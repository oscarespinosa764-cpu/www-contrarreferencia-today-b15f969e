// ============================================================
// ENTRANTES · CAPA SERVER CANÓNICA (server-only).
//
// Única vía autorizada para CREAR un caso entrante y para CONFIRMAR el
// ingreso del paciente. Valida sesión, membresía activa, catálogos,
// fechas, ciudad/departamento derivados de la sede y clasifica en la BD
// (trigger). El cliente no elige columnas: aquí se arma la fila.
// ============================================================
import {
  partirSede,
  localBogotaAIso,
  requiereJustificacionConfirmacion,
  type CrearCasoEntranteDTO,
  type ConfirmarIngresoDTO,
  type AmpliarCupoDTO,
  type CancelarCupoDTO,
} from "./entrantes-dto";
import { resolverCie10 } from "./cie10.server";
import { registrarAuditoriaServer } from "./auditoria.server";


type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type EntranteResultado = { ok: boolean; error?: string; codigo?: string };

const err = (m: string): EntranteResultado => ({ ok: false, error: m });

/** Margen de tolerancia para relojes desfasados (5 minutos). */
const TOLERANCIA_MS = 5 * 60 * 1000;

function noFutura(iso: string, etiqueta: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return `${etiqueta}: fecha inválida`;
  if (t > Date.now() + TOLERANCIA_MS) return `${etiqueta} no puede ser futura`;
  return null;
}

async function verificarMiembroActivo(
  supabase: { rpc: unknown },
  userId: string,
): Promise<boolean> {
  const { data } = await (supabase.rpc as RpcFn)("is_active_member", { _user_id: userId });
  return Boolean(data);
}

type CatalogoRow = { tipo: string; valor: string; extra1: string | null };

