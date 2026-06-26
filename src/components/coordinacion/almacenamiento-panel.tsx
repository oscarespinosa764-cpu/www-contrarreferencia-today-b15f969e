import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { HardDrive, PenLine, QrCode, FileClock, AlertTriangle } from "lucide-react";

// Bloque informativo de bajo consumo: cuenta SOLO datos estructurados livianos.
// Los PDF/Excel se generan bajo demanda y NO se cuentan porque no persisten.

function Metric({

  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AlmacenamientoPanel() {
  const stats = useQuery({
    queryKey: ["almacenamiento-uso"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [firmasPersonal, firmasExternas, sesionesActivas] = await Promise.all([
        supabase.from("user_signatures").select("id", { count: "exact", head: true }),
        supabase
          .from("entrega_firmas")
          .select("id", { count: "exact", head: true })
          .eq("estado", "FIRMADA"),
        supabase
          .from("entrega_firmas")
          .select("id", { count: "exact", head: true })
          .eq("estado", "PENDIENTE")
          .gt("expira_at", nowIso),
      ]);
      const fp = firmasPersonal.count ?? 0;
      const fe = firmasExternas.count ?? 0;
      const sa = sesionesActivas.count ?? 0;
      // Estimación liviana: firma del personal ~bucket (≈40KB), firma externa
      // ~base64 en BD (≈30KB). Solo orientativo.
      const kb = fp * 40 + fe * 30;
      return { fp, fe, sa, kb };
    },
  });

  void contar;
  const kb = stats.data?.kb ?? 0;
  const tam = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  const crecimientoInusual = (stats.data?.fe ?? 0) > 500 || kb > 50 * 1024;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <HardDrive className="h-5 w-5 text-primary" />
        <h3 className="text-base font-bold text-foreground">
          Uso de almacenamiento y archivos temporales
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Solo se guardan datos estructurados livianos. Los PDF y Excel se generan bajo demanda y no
        quedan almacenados, por eso no se contabilizan aquí.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={<PenLine className="h-4 w-4" />}
          label="Firmas del personal"
          value={stats.data?.fp ?? "…"}
          hint="Bucket privado"
        />
        <Metric
          icon={<QrCode className="h-4 w-4" />}
          label="Firmas externas (QR)"
          value={stats.data?.fe ?? "…"}
          hint="Evidencia en BD"
        />
        <Metric
          icon={<FileClock className="h-4 w-4" />}
          label="Enlaces QR activos"
          value={stats.data?.sa ?? "…"}
          hint="Vencen en 2 h"
        />
        <Metric
          icon={<HardDrive className="h-4 w-4" />}
          label="Tamaño aprox."
          value={tam}
          hint="Estimado"
        />
      </div>

      <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        <p>• Archivos temporales activos: 0 (los documentos se descargan, no se almacenan).</p>
        <p>• Última limpieza automática: no aplica (sin archivos persistentes generados).</p>
        <p>
          • Los enlaces QR vencidos se marcan automáticamente al ser consultados (sin tareas
          programadas).
        </p>
      </div>

      {crecimientoInusual && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Crecimiento inusual detectado. Revise las firmas externas guardadas; considere depurar
            registros antiguos si no son necesarios.
          </span>
        </div>
      )}
    </div>
  );
}
