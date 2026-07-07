import { useAuth } from "@/lib/auth";
import { usePractice } from "@/lib/practice-mode";
import { FlaskConical, X } from "lucide-react";

// Aviso fijo mientras el modo práctica está activo. Solo lo ve el admin,
// que es el único que puede activarlo.
export function PracticeBanner() {
  const { isAdmin } = useAuth();
  const { active, setActive } = usePractice();

  if (!active || !isAdmin) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow-md">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>
        MODO PRÁCTICA ACTIVO — los cambios que hagas NO se guardan y desaparecerán al salir.
      </span>
      <button
        onClick={() => setActive(false)}
        className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-950/10 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-amber-950/20"
      >
        <X className="h-3.5 w-3.5" /> Salir
      </button>
    </div>
  );
}
