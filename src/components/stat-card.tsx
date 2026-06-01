import type { ReactNode } from "react";

export type StatColor = "blue" | "green" | "red" | "amber" | "teal" | "sky" | "muted";

const topBorder: Record<StatColor, string> = {
  blue: "border-t-status-blue",
  green: "border-t-status-green",
  red: "border-t-status-red",
  amber: "border-t-status-amber",
  teal: "border-t-status-teal",
  sky: "border-t-status-sky",
  muted: "border-t-border",
};

const valueColor: Record<StatColor, string> = {
  blue: "text-status-blue",
  green: "text-status-green",
  red: "text-status-red",
  amber: "text-status-amber",
  teal: "text-status-teal",
  sky: "text-status-sky",
  muted: "text-foreground",
};

/** Tarjeta de estadística con borde superior de color, título y número grande. */
export function StatCard({
  title,
  value,
  caption,
  color = "blue",
}: {
  title: string;
  value: ReactNode;
  caption?: string;
  color?: StatColor;
}) {
  return (
    <div className={`rounded-xl border border-border ${topBorder[color]} border-t-4 bg-card p-4 text-center shadow-sm`}>
      <p className="mb-3 text-[11px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="rounded-lg border border-border/60 bg-background/40 py-3">
        <p className={`text-3xl font-extrabold ${valueColor[color]}`}>{value ?? "—"}</p>
        {caption && <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}

/** Banda de título de sección centrada (ej. "REFERENCIAS ENTRANTES"). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="my-4 text-center text-lg font-extrabold uppercase tracking-wide text-foreground">
      {children}
    </h2>
  );
}

/** Panel blanco con encabezado tipo "pill" centrado. */
export function Panel({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="mx-auto rounded-full border border-border bg-secondary px-4 py-1 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
            {title}
          </span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
