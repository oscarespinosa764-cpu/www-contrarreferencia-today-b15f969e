// Importación / exportación BAJO DEMANDA del Cuadro de Turno TH-FR-10 (SheetJS).
//
// IMPORTANTE (control de costos): los archivos se generan/parsean en memoria en
// el navegador. La plantilla exportada NO se guarda en el servidor; la
// importación solo escribe en las tablas del cuadro. SheetJS es 100% JS.
//
// El layout replica el formato OFICIAL "TH-FR-10 Cuadro de Turnos 2026":
//   - Bloque institucional (SISTEMA DE GESTION DE TALENTO HUMANO / código / versión).
//   - Fila FECHA · PROCESO · REFERENCIA Y CONTRARREFERENCIA + RESPONSABLE.
//   - Matriz: NOMBRES Y APELLIDOS | DEPENDENCIA/DIA | días 1..N | TOTAL HORAS |
//     TIEMPO EXTRA | TIEMPO PENDIENTE POR DEVOLVER | TIEMPO TOTAL.
//   - Cada colaborador ocupa 2 filas: "Turno" y "Numero de Horas".
//   - Totales por fórmula. Bloque de CONVERSIONES (convenciones) + NOVEDADES.

import * as XLSX from "xlsx";
import { supabase } from "@/lib/backend-client";
import {
  diasDelMes, letraDiaSemana, fechaISO, MESES,
  type ShiftType, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const PROCESO = "REFERENCIA Y CONTRARREFERENCIA";

// Columnas fijas antes de los días: A(name label spacer) B..F=Nombre, G=Dep/Día.
// Para simplificar y mantener fórmulas confiables usamos índices lineales:
//   col 0 = NOMBRES Y APELLIDOS
//   col 1 = DEPENDENCIA / DIA
//   col 2..(1+N) = días 1..N
//   luego TOTAL HORAS, TIEMPO EXTRA, TIEMPO PENDIENTE, TIEMPO TOTAL
const NAME_COL = 0;
const DEP_COL = 1;
const FIRST_DAY_COL = 2;

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

interface OfficialParams {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
  incluirDatos: boolean; // true = cuadro lleno; false = plantilla vacía
}

function construirLibroOficial(p: OfficialParams): XLSX.WorkBook {
  const { anio, mes, members, days, tipos, incluirDatos } = p;
  const base = p.baseHoras ?? 176;
  const responsable = p.responsable ?? "OSCAR ESPINOSA";
  const ndias = diasDelMes(anio, mes);

  const totalCol = FIRST_DAY_COL + ndias;
  const extraCol = totalCol + 1;
  const pendCol = extraCol + 1;
  const ttotCol = pendCol + 1;
  const lastCol = ttotCol;

  const rowLen = lastCol + 1;
  const blank = () => Array(rowLen).fill("");

  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  const R = () => aoa.length; // índice de la fila que se está por agregar (0-based tras push)

  // --- Bloque institucional (filas 0..3) ---
  let r = blank(); r[0] = "SISTEMA DE GESTION DE TALENTO HUMANO"; r[lastCol - 1] = "TH-FR-10";
  aoa.push(r); merges.push({ s: { r: R() - 1, c: 0 }, e: { r: R() - 1, c: lastCol - 2 } });
  r = blank(); r[0] = INSTITUCION; r[lastCol - 1] = "Versión: 01";
  aoa.push(r); merges.push({ s: { r: R() - 1, c: 0 }, e: { r: R() - 1, c: lastCol - 2 } });
  r = blank(); r[0] = "Formato"; r[lastCol - 1] = "Aprobado: 2024-09-24";
  aoa.push(r); merges.push({ s: { r: R() - 1, c: 0 }, e: { r: R() - 1, c: lastCol - 2 } });
  r = blank(); r[0] = "Cuadro de turnos";
  aoa.push(r); merges.push({ s: { r: R() - 1, c: 0 }, e: { r: R() - 1, c: lastCol - 2 } });

  // fila vacía
  aoa.push(blank());

  // --- FECHA · PROCESO ---
  r = blank(); r[0] = "FECHA"; r[1] = `${MESES[mes - 1]} ${anio}`; r[FIRST_DAY_COL] = "PROCESO"; r[FIRST_DAY_COL + 2] = PROCESO;
  aoa.push(r);
  // --- RESPONSABLE ---
  r = blank(); r[0] = "RESPONSABLE"; r[1] = responsable;
  aoa.push(r);

  aoa.push(blank());

  // --- Encabezado de la matriz ---
  const headerRow = blank();
  headerRow[NAME_COL] = "NOMBRES Y APELLIDOS";
  headerRow[DEP_COL] = "DEPENDENCIA / DIA";
  for (let d = 1; d <= ndias; d++) headerRow[FIRST_DAY_COL + d - 1] = d;
  headerRow[totalCol] = "TOTAL HORAS";
  headerRow[extraCol] = "TIEMPO EXTRA";
  headerRow[pendCol] = "TIEMPO PENDIENTE POR DEVOLVER";
  headerRow[ttotCol] = "TIEMPO TOTAL";
  aoa.push(headerRow);
  const headerRowIdx = R() - 1;

  // --- Sub-encabezado: letras de día de la semana ---
  const dowRow = blank();
  for (let d = 1; d <= ndias; d++) dowRow[FIRST_DAY_COL + d - 1] = letraDiaSemana(anio, mes, d);
  aoa.push(dowRow);

  // --- Filas por colaborador (2 filas c/u) ---
  const dayMap = new Map<string, ShiftDay>();
  for (const d of days) dayMap.set(`${d.member_id}:${d.day_number}`, d);
  const tipoMap = new Map(tipos.map((t) => [t.code.toUpperCase(), t]));

  const lista = members.length > 0 ? members : [{ id: "", full_name: "", role_name: "", pending_hours: 0 } as ShiftMember];

  

  for (const m of lista) {
    const turnoRow = blank();
    const horasRow = blank();
    turnoRow[NAME_COL] = m.full_name || "";
    turnoRow[DEP_COL] = "Turno";
    horasRow[DEP_COL] = "Numero de Horas";

    if (incluirDatos && m.id) {
      for (let d = 1; d <= ndias; d++) {
        const cd = dayMap.get(`${m.id}:${d}`);
        if (cd?.shift_code) {
          turnoRow[FIRST_DAY_COL + d - 1] = cd.shift_code;
          const tipo = tipoMap.get(cd.shift_code.toUpperCase());
          const h = Number(cd.hours) || tipo?.hours || 0;
          if (h) horasRow[FIRST_DAY_COL + d - 1] = h;
        }
      }
    }

    aoa.push(turnoRow);
    const turnoIdx = R() - 1;
    aoa.push(horasRow);
    const horasIdx = R() - 1;

    // Fusionar nombre a lo largo de las 2 filas
    merges.push({ s: { r: turnoIdx, c: NAME_COL }, e: { r: horasIdx, c: NAME_COL } });

    // Fórmulas de totales (sobre la fila de Numero de Horas)
    const firstDayRef = `${colLetter(FIRST_DAY_COL)}${horasIdx + 1}`;
    const lastDayRef = `${colLetter(FIRST_DAY_COL + ndias - 1)}${horasIdx + 1}`;
    const totRef = `${colLetter(totalCol)}${turnoIdx + 1}`;
    const extraRef = `${colLetter(extraCol)}${turnoIdx + 1}`;
    const pendRef = `${colLetter(pendCol)}${turnoIdx + 1}`;

    // TOTAL HORAS
    turnoRow[totalCol] = "";
    (aoa[turnoIdx] as any)[totalCol] = { t: "n", f: `SUM(${firstDayRef}:${lastDayRef})` };
    // TIEMPO EXTRA = total - base
    (aoa[turnoIdx] as any)[extraCol] = { t: "n", f: `${totRef}-${base}` };
    // PENDIENTE (valor)
    (aoa[turnoIdx] as any)[pendCol] = incluirDatos ? (Number(m.pending_hours) || 0) : 0;
    // TIEMPO TOTAL = extra + pendiente
    (aoa[turnoIdx] as any)[ttotCol] = { t: "n", f: `${extraRef}+${pendRef}` };

    // Fusionar celdas de total a través de las 2 filas
    [totalCol, extraCol, pendCol, ttotCol].forEach((c) =>
      merges.push({ s: { r: turnoIdx, c }, e: { r: horasIdx, c } }),
    );
  }

  // --- Bloque CONVERSIONES (convenciones) ---
  aoa.push(blank());
  const convTitle = blank(); convTitle[0] = "CONVERSIONES"; convTitle[3] = "HORARIO";
  aoa.push(convTitle);
  const convHead = blank(); convHead[0] = "LETRA"; convHead[1] = "SIGNIFICADO"; convHead[3] = "HORAS";
  aoa.push(convHead);
  for (const t of tipos.filter((x) => x.active !== false)) {
    const cr = blank();
    cr[0] = t.code;
    cr[1] = t.name;
    cr[3] = t.hours ? `${t.hours} H` : (t.start_time && t.end_time ? `${t.start_time} - ${t.end_time}` : "0 H");
    aoa.push(cr);
  }

  // --- NOVEDADES ---
  aoa.push(blank());
  const nov = blank(); nov[0] = "NOVEDADES";
  aoa.push(nov);
  members.forEach((m) => {
    if (m.notes && m.notes.trim()) {
      const nr = blank(); nr[0] = m.full_name; nr[1] = m.notes;
      aoa.push(nr);
    }
  });

  // --- ELABORADO / APROBADO ---
  aoa.push(blank());
  const el = blank(); el[0] = "ELABORADO POR:"; el[1] = responsable; el[3] = "Cargo:"; el[4] = "Coordinador de Referencia";
  aoa.push(el);
  const ap = blank(); ap[0] = "APROBADO POR:"; ap[3] = "Cargo:"; ap[4] = "Subgerente de Servicios de Salud";
  aoa.push(ap);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: rowLen }, (_, i) => {
    if (i === NAME_COL) return { wch: 22 };
    if (i === DEP_COL) return { wch: 16 };
    if (i >= totalCol) return { wch: 12 };
    return { wch: 4 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TH-FR-10");
  return wb;
}

/**
 * Descarga la PLANTILLA oficial TH-FR-10 del mes/año (vacía, lista para diligenciar).
 */
export function exportarPlantillaCuadro(params: {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
}) {
  const wb = construirLibroOficial({ ...params, incluirDatos: false });
  XLSX.writeFile(wb, `TH-FR-10_Plantilla_${MESES[params.mes - 1]}_${params.anio}.xlsx`);
}

/**
 * Descarga el CUADRO MENSUAL diligenciado en el formato oficial TH-FR-10.
 */
export function exportarCuadroMensual(params: {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
}) {
  const wb = construirLibroOficial({ ...params, incluirDatos: true });
  XLSX.writeFile(wb, `TH-FR-10_Cuadro_${MESES[params.mes - 1]}_${params.anio}.xlsx`);
}

export interface ImportResultado {
  miembrosNuevos: number;
  miembrosExistentes: number;
  diasCargados: number;
  codigosDesconocidos: string[];
  filasOmitidas: number;
}

/**
 * Importa un archivo TH-FR-10 (oficial o simple) al cuadro indicado.
 * Detecta el encabezado ("NOMBRES Y APELLIDOS" oficial o "Colaborador" simple),
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
  let oficial = false;
  for (let i = 0; i < aoa.length; i++) {
    const row = (aoa[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    if (row.includes("nombres y apellidos")) { headerIdx = i; oficial = true; break; }
    if (row[0] === "colaborador") { headerIdx = i; oficial = false; break; }
  }
  if (headerIdx === -1) throw new Error("No se encontró el encabezado ('NOMBRES Y APELLIDOS' o 'Colaborador').");

  const header = aoa[headerIdx].map((h) => String(h ?? "").trim());
  const nameCol = oficial
    ? header.findIndex((h) => h.toLowerCase() === "nombres y apellidos")
    : 0;
  const depCol = oficial ? header.findIndex((h) => h.toLowerCase() === "dependencia / dia") : -1;

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

  const isTurnoRow = (row: (string | number)[]) => {
    if (!oficial || depCol < 0) return true;
    return String(row?.[depCol] ?? "").trim().toLowerCase() === "turno";
  };

  let startData = headerIdx + 1;
  // Saltar fila de letras de día (sub-encabezado)
  const sub = aoa[startData];
  if (sub && String(sub[nameCol] ?? "").trim() === "") startData += 1;

  for (let i = startData; i < aoa.length; i++) {
    const row = aoa[i];
    const nombre = String(row?.[nameCol] ?? "").trim();
    // En formato oficial la fila de horas viene sin nombre; solo procesamos "Turno".
    if (oficial && !isTurnoRow(row)) continue;
    if (!nombre) { if (!oficial) res.filasOmitidas++; continue; }
    // Cortar al llegar a bloques posteriores (CONVERSIONES / NOVEDADES / etc.)
    if (/^(conversiones|novedades|elaborado|aprobado|festivos)/i.test(nombre)) break;

    let member = memberByName.get(norm(nombre));
    const cargo = !oficial ? (String(row?.[1] ?? "").trim() || null) : null;
    const sede = !oficial ? (String(row?.[2] ?? "").trim() || null) : null;

    if (!member) {
      const { data, error } = await supabase
        .from("shift_schedule_members")
        .insert({ schedule_id: scheduleId, full_name: nombre, role_name: cargo, sede, sort_order: sortOrder++ })
        .select("*").single();
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
