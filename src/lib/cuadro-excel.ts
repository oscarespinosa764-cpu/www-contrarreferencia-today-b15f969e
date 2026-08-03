// Importación / exportación BAJO DEMANDA del Cuadro de Turno TH-FR-10.
//
// La descarga usa la PLANTILLA INSTITUCIONAL REAL (ver cuadro-plantilla.ts):
// conserva logos, encabezado, bordes, convenciones y configuración de impresión
// del formato oficial, y solo escribe los datos del periodo.
// La importación acepta ese mismo archivo (round-trip).
//
// Todo se genera/parsea 100% en memoria en el navegador.

import * as XLSX from "xlsx";
import { supabase } from "@/lib/backend-client";
import {
  diasDelMes, letraDiaSemana, fechaISO, MESES,
  type ShiftType, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";


// ---------------------------------------------------------------------------
// Formato OFICIAL TH-FR-10 (plantilla institucional real con logos y estilos)
// ---------------------------------------------------------------------------

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Descarga bytes XLSX en el navegador (sin Buffer ni APIs de Node). */
function descargarBytes(bytes: Uint8Array, nombre: string) {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([ab], { type: XLSX_MIME }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface OficialParams {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
  elaboradoNombre?: string;
  elaboradoCargo?: string;
}

async function generarOficial(p: OficialParams, incluirDatos: boolean) {
  const { construirCuadroTHFR10, MAX_COLABORADORES } = await import("@/lib/cuadro-plantilla");
  const dayMap = new Map<string, ShiftDay>();
  for (const d of p.days) dayMap.set(`${d.member_id}:${d.day_number}`, d);

  const activos = p.members.filter((m) => m.active !== false);
  if (activos.length > MAX_COLABORADORES) {
    throw new Error(
      `El formato TH-FR-10 admite hasta ${MAX_COLABORADORES} colaboradores por hoja.`,
    );
  }

  const filas = activos.map((m) => {
    const turnos: Record<number, { code: string; hours: number | null }> = {};
    if (incluirDatos) {
      for (let d = 1; d <= 31; d++) {
        const cd = dayMap.get(`${m.id}:${d}`);
        if (cd?.shift_code) turnos[d] = { code: cd.shift_code, hours: cd.hours ?? null };
      }
    }
    return { nombre: m.full_name || "", cargo: m.role_name, sede: m.sede, turnos };
  });

  return construirCuadroTHFR10({
    anio: p.anio,
    mes: p.mes,
    nombreMes: MESES[p.mes - 1],
    letraDia: (d) => letraDiaSemana(p.anio, p.mes, d),
    baseHoras: p.baseHoras ?? 176,
    responsable: p.responsable ?? null,
    elaboradoNombre: p.elaboradoNombre ?? null,
    elaboradoCargo: p.elaboradoCargo ?? null,
    filas,
    convenciones: p.tipos
      .filter((t) => t.active !== false)
      .map((t) => ({
        code: t.code,
        name: t.name,
        inicio: t.start_time,
        fin: t.end_time,
        horas: t.hours ?? null,
      })),
  });
}

/** Descarga la PLANTILLA oficial TH-FR-10 con el personal real (sin turnos). */
export async function exportarPlantillaCuadro(params: OficialParams) {
  const b64 = await generarOficial(params, false);
  descargarBase64(b64, `TH-FR-10_Plantilla_${MESES[params.mes - 1]}_${params.anio}.xlsx`);
}

/** Descarga el CUADRO MENSUAL diligenciado en el formato oficial TH-FR-10. */
export async function exportarCuadroMensual(params: OficialParams) {
  const b64 = await generarOficial(params, true);
  descargarBase64(b64, `TH-FR-10_Cuadro_${MESES[params.mes - 1]}_${params.anio}.xlsx`);
}

export interface ImportResultado {
  miembrosNuevos: number;
  miembrosExistentes: number;
  diasCargados: number;
  codigosDesconocidos: string[];
  filasOmitidas: number;
}

/**
 * Importa un archivo TH-FR-10 al cuadro indicado.
 * Detecta el encabezado ("Colaborador" o "NOMBRES Y APELLIDOS"),
 * crea colaboradores faltantes (match por nombre) y asigna los códigos por día.
 * No borra datos existentes; sobreescribe celdas por conflicto member/day.
 */
export async function importarCuadroExcel(params: {
  file: File;
  scheduleId: string;
  anio: number;
  mes: number;
  members: ShiftMember[];
  tipos: ShiftType[];
  userId: string;
}): Promise<ImportResultado> {
  const { file, scheduleId, anio, mes, members, tipos, userId } = params;
  void userId;
  const ndias = diasDelMes(anio, mes);
  const tipoMap = new Map(tipos.map((t) => [t.code.toUpperCase(), t]));

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["TH-FR-10"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("El archivo no contiene una hoja válida.");
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false, defval: "" });

  // Localizar fila de encabezado
  let headerIdx = -1;
  for (let i = 0; i < aoa.length; i++) {
    const row = (aoa[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    if (row.includes("nombres y apellidos") || row[0] === "colaborador") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("No se encontró el encabezado ('Colaborador').");

  const header = aoa[headerIdx].map((h) => String(h ?? "").trim());
  const oficial = header.some((h) => h.toLowerCase() === "nombres y apellidos");
  const nameCol = oficial
    ? header.findIndex((h) => h.toLowerCase() === "nombres y apellidos")
    : 0;
  const cargoCol = header.findIndex((h) => h.toLowerCase() === "cargo");
  const sedeCol = header.findIndex((h) => h.toLowerCase() === "sede");
  void header.findIndex((h) => h.toLowerCase() === "dependencia / dia");

  // Mapear índice de columna -> número de día
  const dayCols: { col: number; day: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    const n = parseInt(header[c], 10);
    if (!Number.isNaN(n) && n >= 1 && n <= ndias) dayCols.push({ col: c, day: n });
  }
  if (dayCols.length === 0) throw new Error("No se encontraron columnas de días (1..N).");

  const res: ImportResultado = {
    miembrosNuevos: 0, miembrosExistentes: 0, diasCargados: 0,
    codigosDesconocidos: [], filasOmitidas: 0,
  };
  const desconocidos = new Set<string>();

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const memberByName = new Map(members.map((m) => [norm(m.full_name), m]));
  let sortOrder = members.length;
  const dayRows: Array<Omit<ShiftDay, "id">> = [];

  let startData = headerIdx + 1;
  // Saltar fila de letras de día (sub-encabezado sin nombre)
  const sub = aoa[startData];
  if (sub && String(sub[nameCol] ?? "").trim() === "") startData += 1;

  const saltar = new Set<number>();
  for (let i = startData; i < aoa.length; i++) {
    if (saltar.has(i)) continue;
    const row = aoa[i];
    const nombre = String(row?.[nameCol] ?? "").trim();
    if (!nombre) { res.filasOmitidas++; continue; }
    // Cortar al llegar a bloques posteriores.
    if (/^(conversiones|convenciones|novedades|elaborado|aprobado|festivos|continuidad|gestion traslados)/i.test(nombre)) break;

    let member = memberByName.get(norm(nombre));
    let cargo = cargoCol >= 0 ? (String(row?.[cargoCol] ?? "").trim() || null) : null;
    let sede = sedeCol >= 0 ? (String(row?.[sedeCol] ?? "").trim() || null) : null;

    // Formato oficial TH-FR-10: la fila siguiente lleva "Cargo · Sede" y las horas.
    if (oficial && cargoCol < 0) {
      const detalle = String(aoa[i + 1]?.[nameCol] ?? "").trim();
      if (detalle && detalle.includes("·")) {
        const [c, s] = detalle.split("·").map((x) => x.trim());
        cargo = cargo ?? (c || null);
        sede = sede ?? (s || null);
        saltar.add(i + 1);
      } else if (detalle === "") {
        saltar.add(i + 1);
      }
    }


    if (!member) {
      const { data, error } = await supabase
        .from("shift_schedule_members")
        .insert({ schedule_id: scheduleId, full_name: nombre, role_name: cargo, sede, sort_order: sortOrder++ })
        .select(
          "id, schedule_id, user_id, full_name, role_name, sede, active, base_hours, pending_hours, notes, sort_order",
        ).single();
      if (error) { res.filasOmitidas++; continue; }
      member = data as unknown as ShiftMember;
      memberByName.set(norm(nombre), member);
      res.miembrosNuevos++;
    } else {
      res.miembrosExistentes++;
    }

    for (const { col, day } of dayCols) {
      const raw = String(row?.[col] ?? "").trim().toUpperCase();
      if (!raw) continue;
      const tipo = tipoMap.get(raw);
      if (!tipo) { desconocidos.add(raw); continue; }
      dayRows.push({
        schedule_id: scheduleId, member_id: member.id, day_number: day,
        shift_date: fechaISO(anio, mes, day), shift_code: tipo.code, hours: tipo.hours,
        notes: null, origin: "import",
      });
    }
  }

  if (dayRows.length > 0) {
    const { error } = await supabase
      .from("shift_schedule_days")
      .upsert(dayRows as never, { onConflict: "member_id,day_number" });
    if (error) throw error;
    res.diasCargados = dayRows.length;
  }

  res.codigosDesconocidos = Array.from(desconocidos);
  return res;
}
