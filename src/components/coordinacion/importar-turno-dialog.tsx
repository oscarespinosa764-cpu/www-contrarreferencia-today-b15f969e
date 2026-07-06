import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  procesarImportSolicitudes,
  procesarImportAusentismo,
  COLUMNAS_SOLICITUDES,
  COLUMNAS_AUSENTISMO,
  type ResumenTurno,
} from "@/lib/importar-turnos.functions";

export type TurnoImportTipo = "solicitudes" | "ausentismo";

const CFG: Record<
  TurnoImportTipo,
  { titulo: string; descripcion: string; columnas: string[]; plantilla: string; icon: typeof ClipboardList }
> = {
  solicitudes: {
    titulo: "SOLICITUDES / PERMISOS / CAMBIOS DE TURNO",
    descripcion:
      "Descarga la plantilla base para solicitudes de permisos, ausencias, salidas o cambios de turno. Diligencia el archivo y súbelo para importar las solicitudes al sistema.",
    columnas: COLUMNAS_SOLICITUDES,
    plantilla: "plantilla_solicitudes_turno.xlsx",
    icon: ClipboardList,
  },
  ausentismo: {
    titulo: "CONTROL DE AUSENTISMO",
    descripcion:
      "Descarga la plantilla base para cargar registros de ausentismo laboral. Diligencia el archivo y súbelo para importar la información al control de ausentismo.",
    columnas: COLUMNAS_AUSENTISMO,
    plantilla: "plantilla_control_ausentismo.xlsx",
    icon: CalendarClock,
  },
};

type Fila = Record<string, unknown>;

export function ImportarTurnoDialog({
  open,
  onOpenChange,
  tipo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: TurnoImportTipo;
}) {
  const cfg = CFG[tipo];
  const Icon = cfg.icon;
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  const [validando, setValidando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const procSolicitudes = useServerFn(procesarImportSolicitudes);
  const procAusentismo = useServerFn(procesarImportAusentismo);
  const procesar = tipo === "solicitudes" ? procSolicitudes : procAusentismo;

  const reset = () => {
    setArchivo(null);
    setFilas([]);
    setHeaders([]);
    setResumen(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([cfg.columnas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, cfg.plantilla);
  };

  const onFile = async (file: File) => {
    setResumen(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Fila>(ws, { defval: "" });
      if (json.length === 0) {
        toast.error("El archivo no contiene filas.");
        return;
      }
      setArchivo(file);
      setFilas(json);
      setHeaders(Object.keys(json[0]));
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. Usa formato .xlsx, .xlsm o .csv");
    }
  };

  const validar = async () => {
    setValidando(true);
    try {
      const res = await procesar({ data: { filas: filas as Record<string, unknown>[], confirmar: false } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo validar el archivo.");
        setResumen(res.resumen);
        return;
      }
      setResumen(res.resumen);
    } catch (e) {
      console.error(e);
      toast.error("Error al validar. Intenta de nuevo.");
    } finally {
      setValidando(false);
    }
  };

  const confirmar = async () => {
    setGuardando(true);
    try {
      const res = await procesar({ data: { filas: filas as Record<string, unknown>[], confirmar: true } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo importar.");
        return;
      }
      toast.success(
        `Importación completada: ${res.resumen.validos} registro(s)${res.resumen.omitidos ? `, ${res.resumen.omitidos} omitido(s)` : ""}.`,
      );
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al importar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" /> {cfg.titulo}
          </DialogTitle>
          <DialogDescription>{cfg.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" className="rounded-full" onClick={descargarPlantilla}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar plantilla
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition hover:border-primary/50 hover:bg-muted/50"
          >
            {archivo ? (
              <>
                <FileSpreadsheet className="h-8 w-8 text-status-green" />
                <p className="text-sm font-semibold text-foreground">{archivo.name}</p>
                <p className="text-xs text-muted-foreground">
                  {filas.length} fila(s) · {headers.length} columna(s)
                </p>
                <span className="text-xs text-primary underline">Cambiar archivo</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Selecciona un archivo</p>
                <p className="text-xs text-muted-foreground">.xlsx · .xlsm · .csv</p>
              </>
            )}
          </button>

          {resumen && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-green" /> Resumen antes de guardar
              </p>
              <p className="text-muted-foreground">
                Válidos: <strong className="text-status-green">{resumen.validos}</strong> · Omitidos:{" "}
                <strong className="text-status-amber">{resumen.omitidos}</strong>
              </p>
              {resumen.errores.length > 0 && (
                <div className="mt-2 max-h-40 overflow-auto rounded-md border border-status-red/30 bg-status-red/5 p-2">
                  <p className="mb-1 flex items-center gap-1 font-semibold text-status-red">
                    <AlertTriangle className="h-3.5 w-3.5" /> {resumen.errores.length} fila(s) con error
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {resumen.errores.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        fila {e.fila}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={validando || guardando}>
            Cancelar
          </Button>
          {resumen ? (
            <Button onClick={confirmar} disabled={guardando || resumen.validos === 0}>
              {guardando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando…
                </>
              ) : (
                <>Importar {resumen.validos} registro(s)</>
              )}
            </Button>
          ) : (
            <Button onClick={validar} disabled={!archivo || validando}>
              {validando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Validando…
                </>
              ) : (
                <>Validar</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
