import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  tipoCaso: z.enum(["remision", "entrante"]),
  datos: z.string().min(1).max(8000),
  formato: z.enum(["resumen", "estructurado", "informe"]).default("resumen"),
});

const instrucciones: Record<string, string> = {
  resumen: "Redacta un resumen breve (1 párrafo) del caso, claro y profesional.",
  estructurado: "Redacta una nota estructurada de aproximadamente media página con secciones: Datos del paciente, Situación, Gestión realizada, Pendientes.",
  informe: "Redacta un informe completo y detallado del caso con secciones y redacción formal.",
};

export const generarTextoCaso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { texto: "", error: "La IA no está configurada." };
    }

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
                "Eres asistente de coordinación de Referencia y Contrarreferencia de una IPS en Colombia. Escribes en español, de forma clara, profesional y sin inventar datos que no estén presentes. " +
                instrucciones[data.formato],
            },
            {
              role: "user",
              content: `Genera el texto para este caso de tipo "${data.tipoCaso}" con la siguiente información:\n\n${data.datos}`,
            },
          ],
        }),
      });

      if (res.status === 429) {
        return { texto: "", error: "Límite de uso de IA alcanzado. Intenta más tarde." };
      }
      if (res.status === 402) {
        return { texto: "", error: "Se agotaron los créditos de IA." };
      }
      if (!res.ok) {
        return { texto: "", error: `Error de IA (${res.status}).` };
      }

      const json = await res.json();
      const texto = json?.choices?.[0]?.message?.content ?? "";
      return { texto, error: null as string | null };
    } catch (e) {
      console.error("generarTextoCaso error:", e);
      return { texto: "", error: "El servicio de IA no está disponible." };
    }
  });
