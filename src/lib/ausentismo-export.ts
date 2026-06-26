// Exportación del Control de Ausentismo TH-FR-48 a Excel (SheetJS).
// Reproduce el encabezado institucional y las columnas del formato.
import * as XLSX from "xlsx";
import { eventoNombre, fmtFecha } from "./cuadro-turno-utils";

export interface AbsRecord {
  registration_date: string | null;
  identification_number: string | null;
  worker_name: string | null;
  role_name: string | null;
  start_date: string | null;
  end_date: string | null;
  minutes_number: number;
  days_number: number;
  event_code: string | null;
  reason: string | null;
  eps: string | null;
  arl: string | null;
  daily_salary: number | null;
  required_resources: string | null;
  additional_details: string | null;
  status: string;
}

const META = [
  ["SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO"],
  ["Formato — Control y seguimiento ausentismos laborales"],
  ["Código: TH-FR-48   Versión: 2   Aprobado: 25/09/2024"],
  [],
];

const HEADERS = [
  "#", "Fecha de registro", "C.C.", "Nombre del trabajador", "Cargo",
  "Fecha inicio", "Fecha fin", "No. minutos", "No. días",
  "Evento presentado", "Motivo", "EPS", "ARL", "Salario día",
  "Recursos requeridos", "Detalles adicionales", "Estado",
];

export function exportarAusentismoTH48(
  records: AbsRecord[],
  opts: { mes: string; anio: number; incluirCostos: boolean },
) {
  const filas = records.map((r, i) => [
    i + 1,
    fmtFecha(r.registration_date),
    r.identification_number ?? "",
    r.worker_name ?? "",
    r.role_name ?? "",
    fmtFecha(r.start_date),
    fmtFecha(r.end_date),
    r.minutes_number ?? 0,
    r.days_number ?? 0,
    r.event_code ? `${r.event_code} — ${eventoNombre(r.event_code)}` : "",
    r.reason ?? "",
    r.eps ?? "",
    r.arl ?? "",
    opts.incluirCostos ? (r.daily_salary ?? "") : "—",
    r.required_resources ?? "",
    r.additional_details ?? "",
    r.status,
  ]);

  const aoa = [...META, [`Periodo: ${opts.mes} ${opts.anio}`], [], HEADERS, ...filas];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TH-FR-48");
  XLSX.writeFile(wb, `TH-FR-48_Control_Ausentismos_${opts.mes}_${opts.anio}.xlsx`);
}
