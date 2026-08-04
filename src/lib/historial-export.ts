// Exportación institucional a Excel para el Historial de Casos (CEDIM IPS).
// Reproduce la estructura del formato GU-FR-50 "Bitácora de Referencia y
// Contrarreferencia": hojas RECIBIDAS, REMISIONES, PHD_PAD_O2_ESPECIALES,
// REFERENCIAS_INTERNAS y PENDIENTES, con encabezado institucional.
//
// Usa SheetJS (xlsx), ya presente en el proyecto. La librería community no
// escribe estilos de celda (ajuste de texto, congelar), por lo que se aplica
// ancho de columnas y autofiltro, que sí son compatibles.

import * as XLSX from "xlsx";
import { fmtFechaHora, fmtEdad, fmtRadicado } from "./remisiones-utils";

const META = {
  proceso: "GESTION DE URGENCIAS",
  formato: "Formato",
  nombre: "Bitácora de Referencia y Contrarreferencia",
  codigo: "GU-FR-50",
  version: "Versión: 02",
};

export type Seccion = {
  sheet: string;
  headers: string[];
  rows: (string | number)[][];
  /** Anchos de columna (caracteres) opcionales. */
  widths?: number[];
};

function v(x: unknown): string {
  if (x === null || x === undefined) return "";
  const s = String(x).trim();
  return s;
}

function na(x: unknown): string {
  const s = v(x);
  return s || "N/A";
}

// --- Separación de nombres en 4 componentes (heurística colombiana) ---
export function splitNombre(full: string | null | undefined): {
  primerNombre: string;
  segundoNombre: string;
  primerApellido: string;
  segundoApellido: string;
} {
  const t = v(full).split(/\s+/).filter(Boolean);
  const vacio = { primerNombre: "", segundoNombre: "", primerApellido: "", segundoApellido: "" };
  if (t.length === 0) return vacio;
  if (t.length === 1) return { ...vacio, primerNombre: t[0] };
  if (t.length === 2) return { primerNombre: t[0], segundoNombre: "", primerApellido: t[1], segundoApellido: "" };
  if (t.length === 3) return { primerNombre: t[0], segundoNombre: "", primerApellido: t[1], segundoApellido: t[2] };
  // 4+ : dos nombres, dos apellidos (resto al segundo apellido)
  return {
    primerNombre: t[0],
    segundoNombre: t[1],
    primerApellido: t[2],
    segundoApellido: t.slice(3).join(" "),
  };
}

function edadYUnidad(edad: string | null | undefined): { edad: string; unidad: string } {
  const s = v(edad);
  if (!s) return { edad: "", unidad: "" };
  const num = s.match(/\d+/)?.[0] ?? s;
  let unidad = "AÑOS";
  if (/mes/i.test(s)) unidad = "MESES";
  else if (/d[ií]a/i.test(s)) unidad = "DIAS";
  return { edad: num, unidad };
}

function joinList(x: unknown): string {
  if (Array.isArray(x)) return x.filter(Boolean).join(", ");
  return v(x);
}

function redComentada(r: Record<string, unknown>): string {
  const local = joinList(r.ips_red_local);
  const nacional = joinList(r.departamentos_red_nacional);
  const partes: string[] = [];
  if (local) partes.push(`LOCAL: ${local}`);
  if (nacional) partes.push(`NACIONAL: ${nacional}`);
  if (partes.length === 0) return na(r.alcance_red);
  return partes.join(" | ");
}

// ============================================================
// Constructores de secciones por tipo de caso
// ============================================================

