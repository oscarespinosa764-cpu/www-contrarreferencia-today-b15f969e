import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { registrarAuditoriaServer } from "@/lib/auditoria.server";
import {
  consumeChallenge,
  createChallenge,
  resumirUserAgent,
  verifyEcdsaSignature,
} from "@/lib/devices.server";

// ---------- utilidades comunes ----------

async function getCurrentSessionId(context: {
  claims?: Record<string, unknown> | null;
}): Promise<string | null> {
  const sid = (context.claims?.session_id ?? null) as string | null;
  return typeof sid === "string" && sid.length > 0 ? sid : null;
}

async function getMode(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: { value: unknown } | null }>;
        };
      };
    };
  })
    .from("system_settings")
    .select("value")
    .eq("key", "device_access_mode")
    .maybeSingle();
  const v = data?.value;
  return typeof v === "string" ? v : "BOOTSTRAP";
}

async function isCallerAdminAuthorized(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: boolean | null }>;
  };
  const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

// ---------- Solicitud de desafío ----------

export const requestDeviceChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { purpose?: string; devicePublicId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const purpose = (data.purpose ?? "LINK_SESSION") as
      | "REGISTER_DEVICE"
      | "VERIFY_DEVICE"
      | "LINK_SESSION";
    let deviceId: string | null = null;
    if (data.devicePublicId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dev } = await (supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: unknown) => {
              maybeSingle: () => Promise<{ data: { id: string } | null }>;
            };
          };
        };
      })
        .from("authorized_devices")
        .select("id")
        .eq("device_public_id", data.devicePublicId)
        .maybeSingle();
      deviceId = dev?.id ?? null;
    }
    return await createChallenge(context.userId, purpose, deviceId);
  });


// ---------- Estado propio ----------

export const getMyDeviceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { devicePublicId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const mode = await getMode();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: unknown,
          ) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
            eq: (k: string, v: unknown) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
            };
          };
        };
      };
    };

    type DeviceRow = {
      id: string;
      device_public_id: string;
      estado: string;
      nombre_dispositivo: string | null;
      autorizado_at: string | null;
      expiracion_at: string | null;
      motivo: string | null;
    };

    let device: DeviceRow | null = null;
    if (data.devicePublicId) {
      const r = await admin
        .from("authorized_devices")
        .select("id, device_public_id, estado, nombre_dispositivo, autorizado_at, expiracion_at, motivo")
        .eq("device_public_id", data.devicePublicId)
        .maybeSingle();
      device = (r.data as unknown as DeviceRow) ?? null;
    }


    const sid = await getCurrentSessionId(context);
    let sessionLinked = false;
    if (sid && device) {
      const s = await admin
        .from("authorized_device_sessions")
        .select("id")
        .eq("auth_session_id", sid)
        .eq("estado", "ACTIVA")
        .maybeSingle();
      sessionLinked = !!s.data;
    }

    return { mode, device, sessionLinked };
  });


// ---------- Registrar + solicitar ----------

export const registerDeviceAndRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    publicKey: JsonWebKey;
    challenge: string;
    signature: string;
    nombreDispositivo?: string;
    descripcion?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const valid = await consumeChallenge(context.userId, data.challenge, "REGISTER_DEVICE");
    if (!valid) throw new Error("Desafío inválido o expirado.");
    const okSig = await verifyEcdsaSignature(data.publicKey, data.challenge, data.signature);
    if (!okSig) throw new Error("Firma inválida.");

    const ua = getRequestHeader("user-agent") ?? "";
    const info = resumirUserAgent(ua);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{ data: { id: string; device_public_id: string } | null; error: unknown }>;
          };
        };
      };
    };
    const { data: dev, error } = await admin
      .from("authorized_devices")
      .insert({
        user_id: context.userId,
        public_key: data.publicKey as unknown as Record<string, unknown>,
        nombre_dispositivo: (data.nombreDispositivo ?? "").slice(0, 120) || `${info.navegador} · ${info.sistema_operativo}`,
        descripcion: (data.descripcion ?? "").slice(0, 400) || null,
        ...info,
        estado: "PENDIENTE",
      })
      .select("id, device_public_id")
      .single();

    if (error || !dev) throw new Error("No se pudo registrar el dispositivo.");

    await (admin as unknown as {
      from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> };
    })
      .from("device_access_requests")
      .insert({
        user_id: context.userId,
        device_id: dev.id,
        session_id: await getCurrentSessionId(context),
        estado: "PENDIENTE",
        navegador: info.navegador,
        sistema_operativo: info.sistema_operativo,
        tipo_dispositivo: info.tipo_dispositivo,
      });

    await registrarAuditoriaServer(context.userId, {
      accion: "DEVICE_ACCESS_REQUESTED",
      modulo: "dispositivos",
      tabla: "authorized_devices",
      registroId: dev.id,
      resultado: "exito",
      detalles: info as unknown as Record<string, unknown>,
    });

    return { devicePublicId: dev.device_public_id };
  });

