import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Endpoint público (auth por apikey del proyecto) para recalcular indicadores.
 * Uso:
 *   POST /api/public/hooks/calcular-indicadores?year=2026&month=6
 *   headers: { apikey: <SUPABASE_ANON_KEY> }
 *
 * También lo invoca `pg_cron` mensualmente (job `calcular-indicadores-mensual`).
 */
export const Route = createFileRoute("/api/public/hooks/calcular-indicadores")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        const anon = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = Number(url.searchParams.get("year") ?? prev.getFullYear());
        const month = Number(url.searchParams.get("month") ?? prev.getMonth() + 1);

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data, error } = await supabase.rpc("calcular_indicadores_mes", {
          _year: year,
          _month: month,
        });

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, year, month, resultados: data ?? [] });
      },
    },
  },
});
