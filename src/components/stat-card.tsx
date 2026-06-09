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
    <div className={`flex h-full flex-col rounded-xl border border-border ${topBorder[color]} border-t-4 bg-card p-3 text-center shadow-sm`}>
      <p className="flex min-h-[2.4rem] items-center justify-center text-[12.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 flex flex-1 flex-col justify-center rounded-lg border border-border/60 bg-background/40 px-1 py-2.5">
        <p className={`text-3xl font-extrabold leading-none ${valueColor[color]}`}>{value ?? "—"}</p>
        {caption && <p className="mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}

/** Tarjeta de estadística con un único título y el contador dividido en dos recuadros internos. */
export function SplitStatCard({
  title,
  color = "blue",
  parts,
}: {
  title: string;
  color?: StatColor;
  parts: { label: string; value: ReactNode; color?: StatColor }[];
}) {
  return (
    <div className={`flex h-full flex-col rounded-xl border border-border ${topBorder[color]} border-t-4 bg-card p-3 text-center shadow-sm`}>
      <p className="flex min-h-[2.4rem] items-center justify-center text-[12.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 grid flex-1 grid-cols-2 gap-2">
        {parts.map((p, i) => (
          <div key={i} className="flex flex-col justify-center rounded-lg border border-border/60 bg-background/40 px-1 py-2.5">
            <p className={`text-2xl font-extrabold leading-none ${valueColor[p.color ?? color]}`}>{p.value ?? "—"}</p>
            <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{p.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tarjeta compacta: número grande arriba y etiqueta debajo, dentro de un recuadro interior. */
export function MiniStat({
  label,
  value,
  color = "muted",
}: {
  label: string;
  value: ReactNode;
  color?: StatColor;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="rounded-lg border border-border/60 bg-background/40 py-3 text-center">
        <p className={`text-3xl font-extrabold leading-none ${valueColor[color]}`}>{value ?? "—"}</p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
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
  leftAction,
  children,
  bodyMaxHeight = "24rem",
}: {
  title?: ReactNode;
  action?: ReactNode;
  leftAction?: ReactNode;
  children: ReactNode;
  /** Altura máxima del cuerpo; al superarla aparece scroll interno. Usa null para deshabilitar. */
  bodyMaxHeight?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {(title || action || leftAction) && (
        <div className="mb-3 flex flex-col items-center gap-2 sm:relative sm:flex-row sm:justify-center">
          {leftAction && <div className="sm:absolute sm:left-0">{leftAction}</div>}
          {title && (
            <span className="max-w-full rounded-full border border-border bg-secondary px-4 py-1 text-center text-xs font-bold uppercase tracking-wide text-secondary-foreground">
              {title}
            </span>
          )}
          {action && <div className="sm:absolute sm:right-0">{action}</div>}
        </div>
      )}
      {bodyMaxHeight ? (
        <div className="overflow-y-auto pr-1" style={{ maxHeight: bodyMaxHeight }}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
