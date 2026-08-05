// ============================================================
// ENTRANTES · DTO CANÓNICO (client-safe)
//
// Contratos Zod STRICT compartidos por el frontend y por las server
// functions de creación/confirmación. No contiene lógica de servidor:
// solo la forma de los datos autorizados. Cualquier propiedad adicional
// enviada por el cliente se rechaza (cero mass assignment).
// ============================================================
import { z } from "zod";

/** Texto institucional saneado: sin HTML, sin control chars. */
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), "Caracteres no permitidos");

const textoOpc = (max: number) => texto(max).nullable().optional();

export const TIPOS_ENTRANTE = [
  "ACEP",
  "NEG",
  "CRUE_ACEP",
  "CRUE_NR",
  "CRUE_NEG",
  "SIN_GESTION",
] as const;

export const MODALIDADES = [
  "NORMAL_POR_ACEPTACION",
  "INGRESO_TARDIO",
  "DIRECCIONAMIENTO_CRUE",
  "INGRESO_POSTERIOR_A_NEGACION",
  "SIN_GESTION_PREVIA_REFERENCIA",
] as const;

/** Fecha y hora local `YYYY-MM-DDTHH:mm` (America/Bogota, sin segundos). */
export const fechaHoraLocal = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas");

/** Normalización simple para comparar unidades (sin tildes, mayúsculas). */
const normUnidad = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/**
 * Regla ÚNICA (UI + servidor) de obligatoriedad de la justificación de
 * confirmación. Es obligatoria en toda modalidad excepcional y cuando la
 * unidad real difiere de la prevista. Solo el ingreso normal por aceptación
 * en la misma unidad la deja opcional.
 */
export function requiereJustificacionConfirmacion(i: {
  modalidad: (typeof MODALIDADES)[number];
  unidadPrevista?: string | null;
  unidadReal?: string | null;
}): boolean {
  if (i.modalidad !== "NORMAL_POR_ACEPTACION") return true;
  const prev = normUnidad(i.unidadPrevista);
  const real = normUnidad(i.unidadReal);
  return Boolean(prev) && prev !== real;
}

/** Bloque canónico de confirmación de ingreso (único para todos los flujos). */
export const confirmacionIngresoSchema = z
  .object({
    fechaHora: fechaHoraLocal,
    modalidad: z.enum(MODALIDADES),
    unidadPrevista: texto(120).optional().default(""),
    unidadReal: texto(120).min(1, "Unidad real obligatoria"),
    tipoAmbulancia: texto(40).min(1, "Tipo de ambulancia obligatorio"),
    empresaTep: texto(160).min(1, "Empresa obligatoria"),
    placa: texto(20).min(1, "Placa obligatoria"),
    profesionalTepNombre: texto(160).min(1, "Profesional TEP obligatorio"),
    profesionalTepCargo: texto(120).min(1, "Cargo del profesional TEP obligatorio"),
    justificacion: texto(1000).optional().default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (requiereJustificacionConfirmacion(v) && !v.justificacion.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["justificacion"],
        message: "La justificación de la confirmación es obligatoria en esta modalidad",
      });
    }
  });


export type ConfirmacionIngresoDTO = z.infer<typeof confirmacionIngresoSchema>;

/** Claves de metadata autorizadas (snapshot funcional de la decisión). */
export const METADATA_KEYS = [
  "tipo_caso",
  "entidad_tipo",
  "motivo_negacion",
  "motivo_negacion_label",
  "especialidad_negacion",
  "especialidad_remision",
  "especialidades",
  "especialidad_principal",
  "subtipo_negacion",
  "tipo_documentacion",
  "documentos_solicitados",
  "observaciones",
  "crue_subtipo",
  "codigo_crue",
  "ips_nombre",
  "nombre_funcionario",
  "cargo_funcionario",
  "unidad_requerida",
  "unidad_solicitada",
  "especialidades_requeridas",
  "motivos_negacion_direccionamiento",
  "sin_gestion_previa",
  "procedencia",
  "ingreso",
  "traslado",
  "crue",
] as const;

const metadataSchema = z
  .record(z.enum(METADATA_KEYS), z.unknown())
  .nullable()
  .optional();

