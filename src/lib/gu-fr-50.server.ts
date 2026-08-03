// GU-FR-50 · helpers SERVER-ONLY (mapeo, catálogos, duplicados, parseo).
// Consume exclusivamente la definición canónica de src/lib/gu-fr-50.ts.
// Nunca se importa desde el navegador (extensión .server.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOJAS_GU_FR_50,
  validarEstructuraGuFr50,
  type FilaGuFr50,
  type ModuloGuFr50,
} from "./gu-fr-50";

type SB = SupabaseClient<any, any, any>;

export const MODULOS: ModuloGuFr50[] = [
  "ENTRANTES",
  "SALIENTES",
  "ATENCION DOMICILIARIA",
  "REFERENCIAS INTERNAS",
];

/** Tabla y columna de fecha por módulo (allowlist estricta). */
const FUENTE: Record<ModuloGuFr50, { tabla: string; fecha: string }> = {
  ENTRANTES: { tabla: "casos_entrantes", fecha: "fecha" },
  SALIENTES: { tabla: "remisiones", fecha: "fecha_inicio" },
  "ATENCION DOMICILIARIA": { tabla: "domiciliarios", fecha: "fecha_inicio" },
  "REFERENCIAS INTERNAS": { tabla: "referencia_interna", fecha: "fecha_inicio" },
};

