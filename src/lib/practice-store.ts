// ============================================================================
// MODO PRÁCTICA (efímero) — motor de superposición sobre el cliente de datos.
//
// Objetivo: cuando el modo práctica está ACTIVO, ninguna escritura
// (insert/update/delete/upsert) toca la base de datos real. Se guardan en una
// superposición EN MEMORIA que se mezcla al leer, de modo que el usuario ve lo
// que "creó" mientras practica. Al desactivar el modo, la superposición se
// borra por completo y todo lo practicado desaparece.
//
// Garantía de seguridad: en modo práctica es IMPOSIBLE que un `.from(tabla)`
// escriba en la base real; las lecturas siguen mostrando los datos reales
// (sin modificarlos) más lo practicado.
// ============================================================================

// -------------------------- Estado global (no-React) ------------------------

let active = false;
const listeners = new Set<() => void>();

type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "is"
  | "like"
  | "ilike";

type Filter = { op: FilterOp; column: string; value: unknown; negate?: boolean };
type Row = Record<string, unknown>;
type PatchEntry = { filters: Filter[]; patch: Row };
type DeleteEntry = { filters: Filter[] };
type Overlay = { inserts: Row[]; updates: PatchEntry[]; deletes: DeleteEntry[] };

const overlays = new Map<string, Overlay>();

function ov(table: string): Overlay {
  let o = overlays.get(table);
  if (!o) {
    o = { inserts: [], updates: [], deletes: [] };
    overlays.set(table, o);
  }
  return o;
}

function notify() {
  listeners.forEach((fn) => fn());
}

// -------------------------- API pública del estado --------------------------

export function isPracticeActive(): boolean {
  return active;
}

export function setPracticeActive(next: boolean): void {
  if (active === next) return;
  active = next;
  if (!next) overlays.clear(); // salir del modo práctica borra todo lo practicado
  notify();
}

export function clearPracticeData(): void {
  overlays.clear();
  notify();
}

export function subscribePractice(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPracticeSnapshot(): boolean {
  return active;
}

// -------------------------- Utilidades de filtrado --------------------------

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return "practice-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function likeToRegExp(pattern: string, insensitive: boolean): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp("^" + escaped + "$", insensitive ? "i" : "");
}

function matchOne(row: Row, f: Filter): boolean {
  const v = row[f.column];
  let res: boolean;
  switch (f.op) {
    case "eq":
      res = String(v) === String(f.value);
      break;
    case "neq":
      res = String(v) !== String(f.value);
      break;
    case "gt":
      res = (v as number) > (f.value as number);
      break;
    case "gte":
      res = (v as number) >= (f.value as number);
      break;
    case "lt":
      res = (v as number) < (f.value as number);
      break;
    case "lte":
      res = (v as number) <= (f.value as number);
      break;
    case "in":
      res =
        Array.isArray(f.value) &&
        (f.value as unknown[]).map(String).includes(String(v));
      break;
    case "is":
      res = f.value === null ? v == null : v === f.value;
      break;
    case "like":
      res = typeof v === "string" && likeToRegExp(String(f.value), false).test(v);
      break;
    case "ilike":
      res = typeof v === "string" && likeToRegExp(String(f.value), true).test(v);
      break;
    default:
      res = false;
  }
  return f.negate ? !res : res;
}

function matchAll(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => matchOne(row, f));
}

// -------------------------- Constructor de consultas ------------------------

type OrderBy = { column: string; ascending: boolean; nullsFirst: boolean };

const FILTER_OPS: FilterOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "like",
  "ilike",
];
// Métodos que no sabemos evaluar en memoria: marcan la consulta como
// "no soportada" para evitar mostrar datos practicados donde no corresponden.
const UNSUPPORTED_FILTERS = [
  "or",
  "filter",
  "not",
  "match",
  "contains",
  "containedBy",
  "overlaps",
  "textSearch",
];

type AnyBuilder = {
  [k: string]: (...args: unknown[]) => AnyBuilder;
} & Promise<{ data: unknown; error: unknown; count?: number | null }>;

