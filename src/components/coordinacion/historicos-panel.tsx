import { useState } from "react";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { BarChart3 } from "lucide-react";
import { ImportarDialog } from "./importar-dialog";
import { IndicadoresDatosDialog } from "./indicadores-datos";
import { BorradoSeguroDialog } from "./borrado-seguro-dialog";
import type { DestinoKey } from "@/lib/importar.functions";

type ImportItem = { emoji: string; label: string; destino: DestinoKey };
type Grupo = { titulo: string; items: ImportItem[] };

const grupos: Grupo[] = [
  {
    titulo: "Dashboard Operativo salientes",
    items: [
      { emoji: "🚑", label: "Importar remisiones salientes", destino: "remisiones" },
      { emoji: "🏠", label: "Importar PHD / PAD / Oxígeno y especiales", destino: "domiciliarios" },
      { emoji: "🔁", label: "Importar referencias internas", destino: "referencia_interna" },
      { emoji: "📌", label: "Importar pendientes", destino: "pendientes" },
    ],
  },
  {
    titulo: "Red y disponibilidad",
    items: [
      { emoji: "🔗", label: "Importar red / disponibilidad IPS", destino: "red_operativa" },
    ],
  },
  {
    titulo: "Históricos",
    items: [
      { emoji: "📥", label: "Importar histórico de remisiones entrantes", destino: "historicos_entrante" },
      { emoji: "📤", label: "Importar histórico de remisiones salientes", destino: "historicos_saliente" },
    ],
  },
  {
    titulo: "Catálogos y plantillas",
    items: [
      { emoji: "📚", label: "Importar catálogo", destino: "catalogos" },
      { emoji: "✉️", label: "Importar plantillas", destino: "plantillas" },
    ],
  },
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
  const [activo, setActivo] = useState<ImportItem | null>(null);
  const [indOpen, setIndOpen] = useState(false);
  const [borradoOpen, setBorradoOpen] = useState(false);

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
        <div className="space-y-5">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {g.titulo}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((it) => (
                  <Button
                    key={it.destino}
                    variant="outline"
                    className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                    onClick={() => setActivo(it)}
                  >
                    <span className="text-base">{it.emoji}</span>
                    <span>{it.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {/* Indicadores: misma lógica de importar/exportar, dentro del mismo panel */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Indicadores y mediciones
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setIndOpen(true)}
              >
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Importar / exportar mediciones de indicadores</span>
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[12px] italic text-muted-foreground">
          ⚠️ Descarga la plantilla de cada sección para conocer los encabezados. Formatos
          aceptados: .xlsx / .xlsm / .csv. Acción reservada a coordinación.
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
            onClick={() => setBorradoOpen(true)}
          >
            🗑️ Abrir panel de borrado seguro
          </Button>
        </div>
      </Panel>

      {activo && (
        <ImportarDialog
          open={!!activo}
          onOpenChange={(v) => !v && setActivo(null)}
          destino={activo.destino}
          titulo={activo.label}
        />
      )}

      <IndicadoresDatosDialog open={indOpen} onOpenChange={setIndOpen} />
      <BorradoSeguroDialog open={borradoOpen} onOpenChange={setBorradoOpen} />
    </div>
  );
}
