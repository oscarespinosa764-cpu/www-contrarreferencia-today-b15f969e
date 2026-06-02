import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReglasPanel } from "@/components/coordinacion/reglas-panel";
import { AlertasPanel } from "@/components/coordinacion/alertas-panel";

export const Route = createFileRoute("/_authenticated/reglas")({
  component: ReglasPage,
});

function ReglasPage() {
  return (
    <div>
      <AppHeader
        title="Reglas y Alertas"
        subtitle="Lineamientos operativos y programación de alertas de coordinación"
      />

      <Tabs defaultValue="reglas" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="reglas">Reglas Operativas</TabsTrigger>
          <TabsTrigger value="alertas">Alertas de Coordinación</TabsTrigger>
        </TabsList>

        <TabsContent value="reglas">
          <ReglasPanel />
        </TabsContent>
        <TabsContent value="alertas">
          <AlertasPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
