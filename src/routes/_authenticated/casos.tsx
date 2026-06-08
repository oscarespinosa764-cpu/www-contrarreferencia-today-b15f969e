import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Bell, BellOff } from "lucide-react";
import { useCasos, useCatalogos, usePlantillas } from "@/lib/use-rc-data";
import { useNotifVencimientos } from "@/lib/use-notif-vencimientos";
import { RegistrarWizard } from "@/components/rc/registrar-wizard";
import { SeguimientoControl } from "@/components/rc/seguimiento-control";
import { type Caso } from "@/lib/rc-utils";

export const Route = createFileRoute("/_authenticated/casos")({
  component: CasosPage,
});

function esteMes(c: Caso): boolean {
  const d = c.created_at ? new Date(c.created_at) : null;
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function CasosPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: casos } = useCasos();
  const { data: catalogos } = useCatalogos();
  const { data: plantillas } = usePlantillas();
  const { enabled, setEnabled, perm, requestPermission } = useNotifVencimientos(casos);

  // Reloj para refrescar cuentas regresivas
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const mes = casos.filter(esteMes);
    const count = (t: string) => mes.filter((c) => c.tipo === t).length;
    return {
      aceptados: count("ACEP") + count("CRUE_ACEP"),
      negados: count("NEG") + count("CRUE_NEG"),
      ampliaciones: count("AMP"),
      cancelaciones: count("CAN"),
      ingresos: count("ING"),
    };
  }, [casos]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["rc-casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const toggleNotif = () => {
    if (!enabled && perm !== "granted") requestPermission();
    setEnabled(!enabled);
  };

  return (
    <div>
      <AppHeader title="DASHBOARD OPERATIVO ENTRANTES" subtitle="Registro de casos referencias entrantes" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Aceptados" value={stats.aceptados} caption="Cupos aceptados" color="green" />
        <StatCard title="Negados" value={stats.negados} caption="Cupos negados" color="red" />
        <StatCard title="Ampliaciones" value={stats.ampliaciones} caption="Cupos ampliados" color="amber" />
        <StatCard title="Cancelaciones" value={stats.cancelaciones} caption="Cupos cancelados" color="red" />
        <StatCard title="Ingresos" value={stats.ingresos} caption="Pacientes ingresados" color="blue" />
      </div>

      <Panel
        title="SEGUIMIENTOS"
        bodyMaxHeight={null}
        leftAction={
          <Button
            size="sm"
            variant={enabled ? "secondary" : "outline"}
            className="rounded-full"
            onClick={toggleNotif}
          >
            {enabled ? <Bell className="mr-1.5 h-4 w-4" /> : <BellOff className="mr-1.5 h-4 w-4" />}
            {enabled ? "Alertas activas" : "Alertas apagadas"}
          </Button>
        }
        action={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Nuevo caso
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Registrar nuevo caso</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Asistente de 3 pasos: documento → datos del paciente → clasificación y texto.
                  </p>
                </DialogHeader>
                <RegistrarWizard casos={casos} catalogos={catalogos} plantillas={plantillas} onDone={refrescar} />
              </DialogContent>
            </Dialog>
          )
        }
      >
        <SeguimientoControl casos={casos} catalogos={catalogos} plantillas={plantillas} tick={tick} />
      </Panel>
    </div>
  );
}
