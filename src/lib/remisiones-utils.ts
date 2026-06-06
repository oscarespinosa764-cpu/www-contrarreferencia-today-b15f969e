// Utilidades para la bitácora de remisiones salientes.

export function fmtTranscurrido(fromISO: string | null | undefined): string {
  if (!fromISO) return "—";
  const start = new Date(fromISO).getTime();
  if (Number.isNaN(start)) return "—";
  const diff = Math.max(0, Date.now() - start);
  const totalMin = Math.floor(diff / 60000);
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dias} día${dias === 1 ? "" : "s"} ${pad(horas)}:${pad(min)}`;
}

export type EvolucionEstado = "sin" | "parcial" | "completo";

export function normEvolucion(v: string | null | undefined): EvolucionEstado {
  const s = (v || "").toLowerCase();
  if (/parcial|alguna|amaril/.test(s)) return "parcial";
  if (/evolucion|complet|verde/.test(s)) return "completo";
  return "sin";
}

export const evolucionMeta: Record<
  EvolucionEstado,
  { label: string; dot: string; chip: string }
> = {
  sin: {
    label: "Sin evolucionar",
    dot: "bg-status-red",
    chip: "bg-status-red/15 text-status-red",
  },
  parcial: {
    label: "Evolución parcial",
    dot: "bg-status-amber",
    chip: "bg-status-amber/15 text-status-amber",
  },
  completo: {
    label: "Evolucionado",
    dot: "bg-status-green",
    chip: "bg-status-green/15 text-status-green",
  },
};

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
