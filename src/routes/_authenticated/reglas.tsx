import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertasCoordinacionPanel } from "@/components/coordinacion/alertas-coordinacion-panel";
import { AvisosOperativosVista } from "@/components/coordinacion/avisos-operativos-vista";

export const Route = createFileRoute("/_authenticated/reglas")({
  component: ReglasPage,
});

function ReglasPage() {
  return (
    <div>
      <AppHeader
        title="Alertas y Avisos Operativos"
        subtitle="Visualización y gestión de eventos generados · la configuración está en Control de Mando"
      />

      <Tabs defaultValue="coordinacion" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2">
          <TabsTrigger className="whitespace-normal" value="coordinacion">
            Alertas de Coordinación
          </TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="operativos">
            Avisos Operativos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coordinacion">
          <AlertasCoordinacionPanel />
        </TabsContent>
        <TabsContent value="operativos">
          <AvisosOperativosVista />
        </TabsContent>
      </Tabs>
    </div>
  );
}