// -- Lectura ----------------------------------------------------------------
class ReadChain {
  private table: string;
  private real: AnyBuilder;
  private filters: Filter[] = [];
  private orderBys: OrderBy[] = [];
  private limitN: number | null = null;
  private unsupported = false;
  private _single = false;
  private _maybe = false;

  constructor(table: string, real: AnyBuilder) {
    this.table = table;
    this.real = real;
    for (const op of FILTER_OPS) {
      (this as unknown as Record<string, unknown>)[op] = (
        column: string,
        value: unknown,
      ) => {
        this.filters.push({ op: op as FilterOp, column, value });
        this.real = (this.real as AnyBuilder)[op](column, value);
        return this;
      };
    }
    for (const m of UNSUPPORTED_FILTERS) {
      (this as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
        this.unsupported = true;
        this.real = (this.real as AnyBuilder)[m](...args);
        return this;
      };
    }
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const ascending = opts?.ascending ?? true;
    const nullsFirst = opts?.nullsFirst ?? false;
    this.orderBys.push({ column, ascending, nullsFirst });
    this.real = this.real.order(column, opts as unknown as never);
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    this.real = this.real.limit(n);
    return this;
  }

  range(from: number, to: number) {
    this.real = this.real.range(from, to);
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._maybe = true;
    return this;
  }

  private sort(rows: Row[]) {
    if (!this.orderBys.length) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orderBys) {
        const av = a[o.column];
        const bv = b[o.column];
        if (av === bv) continue;
        if (av == null) return o.nullsFirst ? -1 : 1;
        if (bv == null) return o.nullsFirst ? 1 : -1;
        const cmp = (av as number) < (bv as number) ? -1 : 1;
        return o.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  private apply(res: { data: unknown; error: unknown; count?: number | null }) {
    if (res.error) return res;
    let rows: Row[] = Array.isArray(res.data)
      ? [...(res.data as Row[])]
      : res.data == null
        ? []
        : [res.data as Row];

    const o = overlays.get(this.table);
    if (o) {
      // 1) eliminar filas borradas en práctica
      if (o.deletes.length) {
        rows = rows.filter((r) => !o.deletes.some((d) => matchAll(r, d.filters)));
      }
      // 2) aplicar ediciones de práctica
      if (o.updates.length) {
        rows = rows.map((r) => {
          let nr = r;
          for (const u of o.updates) if (matchAll(nr, u.filters)) nr = { ...nr, ...u.patch };
          return nr;
        });
      }
      // 3) añadir filas creadas en práctica que coincidan con los filtros
      if (!this.unsupported && o.inserts.length) {
        const ids = new Set(rows.map((r) => r?.id));
        const extra = o.inserts.filter(
          (r) => matchAll(r, this.filters) && !ids.has(r.id),
        );
        rows = rows.concat(extra);
      }
      rows = this.sort(rows);
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
    }

    if (this._single) {
      if (rows.length === 0) {
        return {
          data: null,
          error: { code: "PGRST116", message: "No rows found", details: null, hint: null },
        };
      }
      return { data: rows[0], error: null };
    }
    if (this._maybe) {
      return { data: rows[0] ?? null, error: null };
    }
    return { ...res, data: rows };
  }

  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.real)
      .then((res) => this.apply(res as never))
      .then(resolve, reject);
  }

  catch(reject: (e: unknown) => unknown) {
    return this.then((v) => v, reject);
  }
}

// -- Escrituras -------------------------------------------------------------
class WriteResult {
  private rows: Row[];
  private _select = false;
  private _single = false;
  private _maybe = false;

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  select() {
    this._select = true;
    return this;
  }

  single() {
    this._select = true;
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._select = true;
    this._maybe = true;
    return this;
  }

  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    let data: unknown = null;
    if (this._select) {
      data = this._single ? (this.rows[0] ?? null) : this._maybe ? (this.rows[0] ?? null) : this.rows;
    }
    return Promise.resolve({ data, error: null, count: null, status: 201, statusText: "OK" }).then(
      resolve,
      reject,
    );
  }

  catch(reject: (e: unknown) => unknown) {
    return this.then((v) => v, reject);
  }
}

