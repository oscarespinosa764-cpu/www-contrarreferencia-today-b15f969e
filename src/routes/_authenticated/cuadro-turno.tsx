import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CuadroMensualPanel } from "@/components/cuadro-turno/cuadro-mensual-panel";
import { MiTurnoPanel } from "@/components/cuadro-turno/mi-turno-panel";
import { SolicitudesPanel } from "@/components/cuadro-turno/solicitudes-panel";
import { HistorialCambiosPanel } from "@/components/cuadro-turno/historial-cambios-panel";
import { AusentismoPanel } from "@/components/cuadro-turno/ausentismo-panel";
import { FirmasPanel } from "@/components/cuadro-turno/firmas-panel";
import { ConfiguracionPanel } from "@/components/cuadro-turno/configuracion-panel";

export const Route = createFileRoute("/_authenticated/cuadro-turno")({
  component: CuadroTurnoPage,
});

function CuadroTurnoPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("mensual");

  return (
    <div>
      <AppHeader
        title="CUADRO DE TURNO"
        subtitle="Programación mensual del equipo operativo de referencia y contrarreferencia"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="mensual">Cuadro mensual</TabsTrigger>
          <TabsTrigger value="mi-turno">Mi turno</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes</TabsTrigger>
          {isAdmin && <TabsTrigger value="historial">Historial de cambios</TabsTrigger>}
          {isAdmin && <TabsTrigger value="ausentismo">Control de ausentismo</TabsTrigger>}
          {isAdmin && <TabsTrigger value="firmas">Firmas del personal</TabsTrigger>}
          {isAdmin && <TabsTrigger value="config">Configuración</TabsTrigger>}
        </TabsList>

        <TabsContent value="mensual"><CuadroMensualPanel isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="mi-turno"><MiTurnoPanel /></TabsContent>
        <TabsContent value="solicitudes">
          {isAdmin ? <SolicitudesPanel /> : <MiTurnoPanel />}
        </TabsContent>
        {isAdmin && <TabsContent value="historial"><HistorialCambiosPanel /></TabsContent>}
        {isAdmin && <TabsContent value="ausentismo"><AusentismoPanel /></TabsContent>}
        {isAdmin && <TabsContent value="firmas"><FirmasPanel /></TabsContent>}
        {isAdmin && <TabsContent value="config"><ConfiguracionPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
