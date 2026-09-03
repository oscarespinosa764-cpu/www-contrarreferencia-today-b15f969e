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

/**
 * Ejecuta una operación compuesta de Entrantes (evento + actualización del
 * caso padre) dentro de UNA sola transacción de base de datos, con bloqueo
 * `FOR UPDATE` sobre el padre. Sin SQL dinámico: la fila se tipa contra
 * `public.casos_entrantes` en la función SQL.
 */
async function ejecutarEventoCompuesto(
  casoId: string,
  tipo: "ING" | "CAN" | "AMP",
  fila: Record<string, unknown>,
  estadoPadre: string | null,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as unknown as { rpc: RpcFn }).rpc(
    "entrante_evento_compuesto",
    {
      _actor: userId,
      _caso_id: casoId,
      _tipo: tipo,
      _fila: fila,
      _estado_padre: estadoPadre,
    },
  );
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return r.ok
    ? { ok: true }
    : { ok: false, error: r.error || "No fue posible registrar el evento" };
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

  // ── Datos clínicos comunes: edad y CIE-10 en TODOS los orígenes ──
  if (!Number.isInteger(data.edadValor) || data.edadValor < 0)
    return err("La edad del paciente es obligatoria");
  if (!data.edadUnidad) return err("La unidad de edad del paciente es obligatoria");

  // El CIE-10 debe existir en el catálogo estático canónico y su descripción
  // se deriva SIEMPRE del catálogo (nunca de lo enviado por el cliente).
  const cie = await resolverCie10(data.cie10Codigo);
  if (!cie) return err("El código CIE-10 no existe en el catálogo institucional");

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
    edad_valor: data.edadValor,
    edad_unidad: data.edadUnidad,
    especialidad_remision: data.especialidadRemision.toUpperCase(),
    cie10_codigo: cie.codigo,
    cie10_descripcion: cie.descripcion,

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
  const tipos = catalogos.filter((c) => c.tipo === "TIPO_AMBULANCIA").map((c) => norm(c.valor));
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

  // La unidad prevista SIEMPRE se toma de la fila persistida: el cliente no
  // puede eludir la justificación enviando una prevista vacía o igual.
  const unidadPrevistaReal = String(padre.unidad_prevista ?? padre.unidad ?? "");
  const cambioUnidad = norm(unidadPrevistaReal) !== norm(data.ingreso.unidadReal);
  if (
    requiereJustificacionConfirmacion({
      modalidad: data.ingreso.modalidad,
      unidadPrevista: unidadPrevistaReal,
      unidadReal: data.ingreso.unidadReal,
    }) &&
    !data.ingreso.justificacion.trim()
  )
    return err("La justificación de la confirmación es obligatoria en esta modalidad");

  // Operación compuesta ATÓMICA (INSERT del evento ING + UPDATE del padre)
  // en una única transacción de base de datos, con bloqueo del caso padre.
  const filaIngreso = {
    codigo: data.codigoIngreso,
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
  };

  // Ingreso posterior (tardío / posterior a negación): los eventos originales
  // se conservan intactos; solo el ingreso normal cierra el cupo.
  const res = await ejecutarEventoCompuesto(
    padre.id,
    "ING",
    filaIngreso,
    data.posterior ? null : "INGRESADO",
    userId,
  );
  if (!res.ok)
    return err(
      res.error === "DUPLICADO" ? "Este cupo ya tiene un ingreso registrado." : res.error!,
    );

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

// ---------------------------------------------------------------------------
// Eventos posteriores del cupo. El navegador ya no escribe la tabla: estos
// contratos son la ÚNICA vía autorizada para ampliar o cancelar un cupo.
// ---------------------------------------------------------------------------

type PadreCupo = {
  id: string;
  codigo: string | null;
  documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  eapb: string | null;
  regimen: string | null;
  ips: string | null;
  medico: string | null;
  especialidad: string | null;
  unidad: string | null;
  archivado: boolean | null;
};

const COLS_PADRE =
  "id, codigo, documento, nombres, apellidos, eapb, regimen, ips, medico, especialidad, unidad, archivado";

async function cargarPadre(
  admin: { from: (t: string) => any },
  casoId: string,
): Promise<PadreCupo | null> {
  const { data } = await admin
    .from("casos_entrantes")
    .select(COLS_PADRE)
    .eq("id", casoId)
    .maybeSingle();
  return (data as PadreCupo | null) ?? null;
}