// ---------- Verificar y vincular la sesión actual ----------

export const verifyDeviceAndLinkSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { devicePublicId: string; challenge: string; signature: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
            };
          };
        };
        insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
        update: (r: Record<string, unknown>) => {
          eq: (k: string, v: unknown) => Promise<{ error: unknown }>;
        };
      };
    };

    const { data: dev } = await admin
      .from("authorized_devices")
      .select("id, public_key, estado, expiracion_at")
      .eq("user_id", context.userId)
      .eq("device_public_id", data.devicePublicId)
      .maybeSingle();

    if (!dev) return { status: "NOT_FOUND" as const };
    const estado = dev.estado as string;
    if (estado === "REVOCADO") return { status: "REVOCADO" as const };
    if (estado === "BLOQUEADO") return { status: "BLOQUEADO" as const };
    if (estado === "RECHAZADO") return { status: "RECHAZADO" as const };
    if (estado === "EXPIRADO") return { status: "EXPIRADO" as const };
    if (dev.expiracion_at && new Date(dev.expiracion_at as string) < new Date()) {
      await admin.from("authorized_devices").update({ estado: "EXPIRADO" }).eq("id", dev.id as string);
      return { status: "EXPIRADO" as const };
    }
    if (estado === "PENDIENTE") return { status: "PENDIENTE" as const };
    if (estado !== "AUTORIZADO") return { status: "DENEGADO" as const };

    const valid = await consumeChallenge(context.userId, data.challenge, "LINK_SESSION");
    if (!valid) throw new Error("Desafío inválido o expirado.");
    const okSig = await verifyEcdsaSignature(
      dev.public_key as unknown as JsonWebKey,
      data.challenge,
      data.signature,
    );
    if (!okSig) throw new Error("Firma inválida.");

    const sid = await getCurrentSessionId(context);
    if (!sid) throw new Error("No hay session_id en el token.");

    // upsert de la sesión (por auth_session_id UNIQUE)
    await admin.from("authorized_device_sessions").insert({
      user_id: context.userId,
      device_id: dev.id,
      auth_session_id: sid,
      estado: "ACTIVA",
    });
    await admin
      .from("authorized_devices")
      .update({ ultima_actividad_at: new Date().toISOString() })
      .eq("id", dev.id as string);

    await registrarAuditoriaServer(context.userId, {
      accion: "DEVICE_SESSION_LINKED",
      modulo: "dispositivos",
      tabla: "authorized_device_sessions",
      registroId: dev.id as string,
      resultado: "exito",
    });

    return { status: "AUTORIZADO" as const };
  });

// ---------- Bootstrap del administrador ----------

export const bootstrapAuthorizeCurrentDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    publicKey: JsonWebKey;
    challenge: string;
    signature: string;
    nombreDispositivo?: string;
    descripcion?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const mode = await getMode();
    if (mode !== "BOOTSTRAP") throw new Error("El sistema no está en modo BOOTSTRAP.");
    if (!(await isCallerAdminAuthorized(context.userId))) throw new Error("Solo el administrador.");

    const valid = await consumeChallenge(context.userId, data.challenge, "REGISTER_DEVICE");
    if (!valid) throw new Error("Desafío inválido o expirado.");
    const okSig = await verifyEcdsaSignature(data.publicKey, data.challenge, data.signature);
    if (!okSig) throw new Error("Firma inválida.");

    const ua = getRequestHeader("user-agent") ?? "";
    const info = resumirUserAgent(ua);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{ data: { id: string; device_public_id: string } | null; error: unknown }>;
          };
        };
      };
    };
    const now = new Date().toISOString();
    const { data: dev, error } = await admin
      .from("authorized_devices")
      .insert({
        user_id: context.userId,
        public_key: data.publicKey as unknown as Record<string, unknown>,
        nombre_dispositivo:
          (data.nombreDispositivo ?? "").slice(0, 120) ||
          `${info.navegador} · ${info.sistema_operativo}`,
        descripcion: (data.descripcion ?? "").slice(0, 400) || null,
        ...info,
        estado: "AUTORIZADO",
        autorizado_at: now,
        autorizado_por: context.userId,
        ultima_actividad_at: now,
      })
      .select("id, device_public_id")
      .single();

    if (error || !dev) throw new Error("No se pudo registrar el dispositivo administrador.");

    const sid = await getCurrentSessionId(context);
    if (sid) {
      await (supabaseAdmin as unknown as {
        from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> };
      })
        .from("authorized_device_sessions")
        .insert({
          user_id: context.userId,
          device_id: dev.id,
          auth_session_id: sid,
          estado: "ACTIVA",
        });
    }

    await registrarAuditoriaServer(context.userId, {
      accion: "DEVICE_BOOTSTRAP_AUTHORIZED",
      modulo: "dispositivos",
      tabla: "authorized_devices",
      registroId: dev.id,
      resultado: "exito",
    });

    return { devicePublicId: dev.device_public_id };
  });

