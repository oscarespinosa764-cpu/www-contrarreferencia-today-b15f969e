import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/backend-client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  BookOpen,
  FileText,
  ListChecks,
  Cpu,
  Smartphone,
  KeyRound,
  PenLine,
  QrCode,
  FileClock,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Cuenta rápida: usa count exact head para no traer filas al frontend.
async function countRows(
  tabla: string,
  filtro?: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number | null> {
  let q = supabase.from(tabla as never).select("id", { count: "exact", head: true });
  if (filtro) q = filtro(q as never) as typeof q;
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

type Card = {
  key: string;
  label: string;
  icon: LucideIcon;
  fetch: () => Promise<number | null>;
  linkTo?: string;
  linkLabel?: string;
  hint?: string;
};

const CARDS: Card[] = [
  {
    key: "hist_total",
    label: "Casos históricos",
    icon: Archive,
    fetch: () => countRows("historicos_casos", (q) => (q as unknown as { eq: (a: string, b: unknown) => unknown }).eq("archivado", false)),
    linkTo: "/historial",
    linkLabel: "Abrir historial",
  },
  {
    key: "hist_ent",
    label: "Entrantes históricos",
    icon: ArrowDownLeft,
    fetch: () => countRows("historicos_casos", (q) => (q as unknown as { eq: (a: string, b: unknown) => unknown; }).eq("seccion", "entrante")),
  },
  {
    key: "hist_sal",
    label: "Salientes históricos",
    icon: ArrowUpRight,
    fetch: () => countRows("historicos_casos", (q) => (q as unknown as { eq: (a: string, b: unknown) => unknown; }).eq("seccion", "saliente")),
  },
  {
    key: "audit",
    label: "Eventos de auditoría",
    icon: ShieldCheck,
    fetch: () => countRows("audit_logs"),
  },
  {
    key: "cat",
    label: "Registros de catálogos",
    icon: BookOpen,
    fetch: () => countRows("catalogos"),
    linkTo: "/catalogo",
    linkLabel: "Abrir catálogos",
  },
  {
    key: "plant",
    label: "Plantillas del sistema",
    icon: FileText,
    fetch: () => countRows("plantillas"),
  },
  {
    key: "plant_ver",
    label: "Versiones de plantillas",
    icon: FileText,
    fetch: () => countRows("plantillas_versiones"),
  },
  {
    key: "checks",
    label: "Listas de chequeo",
    icon: ListChecks,
    fetch: () => countRows("checklists"),
  },
  {
    key: "checks_ver",
    label: "Versiones de listas",
    icon: ListChecks,
    fetch: () => countRows("checklist_versiones"),
  },
  {
    key: "reglas",
    label: "Reglas administrativas",
    icon: Cpu,
    fetch: () => countRows("reglas_coordinacion"),
    linkTo: "/reglas",
    linkLabel: "Abrir reglas y alertas",
  },
  {
    key: "disp",
    label: "Dispositivos autorizados",
    icon: Smartphone,
    fetch: () =>
      countRows("authorized_devices", (q) =>
        (q as unknown as { eq: (a: string, b: unknown) => unknown }).eq("estado", "AUTORIZADO"),
      ),
  },
  {
    key: "disp_sol",
    label: "Solicitudes de dispositivos",
    icon: KeyRound,
    fetch: () =>
      countRows("device_access_requests", (q) =>
        (q as unknown as { eq: (a: string, b: unknown) => unknown }).eq("estado", "PENDIENTE"),
      ),
  },
  {
    key: "disp_ses",
    label: "Sesiones vinculadas",
    icon: KeyRound,
    fetch: () =>
      countRows("authorized_device_sessions", (q) =>
        (q as unknown as { eq: (a: string, b: unknown) => unknown }).eq("estado", "ACTIVA"),
      ),
  },
  {
    key: "firmas",
    label: "Firmas del personal",
    icon: PenLine,
    fetch: () => countRows("user_signatures"),
  },
  {
    key: "firmas_qr",
    label: "Firmas QR externas",
    icon: QrCode,
    fetch: () =>
      countRows("entrega_firmas", (q) =>
        (q as unknown as { eq: (a: string, b: unknown) => unknown }).eq("estado", "FIRMADA"),
      ),
  },
  {
    key: "qr_activ",
    label: "Enlaces QR activos",
    icon: FileClock,
    fetch: () =>
      countRows("entrega_firmas", (q) => {
        const nowIso = new Date().toISOString();
        return (q as unknown as {
          eq: (a: string, b: unknown) => { gt: (a: string, b: unknown) => unknown };
        })
          .eq("estado", "PENDIENTE")
          .gt("expira_at", nowIso);
      }),
  },
];

function KpiCard({ card }: { card: Card }) {
  const q = useQuery({
    queryKey: ["resumen-sistema", card.key],
    queryFn: card.fetch,
    staleTime: 60_000,
  });
  const Icon = card.icon;
  const valor =
    q.isLoading
      ? "…"
      : q.data == null
        ? "—"
        : new Intl.NumberFormat("es-CO").format(q.data);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-wide">{card.label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-extrabold text-foreground">
        {q.isError ? <span className="text-status-red text-base">Error</span> : valor}
      </p>
      {card.linkTo && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-[11px] text-primary"
        >
          <Link to={card.linkTo}>
            <ExternalLink className="mr-1 h-3 w-3" /> {card.linkLabel}
          </Link>
        </Button>
      )}
    </div>
  );
}

export function ResumenSistemaPanel() {
  return (
    <Panel title="Resumen de información del sistema">
      <p className="mb-3 text-xs text-muted-foreground">
        Conteos actuales de los principales conjuntos de datos. Los detalles se administran en
        sus módulos originales (Historial, Auditoría, Plantillas, Listas, Dispositivos,
        Catálogos, Reglas).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CARDS.map((c) => (
          <KpiCard key={c.key} card={c} />
        ))}
      </div>
    </Panel>
  );
}
