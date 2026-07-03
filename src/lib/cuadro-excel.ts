// Importación / exportación BAJO DEMANDA del Cuadro de Turno TH-FR-10 (SheetJS).
//
// El layout replica el formato REAL "TH-FR-10 Cuadro de Turnos":
//   - Bloque institucional (código / versión / periodo).
//   - Encabezado: Colaborador | Cargo | Sede | días 1..N.
//   - Una fila por colaborador con el código de convención por día.
//   - Hoja "Convenciones" (Código | Nombre | Horas).
//
// Los archivos se generan/parsean 100% en memoria en el navegador.

import * as XLSX from "xlsx";
import { supabase } from "@/lib/backend-client";
import {
  diasDelMes, letraDiaSemana, fechaISO, MESES,
  type ShiftType, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";

interface BuildParams {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  incluirDatos: boolean; // true = cuadro lleno; false = plantilla vacía
}

function construirLibro(p: BuildParams): XLSX.WorkBook {
  const { anio, mes, members, days, tipos, incluirDatos } = p;
  const ndias = diasDelMes(anio, mes);

  const dayMap = new Map<string, ShiftDay>();
  for (const d of days) dayMap.set(`${d.member_id}:${d.day_number}`, d);

  const aoa: (string | number)[][] = [];
  aoa.push(["SISTEMA DE GESTIÓN — TALENTO HUMANO"]);
  aoa.push([INSTITUCION]);
  aoa.push(["Formato — Cuadro de turno mensual"]);
  aoa.push(["Código: TH-FR-10   Versión: 2"]);
  aoa.push([`Periodo: ${MESES[mes - 1]} ${anio}`]);
  aoa.push([
    "Instrucciones: escriba el código de convención en la celda del día. Deje vacío para descanso/sin turno.",
  ]);
  aoa.push([]); // fila 7 en blanco

  // Encabezado (fila 8)
  const header: (string | number)[] = ["Colaborador", "Cargo", "Sede"];
  for (let d = 1; d <= ndias; d++) header.push(d);
  aoa.push(header);

  // Sub-encabezado: letra del día de la semana (fila 9)
  const dow: (string | number)[] = ["", "", ""];
  for (let d = 1; d <= ndias; d++) dow.push(letraDiaSemana(anio, mes, d));
  aoa.push(dow);

  // Una fila por colaborador
  const lista = members.length > 0 ? members : [];
  for (const m of lista) {
    const row: (string | number)[] = [m.full_name || "", m.role_name || "", m.sede || ""];
    for (let d = 1; d <= ndias; d++) {
      if (incluirDatos) {
        const cd = dayMap.get(`${m.id}:${d}`);
        row.push(cd?.shift_code ?? "");
      } else {
        row.push("");
      }
    }
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 28 }, // Colaborador
    { wch: 22 }, // Cargo
    { wch: 14 }, // Sede
    ...Array.from({ length: ndias }, () => ({ wch: 4 })),
  ];

  // Hoja de convenciones
  const conv: (string | number)[][] = [["CONVENCIONES"], ["Código", "Nombre", "Horas"]];
  for (const t of tipos.filter((x) => x.active !== false)) {
    conv.push([t.code, t.name, t.hours ?? 0]);
  }
  const wsConv = XLSX.utils.aoa_to_sheet(conv);
  wsConv["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 8 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TH-FR-10");
  XLSX.utils.book_append_sheet(wb, wsConv, "Convenciones");
  return wb;
}

/** Descarga la PLANTILLA oficial TH-FR-10 del mes/año (vacía). */
export function exportarPlantillaCuadro(params: {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
}) {
  const wb = construirLibro({ ...params, incluirDatos: false });
  XLSX.writeFile(wb, `TH-FR-10_Plantilla_${MESES[params.mes - 1]}_${params.anio}.xlsx`);
}

/** Descarga el CUADRO MENSUAL diligenciado en el formato oficial TH-FR-10. */
export function exportarCuadroMensual(params: {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  baseHoras?: number;
  responsable?: string;
}) {
  const wb = construirLibro({ ...params, incluirDatos: true });
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
  const depCol = header.findIndex((h) => h.toLowerCase() === "dependencia / dia");

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

  for (let i = startData; i < aoa.length; i++) {
    const row = aoa[i];
    const nombre = String(row?.[nameCol] ?? "").trim();
    if (!nombre) { res.filasOmitidas++; continue; }
    // Cortar al llegar a bloques posteriores.
    if (/^(conversiones|convenciones|novedades|elaborado|aprobado|festivos)/i.test(nombre)) break;

    let member = memberByName.get(norm(nombre));
    const cargo = cargoCol >= 0 ? (String(row?.[cargoCol] ?? "").trim() || null) : null;
    const sede = sedeCol >= 0 ? (String(row?.[sedeCol] ?? "").trim() || null)
      : depCol >= 0 ? null : null;

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
