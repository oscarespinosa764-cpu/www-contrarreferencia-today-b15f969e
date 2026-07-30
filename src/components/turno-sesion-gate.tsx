import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

/**
 * Protección de navegación: si existe sesión válida pero no hay TurnoSesion
 * para el usuario actual (pestaña nueva, storage limpiado, código inválido),
 * no se muestra contenido operativo y se redirige al login, donde vive el
 * único selector canónico de turno. No abre modales ni persiste turnos.
 */
export function TurnoSesionGate({ children }: { children: ReactNode }) {
  const { user, isActiveMember, turnoSesion } = useAuth();
  const navigate = useNavigate();
  const falta = Boolean(user && isActiveMember && !turnoSesion);

  useEffect(() => {
    if (falta) {
      navigate({ to: "/login", search: { turno: "requerido" }, replace: true });
    }
  }, [falta, navigate]);

  if (falta) return null;
  return <>{children}</>;
}
