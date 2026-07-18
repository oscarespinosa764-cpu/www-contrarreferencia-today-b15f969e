import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CuadroMensualPanel } from "@/components/cuadro-turno/cuadro-mensual-panel";
import { SolicitudesAusentismoPanel } from "@/components/cuadro-turno/solicitudes-ausentismo-panel";
import { AdministracionPanel } from "@/components/cuadro-turno/administracion-panel";

export const Route = createFileRoute("/_authenticated/cuadro-turno")({
  component: CuadroTurnoPage,
});

function CuadroTurnoPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("cuadro");

  return (
    <div>
      <AppHeader
        title="CUADRO DE  TURNO"
        subtitle="Programación Mensual del Equipo Referencia y Contrarreferencia"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="cuadro">Cuadro de turno</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes y ausentismo</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Administración</TabsTrigger>}
        </TabsList>

        <TabsContent value="cuadro"><CuadroMensualPanel isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="solicitudes"><SolicitudesAusentismoPanel isAdmin={isAdmin} /></TabsContent>
        {isAdmin && <TabsContent value="admin"><AdministracionPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