export const crearCasoEntranteSchema = z
  .object({
    origen: z.enum(["CON_GESTION", "SIN_GESTION"]),
    tipo: z.enum(TIPOS_ENTRANTE),
    codigo: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}\d{5,9}$/, "Código de gestión inválido"),
    documento: z.string().trim().regex(/^\d{4,15}$/, "Documento inválido"),
    nombres: textoOpc(120),
    apellidos: textoOpc(120),
    eapb: textoOpc(160),
    regimen: textoOpc(60),

    // Origen y remisión (solo CON_GESTION)
    ips: textoOpc(200),
    sede: textoOpc(200),
    fechaEnvioRemision: fechaHoraLocal.nullable().optional(),

    // Datos clínicos comunes (obligatorios en TODOS los orígenes)
    edadValor: z.number().int().min(0).max(130),
    edadUnidad: z.enum(["AÑOS", "MESES", "DÍAS"]),
    especialidadRemision: texto(120).min(2, "Especialidad obligatoria"),
    cie10Codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]\d{2,3}[A-Z0-9]?$/, "Código CIE-10 inválido"),
    /** Descripción informativa: el servidor SIEMPRE usa la del catálogo. */
    cie10Descripcion: texto(300).optional().default(""),


    // Decisión
    medico: textoOpc(160),
    unidadPrevista: textoOpc(120),
    /** Horas de reserva del cupo (0 = sin cupo). El vencimiento lo calcula el servidor. */
    hrsReserva: z.number().int().min(0).max(240).optional().default(0),
    aseguramiento: textoOpc(40),
    detalle: textoOpc(4000),
    especialidadCol: textoOpc(600),
    motivoNegacion: textoOpc(120),
    especialidadNegacion: textoOpc(300),
    justificacionDecision: textoOpc(4000),
    codigoCrue: textoOpc(60),

    // Confirmación de ingreso (solo cuando el flujo ingresa de inmediato)
    ingreso: confirmacionIngresoSchema.nullable().optional(),

    mensaje: z.string().trim().max(20000).nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export type CrearCasoEntranteDTO = z.infer<typeof crearCasoEntranteSchema>;

export const confirmarIngresoSchema = z
  .object({
    casoId: z.string().uuid(),
    codigoIngreso: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}\d{5,9}$/, "Código de ingreso inválido"),
    posterior: z.boolean().optional().default(false),
    observaciones: textoOpc(4000),
    mensaje: z.string().trim().max(20000).nullable().optional(),
    ingreso: confirmacionIngresoSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Eventos posteriores del cupo (ampliación y cancelación / vencimiento).
// Se declaran aquí para que el navegador NUNCA escriba directamente la tabla.
// ---------------------------------------------------------------------------

export const ampliarCupoSchema = z
  .object({
    casoId: z.string().uuid(),
    codigo: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}\d{5,9}$/, "Código de ampliación inválido"),
    /** Nuevo vencimiento calculado a partir del cupo vigente. */
    fechaVence: z.string().datetime(),
    hrsReserva: z.number().int().min(1).max(240),
    detalle: textoOpc(4000),
    mensaje: z.string().trim().max(20000).nullable().optional(),
  })
  .strict();

export type AmpliarCupoDTO = z.infer<typeof ampliarCupoSchema>;

export const cancelarCupoSchema = z
  .object({
    casoId: z.string().uuid(),
    codigo: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}\d{5,9}$/, "Código de cancelación inválido"),
    /** `true` = cierre por vencimiento (no ingresó); `false` = cancelación. */
    vencimiento: z.boolean().optional().default(false),
    motivo: texto(200).min(3, "Motivo de cancelación obligatorio"),
    justificacion: texto(4000).min(3, "La justificación es obligatoria"),
    mensaje: z.string().trim().max(20000).nullable().optional(),
  })
  .strict();

export type CancelarCupoDTO = z.infer<typeof cancelarCupoSchema>;



export type ConfirmarIngresoDTO = z.infer<typeof confirmarIngresoSchema>;

// ---------------------------------------------------------------------------
// Utilidades compartidas (UI + servidor)
// ---------------------------------------------------------------------------

/**
 * Sede canónica del catálogo IPS: el catálogo almacena la ubicación como
 * "CIUDAD - DEPARTAMENTO". Se separa SIEMPRE en las dos columnas existentes;
 * nunca se crea un catálogo nuevo de ciudades ni de departamentos.
 */
export function partirSede(sede: string | null | undefined): {
  ciudad: string;
  departamento: string;
} {
  const s = (sede ?? "").trim();
  if (!s) return { ciudad: "", departamento: "" };
  const partes = s.split(/\s+[-–]\s+/);
  if (partes.length >= 2) {
    return {
      ciudad: partes.slice(0, -1).join(" - ").trim().toUpperCase(),
      departamento: partes[partes.length - 1].trim().toUpperCase(),
    };
  }
  return { ciudad: s.toUpperCase(), departamento: "" };
}

/** Convierte `YYYY-MM-DDTHH:mm` (hora de Colombia, UTC-5) a ISO absoluto. */
export function localBogotaAIso(v: string): string {
  return new Date(`${v}:00-05:00`).toISOString();
}
