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
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { importarMasivo, exportarMasivo, columnasDe, type DestinoKey } from "@/lib/importar.functions";

type FilaImport = Record<string, unknown>;

export function ImportarDialog({
  open,
  onOpenChange,
  destino,
  titulo,
  permiteExportar = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  destino: DestinoKey;
  titulo: string;
  /** Solo Dashboard Operativo Salientes e Indicadores pueden exportar datos. */
  permiteExportar?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const importar = useServerFn(importarMasivo);
  const exportar = useServerFn(exportarMasivo);

  const reset = () => {
    setArchivo(null);
    setFilas([]);
    setHeaders([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<FilaImport>(ws, { defval: "" });
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

  const descargarPlantilla = () => {
    const cols = columnasDe(destino);
    const ws = XLSX.utils.aoa_to_sheet([cols]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `plantilla_${destino}.xlsx`);
  };

  const exportarDatos = async () => {
    setExportando(true);
    try {
      const res = await exportar({ data: { destino } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo exportar.");
        return;
      }
      const cols = res.columnas;
      const matriz = [cols, ...res.filas.map((f) => cols.map((c) => f[c] ?? ""))];
      const ws = XLSX.utils.aoa_to_sheet(matriz);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Datos");
      XLSX.writeFile(wb, `export_${destino}.xlsx`);
      toast.success(`${res.filas.length} registro(s) exportado(s).`);
    } catch (e) {
      console.error(e);
      toast.error("Error al exportar. Intenta de nuevo.");
    } finally {
      setExportando(false);
    }
  };


  const confirmar = async () => {
    if (filas.length === 0) return;
    setCargando(true);
    try {
      const res = await importar({ data: { destino, filas: filas as Record<string, unknown>[] } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo importar.");
        return;
      }
      toast.success(
        `${res.insertadas} registro(s) importado(s)${res.omitidas ? `, ${res.omitidas} omitido(s)` : ""}.`,
      );
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al importar. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Descarga la plantilla base, diligénciala y súbela nuevamente para importar la
            información al sistema. Los encabezados deben coincidir con la plantilla. Formatos:
            .xlsx / .xlsm / .csv.
            {permiteExportar && (
              <>
                {" "}
                Usa <strong>Exportar Excel</strong> para descargar la información actual.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={descargarPlantilla}>
              <Download className="mr-1.5 h-4 w-4" /> Descargar plantilla
            </Button>
            {permiteExportar && (
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
                    <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar Excel
                  </>
                )}
              </Button>
            )}
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

          {filas.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3 text-xs">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-green" /> Vista previa de encabezados
              </p>
              <p className="text-muted-foreground">{headers.join(" · ")}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={filas.length === 0 || cargando}>
            {cargando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando…
              </>
            ) : (
              <>Importar {filas.length > 0 ? `${filas.length} fila(s)` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
