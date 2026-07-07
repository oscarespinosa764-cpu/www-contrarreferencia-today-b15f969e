import {
  CalendarClock,
  Building2,
  Ambulance,
  Stethoscope,
  BookUser,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos de red (valor guardado en red_operativa.tipo_red)
// ---------------------------------------------------------------------------
export type TipoRed =
  | "ips_nacional"
  | "ips_departamental"
  | "especialista_interno" // ESPECIALIDADES CEDIM
  | "ips_aliada"
  | "ambulancia_autorizacion"
  | "jornada_especialidad"
  | "codigo_tep"
  // DIRECTORIO INTERNO (contactos institucionales, sedes, extensiones)
  | "directorio_referencia"
  | "sede"
  | "directorio_contacto";

// Pestañas principales (grupos) del módulo
export type RedGrupo =
  | "jornadas_tep"
  | "ips"
  | "ambulancias"
  | "especialidades_cedim"
  | "directorio_interno";

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
  cargo_contacto: string | null;
  direccion: string | null;
  medico: string | null;
  sede: string | null;
  jornada: string | null;
  horario: string | null;
  tipo_apoyo: string | null;
  tipo_ambulancia: string | null;
  codigo_principal: string | null;
  codigo_alterno: string | null;
  nit: string | null;
  eapb_aseguradoras: string | null;
  ambito: string | null; // 'caqueta' | 'nacional'
  empresa_tep: string | null;
  cups: string | null;
  cups_descripcion: string | null;
  recorrido: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
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

export interface GrupoConfig {
  key: RedGrupo;
  label: string;
  icon: LucideIcon;
  tipos: TipoRed[]; // tipo_red que pertenecen a este grupo
  tieneAmbito: boolean; // divide interno Caquetá / Nacional
  buscarPlaceholder: string;
}

// Orden solicitado: JORNADAS/CÓDIGOS TEP primero
export const RED_GRUPOS: GrupoConfig[] = [
  {
    key: "jornadas_tep",
    label: "JORNADAS / CÓDIGOS TEP",
    icon: CalendarClock,
    tipos: ["jornada_especialidad", "codigo_tep"],
    tieneAmbito: false,
    buscarPlaceholder: "Buscar especialidad, IPS, empresa TEP, CUPS, EAPB…",
  },
  {
    key: "ips",
    label: "IPS",
    icon: Building2,
    tipos: ["ips_nacional", "ips_departamental"],
    tieneAmbito: true,
    buscarPlaceholder: "Buscar IPS, ciudad, especialidad, servicio, EAPB, contacto…",
  },
  {
    key: "ambulancias",
    label: "AMBULANCIAS",
    icon: Ambulance,
    tipos: ["ambulancia_autorizacion", "ips_aliada"],
    tieneAmbito: true,
    buscarPlaceholder: "Buscar empresa, ciudad, tipo de ambulancia, EAPB, CUPS…",
  },
  {
    key: "especialidades_cedim",
    label: "ESPECIALIDADES CEDIM",
    icon: Stethoscope,
    tipos: ["especialista_interno"],
    tieneAmbito: false,
    buscarPlaceholder: "Buscar especialidad, profesional, servicio, sede…",
  },
];

export const TIPO_RED_LABEL: Record<TipoRed, string> = {
  ips_nacional: "IPS nacional",
  ips_departamental: "IPS departamental",
  especialista_interno: "Especialidad CEDIM",
  ips_aliada: "IPS aliada",
  ambulancia_autorizacion: "Ambulancia / autorización",
  jornada_especialidad: "Jornada de especialidad / IPS",
  codigo_tep: "Código TEP",
};

export const JORNADAS = ["Mañana", "Tarde", "Noche", "Día completo", "Otro"];
export const ESTADOS_JORNADA = ["Activo", "Inactivo", "Finalizado"];
export const TIPOS_AMBULANCIA = ["TAB", "TAM", "TAM-N", "AÉREA"];

export function getGrupo(key: RedGrupo): GrupoConfig {
  return RED_GRUPOS.find((g) => g.key === key) ?? RED_GRUPOS[0];
}

export function grupoDeTipo(tipo: string | null | undefined): RedGrupo {
  const t = (tipo || "ips_departamental") as TipoRed;
  return RED_GRUPOS.find((g) => g.tipos.includes(t))?.key ?? "ips";
}

// Ámbito: usa el campo explícito o infiere por departamento (Caquetá).
export function esCaqueta(r: RedRegistro): boolean {
  if (r.ambito) return r.ambito.toLowerCase() === "caqueta";
  return norm(r.departamento || r.ciudad || "").includes("caquet");
}

// Normaliza para búsqueda tolerante a tildes/mayúsculas.
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function textoBusqueda(r: RedRegistro): string {
  const rels = (r.relaciones_red ?? [])
    .map((x) => [x.nombre, x.especialidad, x.contacto].filter(Boolean).join(" "))
    .join(" ");
  const cods = (r.codigos_apoyo ?? [])
    .map((x) => [x.entidad, x.codigo_principal, x.codigo_alterno].filter(Boolean).join(" "))
    .join(" ");
  return norm(
    [
      r.entidad, r.servicio_especialidad, r.medico, r.telefono, r.correo, r.contacto,
      r.contacto_principal, r.cargo_contacto, r.ciudad, r.departamento, r.direccion,
      r.tipo_apoyo, r.tipo_ambulancia, r.codigo_principal, r.codigo_alterno, r.nit,
      r.eapb_aseguradoras, r.empresa_tep, r.cups, r.cups_descripcion, r.recorrido,
      r.jornada, r.novedad_disponibilidad, r.observaciones, rels, cods,
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
