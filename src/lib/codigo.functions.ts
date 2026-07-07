import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREFIJO_CODIGO } from "@/lib/rc-utils";

// ---------------------------------------------------------------------------
// Cálculo del siguiente código de gestión (entrantes).
//
// Reglas acordadas:
//  • Consecutivo CONTINUO POR AÑO: no se reinicia cada mes; el mes visible en
//    el código refleja el mes actual, pero el número sigue creciendo dentro
//    del mismo año.
//  • INCLUYE EL HISTORIAL: el consecutivo cuenta tanto los casos activos
//    (casos_entrantes) como los subidos a historicos_casos.
//
// Se usa un CONTEO de casos del año (no el "máximo número"): los códigos
// históricos vienen en formatos y numeraciones heterogéneas y con datos
// sucios (p. ej. "NEG-202605-8:13" o secuencias infladas), por lo que tomar
// el máximo produciría números erróneos. Contar los casos del tipo en el año
// y sumar 1 da un consecutivo estable y creciente.
//
// Formatos reconocidos por tipo:
//   - Compacto (nuevo):  PREFIJO + AAMM + NNN     (ej. N2607001)
//   - Antiguo (radicado): TIPO-AAAAMM(DD)-NNN     (ej. NEG-202607-227)
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  tipo: z.string().min(1),
  yyyy: z.number().int(),
  mm: z.number().int().min(1).max(12),
});

export const siguienteCodigo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { tipo, yyyy, mm } = data;
    const prefijo = PREFIJO_CODIGO[tipo] ?? tipo;
    const yy = String(yyyy).slice(-2);
    const mmStr = String(mm).padStart(2, "0");
    const aamm = `${yy}${mmStr}`;

    // 1) Casos activos del año en formato compacto (PREFIJO + AA...).
    //    El año va justo después del prefijo, por lo que "A26%" no colisiona
    //    con "AD26%"/"AMP..." ni "N26%" con "ND26%"/"NR26%".
    const { count: actCount, error: errActivos } = await context.supabase
      .from("casos_entrantes")
      .select("codigo", { count: "exact", head: true })
      .like("codigo", `${prefijo}${yy}%`);
    if (errActivos) throw errActivos;

    // 2) Casos del historial del año (radicado antiguo TIPO-AAAA...).
    const { count: histCount, error: errHist } = await context.supabase
      .from("historicos_casos")
      .select("radicado", { count: "exact", head: true })
      .eq("seccion", "entrante")
      .like("radicado", `${tipo}-${yyyy}%`);
    if (errHist) throw errHist;

    const total = (actCount ?? 0) + (histCount ?? 0);
    const seq = String(total + 1).padStart(3, "0");
    return { codigo: `${prefijo}${aamm}${seq}` };
  });
