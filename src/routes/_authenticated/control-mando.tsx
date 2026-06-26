import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ControlMandoPanel } from "@/components/coordinacion/control-mando-panel";
import { HistoricosPanel } from "@/components/coordinacion/historicos-panel";
import { UsuariosPanel } from "@/components/coordinacion/usuarios-panel";
import { AuditPanel } from "@/components/coordinacion/audit-panel";
import { DictadoPanel } from "@/components/coordinacion/dictado-panel";
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
        subtitle="Auditoría del turno, importaciones y gestión de usuarios"
      />

      <Tabs defaultValue="auditoria" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-3">
          <TabsTrigger className="whitespace-normal" value="auditoria">Auditoría</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="historicos">Históricos</TabsTrigger>
          <TabsTrigger className="whitespace-normal" value="usuarios">Usuarios</TabsTrigger>
        </TabsList>

        <TabsContent value="auditoria">
          <div className="space-y-4">
            <ControlMandoPanel />
            <AuditPanel />
          </div>
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