// -- Update / Delete (capturan filtros, sin builder real) -------------------
class MutateChain {
  private table: string;
  private kind: "update" | "delete";
  private patch: Row | null;
  private filters: Filter[] = [];
  private unsupported = false;
  private _select = false;
  private _single = false;
  private _maybe = false;

  constructor(table: string, kind: "update" | "delete", patch: Row | null) {
    this.table = table;
    this.kind = kind;
    this.patch = patch;
    for (const op of FILTER_OPS) {
      (this as unknown as Record<string, unknown>)[op] = (
        column: string,
        value: unknown,
      ) => {
        this.filters.push({ op: op as FilterOp, column, value });
        return this;
      };
    }
    for (const m of UNSUPPORTED_FILTERS) {
      (this as unknown as Record<string, unknown>)[m] = () => {
        this.unsupported = true;
        return this;
      };
    }
  }

  order() {
    return this;
  }
  limit() {
    return this;
  }
  select() {
    this._select = true;
    return this;
  }
  single() {
    this._select = true;
    this._single = true;
    return this;
  }
  maybeSingle() {
    this._select = true;
    this._maybe = true;
    return this;
  }

  private commit(): Row[] {
    const o = ov(this.table);
    const affected: Row[] = [];
    if (this.kind === "delete") {
      // quitar de lo insertado en práctica
      o.inserts = o.inserts.filter((r) => {
        const hit = matchAll(r, this.filters);
        if (hit) affected.push(r);
        return !hit;
      });
      if (!this.unsupported) o.deletes.push({ filters: this.filters });
    } else if (this.patch) {
      // aplicar a lo insertado en práctica
      for (const r of o.inserts) {
        if (matchAll(r, this.filters)) {
          Object.assign(r, this.patch);
          affected.push(r);
        }
      }
      if (!this.unsupported) o.updates.push({ filters: this.filters, patch: this.patch });
    }
    notify();
    return affected;
  }

  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    const affected = this.commit();
    let data: unknown = null;
    if (this._select) {
      data = this._single || this._maybe ? (affected[0] ?? null) : affected;
    }
    return Promise.resolve({ data, error: null, count: affected.length }).then(resolve, reject);
  }

  catch(reject: (e: unknown) => unknown) {
    return this.then((v) => v, reject);
  }
}

// -------------------------- Punto de entrada `from` -------------------------

type FromClient = { from: (t: string) => AnyBuilder };

export function makePracticeFrom(table: string, client: FromClient) {
  return {
    select(cols?: string, opts?: { count?: string; head?: boolean }) {
      // Consultas de conteo/head: se delegan sin superposición (degradación segura).
      if (opts && (opts.head || opts.count)) {
        return client.from(table).select(cols as never, opts as never);
      }
      return new ReadChain(table, client.from(table).select(cols as never) as AnyBuilder);
    },
    insert(values: Row | Row[]) {
      const arr = Array.isArray(values) ? values : [values];
      const now = new Date().toISOString();
      const rows: Row[] = arr.map((v) => {
        const row: Row = { ...v };
        if (row.id == null) row.id = uuid();
        if (row.created_at == null) row.created_at = now;
        if (row.updated_at == null) row.updated_at = now;
        return row;
      });
      ov(table).inserts.push(...rows);
      notify();
      return new WriteResult(rows);
    },
    upsert(values: Row | Row[]) {
      const arr = Array.isArray(values) ? values : [values];
      const now = new Date().toISOString();
      const o = ov(table);
      const rows: Row[] = arr.map((v) => {
        const row: Row = { ...v };
        if (row.id == null) row.id = uuid();
        if (row.created_at == null) row.created_at = now;
        if (row.updated_at == null) row.updated_at = now;
        const idx = o.inserts.findIndex((r) => r.id === row.id);
        if (idx >= 0) o.inserts[idx] = row;
        else o.inserts.push(row);
        return row;
      });
      notify();
      return new WriteResult(rows);
    },
    update(patch: Row) {
      return new MutateChain(table, "update", patch);
    },
    delete() {
      return new MutateChain(table, "delete", null);
    },
  };
}
