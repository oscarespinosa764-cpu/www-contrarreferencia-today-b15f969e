import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

  const setTab = (v: string) =>
    navigate({ to: "/cuadro-turno", search: (prev: Record<string, unknown>) => ({ ...prev, tab: v }), replace: true });

  return (
    <div>
      <AppHeader
        title="CUADRO DE  TURNO"
        subtitle="Programación Mensual del Equipo Referencia y Contrarreferencia"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="cuadro">Cuadro de Turno</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes y Ausentismo</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Administración</TabsTrigger>}
        </TabsList>

        <TabsContent value="cuadro"><CuadroMensualPanel isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="solicitudes"><SolicitudesAusentismoPanel isAdmin={isAdmin} /></TabsContent>
        {isAdmin && <TabsContent value="admin"><AdministracionPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
