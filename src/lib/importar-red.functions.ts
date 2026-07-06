import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  HOJAS_RED_ORDEN,
  CAMPOS_DEDUP,
  mapearFilaRed,
  normalizarFila,
  claveDedupRed,
  type HojaRedKey,
  type ErrorFila,
  type ResumenRed,
} from "./red-import";

// ---------------------------------------------------------------------------
// Importación de RED / DISPONIBILIDAD desde la plantilla multi-hoja.
// `confirmar=false` -> devuelve el resumen (previsualización) sin escribir.
// `confirmar=true`  -> aplica inserciones/actualizaciones deduplicadas.
// Reservado a editores (admin / coordinación). Auditado. No guarda archivos.
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  hojas: z.record(
    z.string(),
    z.array(z.record(z.string(), z.unknown())).max(5000),
  ),
  confirmar: z.boolean().default(false),
});

type Prepared = {
  nuevos: Record<string, unknown>[];
  actualizados: { id: string; cambios: Record<string, unknown> }[];
  errores: ErrorFila[];
  omitidos: number;
};

export const procesarImportRed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; resumen: ResumenRed; error: string | null }> => {
    const { supabase, userId } = context;
    const vacio: ResumenRed = { nuevos: 0, actualizados: 0, omitidos: 0, errores: [] };

    const { data: puedeEditar } = await (supabase as any).rpc("can_edit", { _user_id: userId });
    if (!puedeEditar) {
      return { ok: false, resumen: vacio, error: "No tienes autorización para importar." };
    }

    // Registros existentes (solo campos necesarios para deduplicar).
    const { data: existentes, error: errExist } = await (supabase as any)
      .from("red_operativa")
      .select(CAMPOS_DEDUP.join(","))
      .eq("archivado", false)
      .limit(5000);
    if (errExist) {
      console.error("procesarImportRed: error leyendo existentes");
      return { ok: false, resumen: vacio, error: "No se pudo validar contra los datos actuales." };
    }
    const mapaExistentes = new Map<string, string>();
    for (const r of (existentes ?? []) as Record<string, unknown>[]) {
      mapaExistentes.set(claveDedupRed(r), String(r.id));
    }

    const prep: Prepared = { nuevos: [], actualizados: [], errores: [], omitidos: 0 };
    const vistas = new Set<string>();

    for (const hoja of HOJAS_RED_ORDEN) {
      const filas = data.hojas[hoja] ?? [];
      filas.forEach((filaCruda, idx) => {
        const fila = normalizarFila(filaCruda);
        const vacia = Object.values(fila).every((v) => String(v ?? "").trim() === "");
        if (vacia) return;

        const { row, error } = mapearFilaRed(hoja as HojaRedKey, fila);
        if (error || !row) {
          prep.errores.push({
            hoja: hoja as HojaRedKey,
            fila: idx + 1,
            columna: "—",
            error: error ?? "Fila inválida.",
            valor: "",
          });
          return;
        }

        const clave = claveDedupRed(row);
        // Duplicado dentro del mismo archivo -> se omite el repetido.
        if (vistas.has(clave)) {
          prep.omitidos++;
          return;
        }
        vistas.add(clave);

        const cambios: Record<string, unknown> = {};
        for (const [ck, cv] of Object.entries(row)) if (cv != null) cambios[ck] = cv;

        const existenteId = mapaExistentes.get(clave);
        if (existenteId) {
          cambios.usuario_actualizacion = userId;
          prep.actualizados.push({ id: existenteId, cambios });
        } else {
          cambios.created_by = userId;
          cambios.archivado = false;
          prep.nuevos.push(cambios);
        }
      });
    }

    const resumen: ResumenRed = {
      nuevos: prep.nuevos.length,
      actualizados: prep.actualizados.length,
      omitidos: prep.omitidos,
      errores: prep.errores.slice(0, 100),
    };

    // Previsualización: no escribe.
    if (!data.confirmar) {
      return { ok: true, resumen, error: null };
    }

    if (prep.nuevos.length === 0 && prep.actualizados.length === 0) {
      return { ok: false, resumen, error: "No hay filas válidas para importar." };
    }

    // Inserciones en lote.
    if (prep.nuevos.length > 0) {
      const { error } = await (supabase as any).from("red_operativa").insert(prep.nuevos);
      if (error) {
        console.error("procesarImportRed: error insertando");
        await auditar(userId, "fallido", resumen);
        return { ok: false, resumen, error: "No se pudieron guardar los registros nuevos." };
      }
    }
    // Actualizaciones por id.
    for (const u of prep.actualizados) {
      const { error } = await (supabase as any)
        .from("red_operativa")
        .update(u.cambios)
        .eq("id", u.id);
      if (error) console.error("procesarImportRed: error actualizando un registro");
    }

    await auditar(userId, "exito", resumen);
    return { ok: true, resumen, error: null };
  });

async function auditar(userId: string, resultado: string, resumen: ResumenRed) {
  const { registrarAuditoriaServer } = await import("./auditoria.server");
  await registrarAuditoriaServer(userId, {
    accion: "importar",
    modulo: "importacion",
    tabla: "red_operativa",
    resultado,
    detalles: {
      nuevos: resumen.nuevos,
      actualizados: resumen.actualizados,
      omitidos: resumen.omitidos,
      errores: resumen.errores.length,
    },
  });
}
