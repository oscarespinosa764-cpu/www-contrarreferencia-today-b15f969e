import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Definición de destinos de importación masiva.
// Cada destino apunta a una tabla, define las columnas permitidas (lista
// blanca, por seguridad), las columnas de fecha (para normalizar), las
// columnas booleanas y campos fijos que se inyectan en cada fila.
// ---------------------------------------------------------------------------

type DestinoDef = {
  tabla: string;
  columnas: string[];
  fechas?: string[];
  booleanos?: string[];
  fijos?: Record<string, string | boolean>;
  requeridas?: string[];
};

export const DESTINOS = {
  remisiones: {
    tabla: "remisiones",
    columnas: [
      "asegurador", "evolucion", "fecha_inicio", "fecha_radicado", "cama", "servicio",
      "paciente", "documento", "edad", "cie10", "especialidades_tratantes",
      "especialidades_receptoras", "prioridad", "remision_por", "especificacion",
      "tipo_tramite", "regimen", "codigo_radicacion", "estado", "ips_receptora",
      "tipo_ambulancia", "soportes", "prestador_traslado", "contacto_nombre",
      "contacto_parentesco", "contacto_telefono", "pqrs", "observaciones",
      "evolucion_detalle", "tipo_documento",
    ],
    fechas: ["fecha_inicio", "fecha_radicado"],
  },
  domiciliarios: {
    tabla: "domiciliarios",
    columnas: [
      "tipo_solicitud", "unidad_especial", "paciente", "documento", "ips", "estado",
      "prioridad", "detalle", "observaciones", "evolucion", "evolucion_detalle",
      "fecha", "fecha_inicio", "fecha_radicado", "servicio", "cama", "tipo_documento",
      "edad", "cie10", "especialidades_tratantes", "eapb", "regimen",
      "codigo_radicacion", "requiere_ambulancia", "contacto_nombre",
      "contacto_parentesco", "contacto_telefono",
    ],
    fechas: ["fecha", "fecha_inicio", "fecha_radicado"],
  },
  referencia_interna: {
    tabla: "referencia_interna",
    columnas: [
      "tipo_solicitud", "servicio", "proveedor_prestador", "paciente", "documento",
      "estado", "prioridad", "observaciones", "evolucion", "evolucion_detalle",
      "fecha", "fecha_inicio", "fecha_radicado", "tipo_documento", "tipo_ambulancia",
    ],
    fechas: ["fecha", "fecha_inicio", "fecha_radicado"],
  },
  pendientes: {
    tabla: "pendientes",
    columnas: [
      "tipo_pendiente", "ips_area", "paciente_asunto", "prioridad", "estado",
      "observacion_entrega", "fecha", "tipo_caso", "origen",
    ],
    fechas: ["fecha"],
  },
  red_operativa: {
    tabla: "red_operativa",
    columnas: [
      "categoria", "subcategoria", "entidad", "eps", "ips", "departamento", "ciudad",
      "servicio_especialidad", "tipo_contacto", "contacto", "link", "telefono",
      "correo", "tipo_ambulancia", "cups", "fecha_inicio", "fecha_final", "medico",
      "rondas", "observaciones", "estado",
    ],
    fechas: ["fecha_inicio", "fecha_final"],
  },
  historicos_entrante: {
    tabla: "historicos_casos",
    columnas: [
      "tipo_caso", "fuente_hoja", "fuente_archivo", "radicado", "paciente",
      "documento", "ips", "estado", "asegurador", "fecha", "detalle",
    ],
    fechas: ["fecha"],
    fijos: { seccion: "entrante" },
  },
  historicos_saliente: {
    tabla: "historicos_casos",
    columnas: [
      "tipo_caso", "fuente_hoja", "fuente_archivo", "radicado", "paciente",
      "documento", "ips", "estado", "asegurador", "fecha", "detalle",
    ],
    fechas: ["fecha"],
    fijos: { seccion: "saliente" },
  },
  catalogos: {
    tabla: "catalogos",
    columnas: ["tipo", "valor", "extra1", "extra2", "activo"],
    booleanos: ["activo"],
    requeridas: ["tipo", "valor"],
  },
  plantillas: {
    tabla: "plantillas",
    columnas: [
      "indicativo", "categoria", "subcategoria", "nombre", "mensaje", "variables", "activo",
    ],
    booleanos: ["activo"],
    requeridas: ["nombre", "mensaje"],
  },
} satisfies Record<string, DestinoDef>;

export type DestinoKey = keyof typeof DESTINOS;

// Etiquetas de columna por destino para generar la plantilla descargable.
export function columnasDe(destino: DestinoKey): string[] {
  return [...DESTINOS[destino].columnas];
}

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();

function parseFecha(v: unknown): string | null {
  if (v == null || v === "") return null;
  // Número serial de Excel
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(v).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return null;
}

function parseBool(v: unknown): boolean {
  const s = norm(v);
  return ["true", "si", "sí", "1", "x", "activo", "verdadero", "yes"].includes(s);
}

