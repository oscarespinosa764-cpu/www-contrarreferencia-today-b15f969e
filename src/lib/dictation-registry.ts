// Registro de puntos de dictado por voz disponibles en el sistema.
//
// Este registro permite que la subventana "Dictado por voz" de Control de Mando
// muestre los campos compatibles aunque todavía no exista una fila de
// configuración en la base de datos. La configuración persistente
// (activar/desactivar, modo, idioma, roles) vive en la tabla
// `voice_dictation_config` y, cuando existe, tiene prioridad sobre estos
// valores por defecto.

export type DictationInsertMode = "append" | "replace" | "replace-selection";
export type DictationFieldType =
  | "textarea"
  | "input"
  | "contenteditable"
  | "custom"
  | "otro";
export type DictationRole = "admin" | "operativa" | "temporal";

export interface DictationRegistryItem {
  key: string;
  modulo: string;
  ventana: string;
  subventana: string;
  nombre_campo: string;
  selector: string;
  tipo_campo: DictationFieldType;
  modo_insercion: DictationInsertMode;
  idioma: string;
  activo: boolean;
  roles_permitidos: DictationRole[];
}

const sel = (key: string) => `[data-dictation-key="${key}"]`;

function point(
  key: string,
  modulo: string,
  ventana: string,
  subventana: string,
  nombre_campo: string,
): DictationRegistryItem {
  return {
    key,
    modulo,
    ventana,
    subventana,
    nombre_campo,
    selector: sel(key),
    tipo_campo: "textarea",
    modo_insercion: "append",
    idioma: "es-CO",
    activo: true,
    roles_permitidos: ["admin", "operativa"],
  };
}

export const DICTATION_REGISTRY: DictationRegistryItem[] = [
  point(
    "salientes.seguimiento.observaciones",
    "Remisiones salientes",
    "Dashboard Operativo Salientes",
    "Seguimiento",
    "Observaciones",
  ),
  point(
    "salientes.seguimiento.plantilla_indigo",
    "Remisiones salientes",
    "Dashboard Operativo Salientes",
    "Seguimiento",
    "Plantilla Índigo",
  ),
  point(
    "salientes.seguimiento.motivo_pendiente",
    "Remisiones salientes",
    "Dashboard Operativo Salientes",
    "Seguimiento",
    "Motivo del pendiente",
  ),
  point(
    "phd.seguimiento.observaciones",
    "PHD / PAD / O2 / Especiales",
    "Dashboard Operativo",
    "Seguimiento",
    "Observaciones",
  ),
  point(
    "phd.seguimiento.plantilla_indigo",
    "PHD / PAD / O2 / Especiales",
    "Dashboard Operativo",
    "Seguimiento",
    "Plantilla Índigo",
  ),
  point(
    "referencia_interna.seguimiento.observaciones",
    "Referencias internas",
    "Dashboard Operativo",
    "Seguimiento",
    "Observaciones",
  ),
  point(
    "pendientes.seguimiento.observaciones",
    "Pendientes",
    "Dashboard Operativo",
    "Seguimiento",
    "Observaciones",
  ),
  point(
    "salientes.nuevo.justificacion",
    "Remisiones salientes",
    "Nuevo registro",
    "Datos clínicos",
    "Justificación de remisión",
  ),
  point(
    "salientes.nuevo.observaciones",
    "Remisiones salientes",
    "Nuevo registro",
    "Datos clínicos",
    "Observaciones",
  ),
  point(
    "reglas.aviso.mensaje",
    "Reglas y Alertas",
    "Reglas y Alertas",
    "Aviso manual",
    "Mensaje del aviso",
  ),
  point(
    "reglas.regla.mensaje",
    "Reglas y Alertas",
    "Reglas y Alertas",
    "Regla operativa",
    "Mensaje del aviso",
  ),
  point(
    "reglas.regla.accion",
    "Reglas y Alertas",
    "Reglas y Alertas",
    "Regla operativa",
    "Acción sugerida",
  ),
  point(
    "red.novedades",
    "Red / Disponibilidad IPS",
    "Red / Disponibilidad IPS",
    "Registro IPS",
    "Novedades",
  ),
  point(
    "red.observaciones",
    "Red / Disponibilidad IPS",
    "Red / Disponibilidad IPS",
    "Registro IPS",
    "Observaciones generales",
  ),
];

export const DICTATION_REGISTRY_BY_KEY: Record<string, DictationRegistryItem> =
  Object.fromEntries(DICTATION_REGISTRY.map((p) => [p.key, p]));

export const DICTATION_MODULOS = [
  "Remisiones entrantes",
  "Remisiones salientes",
  "PHD / PAD / O2 / Especiales",
  "Referencias internas",
  "Pendientes",
  "Historial",
  "Red / Disponibilidad IPS",
  "Reglas y Alertas",
  "Control de Mando",
  "Catálogos",
  "Indicadores",
  "Otro",
];

export const DICTATION_IDIOMAS = [
  { value: "es-CO", label: "Español (Colombia) · es-CO" },
  { value: "es", label: "Español · es" },
  { value: "es-ES", label: "Español (España) · es-ES" },
];

export const DICTATION_MODOS: { value: DictationInsertMode; label: string }[] = [
  { value: "append", label: "Agregar al final" },
  { value: "replace", label: "Reemplazar contenido" },
  { value: "replace-selection", label: "Reemplazar selección" },
];

export const DICTATION_TIPOS: { value: DictationFieldType; label: string }[] = [
  { value: "textarea", label: "Área de texto (textarea)" },
  { value: "input", label: "Campo de texto (input)" },
  { value: "contenteditable", label: "Editable (contenteditable)" },
  { value: "custom", label: "Editor personalizado" },
  { value: "otro", label: "Otro" },
];

// Campos cortos / identificadores donde NO se recomienda activar dictado.
export const DICTATION_CAMPOS_SENSIBLES = [
  "documento",
  "telefono",
  "teléfono",
  "correo",
  "email",
  "contraseña",
  "password",
  "radicado",
  "codigo",
  "código",
  "fecha",
  "hora",
  "nombre",
  "placa",
];

export function pareceCampoSensible(nombre: string, key: string): boolean {
  const txt = `${nombre} ${key}`.toLowerCase();
  return DICTATION_CAMPOS_SENSIBLES.some((c) => txt.includes(c));
}