export function seccionRecibidas(grupos: GrupoEntrante[]): Seccion {
  const headers = [
    "FECHA Y HORA ENVIO DE REMISION", "IPS QUE REMITE", "CIUDAD Y DEPARTAMENTO",
    "NUMERO DE IDENTIFICACION", "PRIMER NOMBRE", "SEGUNDO NOMBRE", "PRIMER APELLIDO",
    "SEGUNDO APELLIDO", "EDAD", "AÑOS/MESES/DIAS", "EAPB / ASEGURADORA", "REGIMEN",
    "ESPECIALIDAD PRINCIPAL A LA QUE SE REMITE", "CIE-10", "DESCRIPCION DEL CIE-10",
    "FECHA Y HORA DE RESPUESTA", "OPORTUNIDAD DE RESPUESTA", "CODIGO DE ACEPTACION/NEGACION/CRUE",
    "ESTADO DE SOLICITUD", "MOTIVO", "JUSTIFICACION", "UNIDAD A LA QUE INGRESA",
    "INGRESA A CEDIM", "JUSTIFICACION DE CONFIRMACION", "CODIGO DE DIRECCIONAMIENTO CRUE",
    "TIPO DE AMBULANCIA", "EMPRESA", "PLACA VEHICULO", "PROFESIONAL A CARGO", "CARGO",
    "OBSERVACIONES", "USUARIO QUE REGISTRO",
  ];
  const rows = grupos.map((g) => {
    const b = g.base;
    const n = splitNombre([b.nombres, b.apellidos].filter(Boolean).join(" "));
    const ev = edadYUnidad(b.edad);
    const codigos = g.eventos.map((e) => v(e.codigo)).filter(Boolean).join(" · ");
    const ingreso = g.eventos.find((e) => v(e.tipo).toUpperCase().includes("ING"));
    return [
      fmtFechaHora(v(b.fecha) || v(b.created_at)), na(b.ips), na(b.ciudad), v(b.documento),
      n.primerNombre, n.segundoNombre, n.primerApellido, n.segundoApellido,
      ev.edad, ev.unidad, na(b.eapb || b.aseguramiento), na(b.regimen),
      na(b.especialidad), na(b.cie10), na(b.cie10_desc),
      fmtFechaHora(v(b.fecha_respuesta)), na(b.oportunidad), na(codigos || b.codigo),
      g.estadoLabel, na(b.motivo), na(b.justificacion), na(b.unidad),
      ingreso ? "SI" : "NO", na(ingreso?.detalle), na(b.cod_crue),
      na(b.tipo_ambulancia), na(b.empresa_traslado), na(b.placa),
      na(b.profesional), na(b.cargo), na(b.detalle), na(b.usuario_registro),
    ];
  });
  return { sheet: "RECIBIDAS", headers, rows };
}

export function seccionRemisiones(rows: Record<string, unknown>[], segMap: SegMap): Seccion {
  const headers = [
    "FECHA Y HORA DE SOLICITUD", "FECHA Y HORA DE REPORTE/ACEPTACION", "OPORTUNIDAD TRAMITE DE REMISION",
    "NUMERO DE IDENTIFICACION", "PRIMER NOMBRE", "SEGUNDO NOMBRE", "PRIMER APELLIDO", "SEGUNDO APELLIDO",
    "EDAD", "AÑOS/MESES/DIAS", "EAPB / ASEGURADORA", "REGIMEN", "SERVICIO QUE REMITE",
    "MOTIVO DE REMISION", "ESPECIALIDAD REMITENTE", "CIE10", "DESCRIPCION", "IPS RECEPTORA",
    "CIUDAD", "ESPECIALIDAD RECEPTORA", "SERVICIO RECEPTOR", "FECHA Y HORA ACEPTACION", "OPORTUNIDAD",
    "FECHA Y HORA SOLICITUD AMBULANCIA", "EMPRESA DE TRASLADO", "TIPO DE AMBULANCIA", "FECHA Y HORA TRASLADO",
    "OPORTUNIDAD TRASLADO", "ESTADO ACTUAL", "MOTIVO", "OBSERVACIONES", "NUMERO DE RADICADO",
    "RED COMENTADA", "ULTIMA GESTION", "USUARIO QUE REGISTRO",
  ];
  const dataRows = rows.map((r) => {
    const n = splitNombre(v(r.paciente));
    const ev = edadYUnidad(v(r.edad));
    const ultima = ultimaGestion(segMap, v(r.id));
    return [
      fmtFechaHora(v(r.fecha_inicio) || v(r.created_at)), fmtFechaHora(v(r.fecha_radicado)), "",
      v(r.documento), n.primerNombre, n.segundoNombre, n.primerApellido, n.segundoApellido,
      ev.edad, ev.unidad, na(r.eapb || r.asegurador), na(r.regimen), na(r.servicio),
      na(r.remision_por), joinList(r.especialidades_tratantes), na(r.cie10), na(r.especificacion),
      na(r.ips_receptora), "", joinList(r.especialidades_receptoras), "",
      "", "", "", na(r.prestador_traslado), na(r.tipo_ambulancia), "", "",
      estadoLabel(v(r.estado)), "", na(r.observaciones),
      fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean), redComentada(r),
      ultima, na(r.usuario_registro),
    ];
  });
  return { sheet: "REMISIONES", headers, rows: dataRows };
}

