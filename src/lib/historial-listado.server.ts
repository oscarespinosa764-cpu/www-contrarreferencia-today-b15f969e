// Historial de Casos · helpers SERVER-ONLY del listado canónico.
// Nunca se importa desde el navegador (extensión .server.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizarFiltrosFuncionales,
  resolverFiltroTemporalHistorial,
} from "./historial-filtro";
import type {
  HistorialQuery,
  HistorialQueryResult,
  HistorialUnidad,
} from "./historial-listado";

type SB = SupabaseClient<never, never, never>;
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type FilaRpc = {
  modulo: string;
  unit_key: string;
  ids: string[];
  fecha_funcional: string | null;
};

const numero = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/**
 * Listado canónico server-side: periodo resuelto con el reloj del servidor,
 * filtros normalizados con la MISMA allowlist que la exportación, agrupación,
 * total exacto y paginación resueltos en base de datos (RLS del usuario).
 */
export async function listarHistorialServer(
  supabase: SB,
  q: HistorialQuery,
): Promise<HistorialQueryResult> {
  const temporal = resolverFiltroTemporalHistorial({
    periodMode: q.periodMode,
    year: q.year ?? null,
    month: q.month ?? null,
    startDate: q.startDate ?? null,
    endDate: q.endDate ?? null,
  });

  const f = normalizarFiltrosFuncionales({
    status: q.status ?? null,
    sede: q.sede ?? null,
    documento: q.documento ?? null,
    servicio: q.servicio ?? null,
    searchTerm: q.searchTerm ?? null,
    subtype: q.subtype ?? null,
  });
  const caseType =
    q.caseType && !q.caseType.toUpperCase().startsWith("TODO") ? q.caseType.toUpperCase() : null;

  const { data, error } = await (supabase as unknown as RpcClient).rpc("historial_listado", {
    _module: q.module,
    _start: temporal.startAt,
    _end: temporal.endExclusive,
    _tipo: caseType,
    _estado: f.status,
    _sede: f.sede,
    _servicio: f.servicio,
    _documento: f.documento,
    _term: f.searchTerm,
    _subtype: f.subtype,
    _page: q.page,
    _page_size: q.pageSize,
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as Record<string, unknown>;
  const rows: HistorialUnidad[] = ((r.rows as FilaRpc[] | undefined) ?? []).map((x) => ({
    modulo: x.modulo as HistorialUnidad["modulo"],
    unitKey: x.unit_key,
    ids: x.ids ?? [],
    fechaFuncional: x.fecha_funcional,
  }));

  return {
    rows,
    total: numero(r.total),
    page: numero(r.page),
    pageSize: numero(r.pageSize),
    totalPages: numero(r.totalPages),
    hasNextPage: Boolean(r.hasNextPage),
    hasPreviousPage: Boolean(r.hasPreviousPage),
    appliedFilter: {
      module: q.module,
      periodMode: q.periodMode,
      caseType,
      status: f.status,
      sede: f.sede,
      documento: f.documento,
      servicio: f.servicio,
      searchTerm: f.searchTerm,
      subtype: f.subtype,
    },
    visibleInterval: { start: temporal.startDateVisible, end: temporal.endDateVisible },
    technicalInterval: { startAt: temporal.startAt, endExclusive: temporal.endExclusive },
    cutoffAt: temporal.cutoffAt,
    label: temporal.label,
    missingFunctionalDateCount: numero(r.missingFunctionalDateCount),
    totalsByModule: (r.totalsByModule as Record<string, number>) ?? {},
  };
}

export interface PacienteHistorial {
  documento: string;
  nombres: string;
  apellidos: string;
  nombre: string;
}

const patron = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/**
 * Búsqueda de pacientes server-side (documento o nombre) sobre las fuentes
 * autorizadas. Reemplaza el índice que antes se construía en el navegador a
 * partir del universo completo. Máximo 50 resultados.
 */
export async function buscarPacientesServer(
  supabase: SB,
  termino: string,
): Promise<PacienteHistorial[]> {
  const t = termino.trim();
  if (t.length < 3) return [];
  const p = patron(t);
  const cli = supabase as unknown as {
    from: (tabla: string) => {
      select: (cols: string) => {
        or: (f: string) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
      };
    };
  };

  const [ent, sal, dom, ri] = await Promise.all([
    cli
      .from("casos_entrantes")
      .select("documento, nombres, apellidos")
      .or(`documento.ilike.${p},nombres.ilike.${p},apellidos.ilike.${p}`)
      .limit(60),
    cli
      .from("remisiones")
      .select("documento, paciente")
      .or(`documento.ilike.${p},paciente.ilike.${p}`)
      .limit(60),
    cli
      .from("domiciliarios")
      .select("documento, paciente")
      .or(`documento.ilike.${p},paciente.ilike.${p}`)
      .limit(60),
    cli
      .from("referencia_interna")
      .select("documento, paciente")
      .or(`documento.ilike.${p},paciente.ilike.${p}`)
      .limit(60),
  ]);

  const mapa = new Map<string, PacienteHistorial>();
  const add = (documento: unknown, nombres: unknown, apellidos: unknown) => {
    const doc = String(documento ?? "").trim();
    if (!doc || mapa.has(doc)) return;
    const n = String(nombres ?? "").trim();
    const a = String(apellidos ?? "").trim();
    mapa.set(doc, { documento: doc, nombres: n, apellidos: a, nombre: [n, a].filter(Boolean).join(" ") });
  };
  for (const r of (ent.data ?? []) as Record<string, unknown>[]) add(r.documento, r.nombres, r.apellidos);
  for (const grupo of [sal, dom, ri]) {
    for (const r of (grupo.data ?? []) as Record<string, unknown>[]) add(r.documento, r.paciente, "");
  }
  return Array.from(mapa.values()).slice(0, 50);
}
