import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ControlMandoPanel } from "@/components/coordinacion/control-mando-panel";
import { HistoricosPanel } from "@/components/coordinacion/historicos-panel";
import { AlmacenamientoPanel } from "@/components/coordinacion/almacenamiento-panel";
import { UsuariosPanel } from "@/components/coordinacion/usuarios-panel";
import { DictadoPanel } from "@/components/coordinacion/dictado-panel";
import { NotificacionesExternasPanel } from "@/components/coordinacion/notificaciones-externas-panel";
import { AlertasAvisosAdmin } from "@/components/coordinacion/alertas-avisos-admin";
import { ChecklistsPanel } from "@/components/coordinacion/checklists-panel";
import { PlantillasInventarioPanel } from "@/components/coordinacion/plantillas-inventario-panel";
import { AuditoriaPanel } from "@/components/coordinacion/auditoria-panel";

import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/control-mando")({
  component: ControlMandoPage,
});

function ControlMandoPage() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div>
        <AppHeader title="Control de Mando" subtitle="Acceso restringido" />
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Esta sección es exclusiva del administrador.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AppHeader
        title="Control de Mando"
        subtitle="Gestión de usuarios, históricos y estado técnico del turno"
      />

      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <TabsTrigger className="whitespace-normal" value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="historicos">Históricos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="alertas">Alertas y avisos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="checklists">Listas de chequeo</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="plantillas">Plantillas del sistema</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="dictado">Dictado por voz</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="notificaciones">Notificaciones externas</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <div className="space-y-4">
            <UsuariosPanel />
            <ControlMandoPanel />
          </div>
        </TabsContent>
        <TabsContent value="historicos">
          <div className="space-y-4">
            <AlmacenamientoPanel />
            <HistoricosPanel />
          </div>
        </TabsContent>
        <TabsContent value="alertas">
          <AlertasAvisosAdmin />
        </TabsContent>
        <TabsContent value="checklists">
          <ChecklistsPanel />
        </TabsContent>
        <TabsContent value="plantillas">
          <PlantillasInventarioPanel />
        </TabsContent>
        <TabsContent value="dictado">
          <DictadoPanel />
        </TabsContent>
        <TabsContent value="notificaciones">
          <NotificacionesExternasPanel />
        </TabsContent>
      </Tabs>


    </div>
  );
}