export function seccionPHD(rows: Record<string, unknown>[], segMap: SegMap): Seccion {
  const headers = [
    "FECHA Y HORA INICIO TRAMITE", "FECHA Y HORA RADICACION", "TIPO DE SOLICITUD",
    "UNIDAD ESPECIAL", "PACIENTE", "TIPO DOCUMENTO", "DOCUMENTO", "EDAD", "CIE-10",
    "DESCRIPCION CIE-10", "SERVICIO", "CAMA", "ESPECIALIDAD TRATANTE", "EAPB / ERP", "REGIMEN",
    "REQUIERE AMBULANCIA", "TIPO AMBULANCIA", "CODIGO DE RADICACION", "ESTADO",
    "ULTIMA GESTION", "OBSERVACIONES", "USUARIO QUE REGISTRO",
  ];
  const dataRows = rows.map((r) => [
    fmtFechaHora(v(r.fecha_inicio) || v(r.created_at)), fmtFechaHora(v(r.fecha_radicado)),
    na(r.tipo_solicitud_detalle || r.tipo_solicitud), na(r.unidad_especial), na(r.paciente),
    na(r.tipo_documento), v(r.documento), fmtEdad(v(r.edad)), na(r.cie10), "",
    na(r.servicio), na(r.cama), joinList(r.especialidades_tratantes), na(r.eapb), na(r.regimen),
    r.requiere_ambulancia ? "SI" : "NO", na(r.tipo_ambulancia),
    fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean),
    estadoLabel(v(r.estado)), ultimaGestion(segMap, v(r.id)), na(r.observaciones), na(r.usuario_registro),
  ]);
  return { sheet: "PHD_PAD_O2_ESPECIALES", headers, rows: dataRows };
}

export function seccionInternas(rows: Record<string, unknown>[], segMap: SegMap): Seccion {
  const headers = [
    "FECHA Y HORA", "PACIENTE", "TIPO DOCUMENTO", "DOCUMENTO", "SERVICIO",
    "TIPO SOLICITUD / EXAMEN", "EAPB / ERP", "ESTADO", "TIPO AMBULANCIA",
    "OBSERVACIONES", "ULTIMA GESTION", "USUARIO QUE REGISTRO",
  ];
  const dataRows = rows.map((r) => [
    fmtFechaHora(v(r.fecha_inicio) || v(r.created_at)), na(r.paciente), na(r.tipo_documento),
    v(r.documento), na(r.servicio), na(r.tipo_solicitud), na(r.eapb || r.proveedor_prestador),
    estadoLabel(v(r.estado)), na(r.tipo_ambulancia), na(r.observaciones),
    ultimaGestion(segMap, v(r.id)), na(r.usuario_registro),
  ]);
  return { sheet: "REFERENCIAS_INTERNAS", headers, rows: dataRows };
}

export function seccionPendientes(rows: Record<string, unknown>[], segMap: SegMap): Seccion {
  const headers = [
    "FECHA Y HORA CREACION", "PACIENTE / ASUNTO", "TIPO PENDIENTE", "DESTINO (IPS O AREA)",
    "PRIORIDAD", "ESTADO", "OBSERVACION DE ENTREGA", "ULTIMA GESTION", "FECHA CIERRE",
    "USUARIO QUE CREO", "USUARIO QUE CERRO",
  ];
  const dataRows = rows.map((r) => {
    const cerrado = /complet|cerrad/i.test(v(r.estado));
    return [
      fmtFechaHora(v(r.fecha) || v(r.created_at)), na(r.paciente_asunto), na(r.tipo_pendiente),
      na(r.ips_area), na(r.prioridad), estadoPendiente(v(r.estado)), na(r.observacion_entrega),
      ultimaGestion(segMap, v(r.id)), cerrado ? fmtFechaHora(v(r.updated_at)) : "",
      na(r.usuario_registro), cerrado ? na(r.usuario_cierre) : "",
    ];
  });
  return { sheet: "PENDIENTES", headers, rows: dataRows };
}

