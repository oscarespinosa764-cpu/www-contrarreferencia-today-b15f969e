import { ConfiguracionPanel } from "./configuracion-panel";
import { VinculacionPanel } from "./vinculacion-panel";

export function AdministracionPanel() {
  // La gestión de firmas del personal se trasladó a
  // Control de Mando → Usuarios → Editar usuario.
  return (
    <div className="space-y-4">
      <VinculacionPanel />
      <ConfiguracionPanel />
    </div>
  );
}