async function cargarCatalogos(admin: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => Promise<{ data: CatalogoRow[] | null }>;
    };
  };
}): Promise<CatalogoRow[]> {
  const { data } = await admin.from("catalogos").select("tipo, valor, extra1").eq("activo", true);
  return data ?? [];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** Crea el caso entrante con la fila canónica. */
export async function crearCasoEntranteServer(
  supabase: { rpc: unknown },
  userId: string,
  data: CrearCasoEntranteDTO,
): Promise<EntranteResultado> {
  if (!(await verificarMiembroActivo(supabase, userId))) return err("Usuario no autorizado");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any;
  };
  const catalogos = await cargarCatalogos(admin as never);
  const valores = (tipo: string) =>
    catalogos.filter((c) => c.tipo === tipo).map((c) => norm(c.valor));

  // ── Coherencia de origen ──
  const sinGestion = data.origen === "SIN_GESTION";
  if (sinGestion !== (data.tipo === "SIN_GESTION"))
    return err("El origen del caso no corresponde al tipo de gestión");

  // ── Especialidad y unidad contra catálogo ──
  const esps = valores("ESPECIALIDAD");
  if (esps.length && !esps.includes(norm(data.especialidadRemision)))
    return err("La especialidad no pertenece al catálogo institucional");

  // ── Origen / remisión ──
  let ciudad = "";
  let departamento = "";
  let fechaEnvioIso: string | null = null;
  if (!sinGestion) {
    if (!data.fechaEnvioRemision)
      return err("La fecha y hora de envío de la remisión son obligatorias");
    fechaEnvioIso = localBogotaAIso(data.fechaEnvioRemision);
    const e = noFutura(fechaEnvioIso, "Envío de la remisión");
    if (e) return err(e);

    const ips = (data.ips ?? "").trim();
    const sede = (data.sede ?? "").trim();
    if (!ips) return err("La IPS remitente es obligatoria");
    if (data.edadValor == null || !data.edadUnidad)
      return err("La edad del paciente es obligatoria");
    if (!sede) return err("La sede (ciudad y departamento) de la IPS es obligatoria");

    // La ciudad y el departamento SIEMPRE se reconstruyen server-side desde la
    // sede: nunca se confía en lo que muestre el navegador.
    const fila = catalogos.find((c) => c.tipo === "IPS" && norm(c.valor) === norm(ips));
    if (fila) {
      const sedes = (fila.extra1 || "")
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sedes.length && !sedes.some((s) => norm(s) === norm(sede)))
        return err("La sede seleccionada no corresponde a la IPS remitente");
    }
    const p = partirSede(sede);
    ciudad = p.ciudad;
    departamento = p.departamento;
  }

  // ── Confirmación de ingreso incluida (ingreso sin gestión previa) ──
  let ingresoIso: string | null = null;
  if (data.ingreso) {
    ingresoIso = localBogotaAIso(data.ingreso.fechaHora);
    const e = noFutura(ingresoIso, "Ingreso del paciente");
    if (e) return err(e);
    const tipos = valores("TIPO_AMBULANCIA");
    if (tipos.length && !tipos.includes(norm(data.ingreso.tipoAmbulancia)))
      return err("El tipo de ambulancia no pertenece al catálogo");
  }
  if (sinGestion && !data.ingreso)
    return err("El ingreso sin gestión previa exige la confirmación de ingreso");

  const fila: Record<string, unknown> = {
    codigo: data.codigo,
    tipo: data.tipo,
    documento: data.documento,
    nombres: data.nombres || null,
    apellidos: data.apellidos || null,
    eapb: data.eapb || null,
    regimen: data.regimen || null,
    ips: data.ips || null,
    medico: data.medico || null,
    especialidad: data.especialidadCol || null,
    unidad: data.ingreso?.unidadReal || data.unidadPrevista || null,
    aseguramiento: data.aseguramiento || null,
    detalle: data.detalle || null,
    estado: sinGestion
      ? "INGRESADO SIN GESTIÓN PREVIA DE REFERENCIA"
      : data.tipo === "ACEP" || data.tipo === "CRUE_ACEP"
        ? "ACTIVO"
        : "REGISTRADO",
    fecha: (ingresoIso ?? fechaEnvioIso ?? new Date().toISOString()).slice(0, 10),
    texto_ia: data.mensaje || null,
    // Remisión (canónico GU-FR-50)
    fecha_envio_remision: fechaEnvioIso,
    remision_hora_conocida: fechaEnvioIso ? true : null,
    ciudad_remitente: ciudad || null,
    departamento_remitente: departamento || null,
    edad_valor: data.edadValor ?? null,
    edad_unidad: data.edadUnidad ?? null,
    especialidad_remision: data.especialidadRemision.toUpperCase(),
    cie10_codigo: data.cie10Codigo,
    cie10_descripcion: data.cie10Descripcion,
    // Decisión
    motivo_negacion: data.motivoNegacion || null,
    especialidad_negacion: data.especialidadNegacion || null,
    justificacion_decision: data.justificacionDecision || null,
    codigo_crue: data.codigoCrue || null,
    unidad_prevista: data.unidadPrevista || null,
    hrs_reserva: data.hrsReserva ? String(data.hrsReserva) : null,
    fecha_vence: data.hrsReserva
      ? new Date(Date.now() + data.hrsReserva * 3_600_000).toISOString()
      : null,
    metadata: (data.metadata ?? null) as never,
    created_by: userId,
  };

  if (data.ingreso) {
    Object.assign(fila, {
      ingreso_confirmado: true,
      fecha_hora_ingreso: ingresoIso,
      modalidad_ingreso: data.ingreso.modalidad,
      unidad_real: data.ingreso.unidadReal,
      justificacion_confirmacion: data.ingreso.justificacion || null,
      tipo_ambulancia: data.ingreso.tipoAmbulancia,
      empresa_tep: data.ingreso.empresaTep,
      placa_vehiculo: data.ingreso.placa,
      profesional_tep_nombre: data.ingreso.profesionalTepNombre.toUpperCase(),
      profesional_tep_cargo: data.ingreso.profesionalTepCargo.toUpperCase(),
    });
  }

  const { error } = await admin.from("casos_entrantes").insert(fila);
  if (error) return err(error.message as string);

  await registrarAuditoriaServer(userId, {
    accion: "crear_caso_entrante",
    modulo: "entrantes",
    tabla: "casos_entrantes",
    registroId: data.codigo,
    detalles: { tipo: data.tipo, origen: data.origen },
  });

  return { ok: true, codigo: data.codigo };
}

