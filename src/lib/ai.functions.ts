import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// IA — USO RESTRINGIDO
// La IA se usa ÚNICAMENTE para redactar plantillas de texto reutilizables.
// NO se procesan datos reales de pacientes ni información clínica identificable.
// Toda llamada valida sesión + usuario activo y registra auditoría.
// ---------------------------------------------------------------------------

// Heurística defensiva: detecta datos personales evidentes para bloquear su
// envío a la IA. No reemplaza la responsabilidad del usuario, es una barrera.
function pareceDatoSensible(texto: string): boolean {
  const t = texto;
  // Documentos / teléfonos: secuencias largas de dígitos (>= 7).
  if (/\d{7,}/.test(t)) return true;
  // Correos electrónicos.
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return true;
  return false;
}

const plantillaSchema = z.object({
  descripcion: z.string().trim().min(1).max(2000),
  paso: z.string().max(200).optional().default(""),
  variables: z.array(z.string().max(40)).max(40).default([]),
});

export const generarPlantillaTexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => plantillaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Validar usuario activo con rol asignado.
    const { data: activo } = await (supabase as any).rpc("is_active_member", {
      _user_id: userId,
    });
    if (!activo) {
      return { texto: "", error: "No tienes autorización para usar la IA." as string | null };
    }

    // 2) Barrera: no permitir datos personales/sensibles en el prompt.
    if (pareceDatoSensible(`${data.descripcion} ${data.paso}`)) {
      await (supabase as any).rpc("registrar_auditoria", {
        _accion: "ia_plantilla_bloqueada",
        _modulo: "ia",
        _resultado: "rechazado",
        _detalles: { motivo: "posible_dato_sensible" },
      });
      return {
        texto: "",
        error:
          "El texto contiene datos que parecen personales (documentos, teléfonos o correos). No ingreses datos de pacientes. Usa variables como {{PACIENTE}} o {{DOCUMENTO}}." as
            | string
            | null,
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { texto: "", error: "La IA no está configurada." as string | null };
    }

    const vars = data.variables.length
      ? data.variables.map((v) => `{{${v}}}`).join(", ")
      : "{{PACIENTE}}, {{DOCUMENTO}}, {{RADICADO}}, {{IPS}}, {{FECHA}}";

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Eres asistente de coordinación de Referencia y Contrarreferencia de una IPS en Colombia. " +
                "Redactas plantillas de texto reutilizables, claras y profesionales, en español. " +
                "Para los datos que cambian en cada caso DEBES usar variables entre llaves dobles, " +
                `exactamente con esta sintaxis y solo de esta lista cuando apliquen: ${vars}. ` +
                "Nunca inventes ni incluyas datos personales concretos (nombres, documentos, fechas, teléfonos): usa siempre la variable correspondiente. " +
                "Devuelve únicamente el texto de la plantilla, sin explicaciones ni comillas.",
            },
            {
              role: "user",
              content:
                (data.paso ? `Paso del sistema donde se usará: ${data.paso}.\n\n` : "") +
                `Necesito una plantilla para: ${data.descripcion}`,
            },
          ],
        }),
      });

      if (res.status === 429) return { texto: "", error: "Límite de uso de IA alcanzado. Intenta más tarde." as string | null };
      if (res.status === 402) return { texto: "", error: "Se agotaron los créditos de IA." as string | null };
      if (!res.ok) return { texto: "", error: `Error de IA (${res.status}).` as string | null };

      const json = await res.json();
      const texto = json?.choices?.[0]?.message?.content ?? "";

      await (supabase as any).rpc("registrar_auditoria", {
        _accion: "ia_plantilla_generada",
        _modulo: "ia",
        _resultado: "exito",
      });

      return { texto, error: null as string | null };
    } catch (e) {
      console.error("generarPlantillaTexto error");
      return { texto: "", error: "El servicio de IA no está disponible." as string | null };
    }
  });
