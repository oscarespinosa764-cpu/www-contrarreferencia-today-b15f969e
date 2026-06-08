import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { useCasos, useCatalogos, usePlantillas } from "@/lib/use-rc-data";
import { useNotifVencimientos } from "@/lib/use-notif-vencimientos";
import { SeguimientoControl } from "@/components/rc/seguimiento-control";
import { calcularVencimiento } from "@/lib/rc-utils";

export const Route = createFileRoute("/_authenticated/seguimientos")({
  component: SeguimientosPage,
});

function SeguimientosPage() {
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
    const activos = casos.filter((c) => (c.tipo === "ACEP" || c.tipo === "CRUE_ACEP") && c.estado === "ACTIVO");
    let porVencer = 0;
    let vencidos = 0;
    for (const c of activos) {
      const v = calcularVencimiento(c, casos);
      if (v.minRest === null || v.minRest <= 0) vencidos++;
      else if (v.minRest <= 60) porVencer++;
    }
    return { activos: activos.length, porVencer, vencidos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casos, tick]);

  const toggleNotif = () => {
    if (!enabled && perm !== "granted") requestPermission();
    setEnabled(!enabled);
  };

  return (
    <div>
      <AppHeader title="Seguimientos" subtitle="Control de tiempos de los cupos aceptados y direccionamientos activos" />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard title="Cupos activos" value={stats.activos} caption="En seguimiento" color="green" />
        <StatCard title="Próximos a vencer" value={stats.porVencer} caption="≤ 60 min" color="amber" />
        <StatCard title="Vencidos" value={stats.vencidos} caption="Requieren gestión" color="red" />
      </div>

      <Panel
        title="Cupos en seguimiento"
        action={
          <Button size="sm" variant={enabled ? "secondary" : "outline"} className="rounded-full" onClick={toggleNotif}>
            {enabled ? <Bell className="mr-1.5 h-4 w-4" /> : <BellOff className="mr-1.5 h-4 w-4" />}
            {enabled ? "Alertas activas" : "Alertas apagadas"}
          </Button>
        }
        bodyMaxHeight={null}
      >
        <SeguimientoControl casos={casos} catalogos={catalogos} plantillas={plantillas} tick={tick} />
      </Panel>
    </div>
  );
}
