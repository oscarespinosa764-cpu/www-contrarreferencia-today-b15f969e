import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREFIJO_CODIGO } from "@/lib/rc-utils";

// ---------------------------------------------------------------------------
// Cálculo del siguiente código de gestión (entrantes).
//
// Reglas acordadas:
//  • Consecutivo CONTINUO POR AÑO: no se reinicia cada mes; el mes visible
//    en el código refleja el mes actual, pero el número sigue creciendo
//    dentro del mismo año.
//  • INCLUYE EL HISTORIAL: se revisan tanto los casos activos
//    (casos_entrantes) como los subidos a historicos_casos, en ambos
//    formatos de código:
//      - Formato compacto:  PREFIJO + AAMM + NNN     (ej. N2607001)
//      - Formato antiguo:   TIPO-AAAAMMDD-NNN        (ej. NEG-20260421-010)
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  tipo: z.string().min(1),
  yyyy: z.number().int(),
  mm: z.number().int().min(1).max(12),
});

function extraerSeqDelAnio(
  code: string | null | undefined,
  tipo: string,
  prefijo: string,
  yyyy: number,
): number {
  if (!code) return 0;
  const c = String(code).trim().toUpperCase();
  if (!c) return 0;

  const yy = String(yyyy).slice(-2);
  const yyyyStr = String(yyyy);

  // ── Formato antiguo: TIPO-AAAAMM(DD)-NNN ──
  if (c.includes("-")) {
    const parts = c.split("-");
    if (parts.length === 3 && parts[0] === tipo && parts[1].slice(0, 4) === yyyyStr) {
      const n = parseInt(parts[2], 10);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  // ── Formato compacto: PREFIJO + AAMM + NNN ──
  if (c.startsWith(prefijo)) {
    const rest = c.slice(prefijo.length);
    // El carácter tras el prefijo debe ser dígito (evita confundir A vs AD, N vs ND/NR).
    if (!/^\d/.test(rest)) return 0;
    // Los dos primeros dígitos son el año (AA); luego mes (MM); luego consecutivo.
    if (rest.slice(0, 2) !== yy) return 0;
    const n = parseInt(rest.slice(4), 10);
    return isNaN(n) ? 0 : n;
  }

  return 0;
}

export const siguienteCodigo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { tipo, yyyy, mm } = data;
    const prefijo = PREFIJO_CODIGO[tipo] ?? tipo;
    const yy = String(yyyy).slice(-2);
    const mmStr = String(mm).padStart(2, "0");
    const aamm = `${yy}${mmStr}`;

    let maxSeq = 0;

    // 1) Casos activos (incluye archivados: no se filtra por `archivado`).
    const { data: activos, error: errActivos } = await context.supabase
      .from("casos_entrantes")
      .select("codigo")
      .not("codigo", "is", null)
      .limit(10000);
    if (errActivos) throw errActivos;
    for (const row of activos ?? []) {
      const n = extraerSeqDelAnio((row as { codigo: string | null }).codigo, tipo, prefijo, yyyy);
      if (n > maxSeq) maxSeq = n;
    }

    // 2) Historial de entrantes (radicado guarda el código original).
    const { data: histor, error: errHist } = await context.supabase
      .from("historicos_casos")
      .select("radicado")
      .eq("seccion", "entrante")
      .not("radicado", "is", null)
      .limit(20000);
    if (errHist) throw errHist;
    for (const row of histor ?? []) {
      const n = extraerSeqDelAnio((row as { radicado: string | null }).radicado, tipo, prefijo, yyyy);
      if (n > maxSeq) maxSeq = n;
    }

    const seq = String(maxSeq + 1).padStart(3, "0");
    return { codigo: `${prefijo}${aamm}${seq}` };
  });
