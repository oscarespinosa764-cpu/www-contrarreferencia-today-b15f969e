// Bitácora GU-FR-50 · exportación e importación canónicas (Control de Mando).
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  construirLibroGuFr50, descargarXlsx, HOJAS_GU_FR_50, GU_FR_50,
  type FilaGuFr50, type ModuloGuFr50,
} from "@/lib/gu-fr-50";
import {
  exportarGuFr50, previsualizarImportacionGuFr50, confirmarImportacionGuFr50,
} from "@/lib/gu-fr-50.functions";

const MODULOS = HOJAS_GU_FR_50.map((h) => h.nombre as ModuloGuFr50);

type Resumen = { hoja: string; total: number; vacias: number; validas: number; advertencias: number; errores: number; duplicadas: number; ambiguas: number; nuevas: number };
type ErrFila = { hoja: string; fila: number; columna: string; encabezado: string; valor: string; codigo: string; mensaje: string };

/** Claves de consulta a invalidar tras una importación exitosa. */
const CLAVES = [
  "casos-entrantes", "entrantes", "remisiones", "domiciliarios", "referencia_interna",
  "historicos", "historial", "dashboard", "indicadores", "alertas", "catalogos", "auditoria",
];

export function GuFr50Dialog({
  open, onOpenChange, modulosIniciales,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modulosIniciales?: ModuloGuFr50[];
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState<ModuloGuFr50[]>(modulosIniciales ?? MODULOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<{ nombre: string; encabezados: unknown[]; filas: unknown[][] }[]>([]);
  const [resumen, setResumen] = useState<Resumen[] | null>(null);
  const [errores, setErrores] = useState<ErrFila[]>([]);
  const [estructura, setEstructura] = useState<string[]>([]);
  const [validando, setValidando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const exportar = useServerFn(exportarGuFr50);
  const previsualizar = useServerFn(previsualizarImportacionGuFr50);
  const confirmar = useServerFn(confirmarImportacionGuFr50);

  const reset = () => {
    setArchivo(null); setHojas([]); setResumen(null); setErrores([]); setEstructura([]);
    if (inputRef.current) inputRef.current.value = "";
  };
  const cerrar = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const toggle = (m: ModuloGuFr50) =>
    setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const rango = () => ({
    startDate: desde ? new Date(`${desde}T00:00:00`).toISOString() : null,
    endDate: hasta ? new Date(`${hasta}T23:59:59`).toISOString() : null,
  });

  const descargarPlantilla = async () => {
    try {
      descargarXlsx(await construirLibroGuFr50({}), GU_FR_50.archivo);
      toast.success("Plantilla GU-FR-50 descargada (4 hojas).");
    } catch { toast.error("No se pudo generar la plantilla."); }
  };

  const hacerExport = async () => {
    if (sel.length === 0) { toast.info("Selecciona al menos un módulo."); return; }
    setExportando(true);
    try {
      const res = await exportar({ data: { modules: sel, ...rango() } });
      const datos: Partial<Record<ModuloGuFr50, FilaGuFr50[]>> = {};
      for (const m of sel) datos[m] = (res.filas[m] ?? []) as FilaGuFr50[];
      const bytes = await construirLibroGuFr50(datos);
      descargarXlsx(bytes, `GU-FR-50_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exportación GU-FR-50: ${res.total} registro(s).`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo exportar. Intenta de nuevo.");
    } finally { setExportando(false); }
  };

  const onFile = async (file: File) => {
    setResumen(null); setErrores([]); setEstructura([]);
    if (file.size > 15_000_000) { toast.error("Archivo demasiado grande (máx. 15 MB)."); return; }
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const leidas = wb.SheetNames.map((nombre) => {
        const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
          header: 1, defval: "", blankrows: false, raw: false,
        });
        return {
          nombre,
          encabezados: (matriz[1] ?? []) as unknown[],
          filas: (matriz.slice(2) ?? []) as unknown[][],
        };
      });
      setArchivo(file); setHojas(leidas);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. Debe ser un .xlsx válido.");
    }
  };

  const validar = async () => {
    setValidando(true);
    try {
      const r = await previsualizar({ data: { hojas } });
      setEstructura(r.estructura); setErrores(r.errores as ErrFila[]); setResumen(r.resumen as Resumen[]);
      if (r.estructura.length > 0) toast.error("Estructura inválida: el archivo no es la plantilla GU-FR-50.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo previsualizar el archivo.");
    } finally { setValidando(false); }
  };

  const importar = async () => {
    setGuardando(true);
    try {
      const r = await confirmar({ data: { hojas } });
      if (!r.ok) { toast.error(r.error ?? "No se pudo importar."); return; }
      CLAVES.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Importación completada: ${r.insertadas} insertada(s), ${r.omitidas} omitida(s).`);
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo importar. La operación se revirtió por completo.");
    } finally { setGuardando(false); }
  };

  const totalValidas = resumen?.reduce((a, r) => a + r.validas, 0) ?? 0;
  const puedeImportar = !!resumen && estructura.length === 0 && errores.length === 0 && totalValidas > 0;

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> BITÁCORA GU-FR-50 (V02)
          </DialogTitle>
          <DialogDescription>
            Plantilla única de entrada y salida: ENTRANTES · SALIENTES · ATENCION DOMICILIARIA ·
            REFERENCIAS INTERNAS. Encabezados en la fila 2, datos desde la fila 3.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Exportar</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sel.includes(m)} onCheckedChange={() => toggle(m)} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <Button onClick={hacerExport} disabled={exportando} className="rounded-full">
                {exportando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Exportar GU-FR-50
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={descargarPlantilla}>
                Plantilla vacía
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Importar</p>
            <input
              ref={inputRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition hover:border-primary/50"
            >
              {archivo ? (
                <>
                  <FileSpreadsheet className="h-7 w-7 text-status-green" />
                  <p className="text-sm font-semibold">{archivo.name}</p>
                  <p className="text-xs text-muted-foreground">{hojas.length} hoja(s)</p>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-semibold">Selecciona el archivo GU-FR-50 (.xlsx)</p>
                </>
              )}
            </button>

            {estructura.length > 0 && (
              <div className="rounded-md border border-status-red/30 bg-status-red/5 p-2 text-xs">
                <p className="mb-1 flex items-center gap-1 font-semibold text-status-red">
                  <AlertTriangle className="h-3.5 w-3.5" /> Estructura rechazada
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {estructura.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {resumen && estructura.length === 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-status-green" /> Previsualización (sin escritura)
                </p>
                <table className="w-full text-left">
                  <thead className="text-muted-foreground">
                    <tr><th>Hoja</th><th>Filas</th><th>Válidas</th><th>Errores</th><th>Duplicadas</th><th>Nuevas</th></tr>
                  </thead>
                  <tbody>
                    {resumen.map((r) => (
                      <tr key={r.hoja}>
                        <td className="pr-2 font-semibold">{r.hoja}</td>
                        <td>{r.total}</td><td>{r.validas}</td>
                        <td className={r.errores ? "text-status-red" : ""}>{r.errores}</td>
                        <td>{r.duplicadas}</td><td>{r.nuevas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {errores.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-auto rounded-md border border-status-red/30 bg-status-red/5 p-2">
                    <p className="mb-1 font-semibold text-status-red">{errores.length} error(es)</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {errores.slice(0, 30).map((e, i) => (
                        <li key={i}>{e.hoja}!{e.columna}{e.fila}: [{e.codigo}] {e.mensaje}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={validando || guardando}>Cerrar</Button>
          <Button variant="outline" onClick={validar} disabled={!archivo || validando}>
            {validando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Previsualizar
          </Button>
          <Button onClick={importar} disabled={!puedeImportar || guardando}>
            {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Confirmar importación ({totalValidas})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
