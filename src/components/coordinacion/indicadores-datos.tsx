import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, FileSpreadsheet, Loader2, Upload, CheckCircle2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import {
  calcularResultado,
  calcularSemaforo,
  type Indicador,
  type Medicion,
} from "@/lib/indicadores-utils";

const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();

type FilaImport = Record<string, unknown>;

export function IndicadoresDatos() {
  const { canEdit, isAdmin } = useAuth();
  const [expSel, setExpSel] = useState<string>("ALL");
  const [exportando, setExportando] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: indicadores } = useQuery({
    queryKey: ["indicadores-datos-cfg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indicadores")
        .select("*")
        .eq("archivado", false)
        .order("codigo", { ascending: true });
      if (error) throw error;
      return data as Indicador[];
    },
  });

  const inds = useMemo(() => indicadores ?? [], [indicadores]);

  const exportar = async () => {
    setExportando(true);
    try {
      const objetivo = expSel === "ALL" ? inds : inds.filter((i) => i.id === expSel);
      if (objetivo.length === 0) {
        toast.info("No hay indicadores para exportar.");
        return;
      }
      const ids = objetivo.map((i) => i.id);
      const { data: meds, error } = await supabase
        .from("mediciones_indicadores")
        .select("*")
        .in("indicador_id", ids)
        .order("periodo", { ascending: true });
      if (error) throw error;
      const indById = new Map(objetivo.map((i) => [i.id, i]));
      const cols = [
        "codigo",
        "indicador",
        "periodo",
        "numerador",
        "denominador",
        "resultado",
        "meta",
        "unidad",
        "semaforo",
        "comentario",
        "fecha",
      ];
      const filas = ((meds ?? []) as Medicion[]).map((m) => {
        const ind = indById.get(m.indicador_id);
        return {
          codigo: ind?.codigo ?? "",
          indicador: ind?.nombre ?? "",
          periodo: m.periodo ?? "",
          numerador: m.numerador_valor ?? "",
          denominador: m.denominador_valor ?? "",
          resultado: m.resultado ?? "",
          meta: m.meta ?? ind?.meta ?? "",
          unidad: m.unidad ?? ind?.unidad ?? "",
          semaforo: m.semaforo ?? "",
          comentario: m.comentario ?? "",
          fecha: m.fecha ?? m.created_at ?? "",
        } as Record<string, unknown>;
      });
      const matriz = [cols, ...filas.map((f) => cols.map((c) => f[c] ?? ""))];
      const ws = XLSX.utils.aoa_to_sheet(matriz);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Indicadores");
      const nombre =
        expSel === "ALL"
          ? `indicadores_todos_${new Date().toISOString().slice(0, 10)}`
          : `indicador_${indById.get(expSel)?.codigo ?? "export"}`;
      XLSX.writeFile(wb, `${nombre}.xlsx`);
      toast.success(`${filas.length} medición(es) exportada(s).`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <Panel
      title="Indicadores"
      action={
        <span className="rounded-full bg-status-amber/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-status-amber">
          Solo ADMIN
        </span>
      }
    >
      {!isAdmin ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          La carga y exportación de indicadores está reservada a coordinación (ADMIN).
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Importa las mediciones mensuales de cada indicador y exporta la información actual
              (un indicador específico o todos) con el formato exacto de la plantilla.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Exportar</Label>
              <select
                className={selectCls}
                value={expSel}
                onChange={(e) => setExpSel(e.target.value)}
              >
                <option value="ALL">Todos los indicadores</option>
                {inds.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo} · {i.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={exportar}
              disabled={exportando}
            >
              {exportando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Exportando…
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar (Excel)
                </>
              )}
            </Button>
          </div>

          {canEdit && (
            <div className="flex justify-start">
              <Button size="sm" className="rounded-full" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Importar mediciones
              </Button>
            </div>
          )}
        </div>
      )}

      <ImportarMedicionesDialog open={importOpen} onOpenChange={setImportOpen} indicadores={inds} />
    </Panel>
  );
}

function ImportarMedicionesDialog({
  open,
  onOpenChange,
  indicadores,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  indicadores: Indicador[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [indId, setIndId] = useState<string>("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [cargando, setCargando] = useState(false);

  const reset = () => {
    setArchivo(null);
    setFilas([]);
    setIndId("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const descargarPlantilla = () => {
    const cols = ["periodo", "numerador", "denominador", "comentario"];
    const ejemplo = ["2026-01", "0", "0", ""];
    const ws = XLSX.utils.aoa_to_sheet([cols, ejemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_mediciones_indicador.xlsx");
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
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. Usa formato .xlsx, .xlsm o .csv");
    }
  };

  const confirmar = async () => {
    if (!indId) return toast.error("Selecciona el indicador.");
    if (filas.length === 0) return;
    const ind = indicadores.find((i) => i.id === indId);
    if (!ind) return toast.error("Indicador no encontrado.");
    setCargando(true);
    try {
      const registros: Record<string, unknown>[] = [];
      let omitidas = 0;
      for (const fila of filas) {
        const m: Record<string, unknown> = {};
        for (const [rawKey, rawVal] of Object.entries(fila)) {
          m[norm(rawKey)] = rawVal;
        }
        const periodoRaw = String(m["periodo"] ?? "").trim();
        const periodo = periodoRaw.match(/^(\d{4})-(\d{2})/)?.[0] ?? periodoRaw;
        const num = Number(m["numerador"] ?? m["numerador_valor"] ?? 0) || 0;
        const den = Number(m["denominador"] ?? m["denominador_valor"] ?? 0) || 0;
        const comentario = String(m["comentario"] ?? "").trim() || null;
        if (!periodo) {
          omitidas++;
          continue;
        }
        const resultado = calcularResultado(ind.tipo, num, den);
        const semaforo = calcularSemaforo(resultado, ind.meta, ind.sentido);
        registros.push({
          indicador_id: ind.id,
          periodo,
          numerador_valor: num,
          denominador_valor: den,
          resultado,
          meta: ind.meta,
          unidad: ind.unidad,
          semaforo,
          comentario,
          fecha: new Date().toISOString(),
          created_by: user?.id,
        });
      }
      if (registros.length === 0) {
        toast.error("No se encontraron filas válidas. Revisa la columna 'periodo'.");
        return;
      }
      const { error } = await supabase.from("mediciones_indicadores").insert(registros);
      if (error) throw error;
      toast.success(
        `${registros.length} medición(es) importada(s)${omitidas ? `, ${omitidas} omitida(s)` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["indicadores-med"] });
      qc.invalidateQueries({ queryKey: ["mediciones-indicadores"] });
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al importar.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar mediciones de indicador</DialogTitle>
          <DialogDescription>
            Elige el indicador y sube un archivo .xlsx / .xlsm / .csv con las columnas{" "}
            <strong>periodo, numerador, denominador, comentario</strong>. El resultado y el semáforo
            se calculan automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Indicador</Label>
            <select className={selectCls} value={indId} onChange={(e) => setIndId(e.target.value)}>
              <option value="">Seleccione…</option>
              {indicadores.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.codigo} · {i.nombre}
                </option>
              ))}
            </select>
          </div>

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
                <p className="text-xs text-muted-foreground">{filas.length} fila(s)</p>
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
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-green" /> {filas.length} fila(s) lista(s)
                para importar
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={filas.length === 0 || !indId || cargando}>
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
