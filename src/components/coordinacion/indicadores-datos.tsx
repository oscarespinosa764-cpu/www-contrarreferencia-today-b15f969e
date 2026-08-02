import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";

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
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  calcularResultado,
  calcularSemaforo,
  type Indicador,
  type Medicion,
} from "@/lib/indicadores-utils";
import { registrarAuditoria } from "@/lib/auditoria.functions";

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

// Columnas de la plantilla base (vacía) para diligenciar mediciones.
const COLS_PLANTILLA = ["codigo", "indicador", "periodo", "numerador", "denominador", "comentario"];

type FilaImport = Record<string, unknown>;

type Preview = {
  nuevos: number;
  actualizados: number;
  errores: number;
  registros: {
    indicador_id: string;
    periodo: string;
    numerador_valor: number;
    denominador_valor: number;
    resultado: number | null;
    meta: number | null;
    unidad: string | null;
    semaforo: string;
    comentario: string | null;
    existenteId: string | null;
  }[];
};

export function IndicadoresDatosDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const auditar = useServerFn(registrarAuditoria);

  const [sel, setSel] = useState<string>("ALL");
  const [exportando, setExportando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [validando, setValidando] = useState(false);
  const [guardando, setGuardando] = useState(false);

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
  const objetivo = useMemo(
    () => (sel === "ALL" ? inds : inds.filter((i) => i.id === sel)),
    [sel, inds],
  );

  const resetArchivo = () => {
    setArchivo(null);
    setFilas([]);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cerrar = (v: boolean) => {
    if (!v) {
      resetArchivo();
      setSel("ALL");
    }
    onOpenChange(v);
  };

  const nombreSel = () =>
    sel === "ALL" ? "todos" : inds.find((i) => i.id === sel)?.codigo ?? "indicador";

  // ------------------------------------------------------------------
  // Descargar plantilla base (vacía) — NO contiene datos reales.
  // ------------------------------------------------------------------
  const descargarPlantilla = () => {
    if (objetivo.length === 0) {
      toast.info("No hay indicadores disponibles.");
      return;
    }
    setDescargando(true);
    try {
      const wb = XLSX.utils.book_new();
      // Una fila base por indicador con código y nombre precargados; las
      // columnas de medición quedan vacías para diligenciar.
      const filasBase = objetivo.map((i) => [i.codigo ?? "", i.nombre ?? "", "", "", "", ""]);
      const ws = XLSX.utils.aoa_to_sheet([COLS_PLANTILLA, ...filasBase]);
      XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
      const fecha = new Date().toISOString().slice(0, 10);
      const nombre =
        sel === "ALL"
          ? `plantilla_indicadores_mediciones_${fecha}.xlsx`
          : `plantilla_indicador_${nombreSel()}_${fecha}.xlsx`;
      XLSX.writeFile(wb, nombre);
      auditar({
        data: {
          accion: "descargar_plantilla_indicadores",
          modulo: "indicadores",
          tabla: "mediciones_indicadores",
          resultado: "exito",
          detalles: { alcance: sel === "ALL" ? "todos" : nombreSel(), indicadores: objetivo.length },
        },
      }).catch(() => {});
    } finally {
      setDescargando(false);
    }
  };

  // ------------------------------------------------------------------
  // Exportar datos reales actuales — NO es la plantilla vacía.
  // ------------------------------------------------------------------
  const exportarDatos = async () => {
    if (objetivo.length === 0) {
      toast.info("No hay indicadores para exportar.");
      return;
    }
    setExportando(true);
    try {
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
      const filasExp = ((meds ?? []) as Medicion[]).map((m) => {
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
      const matriz = [cols, ...filasExp.map((f) => cols.map((c) => f[c] ?? ""))];
      const ws = XLSX.utils.aoa_to_sheet(matriz);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Indicadores");
      const fecha = new Date().toISOString().slice(0, 10);
      const nombre =
        sel === "ALL"
          ? `indicadores_mediciones_export_${fecha}.xlsx`
          : `indicador_${nombreSel()}_export_${fecha}.xlsx`;
      XLSX.writeFile(wb, nombre);
      toast.success(`${filasExp.length} medición(es) exportada(s).`);
      auditar({
        data: {
          accion: "exportar_datos_indicadores",
          modulo: "indicadores",
          tabla: "mediciones_indicadores",
          resultado: "exito",
          detalles: { alcance: sel === "ALL" ? "todos" : nombreSel(), filas: filasExp.length },
        },
      }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  // ------------------------------------------------------------------
  // Seleccionar archivo (no importa automáticamente).
  // ------------------------------------------------------------------
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
      setPreview(null);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. Usa formato .xlsx, .xlsm o .csv");
    }
  };

  const codeToInd = useMemo(() => {
    const m = new Map<string, Indicador>();
    for (const i of inds) {
      if (i.codigo) m.set(norm(i.codigo), i);
      if (i.nombre) m.set(norm(i.nombre), i);
    }
    return m;
  }, [inds]);

  // ------------------------------------------------------------------
  // Validar: arma la vista previa (nuevos / actualizados / errores) sin guardar.
  // ------------------------------------------------------------------
  const validar = async () => {
    if (filas.length === 0) return;
    setValidando(true);
    try {
      const parsed: Preview["registros"] = [];
      let errores = 0;
      const porIndicador = new Map<string, { periodo: string; idx: number }[]>();

      const filasNorm = filas.map((fila) => {
        const m: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fila)) m[norm(k)] = v;
        return m;
      });

      for (const m of filasNorm) {
        // Resolver indicador: si hay uno específico seleccionado, usarlo;
        // si es "Todos", resolver por código o nombre de la fila.
        let ind: Indicador | undefined;
        if (sel !== "ALL") {
          ind = inds.find((i) => i.id === sel);
        } else {
          const code = norm(m["codigo"] ?? m["indicador"] ?? "");
          ind = code ? codeToInd.get(code) : undefined;
        }
        const periodoRaw = String(m["periodo"] ?? "").trim();
        const periodo = periodoRaw.match(/^(\d{4})-(\d{2})/)?.[0] ?? "";
        const num = Number(m["numerador"] ?? m["numerador_valor"] ?? 0) || 0;
        const den = Number(m["denominador"] ?? m["denominador_valor"] ?? 0) || 0;
        const comentario = String(m["comentario"] ?? "").trim() || null;

        if (!ind || !periodo) {
          errores++;
          continue;
        }
        const resultado = calcularResultado(ind.tipo, num, den);
        const semaforo = calcularSemaforo(resultado, ind.meta, ind.sentido);
        const idx = parsed.push({
          indicador_id: ind.id,
          periodo,
          numerador_valor: num,
          denominador_valor: den,
          resultado,
          meta: ind.meta,
          unidad: ind.unidad,
          semaforo,
          comentario,
          existenteId: null,
        }) - 1;
        const arr = porIndicador.get(ind.id) ?? [];
        arr.push({ periodo, idx });
        porIndicador.set(ind.id, arr);
      }

      // Buscar existentes por indicador + periodo para clasificar nuevos vs. actualizados.
      for (const [indId, items] of porIndicador) {
        const periodos = Array.from(new Set(items.map((i) => i.periodo)));
        const { data: existentes } = await supabase
          .from("mediciones_indicadores")
          .select("id, periodo")
          .eq("indicador_id", indId)
          .in("periodo", periodos);
        const byPeriodo = new Map(
          ((existentes ?? []) as { id: string; periodo: string | null }[]).map((e) => [
            String(e.periodo ?? ""),
            e.id,
          ]),
        );
        for (const it of items) {
          const found = byPeriodo.get(it.periodo);
          if (found) parsed[it.idx].existenteId = found;
        }
      }

      const actualizados = parsed.filter((r) => r.existenteId).length;
      const nuevos = parsed.length - actualizados;
      setPreview({ nuevos, actualizados, errores, registros: parsed });
      if (parsed.length === 0) {
        toast.error("No se encontraron filas válidas. Revisa indicador y periodo (YYYY-MM).");
      }
      auditar({
        data: {
          accion: "validar_importacion_indicadores",
          modulo: "indicadores",
          tabla: "mediciones_indicadores",
          resultado: errores > 0 && parsed.length === 0 ? "fallido" : "exito",
          detalles: { nuevos, actualizados, errores },
        },
      }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast.error("No se pudo validar el archivo.");
    } finally {
      setValidando(false);
    }
  };

  // ------------------------------------------------------------------
  // Confirmar importación: crea nuevos / actualiza existentes (sin duplicar).
  // ------------------------------------------------------------------
  const importar = async () => {
    if (!preview || preview.registros.length === 0) return;
    setGuardando(true);
    try {
      const nuevos = preview.registros.filter((r) => !r.existenteId);
      const actualizar = preview.registros.filter((r) => r.existenteId);

      if (nuevos.length > 0) {
        const { error } = await supabase.from("mediciones_indicadores").insert(
          nuevos.map((r) => ({
            indicador_id: r.indicador_id,
            periodo: r.periodo,
            numerador_valor: r.numerador_valor,
            denominador_valor: r.denominador_valor,
            resultado: r.resultado,
            meta: r.meta,
            unidad: r.unidad,
            semaforo: r.semaforo,
            comentario: r.comentario,
            fecha: new Date().toISOString(),
            created_by: user?.id,
          })) as never,
        );
        if (error) throw error;
      }

      for (const r of actualizar) {
        const { error } = await supabase
          .from("mediciones_indicadores")
          .update({
            numerador_valor: r.numerador_valor,
            denominador_valor: r.denominador_valor,
            resultado: r.resultado,
            meta: r.meta,
            unidad: r.unidad,
            semaforo: r.semaforo,
            comentario: r.comentario,
            fecha: new Date().toISOString(),
          } as never)
          .eq("id", r.existenteId!);
        if (error) throw error;
      }

      toast.success(
        `Importación completada: ${nuevos.length} nuevo(s), ${actualizar.length} actualizado(s).`,
      );
      auditar({
        data: {
          accion: "importar_indicadores",
          modulo: "indicadores",
          tabla: "mediciones_indicadores",
          resultado: "exito",
          detalles: {
            creados: nuevos.length,
            actualizados: actualizar.length,
            omitidos: preview.errores,
          },
        },
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["mediciones-ind"] });
      qc.invalidateQueries({ queryKey: ["indicadores-tiempo-real"] });
      qc.invalidateQueries({ queryKey: ["indicadores-cfg"] });
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al importar.");
      auditar({
        data: {
          accion: "importar_indicadores",
          modulo: "indicadores",
          tabla: "mediciones_indicadores",
          resultado: "fallido",
        },
      }).catch(() => {});
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Indicadores y mediciones
          </DialogTitle>
          <DialogDescription>
            Descarga la plantilla base para cargar mediciones mensuales de indicadores. También
            puedes exportar la información actual de uno o todos los indicadores para revisión o
            respaldo operativo.
          </DialogDescription>
        </DialogHeader>

        {!isAdmin ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            La carga y exportación de indicadores está reservada a coordinación.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Selector de indicador (aplica a las tres acciones) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Indicador</Label>
              <select
                className={selectCls}
                value={sel}
                onChange={(e) => {
                  setSel(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="ALL">Todos los indicadores</option>
                {inds.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo} · {i.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Acciones separadas: plantilla vs datos reales */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={descargarPlantilla}
                disabled={descargando}
              >
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

            {preview && (
              <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-status-green" /> Vista previa antes de guardar
                </p>
                <p className="text-muted-foreground">
                  <strong className="text-status-green">{preview.nuevos}</strong> nuevo(s) ·{" "}
                  <strong className="text-primary">{preview.actualizados}</strong> a actualizar ·{" "}
                  <strong className="text-status-red">{preview.errores}</strong> con error
                </p>
                {preview.errores > 0 && (
                  <p className="flex items-center gap-1 text-status-amber">
                    <AlertTriangle className="h-3.5 w-3.5" /> Las filas con error (indicador o periodo
                    inválido) se omitirán.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => cerrar(false)} disabled={guardando}>
              Cancelar
            </Button>
            {!preview ? (
              <Button onClick={validar} disabled={filas.length === 0 || validando}>
                {validando ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Validando…
                  </>
                ) : (
                  <>Validar</>
                )}
              </Button>
            ) : (
              <Button
                onClick={importar}
                disabled={preview.registros.length === 0 || guardando}
              >
                {guardando ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando…
                  </>
                ) : (
                  <>Importar {preview.registros.length} medición(es)</>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
