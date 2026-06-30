// Importación / exportación BAJO DEMANDA del Cuadro de Turno TH-FR-10 (SheetJS).
//
// IMPORTANTE (control de costos): los archivos se generan/parsean en memoria en
// el navegador. La plantilla exportada NO se guarda en el servidor; la
// importación solo escribe en las tablas del cuadro. SheetJS es 100% JS.

import * as XLSX from "xlsx";
import { supabase } from "@/lib/backend-client";
import {
  diasDelMes, letraDiaSemana, fechaISO, MESES,
  type ShiftType, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";

/**
 * Exporta la plantilla TH-FR-10 del mes (estructura editable para reimportar).
 * Incluye colaboradores y códigos ya cargados, más una hoja de convenciones.
 */
export function exportarPlantillaCuadro(params: {
  anio: number;
  mes: number;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
}) {
  const { anio, mes, members, days, tipos } = params;
  const ndias = diasDelMes(anio, mes);

  const META = [
    ["SISTEMA DE GESTIÓN — TALENTO HUMANO"],
    [INSTITUCION],
    ["Formato — Cuadro de turno mensual"],
    ["Código: TH-FR-10   Versión: 2"],
    [`Periodo: ${MESES[mes - 1]} ${anio}`],
    ["Instrucciones: escriba el código de convención en la celda del día. Deje vacío para descanso/sin turno."],
    [],
  ];

  const diasHeader = Array.from({ length: ndias }, (_, i) => String(i + 1));
  const diasLetra = Array.from({ length: ndias }, (_, i) => letraDiaSemana(anio, mes, i + 1));
  const header = ["Colaborador", "Cargo", "Sede", ...diasHeader];
  const subHeader = ["", "", "", ...diasLetra];

  const dayMap = new Map<string, ShiftDay>();
  for (const d of days) dayMap.set(`${d.member_id}:${d.day_number}`, d);

  const filas = members.map((m) => {
    const celdas = Array.from({ length: ndias }, (_, i) =>
      dayMap.get(`${m.id}:${i + 1}`)?.shift_code ?? "");
    return [m.full_name, m.role_name ?? "", m.sede ?? "", ...celdas];
  });
  // Fila vacía guía si no hay colaboradores
  if (filas.length === 0) filas.push(["", "", "", ...Array(ndias).fill("")]);

  const aoa = [...META, header, subHeader, ...filas];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((h, i) => ({ wch: i < 3 ? Math.max(14, h.length) : 4 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TH-FR-10");

  // Hoja de convenciones
  const conv = [["CONVENCIONES"], ["Código", "Nombre", "Horas"]];
  for (const t of tipos) conv.push([t.code, t.name, String(t.hours)]);
  const wsc = XLSX.utils.aoa_to_sheet(conv);
  wsc["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsc, "Convenciones");

  XLSX.writeFile(wb, `TH-FR-10_Cuadro_${MESES[mes - 1]}_${anio}.xlsx`);
}

export interface ImportResultado {
  miembrosNuevos: number;
  miembrosExistentes: number;
  diasCargados: number;
  codigosDesconocidos: string[];
  filasOmitidas: number;
}

/**
 * Importa un archivo TH-FR-10 al cuadro indicado. Crea colaboradores faltantes
 * (match por nombre) y asigna los códigos por día. Las horas se toman de la
 * convención correspondiente. No borra datos existentes; sobreescribe celdas.
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
  const ndias = diasDelMes(anio, mes);
  const tipoMap = new Map(tipos.map((t) => [t.code.toUpperCase(), t]));

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["TH-FR-10"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("El archivo no contiene una hoja válida.");
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" });

  // Localizar fila de encabezado (la que empieza con "Colaborador")
  let headerIdx = -1;
  for (let i = 0; i < aoa.length; i++) {
    const c0 = String(aoa[i]?.[0] ?? "").trim().toLowerCase();
    if (c0 === "colaborador") { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("No se encontró el encabezado 'Colaborador'.");

  const header = aoa[headerIdx].map((h) => String(h ?? "").trim());
  // Mapear índice de columna -> número de día
  const dayCols: { col: number; day: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    const n = parseInt(header[c], 10);
    if (!Number.isNaN(n) && n >= 1 && n <= ndias) dayCols.push({ col: c, day: n });
  }
  if (dayCols.length === 0) throw new Error("No se encontraron columnas de días (1..N).");

  // La segunda fila puede ser sub-encabezado de letras; se salta si col 0 vacío
  let startData = headerIdx + 1;
  const sub = aoa[startData];
  if (sub && String(sub[0] ?? "").trim() === "" && String(sub[1] ?? "").trim() === "") {
    startData += 1;
  }

  const res: ImportResultado = {
    miembrosNuevos: 0, miembrosExistentes: 0, diasCargados: 0,
    codigosDesconocidos: [], filasOmitidas: 0,
  };
  const desconocidos = new Set<string>();

  // Index de miembros por nombre normalizado
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const memberByName = new Map(members.map((m) => [norm(m.full_name), m]));
  let sortOrder = members.length;

  const dayRows: Array<Omit<ShiftDay, "id">> = [];

  for (let i = startData; i < aoa.length; i++) {
    const row = aoa[i];
    const nombre = String(row?.[0] ?? "").trim();
    if (!nombre) { res.filasOmitidas++; continue; }

    let member = memberByName.get(norm(nombre));
    const cargo = String(row?.[1] ?? "").trim() || null;
    const sede = String(row?.[2] ?? "").trim() || null;

    if (!member) {
      const { data, error } = await supabase
        .from("shift_schedule_members")
        .insert({
          schedule_id: scheduleId, full_name: nombre,
          role_name: cargo, sede, sort_order: sortOrder++,
        })
        .select("*")
        .single();
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
        schedule_id: scheduleId,
        member_id: member.id,
        day_number: day,
        shift_date: fechaISO(anio, mes, day),
        shift_code: tipo.code,
        hours: tipo.hours,
        notes: null,
        origin: "import",
      });
    }
  }

  // Upsert de días (conflicto por schedule/member/day)
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
