import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { CuadroMensualPanel } from "@/components/cuadro-turno/cuadro-mensual-panel";
import { SolicitudesAusentismoPanel } from "@/components/cuadro-turno/solicitudes-ausentismo-panel";
import { AdministracionPanel } from "@/components/cuadro-turno/administracion-panel";

const searchSchema = z.object({
  tab: fallback(z.string(), "cuadro").default("cuadro"),
  sub: fallback(z.string(), "solicitudes").default("solicitudes"),
  vista: fallback(z.string(), "calendario").default("calendario"),
  anio: fallback(z.number(), new Date().getFullYear()).default(new Date().getFullYear()),
  mes: fallback(z.number(), new Date().getMonth() + 1).default(new Date().getMonth() + 1),
  dia: z.number().optional(),
  q: fallback(z.string(), "").default(""),
  cargo: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/cuadro-turno")({
  validateSearch: zodValidator(searchSchema),
  component: CuadroTurnoPage,
});

function CuadroTurnoPage() {
  const { isAdmin } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = tab === "solicitudes" || (isAdmin && tab === "admin") ? tab : "cuadro";

  const setTab = (v: string) =>
    navigate({ to: "/cuadro-turno", search: (prev: Record<string, unknown>) => ({ ...prev, tab: v }), replace: true });

  const tabClass = (v: string) =>
    `inline-flex min-h-9 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      activeTab === v
        ? "bg-background text-foreground shadow"
        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
    }`;

  return (
    <div>
      <AppHeader
        title="CUADRO DE  TURNO"
        subtitle="Programación Mensual del Equipo Referencia y Contrarreferencia"
      />

      <div className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted p-1">
        <button type="button" className={tabClass("cuadro")} onClick={() => setTab("cuadro")}>Cuadro de Turno</button>
        <button type="button" className={tabClass("solicitudes")} onClick={() => setTab("solicitudes")}>Solicitudes y Ausentismo</button>
        {isAdmin && <button type="button" className={tabClass("admin")} onClick={() => setTab("admin")}>Administración</button>}
      </div>

      {activeTab === "cuadro" && <CuadroMensualPanel isAdmin={isAdmin} />}
      {activeTab === "solicitudes" && <SolicitudesAusentismoPanel isAdmin={isAdmin} />}
      {activeTab === "admin" && isAdmin && <AdministracionPanel />}
    </div>
  );
}
