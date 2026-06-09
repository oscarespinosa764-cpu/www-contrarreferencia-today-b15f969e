import { toast } from "sonner";
import { Zap, AlertTriangle, Check, X } from "lucide-react";

export interface NotifVencData {
  nivel: "warn" | "crit";
  paciente: string;
  codigo: string;
  documento?: string | null;
  unidad?: string | null;
  ips?: string | null;
  tiempo: string;
}

function NotifVencCard({ data, toastId }: { data: NotifVencData; toastId: string | number }) {
  const crit = data.nivel === "crit";
  const accent = crit ? "text-status-red" : "text-status-amber";
  const ring = crit ? "ring-status-red/60" : "ring-status-amber/60";
  const glow = crit
    ? "0 0 22px color-mix(in oklab, var(--status-red) 45%, transparent)"
    : "0 0 22px color-mix(in oklab, var(--status-amber) 40%, transparent)";

  return (
    <div
      className={`w-[340px] max-w-[88vw] rounded-2xl border border-white/10 bg-vitalis-dark p-4 text-white ring-1 ${ring}`}
      style={{ boxShadow: glow }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide ${accent}`}>
          {crit ? <AlertTriangle className="h-4 w-4" /> : <Zap className="h-4 w-4 fill-current" />}
          {crit ? "Cupo vencido" : "Próximo a vencer"}
        </div>
        <button
          onClick={() => toast.dismiss(toastId)}
          aria-label="Cerrar"
          className="text-white/50 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-base font-bold leading-tight text-white">{data.paciente}</p>

      <p className="mt-1 font-mono text-sm font-bold text-vitalis-teal">{data.codigo}</p>

      <div className="mt-1 space-y-0.5 text-xs text-white/70">
        <p>
          Doc. {data.documento || "—"}
          {data.unidad ? ` · ${data.unidad}` : ""}
        </p>
        <p className="truncate">IPS: {data.ips || "—"}</p>
      </div>

      <p className={`mt-2 text-sm font-bold ${accent}`}>
        {crit ? "Tiempo de ingreso vencido" : `Quedan: ${data.tiempo}`}
      </p>

      <button
        onClick={() => toast.dismiss(toastId)}
        className="mt-3 w-full rounded-lg border border-vitalis-teal/60 py-2 text-center text-xs font-extrabold uppercase tracking-wide text-vitalis-teal transition-colors hover:bg-vitalis-teal/10"
      >
        <Check className="mr-1 inline h-3.5 w-3.5" /> Notificado
      </button>
    </div>
  );
}

export function notifVencimiento(data: NotifVencData) {
  toast.custom((t) => <NotifVencCard data={data} toastId={t} />, {
    duration: data.nivel === "crit" ? 12000 : 9000,
  });
}
