import {
  Building2,
  Building,
  UserRound,
  Handshake,
  Ambulance,
  type LucideIcon,
} from "lucide-react";

// Tipos de red soportados por el módulo Red / Disponibilidad IPS.
export type TipoRed =
  | "ips_nacional"
  | "ips_departamental"
  | "especialista_interno"
  | "ips_aliada"
  | "ambulancia_autorizacion";

export interface RelacionRed {
  nombre: string;
  especialidad?: string;
  fechas?: string;
  jornada?: string;
  contacto?: string;
}

export interface CodigoApoyo {
  entidad: string;
  codigo_principal?: string;
  codigo_alterno?: string;
  telefono?: string;
  observacion?: string;
}

// Forma del registro tal como vive en la tabla red_operativa (campos usados).
export interface RedRegistro {
  id: string;
  entidad: string | null;
  tipo_red: TipoRed | string | null;
  estado: string | null;
  ciudad: string | null;
  departamento: string | null;
  servicio_especialidad: string | null;
  telefono: string | null;
  correo: string | null;
  contacto: string | null;
  contacto_principal: string | null;
  direccion: string | null;
  medico: string | null;
  sede: string | null;
  jornada: string | null;
  horario: string | null;
  tipo_apoyo: string | null;
  tipo_ambulancia: string | null;
  codigo_principal: string | null;
  codigo_alterno: string | null;
  disponible_para_remisiones: boolean | null;
  novedad_disponibilidad: string | null;
  fecha_actualizacion_disponibilidad: string | null;
  usuario_actualizacion: string | null;
  fecha_inicio: string | null;
  fecha_final: string | null;
  observaciones: string | null;
  relaciones_red: RelacionRed[] | null;
  codigos_apoyo: CodigoApoyo[] | null;
  archivado: boolean | null;
  created_at: string;
  updated_at: string | null;
}

export interface TabConfig {
  key: TipoRed;
  label: string;
  short: string;
  addLabel: string;
  icon: LucideIcon;
  esEspecialista: boolean;
  esAmbulancia: boolean;
}

export const RED_TABS: TabConfig[] = [
  {
    key: "ips_nacional",
    label: "IPS NACIONALES",
    short: "IPS",
    addLabel: "Agregar IPS",
    icon: Building2,
    esEspecialista: false,
    esAmbulancia: false,
  },
  {
    key: "ips_departamental",
    label: "IPS DEPARTAMENTALES",
    short: "IPS",
    addLabel: "Agregar IPS",
    icon: Building,
    esEspecialista: false,
    esAmbulancia: false,
  },
  {
    key: "especialista_interno",
    label: "ESPECIALISTAS INTERNOS",
    short: "Especialista",
    addLabel: "Agregar especialista",
    icon: UserRound,
    esEspecialista: true,
    esAmbulancia: false,
  },
  {
    key: "ips_aliada",
    label: "IPS ALIADAS",
    short: "IPS aliada",
    addLabel: "Agregar IPS aliada",
    icon: Handshake,
    esEspecialista: false,
    esAmbulancia: false,
  },
  {
    key: "ambulancia_autorizacion",
    label: "AMBULANCIAS / AUTORIZACIONES",
    short: "Ambulancia / autorización",
    addLabel: "Agregar ambulancia/autorización",
    icon: Ambulance,
    esEspecialista: false,
    esAmbulancia: true,
  },
];

export const TIPO_RED_LABEL: Record<TipoRed, string> = {
  ips_nacional: "IPS nacional",
  ips_departamental: "IPS departamental",
  especialista_interno: "Especialista interno",
  ips_aliada: "IPS aliada",
  ambulancia_autorizacion: "Ambulancia / autorización",
};

export const JORNADAS = ["Mañana", "Tarde", "Noche", "Jornada completa"];
export const TIPOS_APOYO = ["Ambulancia", "Autorizaciones", "Ambulancia y autorizaciones"];

export function getTab(tipo: TipoRed): TabConfig {
  return RED_TABS.find((t) => t.key === tipo) ?? RED_TABS[1];
}

// Normaliza para búsqueda tolerante a tildes/mayúsculas.
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Texto completo de un registro para el buscador.
export function textoBusqueda(r: RedRegistro): string {
  const rels = (r.relaciones_red ?? [])
    .map((x) => [x.nombre, x.especialidad, x.contacto].filter(Boolean).join(" "))
    .join(" ");
  const cods = (r.codigos_apoyo ?? [])
    .map((x) => [x.entidad, x.codigo_principal, x.codigo_alterno].filter(Boolean).join(" "))
    .join(" ");
  return norm(
    [
      r.entidad,
      r.servicio_especialidad,
      r.medico,
      r.telefono,
      r.correo,
      r.contacto,
      r.contacto_principal,
      r.ciudad,
      r.departamento,
      r.direccion,
      r.tipo_apoyo,
      r.tipo_ambulancia,
      r.codigo_principal,
      r.codigo_alterno,
      r.novedad_disponibilidad,
      r.observaciones,
      rels,
      cods,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function esActivo(r: RedRegistro): boolean {
  return (r.estado || "activo").toLowerCase() !== "inactivo";
}

export function ubicacion(r: RedRegistro): string {
  return [r.ciudad, r.departamento].filter(Boolean).join(", ");
}

export function serviciosList(r: RedRegistro): string[] {
  return (r.servicio_especialidad || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
