import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
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
  Network,
} from "lucide-react";
import { toast } from "sonner";
import {
  COLUMNAS_RED,
  HOJAS_RED_ORDEN,
  ALIAS_HOJAS_DIRECTORIO,
  norm,
  type HojaRedKey,
  type ResumenRed,
} from "@/lib/red-import";

import { procesarImportRed } from "@/lib/importar-red.functions";
import { exportarRed } from "@/lib/importar-red.functions";

type HojasData = Partial<Record<HojaRedKey, Record<string, unknown>[]>>;

export function ImportarRedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<HojasData>({});
  const [totalFilas, setTotalFilas] = useState(0);
  const [resumen, setResumen] = useState<ResumenRed | null>(null);
  const [validando, setValidando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const procesar = useServerFn(procesarImportRed);
  const exportar = useServerFn(exportarRed);

  const reset = () => {
    setArchivo(null);
    setHojas({});
    setTotalFilas(0);
    setResumen(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const descargarPlantilla = () => {
    const wb = XLSX.utils.book_new();
    for (const hoja of HOJAS_RED_ORDEN) {
      const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_RED[hoja]]);
      XLSX.utils.book_append_sheet(wb, ws, hoja);
    }
    XLSX.writeFile(wb, "plantilla_red_disponibilidad.xlsx");
  };

  const exportarDatos = async () => {
    setExportando(true);
    try {
      const res = await exportar();
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo exportar.");
        return;
      }
      const wb = XLSX.utils.book_new();
      let total = 0;
      for (const h of res.hojas) {
        const matriz = [h.columnas, ...h.filas.map((f) => h.columnas.map((c) => f[c] ?? ""))];
        const ws = XLSX.utils.aoa_to_sheet(matriz);
        XLSX.utils.book_append_sheet(wb, ws, h.hoja);
        total += h.filas.length;
      }
      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `red_disponibilidad_export_${fecha}.xlsx`);
      toast.success(`${total} registro(s) exportado(s).`);
    } catch (e) {
      console.error(e);
      toast.error("Error al exportar. Intenta de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const onFile = async (file: File) => {
    setResumen(null);
    setNota(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const encontradas: HojasData = {};
      const push = (hoja: HojaRedKey, filas: Record<string, unknown>[]) => {
        if (filas.length === 0) return;
        encontradas[hoja] = [...(encontradas[hoja] ?? []), ...filas];
      };
      let total = 0;
      const claimadas = new Set<string>();

      // 1) Hojas con el nombre exacto de la plantilla.
      const porNombre = new Map(wb.SheetNames.map((n) => [norm(n), n]));
      for (const hoja of HOJAS_RED_ORDEN) {
        const real = porNombre.get(norm(hoja));
        if (!real) continue;
        claimadas.add(real);
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[real], {
          defval: "",
        });
        push(hoja, json);
        total += json.length;
      }

      // 2) Hojas del archivo histórico DIRECTORIO.xlsx (por alias de nombre).
      for (const real of wb.SheetNames) {
        if (claimadas.has(real)) continue;
        const alias = ALIAS_HOJAS_DIRECTORIO[norm(real)];
        if (!alias) continue;
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[real], {
          defval: "",
        });
        // DISPO. AMB. → CODIGOS_TEP y/o AMBULANCIAS según el contenido de la fila.
        if (alias === "AMBULANCIAS") {
          const tep: Record<string, unknown>[] = [];
          const amb: Record<string, unknown>[] = [];
          for (const row of json) {
            const tieneCups = Object.entries(row).some(
              ([k, v]) => norm(k).includes("cups") && String(v ?? "").trim() !== "",
            );
            (tieneCups ? tep : amb).push(row);
          }
          push("CODIGOS_TEP", tep);
          push("AMBULANCIAS", amb);
        } else {
          push(alias, json);
        }
        total += json.length;
      }

      if (Object.keys(encontradas).length === 0) {
        toast.error(
          "No se encontraron hojas válidas. Descarga la plantilla o usa el archivo DIRECTORIO.xlsx.",
        );
        return;
      }

      // Compatibilidad: avisar si es una plantilla antigua (solo 5 hojas base).
      const nuevas: HojaRedKey[] = [
        "DIRECTORIO_EAPB_EPS", "DIRECTORIO_CRUE", "LINEAS_EMERGENCIA",
        "RECURSOS_REFERENCIA", "DATOS_GENERALES_CEDIM", "SEDES_CEDIM",
        "DIRECTORIO_INTERNO_CEDIM",
      ];
      const traeDirectorios = nuevas.some((h) => encontradas[h]?.length);
      if (!traeDirectorios) {
        setNota("Archivo compatible sin directorios adicionales: se importarán solo las hojas base.");
      }

      setArchivo(file);
      setHojas(encontradas);
      setTotalFilas(total);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. Usa formato .xlsx, .xlsm o .csv");
    }
  };


  const validar = async () => {
    setValidando(true);
    try {
      const res = await procesar({ data: { hojas: hojas as Record<string, Record<string, unknown>[]>, confirmar: false } });
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
      const res = await procesar({ data: { hojas: hojas as Record<string, Record<string, unknown>[]>, confirmar: true } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo importar.");
        return;
      }
      const { nuevos, actualizados, omitidos } = res.resumen;
      toast.success(
        `Importación completada: ${nuevos} nuevo(s), ${actualizados} actualizado(s)${omitidos ? `, ${omitidos} omitido(s)` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["red-operativa"] });
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
            <Network className="h-5 w-5 text-primary" /> RED/DISPONIBILIDAD
          </DialogTitle>
          <DialogDescription>
            Descarga la plantilla base para cargar instituciones, ambulancias, jornadas y
            especialidades. También puedes exportar la información actual para respaldo operativo o
            actualización controlada de datos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={descargarPlantilla}>
              <Download className="mr-1.5 h-4 w-4" /> Descargar plantilla
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={exportarDatos}
              disabled={exportando}
            >
              {exportando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Exportando…
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar datos
                </>
              )}
            </Button>
          </div>

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
                  {Object.keys(hojas).length} hoja(s) · {totalFilas} fila(s)
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
              <div className="grid grid-cols-3 gap-2 text-center">
                <Contador label="Nuevos" value={resumen.nuevos} tone="green" />
                <Contador label="Actualizados" value={resumen.actualizados} tone="amber" />
                <Contador label="Omitidos" value={resumen.omitidos} tone="muted" />
              </div>
              {resumen.errores.length > 0 && (
                <div className="mt-2 max-h-40 overflow-auto rounded-md border border-status-red/30 bg-status-red/5 p-2">
                  <p className="mb-1 flex items-center gap-1 font-semibold text-status-red">
                    <AlertTriangle className="h-3.5 w-3.5" /> {resumen.errores.length} fila(s) con
                    error
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {resumen.errores.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">{e.hoja}</span> · fila{" "}
                        {e.fila}: {e.error}
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
            <Button
              onClick={confirmar}
              disabled={guardando || (resumen.nuevos === 0 && resumen.actualizados === 0)}
            >
              {guardando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando…
                </>
              ) : (
                <>Confirmar importación</>
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

function Contador({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "muted";
}) {
  const cls =
    tone === "green"
      ? "text-status-green"
      : tone === "amber"
        ? "text-status-amber"
        : "text-muted-foreground";
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
