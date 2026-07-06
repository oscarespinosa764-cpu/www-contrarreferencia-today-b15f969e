import { ConfiguracionPanel } from "./configuracion-panel";

export function AdministracionPanel() {
  // La gestión de firmas del personal se trasladó a
  // Control de Mando → Usuarios → Editar usuario.
  return (
    <div className="space-y-4">
      <ConfiguracionPanel />
    </div>
  );
}