const t = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const lista = (v: unknown): string => (Array.isArray(v) ? v.filter(Boolean).join(", ") : t(v));
const iso = (v: unknown): string | null => {
  const s = t(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const num = (v: unknown): number | null => {
  const m = t(v).match(/\d+/);
  return m ? Number(m[0]) : null;
};
const unidadEdad = (v: unknown): string => {
  const s = t(v);
  if (!s) return "";
  if (/mes/i.test(s)) return "MESES";
  if (/d[ií]a/i.test(s)) return "DIAS";
  return "AÑOS";
};
/** Horas entre dos instantes (duración numérica de Excel: días). */
const dur = (a: unknown, b: unknown): number | null => {
  const x = iso(a);
  const y = iso(b);
  if (!x || !y) return null;
  const ms = new Date(y).getTime() - new Date(x).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 86_400_000;
};

type Row = Record<string, unknown>;

/** Mapea filas de base de datos al DTO canónico de cada hoja. */
export function mapearModulo(modulo: ModuloGuFr50, rows: Row[]): FilaGuFr50[] {
  if (modulo === "ENTRANTES") {
    return rows.map((r) => ({
      fecha_envio: iso(r.fecha),
      ips_remite: t(r.ips),
      ciudad_departamento: "",
      documento: t(r.documento),
      paciente: [t(r.nombres), t(r.apellidos)].filter(Boolean).join(" "),
      edad: null,
      unidad_edad: "",
      eapb: t(r.eapb) || t(r.aseguramiento),
      especialidad: t(r.especialidad),
      cie10: "",
      cie10_descripcion: "",
      fecha_respuesta: iso(r.updated_at),
      oportunidad_respuesta: dur(r.fecha, r.updated_at),
      codigo_aceptacion: t(r.codigo),
      estado: t(r.estado),
      motivos: "",
      justificacion: t(r.detalle),
      unidad: t(r.unidad),
      ingresa: /ingres/i.test(t(r.estado)) ? "SI" : "",
      justificacion_confirmacion: "",
      codigo_crue: t(r.cod_ref),
      tipo_ambulancia: "",
      empresa_traslado: "",
      placa: "",
      profesional: t(r.medico),
      cargo: "",
    }));
  }
  if (modulo === "SALIENTES") {
    return rows.map((r) => ({
      fecha_solicitud: iso(r.fecha_inicio) ?? iso(r.created_at),
      fecha_reporte_eps: iso(r.fecha_radicado),
      oportunidad_tramite: dur(r.fecha_inicio, r.fecha_radicado),
      documento: t(r.documento),
      paciente: t(r.paciente),
      edad: num(r.edad),
      unidad_edad: unidadEdad(r.edad),
      eapb: t(r.eapb) || t(r.asegurador),
      regimen: t(r.regimen),
      servicio_remite: t(r.servicio),
      motivo_remision: t(r.remision_por),
      especialidad_remitente: lista(r.especialidades_tratantes),
      cie10: t(r.cie10),
      cie10_descripcion: t(r.especificacion),
      ips_receptora: t(r.ips_receptora),
      ciudad: "",
      especialidad_receptora: lista(r.especialidades_receptoras),
      servicio_receptor: "",
      fecha_aceptacion: iso(r.fecha_radicado),
      oportunidad_aceptacion: dur(r.fecha_inicio, r.fecha_radicado),
      fecha_solicitud_ambulancia: null,
      empresa_traslado: t(r.prestador_traslado),
      tipo_ambulancia: t(r.tipo_ambulancia),
      fecha_traslado: null,
      oportunidad_traslado: null,
      estado_actual: t(r.estado),
      motivo_estado: t(r.evolucion_motivo),
      observaciones: t(r.observaciones),
    }));
  }
  if (modulo === "ATENCION DOMICILIARIA") {
    return rows.map((r) => ({
      fecha_solicitud: iso(r.fecha_inicio) ?? iso(r.fecha),
      fecha_comentado: iso(r.fecha_radicado),
      oportunidad_respuesta: dur(r.fecha_inicio, r.fecha_radicado),
      documento: t(r.documento),
      paciente: t(r.paciente),
      edad: num(r.edad),
      unidad_edad: unidadEdad(r.edad),
      eapb: t(r.eapb),
      regimen: t(r.regimen),
      servicio_remite: t(r.servicio),
      especialidad_remitente: lista(r.especialidades_tratantes),
      // Subtipo real preservado: PHD / PAD / O2 / ESPECIAL.
      tipo_solicitud: t(r.tipo_solicitud_detalle) || t(r.tipo_solicitud),
      cie10: t(r.cie10),
      cie10_descripcion: "",
      estado: t(r.estado),
      requiere_ambulancia: r.requiere_ambulancia ? "SI" : "NO",
      tipo_ambulancia: t(r.tipo_ambulancia),
      empresa_traslado: t(r.proveedor) || t(r.proveedor_ambulancia),
      fecha_traslado: iso(r.fecha_egreso),
      oportunidad_traslado: dur(r.fecha_inicio, r.fecha_egreso),
      observaciones: t(r.observaciones),
    }));
  }
  return rows.map((r) => ({
    fecha_solicitud: iso(r.fecha_inicio) ?? iso(r.fecha),
    documento: t(r.documento),
    paciente: t(r.paciente),
    edad: null,
    entidad: t(r.eapb) || t(r.proveedor_prestador),
    vx_examen: t(r.tipo_solicitud),
    especialidad_solicitante: t(r.servicio),
    cie10_descripcion: "",
    fecha_solicitud_valoracion: iso(r.fecha_inicio),
    oportunidad_solicitud: dur(r.fecha_inicio, r.fecha_radicado),
    fecha_valoracion: iso(r.fecha_radicado),
    oportunidad_respuesta: dur(r.fecha_inicio, r.fecha_radicado),
    ips_acepta: t(r.proveedor_prestador),
    ciudad: "",
    fecha_solicitud_ambulancia: null,
    empresa_traslado: "",
    tipo_ambulancia: t(r.tipo_ambulancia),
    tipo_recorrido: "",
    observacion: t(r.observaciones),
  }));
}

/** Consulta server-side por módulo con rango de fechas validado. */
export async function consultarModulo(
  supabase: SB,
  modulo: ModuloGuFr50,
  desde: string | null,
  hasta: string | null,
  limite = 5000,
): Promise<FilaGuFr50[]> {
  const f = FUENTE[modulo];
  let q = supabase.from(f.tabla).select("*").order(f.fecha, { ascending: true }).limit(limite);
  if (desde) q = q.gte(f.fecha, desde);
  if (hasta) q = q.lte(f.fecha, hasta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return mapearModulo(modulo, (data ?? []) as Row[]);
}

// ---------------------------------------------------------------------------
// Catálogos server-authoritative
// ---------------------------------------------------------------------------

export type EstadoCatalogo = "CATALOGO_RESUELTO" | "CATALOGO_NO_ENCONTRADO" | "CATALOGO_AMBIGUO";

const clave = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Catálogos que NO se validan (texto libre o codificación externa). */
const SIN_VALIDACION = new Set(["CIE10"]);

export async function cargarCatalogos(supabase: SB): Promise<Map<string, Map<string, string[]>>> {
  const { data } = await supabase.from("catalogos").select("tipo, valor, activo");
  const mapa = new Map<string, Map<string, string[]>>();
  for (const row of (data ?? []) as Row[]) {
    if (row.activo === false) continue;
    const tipo = clave(t(row.tipo));
    const valor = t(row.valor);
    if (!tipo || !valor) continue;
    const sub = mapa.get(tipo) ?? new Map<string, string[]>();
    const k = clave(valor);
    sub.set(k, [...(sub.get(k) ?? []), valor]);
    mapa.set(tipo, sub);
  }
  return mapa;
}

export function resolverCatalogo(
  catalogos: Map<string, Map<string, string[]>>,
  tipo: string,
  valor: string,
): { estado: EstadoCatalogo; valor: string } {
  if (!valor) return { estado: "CATALOGO_RESUELTO", valor: "" };
  if (SIN_VALIDACION.has(tipo)) return { estado: "CATALOGO_RESUELTO", valor };
  const sub = catalogos.get(clave(tipo));
  if (!sub || sub.size === 0) return { estado: "CATALOGO_RESUELTO", valor };
  const hit = sub.get(clave(valor));
  if (!hit) return { estado: "CATALOGO_NO_ENCONTRADO", valor };
  if (hit.length > 1) return { estado: "CATALOGO_AMBIGUO", valor };
  return { estado: "CATALOGO_RESUELTO", valor: hit[0] };
}

// ---------------------------------------------------------------------------
// Parseo y validación del lote recibido
// ---------------------------------------------------------------------------

export interface HojaCruda {
  nombre: string;
  encabezados: unknown[];
  filas: unknown[][];
}

export interface ErrorFila {
  hoja: string;
  fila: number;
  columna: string;
  encabezado: string;
  valor: string;
  codigo: string;
  mensaje: string;
}

export interface ResumenHoja {
  hoja: string;
  total: number;
  vacias: number;
  validas: number;
  advertencias: number;
  errores: number;
  duplicadas: number;
  ambiguas: number;
  nuevas: number;
}

export interface ResultadoAnalisis {
  ok: boolean;
  estructura: string[];
  resumen: ResumenHoja[];
  errores: ErrorFila[];
  lote: Partial<Record<ModuloGuFr50, Record<string, string>[]>>;
}

const enmascarar = (v: string) => (v.length > 24 ? `${v.slice(0, 21)}…` : v);

const FECHA_CLAVE = CAMPO_FECHA;


/**
 * Valida estructura, tipos, catálogos y duplicados del archivo recibido.
 * NO escribe en base de datos.
 */
export async function analizarLote(
  supabase: SB,
  hojas: HojaCruda[],
): Promise<ResultadoAnalisis> {
  const estructura = validarEstructuraGuFr50(
    hojas.map((h) => ({ nombre: h.nombre, encabezados: h.encabezados })),
  );
  if (!estructura.ok) {
    return { ok: false, estructura: estructura.errores, resumen: [], errores: [], lote: {} };
  }

  const catalogos = await cargarCatalogos(supabase);
  const errores: ErrorFila[] = [];
  const resumen: ResumenHoja[] = [];
  const lote: Partial<Record<ModuloGuFr50, Record<string, string>[]>> = {};

  for (const def of HOJAS_GU_FR_50) {
    const modulo = def.nombre as ModuloGuFr50;
    const cruda = hojas.find((h) => h.nombre.trim() === def.nombre)!;
    const fuente = FUENTE[modulo];
    let vacias = 0;
    let advertencias = 0;
    let duplicadas = 0;
    const aceptadas: Record<string, string>[] = [];
    const vistos = new Set<string>();

    for (let i = 0; i < cruda.filas.length; i++) {
      const filaExcel = 3 + i;
      const celdas = cruda.filas[i] ?? [];
      const valores = def.columnas.map((c, idx) => t(celdas[idx]));
      if (valores.every((v) => v === "")) {
        vacias++;
        continue;
      }
      const registro: Record<string, string> = {};
      let filaConError = false;

      def.columnas.forEach((col, idx) => {
        let valor = valores[idx];
        if (!valor) return;
        // Nunca se confía en fórmulas del archivo: se tratan como texto.
        if (/^[=+@]/.test(valor)) valor = valor.replace(/^['=+@]+/, "").trim();
        if (col.tipo === "fecha") {
          const v = iso(valor);
          if (!v) {
            filaConError = true;
            errores.push({
              hoja: def.nombre, fila: filaExcel, columna: col.col, encabezado: col.header,
              valor: enmascarar(valor), codigo: "FECHA_INVALIDA",
              mensaje: "Fecha no reconocida. Usa una fecha real de Excel.",
            });
            return;
          }
          registro[col.campo] = v;
          return;
        }
        if (col.tipo === "duracion") return; // se recalcula server-side
        if (col.catalogo) {
          const r = resolverCatalogo(catalogos, col.catalogo, valor);
          if (r.estado !== "CATALOGO_RESUELTO") {
            advertencias++;
            errores.push({
              hoja: def.nombre, fila: filaExcel, columna: col.col, encabezado: col.header,
              valor: enmascarar(valor), codigo: r.estado,
              mensaje:
                r.estado === "CATALOGO_AMBIGUO"
                  ? "El valor coincide con más de una entrada del catálogo."
                  : "El valor no existe en el catálogo. Debe crearse desde Catálogos.",
            });
            filaConError = true;
            return;
          }
          registro[col.campo] = r.valor;
          return;
        }
        registro[col.campo] = valor;
      });

      if (!registro.documento) {
        filaConError = true;
        errores.push({
          hoja: def.nombre, fila: filaExcel, columna: "-", encabezado: "NUMERO DE IDENTIFICACION",
          valor: "", codigo: "DOCUMENTO_REQUERIDO", mensaje: "El documento es obligatorio.",
        });
      }
      const fechaClave = registro[FECHA_CLAVE[modulo]];
      if (!fechaClave) {
        filaConError = true;
        errores.push({
          hoja: def.nombre, fila: filaExcel, columna: "-", encabezado: "FECHA",
          valor: "", codigo: "FECHA_REQUERIDA", mensaje: "La fecha de la solicitud es obligatoria.",
        });
      }
      if (filaConError) continue;

      // Identidad canónica (misma función que usará la confirmación).
      const id = identidad(modulo, registro);
      if (vistos.has(id.exacta)) {
        duplicadas++;
        continue;
      }
      vistos.add(id.exacta);
      candidatas.push({ registro, id });
    }

    // Índices canónicos contra la base de datos (por módulo, nunca cruzados).
    let dupBD = 0;
    let ambiguas = 0;
    const aceptadas: Record<string, string>[] = [];
    if (candidatas.length > 0) {
      const docs = [...new Set(candidatas.map((c) => c.registro.documento))].slice(0, 1000);
      const { data } = await supabase.from(fuente.tabla).select("*").in("documento", docs);
      const existentes = mapearModulo(modulo, (data ?? []) as Row[]);
      const idxExacto = new Map<string, number>();
      const idxMinuto = new Map<string, number>();
      for (const e of existentes) {
        const ie = identidad(modulo, e as unknown as Record<string, unknown>);
        idxExacto.set(ie.exacta, (idxExacto.get(ie.exacta) ?? 0) + 1);
        idxMinuto.set(ie.minuto, (idxMinuto.get(ie.minuto) ?? 0) + 1);
      }
      for (const c of candidatas) {
        const estado = clasificar(c.id, idxExacto, idxMinuto);
        if (estado === "NUEVO") {
          // El fingerprint viaja server-side hacia la RPC (nunca desde el cliente).
          aceptadas.push({ ...c.registro, _fp: c.id.exacta });
          continue;
        }
        if (estado === "DUPLICADO_AMBIGUO" || estado === "CONFLICTO_IDENTIDAD") {
          ambiguas++;
          errores.push({
            hoja: def.nombre, fila: 0, columna: "-", encabezado: "IDENTIDAD",
            valor: enmascarar(c.registro.documento ?? ""), codigo: estado,
            mensaje:
              estado === "DUPLICADO_AMBIGUO"
                ? "Coincide con más de un caso existente: requiere revisión manual."
                : "Identidad incompleta o contradictoria: no se puede importar.",
          });
          continue;
        }
        dupBD++;
      }
    }
    duplicadas += dupBD;

    lote[modulo] = aceptadas;
    resumen.push({
      hoja: def.nombre,
      total: cruda.filas.length,
      vacias,
      validas: aceptadas.length,
      advertencias,
      errores: errores.filter((e) => e.hoja === def.nombre).length,
      duplicadas,
      ambiguas,
      nuevas: aceptadas.length,
    });

  }

  return { ok: errores.length === 0, estructura: [], resumen, errores, lote };
}
