import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const importaciones: { emoji: string; label: string }[] = [
  { emoji: "📥", label: "Importar Excel inicial (operación)" },
  { emoji: "📤", label: "Importar remisiones salientes" },
  { emoji: "📨", label: "Importar remisiones entrantes R&C" },
  { emoji: "📚", label: "Importar catálogo CEDIM" },
  { emoji: "✉️", label: "Importar plantillas CEDIM" },
  { emoji: "🔍", label: "Comparar catálogo Excel" },
  { emoji: "🗄️", label: "Importar históricos" },
  { emoji: "🔗", label: "Importar red / directorio" },
  { emoji: "🩺", label: "Diagnosticar Casos R&C" },
  { emoji: "🛠️", label: "Reparar Casos R&C con backup" },
];

function AdminBadge({ tone = "amber" }: { tone?: "amber" | "red" }) {
  const cls =
    tone === "red" ? "bg-status-red/15 text-status-red" : "bg-status-amber/15 text-status-amber";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      Solo ADMIN
    </span>
  );
}

export function HistoricosPanel() {
  const { isAdmin } = useAuth();
  const aviso = () => toast.info("Función de importación en preparación.");

  if (!isAdmin) {
    return (
      <Panel title="Acceso restringido">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Esta sección está reservada a coordinación (ADMIN).
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel title="Importaciones masivas" action={<AdminBadge />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {importaciones.map((it) => (
            <Button
              key={it.label}
              variant="outline"
              className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
              onClick={aviso}
            >
              <span className="text-base">{it.emoji}</span>
              <span>{it.label}</span>
            </Button>
          ))}
        </div>
        <p className="mt-4 text-center text-[12px] italic text-muted-foreground">
          ⚠️ La importación valida duplicados por documento dentro de cada sección. Formatos
          aceptados: .xlsx / .xlsm. Acción reservada a coordinación.
        </p>
      </Panel>

      <Panel
        title={<span className="text-status-red">⚠️ Zona de borrado — dejar en ceros</span>}
        action={<AdminBadge tone="red" />}
      >
        <p className="text-center text-sm text-muted-foreground">
          Vacía los datos transaccionales para migrar limpio desde tus aplicativos viejos.{" "}
          <span className="font-bold text-foreground">Preserva siempre</span> catálogos,
          plantillas, usuarios, reglas, red e indicadores.
        </p>
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            className="rounded-xl border-status-red/40 text-status-red hover:bg-status-red/10"
            onClick={() => toast.warning("Panel de borrado seguro en preparación.")}
          >
            🗑️ Abrir panel de borrado seguro
          </Button>
        </div>
      </Panel>
    </div>
  );
}
