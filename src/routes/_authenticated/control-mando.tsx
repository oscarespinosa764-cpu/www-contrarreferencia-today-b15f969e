import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ControlMandoPanel } from "@/components/coordinacion/control-mando-panel";
import { HistoricosPanel } from "@/components/coordinacion/historicos-panel";
import { UsuariosPanel } from "@/components/coordinacion/usuarios-panel";

export const Route = createFileRoute("/_authenticated/control-mando")({
  component: ControlMandoPage,
});

function ControlMandoPage() {
  return (
    <div>
      <AppHeader
        title="Control de Mando"
        subtitle="Auditoría del turno, importaciones y gestión de usuarios"
      />

      <Tabs defaultValue="control" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-3">
          <TabsTrigger className="whitespace-normal" value="control">Control de Mando</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="historicos">Históricos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="usuarios">Usuarios</TabsTrigger>
        </TabsList>

        <TabsContent value="control">
          <ControlMandoPanel />
        </TabsContent>
        <TabsContent value="historicos">
          <HistoricosPanel />
        </TabsContent>
        <TabsContent value="usuarios">
          <UsuariosPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