// ---------- Panel admin: listados ----------

export const adminListDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCallerAdminAuthorized(context.userId))) throw new Error("Solo administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type DeviceListRow = {
      id: string; user_id: string; device_public_id: string;
      nombre_dispositivo: string | null; descripcion: string | null;
      navegador: string | null; sistema_operativo: string | null; tipo_dispositivo: string | null;
      estado: string; autorizado_at: string | null; expiracion_at: string | null;
      ultima_actividad_at: string | null; motivo: string | null; created_at: string;
    };
    const { data } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: DeviceListRow[] | null }>;
        };
      };
    })
      .from("authorized_devices")
      .select(
        "id, user_id, device_public_id, nombre_dispositivo, descripcion, navegador, sistema_operativo, tipo_dispositivo, estado, autorizado_at, expiracion_at, ultima_actividad_at, motivo, created_at",
      )
      .order("created_at", { ascending: false });
    return (data ?? []) as DeviceListRow[];
  });

export const adminListDeviceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCallerAdminAuthorized(context.userId))) throw new Error("Solo administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type ReqRow = {
      id: string; user_id: string; device_id: string; estado: string;
      solicitado_at: string; navegador: string | null; sistema_operativo: string | null;
      tipo_dispositivo: string | null; motivo: string | null;
    };
    const { data } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: unknown) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: ReqRow[] | null }>;
          };
        };
      };

    })
      .from("device_access_requests")
      .select(
        "id, user_id, device_id, estado, solicitado_at, navegador, sistema_operativo, tipo_dispositivo, motivo",
      )
      .eq("estado", "PENDIENTE")
      .order("solicitado_at", { ascending: false });
    return (data ?? []) as ReqRow[];
  });

// ---------- Panel admin: acciones ----------

