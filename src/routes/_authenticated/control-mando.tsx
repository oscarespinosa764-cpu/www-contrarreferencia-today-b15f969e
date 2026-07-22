import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ControlMandoPanel } from "@/components/coordinacion/control-mando-panel";
import { HistoricosPanel } from "@/components/coordinacion/historicos-panel";
import { AlmacenamientoPanel } from "@/components/coordinacion/almacenamiento-panel";
import { ResumenSistemaPanel } from "@/components/coordinacion/resumen-sistema-panel";
import { ActividadDatosPanel } from "@/components/coordinacion/actividad-datos-panel";
import { UsuariosPanel } from "@/components/coordinacion/usuarios-panel";
import { DictadoPanel } from "@/components/coordinacion/dictado-panel";
import { NotificacionesExternasPanel } from "@/components/coordinacion/notificaciones-externas-panel";
import { AlertasAvisosAdmin } from "@/components/coordinacion/alertas-avisos-admin";
import { ChecklistsPanel } from "@/components/coordinacion/checklists-panel";
import { PlantillasInventarioPanel } from "@/components/coordinacion/plantillas-inventario-panel";
import { AuditoriaPanel } from "@/components/coordinacion/auditoria-panel";
import { DispositivosPanel } from "@/components/coordinacion/dispositivos-panel";
import { CategoriasView } from "@/components/catalogo/categorias-view";
import { ReglasAdmin } from "@/components/coordinacion/reglas-admin";



import { useAuth } from "@/lib/auth";

const searchSchema = z.object({
  tab: fallback(z.string(), "usuarios").default("usuarios"),
});

export const Route = createFileRoute("/_authenticated/control-mando")({
  validateSearch: zodValidator(searchSchema),
  component: ControlMandoPage,
});

function ControlMandoPage() {
  const { isAdmin } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

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

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v } })}
        className="w-full"
      >
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-10">
          <TabsTrigger className="whitespace-normal" value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="dispositivos">Dispositivos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="catalogos">Catálogos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="historicos">Datos, importaciones y respaldo</TabsTrigger>
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
        <TabsContent value="dispositivos">
          <DispositivosPanel />
        </TabsContent>
        <TabsContent value="catalogos">
          <CategoriasView />
        </TabsContent>
        <TabsContent value="historicos">
          <div className="mb-4 rounded-xl border bg-card p-5">
            <h2 className="text-lg font-bold text-foreground">Datos, importaciones y respaldo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre importaciones, exportaciones, copias de seguridad, almacenamiento y
              depuración controlada de información. Los detalles de cada módulo se consultan
              en su sección correspondiente (Historial, Auditoría, Plantillas, Listas,
              Dispositivos, Catálogos, Reglas).
            </p>
          </div>
          <div className="space-y-4">
            <ResumenSistemaPanel />
            <ActividadDatosPanel />
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
        <TabsContent value="auditoria">
          <AuditoriaPanel />
        </TabsContent>
      </Tabs>


    </div>
  );
}