/** Amplía el cupo vigente creando el evento AMP asociado por `cod_ref`. */
export async function ampliarCupoServer(
  supabase: { rpc: unknown },
  userId: string,
  data: AmpliarCupoDTO,
): Promise<EntranteResultado> {
  if (!(await verificarMiembroActivo(supabase, userId))) return err("Usuario no autorizado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  const padre = await cargarPadre(admin, data.casoId);
  if (!padre) return err("El caso no existe");
  if (padre.archivado) return err("El caso está cerrado y no admite ampliaciones");

  const vence = new Date(data.fechaVence);
  if (!Number.isFinite(vence.getTime()) || vence.getTime() <= Date.now())
    return err("El nuevo vencimiento debe ser futuro");

  // Ampliación ATÓMICA: el evento AMP se inserta bajo el mismo bloqueo del
  // caso padre que el resto de operaciones compuestas (sin cambio de estado).
  const filaAmpliacion = {
    codigo: data.codigo,
    documento: padre.documento,
    nombres: padre.nombres,
    apellidos: padre.apellidos,
    eapb: padre.eapb,
    regimen: padre.regimen,
    ips: padre.ips,
    medico: padre.medico,
    especialidad: padre.especialidad,
    unidad: padre.unidad,
    estado: "REGISTRADO",
    fecha: new Date().toISOString().slice(0, 10),
    fecha_vence: vence.toISOString(),
    hrs_reserva: String(data.hrsReserva),
    detalle: data.detalle || null,
    texto_ia: data.mensaje || null,
    created_by: userId,
  };

  const res = await ejecutarEventoCompuesto(padre.id, "AMP", filaAmpliacion, null, userId);
  if (!res.ok)
    return err(res.error === "DUPLICADO" ? "Esta ampliación ya fue registrada." : res.error!);


  await registrarAuditoriaServer(userId, {
    accion: "ampliar_cupo",
    modulo: "entrantes",
    tabla: "casos_entrantes",
    registroId: padre.codigo ?? data.codigo,
    detalles: { horas: data.hrsReserva, nuevo_vencimiento: vence.toISOString() },
  });

  return { ok: true, codigo: data.codigo };
}

/** Cancela el cupo (o lo cierra por vencimiento) creando el evento CAN. */
export async function cancelarCupoServer(
  supabase: { rpc: unknown },
  userId: string,
  data: CancelarCupoDTO,
): Promise<EntranteResultado> {
  if (!(await verificarMiembroActivo(supabase, userId))) return err("Usuario no autorizado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  const padre = await cargarPadre(admin, data.casoId);
  if (!padre) return err("El caso no existe");

  const estadoFinal = data.vencimiento ? "CANCELADO_VENCIMIENTO" : "CANCELADO";

  // Cierre ATÓMICO: evento CAN + estado final del padre en una transacción.
  const filaCancelacion = {
    codigo: data.codigo,
    documento: padre.documento,
    nombres: padre.nombres,
    apellidos: padre.apellidos,
    eapb: padre.eapb,
    regimen: padre.regimen,
    ips: padre.ips,
    medico: padre.medico,
    especialidad: padre.especialidad,
    unidad: padre.unidad,
    estado: "REGISTRADO",
    fecha: new Date().toISOString().slice(0, 10),
    detalle: `${data.motivo} · ${data.justificacion}`,
    // El resultado sin ingreso también exige justificación: se conserva en la
    // columna canónica de confirmación (no se crean columnas nuevas).
    justificacion_confirmacion: data.justificacion,
    ingreso_confirmado: false,
    texto_ia: data.mensaje || null,
    created_by: userId,
  };

  const res = await ejecutarEventoCompuesto(padre.id, "CAN", filaCancelacion, estadoFinal, userId);
  if (!res.ok)
    return err(res.error === "DUPLICADO" ? "Esta cancelación ya fue registrada." : res.error!);

  await registrarAuditoriaServer(userId, {
    accion: data.vencimiento ? "archivar_vencimiento" : "cancelar_cupo",
    modulo: "entrantes",
    tabla: "casos_entrantes",
    registroId: padre.codigo ?? data.codigo,
    detalles: { motivo: data.motivo, justificacion: data.justificacion, estado: estadoFinal },
  });

  return { ok: true, codigo: data.codigo };
}
