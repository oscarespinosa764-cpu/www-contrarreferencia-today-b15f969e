import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { AlertasCoordinacionPanel } from "@/components/coordinacion/alertas-coordinacion-panel";
import { AvisosOperativosVista } from "@/components/coordinacion/avisos-operativos-vista";

export const Route = createFileRoute("/_authenticated/reglas")({
  component: ReglasPage,
});

// Consolidado en UNA sola pantalla (sin pestañas):
//  · Cuadro superior  → Alertas de Coordinación
//  · Cuadro inferior  → Avisos Operativos
function ReglasPage() {
  return (
    <div>
      <AppHeader
        title="Alertas y Avisos Operativos"
        subtitle="Alertas de coordinación (arriba) y avisos operativos (abajo) · la configuración está en Control de Mando"
      />

      <div className="space-y-6">
        <AlertasCoordinacionPanel />
        <AvisosOperativosVista />
      </div>
    </div>
  );
}