const inputSchema = z.object({
  destino: z.enum(
    Object.keys(DESTINOS) as [DestinoKey, ...DestinoKey[]],
  ),
  filas: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "El archivo no contiene filas.")
    .max(5000, "Máximo 5000 filas por importación."),
});

export const importarMasivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const def = DESTINOS[data.destino] as DestinoDef;
    const { supabase, userId } = context;

    // Solo editores (admin / operativa) activos pueden importar.
    const { data: puedeEditar } = await (supabase as any).rpc("can_edit", { _user_id: userId });
    if (!puedeEditar) {
      return { ok: false, insertadas: 0, omitidas: 0, error: "No tienes autorización para importar." as string | null };
    }

    const permitidas = new Set(def.columnas);
    const fechas = new Set(def.fechas ?? []);
    const booleanos = new Set(def.booleanos ?? []);

    const registros: Record<string, unknown>[] = [];
    let omitidas = 0;

    for (const fila of data.filas) {
      const out: Record<string, unknown> = {};
      for (const [rawKey, rawVal] of Object.entries(fila)) {
        const key = norm(rawKey);
        if (!permitidas.has(key)) continue;
        if (rawVal == null || String(rawVal).trim() === "") continue;
        if (fechas.has(key)) {
          const f = parseFecha(rawVal);
          if (f) out[key] = f;
        } else if (booleanos.has(key)) {
          out[key] = parseBool(rawVal);
        } else {
          out[key] = String(rawVal).trim();
        }
      }

      // Campos fijos del destino (ej. seccion)
      if (def.fijos) Object.assign(out, def.fijos);

      // Validar requeridas
      const faltan = (def.requeridas ?? []).some((c) => out[c] == null);
      const tieneAlgo = Object.keys(out).some((k) => !(def.fijos && k in def.fijos));
      if (faltan || !tieneAlgo) {
        omitidas++;
        continue;
      }

      out.created_by = userId;
      registros.push(out);
    }

    if (registros.length === 0) {
      return { ok: false, insertadas: 0, omitidas, error: "No se encontraron filas válidas. Revisa los encabezados de la plantilla." };
    }

    // El nombre de tabla es dinámico; el cliente tipado no lo infiere.
    const { error } = await (supabase as any).from(def.tabla).insert(registros);
    if (error) {
      console.error("importarMasivo error");
      const { registrarAuditoriaServer } = await import("./auditoria.server");
      await registrarAuditoriaServer(userId, {
        accion: "importar",
        modulo: "importacion",
        tabla: def.tabla,
        resultado: "fallido",
        detalles: { intentadas: registros.length },
      });
      return { ok: false, insertadas: 0, omitidas, error: "No se pudo importar. Revisa el formato del archivo." as string | null };
    }

    const { registrarAuditoriaServer } = await import("./auditoria.server");
    await registrarAuditoriaServer(userId, {
      accion: "importar",
      modulo: "importacion",
      tabla: def.tabla,
      resultado: "exito",
      detalles: { insertadas: registros.length, omitidas },
    });

    return { ok: true, insertadas: registros.length, omitidas, error: null as string | null };
  });

// ---------------------------------------------------------------------------
// Exportación: descarga los datos existentes del destino (solo ADMIN) para que
// coordinación pueda ver el formato real y reutilizarlo como plantilla.
// ---------------------------------------------------------------------------

const exportSchema = z.object({
  destino: z.enum(Object.keys(DESTINOS) as [DestinoKey, ...DestinoKey[]]),
});

export const exportarMasivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const def = DESTINOS[data.destino] as DestinoDef;
    const { supabase, userId } = context;

    // Solo coordinación (ADMIN) puede exportar.
    const { data: esAdmin, error: adminErr } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (adminErr || !esAdmin) {
      return { ok: false, columnas: def.columnas, filas: [] as Record<string, string>[], error: "Acción reservada a coordinación." as string | null };
    }

    const seleccion = def.columnas.join(",");
    let query = (supabase as any).from(def.tabla).select(seleccion).limit(5000);
    if (def.fijos && "seccion" in def.fijos) {
      query = query.eq("seccion", (def.fijos as Record<string, string>).seccion);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("exportarMasivo error");
      return { ok: false, columnas: def.columnas, filas: [] as Record<string, string>[], error: "No se pudo exportar." as string | null };
    }

    // Normalizamos los valores a strings serializables, respetando el orden de columnas.
    const filas: Record<string, string>[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => {
      const out: Record<string, string> = {};
      for (const col of def.columnas) {
        const v = r[col];
        out[col] = v == null ? "" : String(v);
      }
      return out;
    });

    const { registrarAuditoriaServer } = await import("./auditoria.server");
    await registrarAuditoriaServer(userId, {
      accion: "exportar",
      modulo: "exportacion",
      tabla: def.tabla,
      detalles: { filas: filas.length },
    });

    return {
      ok: true,
      columnas: def.columnas,
      filas,
      error: null as string | null,
    };
  });