/** Confirma el ingreso de un caso ya existente (evento ING canónico). */
export async function confirmarIngresoServer(
  supabase: { rpc: unknown },
  userId: string,
  data: ConfirmarIngresoDTO,
): Promise<EntranteResultado> {
  if (!(await verificarMiembroActivo(supabase, userId))) return err("Usuario no autorizado");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  const ingresoIso = localBogotaAIso(data.ingreso.fechaHora);
  const e = noFutura(ingresoIso, "Ingreso del paciente");
  if (e) return err(e);

  const catalogos = await cargarCatalogos(admin as never);
  const tipos = catalogos
    .filter((c) => c.tipo === "TIPO_AMBULANCIA")
    .map((c) => norm(c.valor));
  if (tipos.length && !tipos.includes(norm(data.ingreso.tipoAmbulancia)))
    return err("El tipo de ambulancia no pertenece al catálogo");

  const { data: padre, error: errPadre } = await admin
    .from("casos_entrantes")
    .select(
      "id, codigo, documento, nombres, apellidos, eapb, regimen, ips, medico, especialidad, unidad, unidad_prevista",
    )
    .eq("id", data.casoId)
    .maybeSingle();
  if (errPadre) return err(errPadre.message as string);
  if (!padre) return err("El caso no existe");

  const cambioUnidad =
    norm(String(padre.unidad_prevista ?? padre.unidad ?? "")) !== norm(data.ingreso.unidadReal);

  const { error: e1 } = await admin.from("casos_entrantes").insert({
    codigo: data.codigoIngreso,
    tipo: "ING",
    cod_ref: padre.codigo,
    documento: padre.documento,
    nombres: padre.nombres,
    apellidos: padre.apellidos,
    eapb: padre.eapb,
    regimen: padre.regimen,
    ips: padre.ips,
    medico: padre.medico,
    especialidad: padre.especialidad,
    unidad: data.ingreso.unidadReal,
    estado: "INGRESADO",
    fecha: ingresoIso.slice(0, 10),
    ingreso_confirmado: true,
    fecha_hora_ingreso: ingresoIso,
    modalidad_ingreso: data.ingreso.modalidad,
    unidad_prevista: padre.unidad_prevista ?? padre.unidad ?? null,
    unidad_real: data.ingreso.unidadReal,
    justificacion_confirmacion: data.ingreso.justificacion || null,
    tipo_ambulancia: data.ingreso.tipoAmbulancia,
    empresa_tep: data.ingreso.empresaTep,
    placa_vehiculo: data.ingreso.placa,
    profesional_tep_nombre: data.ingreso.profesionalTepNombre.toUpperCase(),
    profesional_tep_cargo: data.ingreso.profesionalTepCargo.toUpperCase(),
    detalle: data.observaciones || null,
    texto_ia: data.mensaje || null,
    created_by: userId,
  });
  if (e1) {
    const dup = String((e1 as { code?: string }).code) === "23505";
    return err(dup ? "Este cupo ya tiene un ingreso registrado." : (e1.message as string));
  }

  // Ingreso posterior (tardío / posterior a negación): los eventos originales
  // se conservan intactos; solo el ingreso normal cierra el cupo.
  if (!data.posterior) {
    const { error: e2 } = await admin
      .from("casos_entrantes")
      .update({ estado: "INGRESADO" })
      .eq("id", padre.id);
    if (e2) return err(e2.message as string);
  }

  await registrarAuditoriaServer(userId, {
    accion: data.posterior ? "confirmar_ingreso_posterior" : "confirmar_ingreso",
    modulo: "entrantes",
    tabla: "casos_entrantes",
    registroId: padre.codigo,
    detalles: {
      modalidad: data.ingreso.modalidad,
      unidad_prevista: padre.unidad_prevista ?? padre.unidad ?? null,
      unidad_real: data.ingreso.unidadReal,
      cambio_unidad: cambioUnidad,
    },
  });

  return { ok: true, codigo: data.codigoIngreso };
}