// ============================================================
// Helpers de estado / seguimientos
// ============================================================

export type SegMap = Map<string, { created_at: string; detalle: string; estado: string; tipo: string; usuario: string; contacto: string }[]>;

export function buildSegMap(seguimientos: Record<string, unknown>[]): SegMap {
  const map: SegMap = new Map();
  for (const s of seguimientos) {
    const id = v(s.caso_id);
    if (!id) continue;
    const arr = map.get(id) ?? [];
    arr.push({
      created_at: v(s.created_at),
      detalle: v(s.plantilla_indigo) || v(s.detalle),
      estado: v(s.estado_solicitud),
      tipo: v(s.tipo_seguimiento),
      usuario: v(s.nombre_usuario),
      contacto: v(s.nombre_contacto),
    });
    map.set(id, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return map;
}

function ultimaGestion(map: SegMap, casoId: string): string {
  const arr = map.get(casoId);
  if (!arr || arr.length === 0) return "";
  const last = arr[arr.length - 1];
  return `${fmtFechaHora(last.created_at)} · ${last.tipo || last.estado || ""}`.trim();
}

export function estadoLabel(estado: string | null): string {
  const e = (estado || "").toUpperCase();
  if (e.includes("DESIST")) return "DESISTIDA";
  if (e.includes("CANCELAD")) return "CANCELADA";
  if (e.includes("COORDINAD")) return "AMBULANCIA COORDINADA";
  if (e.includes("ACEPTAD")) return "ACEPTADA";
  if (e.includes("PENDIENTE")) return "PENDIENTE ACEPTACIÓN";
  return e || "EN GESTIÓN";
}

function estadoPendiente(estado: string | null): string {
  const e = (estado || "").toUpperCase();
  if (e.includes("COMPLET") || e.includes("CERRAD")) return "CUMPLIMIENTO COMPLETO / CERRADO";
  if (e.includes("PARCIAL")) return "CUMPLIMIENTO PARCIAL";
  return e || "ABIERTO";
}

// ============================================================
// Tipos auxiliares para entrantes
// ============================================================

export type GrupoEntrante = {
  base: Record<string, unknown> & {
    nombres?: string | null; apellidos?: string | null; documento?: string | null;
    ips?: string | null; edad?: string | null; codigo?: string | null;
  };
  eventos: Record<string, unknown>[];
  estadoLabel: string;
};

// ============================================================
// Construcción del libro y descarga
// ============================================================

function buildWorksheet(sec: Seccion, usuario: string, filtros: string): XLSX.WorkSheet {
  const ncol = sec.headers.length;
  const blank = (n: number) => Array(n).fill("");
  const metaRow = (left: string, right: string) => {
    const row = blank(ncol);
    row[0] = left;
    if (ncol > 1) row[ncol - 1] = right;
    return row;
  };
  const aoa: (string | number)[][] = [];
  aoa.push(metaRow(META.proceso, META.codigo));
  aoa.push(metaRow(META.formato, META.version));
  aoa.push(metaRow(META.nombre, "Aprobado:"));
  aoa.push(blank(ncol));
  const gen = blank(ncol);
  gen[0] = `Fecha de generación: ${fmtFechaHora(new Date().toISOString())}`;
  if (ncol > 1) gen[1] = `Usuario que exporta: ${usuario}`;
  aoa.push(gen);
  const filt = blank(ncol);
  filt[0] = `Filtros: ${filtros || "Todos"}`;
  aoa.push(filt);
  aoa.push(sec.headers);
  for (const r of sec.rows) aoa.push(r);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Ancho de columnas
  ws["!cols"] = sec.headers.map((h, i) => ({
    wch: Math.min(40, Math.max(12, (sec.widths?.[i] ?? h.length) + 2)),
  }));
  // Autofiltro en la fila de encabezados (fila 7 -> índice 6)
  const lastCol = XLSX.utils.encode_col(ncol - 1);
  ws["!autofilter"] = { ref: `A7:${lastCol}7` };
  return ws;
}

