import { useState } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { BarChart3, DatabaseBackup, Loader2, Network, CalendarDays, ClipboardList, CalendarClock, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { ImportarDialog } from "./importar-dialog";
import { ImportarRedDialog } from "./importar-red-dialog";
import { ImportarCuadroDialog } from "./importar-cuadro-dialog";
import { ImportarTurnoDialog, type TurnoImportTipo } from "./importar-turno-dialog";
import { IndicadoresDatosDialog } from "./indicadores-datos";
import { BorradoSeguroDialog } from "./borrado-seguro-dialog";
import { GuFr50Dialog } from "./gu-fr-50-dialog";
import { respaldoTotal } from "@/lib/backup.functions";
import type { DestinoKey } from "@/lib/importar.functions";

type ImportItem = { emoji: string; label: string; destino: DestinoKey; exportar?: boolean };
type Grupo = { titulo: string; items: ImportItem[] };

const grupos: Grupo[] = [
  {
    titulo: "Dashboard Operativo salientes",
    items: [
      // Único módulo (junto con Indicadores) autorizado a exportar datos.
      { emoji: "🚑", label: "Remisiones salientes", destino: "remisiones", exportar: true },
      { emoji: "🏠", label: "PHD / PAD / Oxígeno y especiales", destino: "domiciliarios" },
      { emoji: "🔁", label: "Referencias internas", destino: "referencia_interna" },
      { emoji: "📌", label: "Pendientes", destino: "pendientes" },
    ],
  },
  {
    titulo: "Históricos",
    items: [
      { emoji: "📥", label: "Histórico de remisiones entrantes", destino: "historicos_entrante" },
      { emoji: "📤", label: "Histórico de remisiones salientes", destino: "historicos_saliente" },
    ],
  },
  {
    titulo: "Catálogos y plantillas",
    items: [
      { emoji: "📚", label: "Catálogo", destino: "catalogos" },
      { emoji: "✉️", label: "Plantillas", destino: "plantillas" },
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
  const [respaldando, setRespaldando] = useState(false);

  // Importación de red / disponibilidad (modal de archivo, no CRUD)
  const [redImportOpen, setRedImportOpen] = useState(false);

  // Importaciones de Cuadro de turno
  const [cuadroOpen, setCuadroOpen] = useState(false);
  const [turnoTipo, setTurnoTipo] = useState<TurnoImportTipo | null>(null);

  const generarRespaldo = useServerFn(respaldoTotal);

  const [guOpen, setGuOpen] = useState(false);
  const [plantillaCargando, setPlantillaCargando] = useState(false);
  const descargarPlantilla = async () => {
    setPlantillaCargando(true);
    try {
      const { descargarPlantillaGuFr50 } = await import("@/lib/gu-fr-50");
      await descargarPlantillaGuFr50();
      toast.success("Plantilla GU-FR-50 descargada (4 hojas).");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar la plantilla GU-FR-50.");
    } finally {
      setPlantillaCargando(false);
    }
  };

  if (!isAdmin) {
    return (
      <Panel title="Acceso restringido">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Esta sección está reservada a coordinación (ADMIN).
        </p>
      </Panel>
    );
  }

  const descargarRespaldo = async () => {
    setRespaldando(true);
    try {
      const res = await generarRespaldo();
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo generar el respaldo.");
        return;
      }
      const wb = XLSX.utils.book_new();
      let totalFilas = 0;
      for (const t of res.tablas) {
        const cols = t.columnas;
        const matriz =
          cols.length > 0
            ? [cols, ...t.filas.map((f) => cols.map((c) => f[c] ?? ""))]
            : [["(sin registros)"]];
        const ws = XLSX.utils.aoa_to_sheet(matriz);
        XLSX.utils.book_append_sheet(wb, ws, t.nombre.slice(0, 31));
        totalFilas += t.filas.length;
      }
      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `respaldo_cedim_${fecha}.xlsx`);
      toast.success(
        `Respaldo generado: ${res.tablas.length} tabla(s), ${totalFilas} registro(s).`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Error al generar el respaldo. Intenta de nuevo.");
    } finally {
      setRespaldando(false);
    }
  };



  return (
    <div className="space-y-5">
      <Panel title="Importaciones / exportaciones" action={<AdminBadge />}>
        <div className="space-y-5">
          {/* Plantilla canónica GU-FR-50 (cuatro hojas) */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Bitácora GU-FR-50 · plantilla canónica
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Button
                variant="outline"
                disabled={plantillaCargando}
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={descargarPlantilla}
              >
                {plantillaCargando ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                )}
                <span>Descargar plantilla GU-FR-50 (4 hojas)</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setGuOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span>Exportar / importar bitácora GU-FR-50</span>
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              ENTRANTES · SALIENTES · ATENCION DOMICILIARIA · REFERENCIAS INTERNAS.
              Encabezados en la fila 2 y datos desde la fila 3. Los catálogos se validan
              contra la base de datos, no contra el Excel.
            </p>
          </div>

          {grupos.slice(0, 1).map((g) => (
            <GrupoBotones key={g.titulo} g={g} onSelect={setActivo} />
          ))}


          {/* Red y disponibilidad: importación por archivo + exportación de datos */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              RED/DISPONIBILIDAD
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setRedImportOpen(true)}
              >
                <Network className="h-4 w-4 text-primary" />
                <span>Red/Disponibilidad</span>
              </Button>
            </div>
          </div>

          {/* Cuadro de turno: importación por archivo (sin exportar aquí) */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Cuadro de turno
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setCuadroOpen(true)}
              >
                <CalendarDays className="h-4 w-4 text-primary" />
                <span>Cuadro de turno</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setTurnoTipo("solicitudes")}
              >
                <ClipboardList className="h-4 w-4 text-primary" />
                <span>Solicitudes / permisos / cambios de turno</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
                onClick={() => setTurnoTipo("ausentismo")}
              >
                <CalendarClock className="h-4 w-4 text-primary" />
                <span>Control de ausentismo</span>
              </Button>
            </div>
          </div>

          {grupos.slice(1).map((g) => (
            <GrupoBotones key={g.titulo} g={g} onSelect={setActivo} />
          ))}

          {/* Indicadores: misma lógica de importar/exportar */}
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
                <span>Mediciones de indicadores</span>
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[12px] italic text-muted-foreground">
          ⚠️ Descarga la plantilla de cada sección para conocer los encabezados. Formatos
          aceptados: .xlsx / .xlsm / .csv. Acción reservada a coordinación.
        </p>
      </Panel>

      {/* COPIA DE SEGURIDAD */}
      <Panel
        title="Copia de seguridad"
        action={
          <Button size="sm" className="rounded-full" onClick={descargarRespaldo} disabled={respaldando}>
            {respaldando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <DatabaseBackup className="mr-1.5 h-4 w-4" /> Respaldo total
              </>
            )}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Genera y descarga un archivo Excel con <strong>todas las tablas</strong> del sistema
          (remisiones, casos, seguimientos, red operativa, catálogos, indicadores, usuarios y más),
          una hoja por tabla. Úsalo como copia de seguridad periódica fuera de línea.
        </p>
        <p className="mt-3 rounded-lg border border-status-amber/30 bg-status-amber/10 px-3 py-2 text-xs text-status-amber">
          Contiene datos sensibles de pacientes. Guárdalo en un lugar seguro y bórralo cuando ya no
          se necesite. La acción queda registrada en auditoría.
        </p>
      </Panel>

      {/* ZONA DE BORRADO */}
      <Panel
        title={<span className="text-status-red">⚠️ Zona de borrado</span>}
        action={<AdminBadge tone="red" />}
      >
        <p className="text-center text-sm text-muted-foreground">
          Vacía los datos transaccionales para migrar limpio desde tus aplicativos viejos.{" "}
          <span className="font-bold text-foreground">Se preservan siempre</span> catálogos,
          plantillas, usuarios, roles, reglas, red e indicadores. Nunca se tocan.
        </p>
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            className="rounded-xl border-status-red/40 text-status-red hover:bg-status-red/10"
            onClick={() => setBorradoOpen(true)}
          >
            🗑️ Panel de borrado seguro
          </Button>
        </div>
      </Panel>

      {activo && (
        <ImportarDialog
          open={!!activo}
          onOpenChange={(v) => !v && setActivo(null)}
          destino={activo.destino}
          titulo={activo.label}
          permiteExportar={activo.exportar}
        />
      )}

      <GuFr50Dialog open={guOpen} onOpenChange={setGuOpen} />
      <IndicadoresDatosDialog open={indOpen} onOpenChange={setIndOpen} />
      <BorradoSeguroDialog open={borradoOpen} onOpenChange={setBorradoOpen} />

      <ImportarRedDialog open={redImportOpen} onOpenChange={setRedImportOpen} />
      <ImportarCuadroDialog open={cuadroOpen} onOpenChange={setCuadroOpen} />
      {turnoTipo && (
        <ImportarTurnoDialog
          open={!!turnoTipo}
          onOpenChange={(v) => !v && setTurnoTipo(null)}
          tipo={turnoTipo}
        />
      )}
    </div>
  );
}

function GrupoBotones({ g, onSelect }: { g: Grupo; onSelect: (it: ImportItem) => void }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {g.titulo}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {g.items.map((it) => (
          <Button
            key={it.destino}
            variant="outline"
            className="h-auto justify-start gap-2 whitespace-normal rounded-xl py-3 text-left text-sm font-semibold"
            onClick={() => onSelect(it)}
          >
            <span className="text-base">{it.emoji}</span>
            <span>{it.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