async function adminChangeDeviceState(
  actorId: string,
  deviceId: string,
  nuevo: "AUTORIZADO" | "RECHAZADO" | "REVOCADO" | "BLOQUEADO" | "PENDIENTE",
  motivo?: string,
): Promise<void> {
  if (!(await isCallerAdminAuthorized(actorId))) throw new Error("Solo administrador.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
          };
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
      update: (r: Record<string, unknown>) => {
        eq: (k: string, v: unknown) => Promise<{ error: unknown }>;
      };
      upsert: (r: Record<string, unknown>, o?: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  const { data: dev } = await admin
    .from("authorized_devices")
    .select("id, user_id, estado")
    .eq("id", deviceId)
    .maybeSingle();
  if (!dev) throw new Error("Dispositivo inexistente.");
  const { data: pendingRequest } = await admin
    .from("device_access_requests")
    .select("session_id")
    .eq("device_id", deviceId)
    .eq("estado", "PENDIENTE")
    .maybeSingle();

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: nuevo, motivo: motivo ?? null };
  if (nuevo === "AUTORIZADO") {
    patch.autorizado_at = now;
    patch.autorizado_por = actorId;
  }
  if (nuevo === "RECHAZADO") {
    patch.rechazado_at = now;
    patch.rechazado_por = actorId;
  }
  if (nuevo === "REVOCADO") {
    patch.revocado_at = now;
    patch.revocado_por = actorId;
  }
  if (nuevo === "BLOQUEADO") {
    patch.bloqueado_at = now;
    patch.bloqueado_por = actorId;
  }
  await admin.from("authorized_devices").update(patch).eq("id", deviceId);

  // Efectos secundarios
  if (nuevo === "AUTORIZADO" || nuevo === "RECHAZADO") {
    await admin
      .from("device_access_requests")
      .update({
        estado: nuevo === "AUTORIZADO" ? "APROBADA" : "RECHAZADA",
        revisado_at: now,
        revisado_por: actorId,
      })
      .eq("device_id", deviceId);
  }
  if (nuevo === "AUTORIZADO" && typeof pendingRequest?.session_id === "string" && pendingRequest.session_id) {
    await admin
      .from("authorized_device_sessions")
      .upsert(
        {
          user_id: dev.user_id,
          device_id: deviceId,
          auth_session_id: pendingRequest.session_id,
          estado: "ACTIVA",
          ultima_validacion_at: now,
        },
        { onConflict: "auth_session_id" },
      );
  }
  if (nuevo === "REVOCADO" || nuevo === "BLOQUEADO") {
    await admin
      .from("authorized_device_sessions")
      .update({ estado: "REVOCADA", revocado_at: now, motivo_revocacion: motivo ?? null })
      .eq("device_id", deviceId);
  }

  const accionMap = {
    AUTORIZADO: "DEVICE_AUTHORIZED",
    RECHAZADO: "DEVICE_REJECTED",
    REVOCADO: "DEVICE_REVOKED",
    BLOQUEADO: "DEVICE_BLOCKED",
    PENDIENTE: "DEVICE_UNBLOCKED",
  } as const;
  await registrarAuditoriaServer(actorId, {
    accion: accionMap[nuevo],
    modulo: "dispositivos",
    tabla: "authorized_devices",
    registroId: deviceId,
    resultado: "exito",
    detalles: { estado_anterior: dev.estado, estado_nuevo: nuevo, motivo: motivo ?? null },
  });
}

export const adminApproveDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await adminChangeDeviceState(context.userId, data.deviceId, "AUTORIZADO", data.motivo);
    return { ok: true };
  });

export const adminRejectDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await adminChangeDeviceState(context.userId, data.deviceId, "RECHAZADO", data.motivo);
    return { ok: true };
  });

export const adminRevokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await adminChangeDeviceState(context.userId, data.deviceId, "REVOCADO", data.motivo);
    return { ok: true };
  });

export const adminBlockDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await adminChangeDeviceState(context.userId, data.deviceId, "BLOQUEADO", data.motivo);
    return { ok: true };
  });

export const adminUnblockDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string }) => d)
  .handler(async ({ data, context }) => {
    await adminChangeDeviceState(context.userId, data.deviceId, "PENDIENTE");
    return { ok: true };
  });

// ---------- Modo global ----------

export const getSystemMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { mode: await getMode() };
  });

export const adminSetGlobalMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode: string; frase: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isCallerAdminAuthorized(context.userId))) throw new Error("Solo administrador.");
    const nuevo = data.mode;
    if (!["DISABLED", "BOOTSTRAP", "ENFORCED", "EMERGENCY_RECOVERY"].includes(nuevo)) {
      throw new Error("Modo inválido.");
    }
    if (nuevo === "ENFORCED" && data.frase !== "ACTIVAR CONTROL DE DISPOSITIVOS") {
      throw new Error("Frase de confirmación incorrecta.");
    }
    // Verificación previa: debe existir al menos un dispositivo admin AUTORIZADO
    if (nuevo === "ENFORCED") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dev } = await (supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: unknown,
            ) => {
              eq: (
                k: string,
                v: unknown,
              ) => {
                limit: (n: number) => Promise<{ data: unknown[] | null }>;
              };
            };
          };
        };
      })
        .from("authorized_devices")
        .select("id")
        .eq("user_id", context.userId)
        .eq("estado", "AUTORIZADO")
        .limit(1);
      if (!dev || dev.length === 0) {
        throw new Error("Debe existir un dispositivo administrador AUTORIZADO antes de activar.");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as {
      from: (t: string) => {
        update: (r: Record<string, unknown>) => {
          eq: (k: string, v: unknown) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("system_settings")
      .update({ value: nuevo as unknown as Record<string, unknown>, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("key", "device_access_mode");

    await registrarAuditoriaServer(context.userId, {
      accion: nuevo === "ENFORCED" ? "DEVICE_CONTROL_ENFORCED" : "DEVICE_CONTROL_DISABLED",
      modulo: "dispositivos",
      tabla: "system_settings",
      resultado: "exito",
      detalles: { mode_nuevo: nuevo },
    });

    return { ok: true };
  });
