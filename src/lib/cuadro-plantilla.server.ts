// Generación server-side del Cuadro de Turno en el formato oficial TH-FR-10.
// Parte de la plantilla institucional real (logos, estilos, bordes, impresión)
// y solo escribe datos: periodo, colaboradores, cargos, sedes, turnos, horas,
// convenciones y firmas. No crea un formato paralelo.
import ExcelJS from "exceljs";
import { TH_FR_10_BASE_B64 } from "./cuadro-plantilla-base.server";

const HOJA = "BASE";
const FILA_INICIO = 12; // primer bloque (fila turno; la siguiente es horas)
export const MAX_COLABORADORES = 20;
const COL_DIA_1 = 10; // columna J
const MAX_DIAS = 31;

export interface FilaColaborador {
  nombre: string;
  cargo?: string | null;
  sede?: string | null;
  /** día (1..31) -> { code, hours } */
  turnos: Record<number, { code: string; hours: number | null }>;
}

export interface ConvencionFila {
  code: string;
  name: string;
  inicio?: string | null;
  fin?: string | null;
  horas?: number | null;
}

export interface BuildParams {
  anio: number;
  mes: number;
  nombreMes: string;
  letraDia: (dia: number) => string;
  baseHoras: number;
  responsable?: string | null;
  elaboradoNombre?: string | null;
  elaboradoCargo?: string | null;
  filas: FilaColaborador[];
  convenciones: ConvencionFila[];
}

/** Devuelve el XLSX oficial TH-FR-10 diligenciado, en base64. */
export async function construirCuadroTHFR10(p: BuildParams): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(TH_FR_10_BASE_B64, "base64"));
  const ws = wb.getWorksheet(HOJA);
  if (!ws) throw new Error("PLANTILLA_INVALIDA");
  ws.name = `${p.nombreMes.slice(0, 3).toUpperCase()}`;

  const ndias = new Date(p.anio, p.mes, 0).getDate();

  // Cabecera institucional
  ws.getCell("C6").value = `${p.nombreMes.toUpperCase()} ${p.anio}`;
  if (p.responsable) ws.getCell("C8").value = p.responsable;

  // Encabezado de días (números y letras) + ocultar días sobrantes
  for (let d = 1; d <= MAX_DIAS; d++) {
    const col = COL_DIA_1 + d - 1;
    const dentro = d <= ndias;
    ws.getRow(10).getCell(col).value = dentro ? d : null;
    ws.getRow(11).getCell(col).value = dentro ? p.letraDia(d) : null;
    ws.getColumn(col).hidden = !dentro;
  }

  // Bloques de colaboradores
  const filas = p.filas.slice(0, MAX_COLABORADORES);
  for (let i = 0; i < MAX_COLABORADORES; i++) {
    const rTurno = FILA_INICIO + i * 2;
    const rHoras = rTurno + 1;
    const fila = filas[i];

    if (!fila) {
      ws.getRow(rTurno).hidden = true;
      ws.getRow(rHoras).hidden = true;
      continue;
    }
    ws.getRow(rTurno).hidden = false;
    ws.getRow(rHoras).hidden = false;

    ws.getCell(`B${rTurno}`).value = fila.nombre.toUpperCase();
    const detalle = [fila.cargo?.trim(), fila.sede?.trim()].filter(Boolean).join(" · ");
    ws.getCell(`B${rHoras}`).value = detalle || null;

    for (let d = 1; d <= MAX_DIAS; d++) {
      const col = COL_DIA_1 + d - 1;
      const t = d <= ndias ? fila.turnos[d] : undefined;
      ws.getRow(rTurno).getCell(col).value = t?.code ?? null;
      ws.getRow(rHoras).getCell(col).value = t && t.hours != null ? t.hours : null;
    }

    ws.getCell(`AO${rTurno}`).value = { formula: `SUM(J${rHoras}:AN${rHoras})` };
    ws.getCell(`AP${rTurno}`).value = { formula: `AO${rTurno}-${p.baseHoras}` };
  }

  // Convenciones (LETRA | SIGNIFICADO | INICIO | FIN | H) — filas 55..60
  const convFilas = [55, 56, 57, 58, 59, 60];
  p.convenciones.slice(0, convFilas.length).forEach((c, idx) => {
    const r = convFilas[idx];
    ws.getCell(`F${r}`).value = c.code;
    ws.getCell(`G${r}`).value = c.name;
    ws.getCell(`H${r}`).value = c.inicio ?? null;
    ws.getCell(`I${r}`).value = c.fin ?? null;
    ws.getCell(`J${r}`).value = c.horas ?? null;
  });

  // Firmas
  if (p.elaboradoNombre) ws.getCell("Q64").value = p.elaboradoNombre;
  if (p.elaboradoCargo) ws.getCell("Q65").value = p.elaboradoCargo;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString("base64");
}
