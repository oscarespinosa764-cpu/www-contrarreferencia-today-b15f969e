// Cálculo de métricas/tarjetas del Dashboard General y Operativo.
// Regla central del informe: las tarjetas NO son tablas, son agregados que se
// calculan leyendo las tablas base y aplicando filtros (estado, tipo, archivado,
// vencimiento). Aquí centralizamos esos filtros para reutilizarlos.

const norm = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const activo = (r: { archivado?: boolean | null }) => !r.archivado;

// ---------- Remisiones salientes ----------
export type RemisionRow = {
  archivado?: boolean | null;
  estado?: string | null;
  tipo_tramite?: string | null;
  remision_por?: string | null;
  especificacion?: string | null;
  observaciones?: string | null;
  evolucion?: string | null;
  evolucion_detalle?: string | null;
  tipo_ambulancia?: string | null;
  ips_receptora?: string | null;
};

export function metricasRemisiones(rows: RemisionRow[]) {
  const act = rows.filter(activo);
  const estado = (r: RemisionRow) => norm(r.estado);

  const desistTexto = (r: RemisionRow) =>
    norm(
      [
        r.estado,
        r.tipo_tramite,
        r.remision_por,
        r.especificacion,
        r.observaciones,
        r.evolucion,
        r.evolucion_detalle,
        r.tipo_ambulancia,
        r.ips_receptora,
      ]
        .filter(Boolean)
        .join(" "),
    );

  const desist = act.filter((r) => {
    const t = desistTexto(r);
    return t.includes("DESIST") || t.includes("DISENT");
  });

  return {
    activas: act.length,
    pendientesAceptacion: act.filter((r) => {
      const e = estado(r);
      return e === "PENDIENTE ACEPTACION" || e.includes("PENDIENTE") || e.includes("SIN");
    }).length,
    acepPendienteAmbulancia: act.filter((r) =>
      estado(r).includes("ACEPTADO SIN PROGRAMACION"),
    ).length,
    acepAmbulanciaCoordinada: act.filter((r) =>
      estado(r).includes("ACEPTADO CON PROGRAMACION"),
    ).length,
    desistIps: desist.filter((r) => !desistTexto(r).includes("GENERAL")).length,
    desistGeneral: desist.filter((r) => desistTexto(r).includes("GENERAL")).length,
  };
}

// ---------- Casos entrantes (R&C) ----------
export type CasoRow = {
  archivado?: boolean | null;
  tipo?: string | null;
  estado?: string | null;
  fecha_vence?: string | null;
};

const NOTIF_PROXIMO_MIN = 120;

export function metricasCasos(rows: CasoRow[]) {
  const tipo = (r: CasoRow) => norm(r.tipo);
  const estado = (r: CasoRow) => norm(r.estado);

  const esCerrado = (r: CasoRow) => {
    const e = estado(r);
    return (
      e.includes("CERRADO") ||
      e.includes("CANCELADO") ||
      e.includes("ARCHIVADO") ||
      e.includes("INGRESADO")
    );
  };

  const acepActivos = rows.filter((r) => tipo(r).includes("ACEP") && !esCerrado(r));

  const minutosRestantes = (r: CasoRow) => {
    if (!r.fecha_vence) return null;
    const t = new Date(r.fecha_vence).getTime();
    if (Number.isNaN(t)) return null;
    return (t - Date.now()) / 60000;
  };

  return {
    aceptados: rows.filter((r) => tipo(r).includes("ACEP")).length,
    negados: rows.filter((r) => tipo(r).includes("NEG")).length,
    cancelaciones: rows.filter((r) => tipo(r).includes("CAN")).length,
    ampliaciones: rows.filter((r) => tipo(r).includes("AMP")).length,
    pendientesIngreso: acepActivos.length,
    proximosVencer: acepActivos.filter((r) => {
      const m = minutosRestantes(r);
      return m !== null && m >= 0 && m <= NOTIF_PROXIMO_MIN;
    }).length,
    vencidos: acepActivos.filter((r) => {
      const m = minutosRestantes(r);
      return m !== null && m < 0;
    }).length,
  };
}

// ---------- Lista de casos pendientes de notificación ----------
export type CasoNotifRow = CasoRow & {
  id: string;
  nombres?: string | null;
  apellidos?: string | null;
  codigo?: string | null;
  cod_ref?: string | null;
  especialidad?: string | null;
  ips?: string | null;
  documento?: string | null;
};

export function casosNotificacion(rows: CasoNotifRow[]) {
  const tipo = (r: CasoNotifRow) => norm(r.tipo);
  const estado = (r: CasoNotifRow) => norm(r.estado);

  const esCerrado = (r: CasoNotifRow) => {
    const e = estado(r);
    return (
      e.includes("CERRADO") ||
      e.includes("CANCELADO") ||
      e.includes("ARCHIVADO") ||
      e.includes("INGRESADO")
    );
  };

  const minutosRestantes = (r: CasoNotifRow) => {
    if (!r.fecha_vence) return null;
    const t = new Date(r.fecha_vence).getTime();
    if (Number.isNaN(t)) return null;
    return (t - Date.now()) / 60000;
  };

  return rows
    .filter((r) => tipo(r).includes("ACEP") && !esCerrado(r))
    .map((r) => ({ ...r, minutos: minutosRestantes(r) }))
    .filter((r) => r.minutos !== null && r.minutos <= NOTIF_PROXIMO_MIN)
    .sort((a, b) => (a.minutos ?? 0) - (b.minutos ?? 0));
}

// ---------- Indicadores rápidos ----------
export type IndicadorRow = { id: string; activo?: boolean | null; archivado?: boolean | null };
export type MedicionRow = { indicador_id: string; semaforo?: string | null; fecha?: string | null };

export function metricasIndicadores(indicadores: IndicadorRow[], mediciones: MedicionRow[]) {
  const activos = indicadores.filter((i) => i.activo !== false && !i.archivado);

  const ultimaPorIndicador = new Map<string, MedicionRow>();
  for (const m of mediciones) {
    const prev = ultimaPorIndicador.get(m.indicador_id);
    if (!prev || new Date(m.fecha ?? 0).getTime() > new Date(prev.fecha ?? 0).getTime()) {
      ultimaPorIndicador.set(m.indicador_id, m);
    }
  }

  let enMeta = 0;
  let alerta = 0;
  let criticos = 0;
  let sinMedicion = 0;

  for (const ind of activos) {
    const med = ultimaPorIndicador.get(ind.id);
    const s = norm(med?.semaforo);
    if (!med || !s) sinMedicion++;
    else if (s.includes("VERDE") || s.includes("META")) enMeta++;
    else if (s.includes("AMARILLO") || s.includes("ALERTA")) alerta++;
    else if (s.includes("ROJO") || s.includes("CRITICO")) criticos++;
    else sinMedicion++;
  }

  return { total: activos.length, enMeta, alerta, criticos, sinMedicion };
}
