import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invalidatePlantillaConfig } from "@/lib/plantillas-inventario-config";
import {
  AlertTriangle,
  RefreshCw,
  Eye,
  History,
  MapPin,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { PlantillaFormDialog, type PlantillaFormValue } from "./plantilla-form-dialog";
import { PuntoUsoFormDialog, type PuntoUsoFormValue } from "./punto-uso-form-dialog";
import { buildOficioHTML } from "@/lib/oficio";
import { fixtureOficioMensaje, FIXTURE_CASO, AVISO_PREVIEW } from "@/lib/plantillas-preview-fixtures";
import {
  listarVersionesPlantilla,
  crearBorradorPlantilla,
  guardarBorradorPlantilla,
  publicarVersionPlantilla,
  restaurarVersionPlantilla,
} from "@/lib/plantillas-versiones.functions";

// ============================================================
// ADMINISTRADOR DE PLANTILLAS DEL SISTEMA (Fase 1+2).
// - Sub-pestañas por categoría (Documentos, Textos, Puntos de uso).
// - Detalle con Vista previa, Diseño, Variables, Puntos de uso,
//   Versiones e Historial.
// - Editor de campos seguros con guardado versionado.
// - Vista previa con datos ficticios (nunca datos reales).
// ============================================================

type Variable = {
  codigo: string;
  nombre: string;
  descripcion?: string;
  fuente?: string;
  tipo?: string;
  obligatoria?: boolean;
  valor_prueba?: string;
};

type PuntoUso = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  ruta: string | null;
  ventana: string | null;
  paso: string | null;
  evento: string | null;
  tipo_salida: string;
  plantilla_codigo: string | null;
  componente_responsable: string | null;
  estado: string;
  notas: string | null;
};

type PlantillaInv = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string | null;
  editable_nivel: "SOLO_LECTURA" | "PARCIAL" | "COMPLETA";
  formato: string | null;
  origen: string | null;
  generador: string | null;
  estado: string | null;
  version: string | null;
  dependencia: string | null;
  notas: string | null;
  contenido_editable: Record<string, unknown>;
  variables_declaradas: Variable[];
  puntos_uso_codigos: string[];
};

type Version = {
  id: string;
  plantilla_codigo: string;
  version: number;
  estado: "BORRADOR" | "ACTIVA" | "ARCHIVADA";
  contenido_editable: Record<string, unknown>;
  motivo: string | null;
  publicada_at: string | null;
  archivada_at: string | null;
  created_at: string;
  updated_at: string;
};

const NIVEL_LABEL: Record<string, string> = {
  SOLO_LECTURA: "Solo lectura",
  PARCIAL: "Configuración parcial",
  COMPLETA: "Editable",
};

function esDocumento(formato: string | null): boolean {
  const f = (formato ?? "").toUpperCase();
  return f === "PDF" || f === "XLSX" || f === "DOCX";
}

function esTexto(formato: string | null): boolean {
  const f = (formato ?? "").toUpperCase();
  return f === "HTML" || f === "TEXTO" || f === "MENSAJE";
}

export function PlantillasInventarioPanel() {
  const { isAdmin } = useAuth();

  const [subtab, setSubtab] = useState<"documentos" | "textos" | "puntos">("documentos");
  const [moduloFiltro, setModuloFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("activas");
  const [busqueda, setBusqueda] = useState("");
  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);

  const {
    data: rows,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PlantillaInv[]>({
    queryKey: ["cm-plantillas-inv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plantillas_inventario")
        .select(
          "id, codigo, nombre, modulo, editable_nivel, formato, origen, generador, estado, version, dependencia, notas, contenido_editable, variables_declaradas, puntos_uso_codigos",
        )
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        contenido_editable: (r.contenido_editable ?? {}) as Record<string, unknown>,
        variables_declaradas: (r.variables_declaradas ?? []) as Variable[],
        puntos_uso_codigos: (r.puntos_uso_codigos ?? []) as string[],
      })) as PlantillaInv[];
    },
  });

  const { data: puntos } = useQuery<PuntoUso[]>({
    queryKey: ["cm-puntos-uso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("puntos_de_uso")
        .select(
          "id, codigo, nombre, modulo, ruta, ventana, paso, evento, tipo_salida, plantilla_codigo, componente_responsable, estado, notas",
        )
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PuntoUso[];
    },
  });

  const modulos = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.modulo).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (subtab === "documentos" && !esDocumento(r.formato)) return false;
      if (subtab === "textos" && !esTexto(r.formato)) return false;
      if (moduloFiltro !== "todos" && r.modulo !== moduloFiltro) return false;
      if (estadoFiltro === "activas" && r.estado !== "ACTIVA") return false;
      if (estadoFiltro === "inactivas" && r.estado === "ACTIVA") return false;
      if (!q) return true;
      return [r.codigo, r.nombre, r.modulo ?? "", r.formato ?? "", r.origen ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [busqueda, estadoFiltro, moduloFiltro, rows, subtab]);

  const seleccion = useMemo(
    () => filtradas.find((r) => r.codigo === selectedCodigo) ?? filtradas[0] ?? null,
    [filtradas, selectedCodigo],
  );

  const errorMessage = error instanceof Error ? error.message : "No fue posible leer las plantillas.";

  return (
    <div className="space-y-4">
      <Tabs value={subtab} onValueChange={(v) => setSubtab(v as typeof subtab)}>
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="textos">Textos y comunicaciones</TabsTrigger>
          <TabsTrigger value="puntos">Puntos de uso</TabsTrigger>
        </TabsList>

        <TabsContent value="puntos" className="mt-4">
          <PuntosUsoTabla puntos={puntos ?? []} plantillas={rows ?? []} />
        </TabsContent>

        <TabsContent value="documentos" className="mt-4">
          <PanelListaDetalle
            titulo="Documentos generados"
            subtitle="PDF y Excel generados por el sistema"
            filtradas={filtradas}
            rows={rows ?? []}
            isLoading={isLoading}
            isError={isError}
            errorMessage={errorMessage}
            refetch={refetch}
            modulos={modulos}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            moduloFiltro={moduloFiltro}
            setModuloFiltro={setModuloFiltro}
            estadoFiltro={estadoFiltro}
            setEstadoFiltro={setEstadoFiltro}
            seleccion={seleccion}
            setSelectedCodigo={setSelectedCodigo}
            puntos={puntos ?? []}
            canEdit={isAdmin}
          />
        </TabsContent>

        <TabsContent value="textos" className="mt-4">
          <PanelListaDetalle
            titulo="Textos y comunicaciones"
            subtitle="Oficios HTML, mensajes y correos"
            filtradas={filtradas}
            rows={rows ?? []}
            isLoading={isLoading}
            isError={isError}
            errorMessage={errorMessage}
            refetch={refetch}
            modulos={modulos}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            moduloFiltro={moduloFiltro}
            setModuloFiltro={setModuloFiltro}
            estadoFiltro={estadoFiltro}
            setEstadoFiltro={setEstadoFiltro}
            seleccion={seleccion}
            setSelectedCodigo={setSelectedCodigo}
            puntos={puntos ?? []}
            canEdit={isAdmin}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Panel Lista + Detalle
// ============================================================

interface PanelProps {
  titulo: string;
  subtitle: string;
  filtradas: PlantillaInv[];
  rows: PlantillaInv[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  refetch: () => void;
  modulos: string[];
  busqueda: string;
  setBusqueda: (v: string) => void;
  moduloFiltro: string;
  setModuloFiltro: (v: string) => void;
  estadoFiltro: string;
  setEstadoFiltro: (v: string) => void;
  seleccion: PlantillaInv | null;
  setSelectedCodigo: (v: string) => void;
  puntos: PuntoUso[];
  canEdit: boolean;
}

function PanelListaDetalle(props: PanelProps) {
  const {
    titulo,
    subtitle,
    filtradas,
    rows,
    isLoading,
    isError,
    errorMessage,
    refetch,
    modulos,
    busqueda,
    setBusqueda,
    moduloFiltro,
    setModuloFiltro,
    estadoFiltro,
    setEstadoFiltro,
    seleccion,
    setSelectedCodigo,
    puntos,
    canEdit,
  } = props;

  const [dialogCrear, setDialogCrear] = useState(false);
  const [dialogEditar, setDialogEditar] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <aside className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{titulo}</h3>
            <p className="text-[11px] text-muted-foreground">
              {filtradas.length} visibles · {rows.length} registradas · {subtitle}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDialogCrear(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
            </Button>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar plantilla"
            className="h-8 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={moduloFiltro} onValueChange={setModuloFiltro}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los módulos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activas">Activas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="inactivas">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudieron leer las plantillas</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{errorMessage}</p>
              <Button size="sm" variant="outline" onClick={refetch}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ul className="space-y-1">
          {!isLoading &&
            !isError &&
            filtradas.map((r) => {
              const active = seleccion?.id === r.id;
              const puntosCount = r.puntos_uso_codigos.length;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedCodigo(r.codigo)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-tight">{r.nombre}</span>
                      <Badge variant={r.editable_nivel === "SOLO_LECTURA" ? "outline" : "default"}>
                        {NIVEL_LABEL[r.editable_nivel] ?? r.editable_nivel}
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{r.codigo}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {r.formato ?? "—"} · {r.modulo ?? "—"} · v{r.version ?? "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {puntosCount === 0
                        ? "Sin punto de uso"
                        : `${puntosCount} punto${puntosCount === 1 ? "" : "s"} de uso`}
                    </div>
                  </button>
                </li>
              );
            })}
          {!isLoading && !isError && filtradas.length === 0 && (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {rows.length === 0
                ? "Aún no hay plantillas registradas."
                : "No hay plantillas que coincidan con los filtros visibles."}
            </li>
          )}
        </ul>
      </aside>

      <section className="rounded-xl border border-border bg-card p-4">
        {!seleccion ? (
          <p className="text-sm text-muted-foreground">Seleccione una plantilla.</p>
        ) : (
          <PlantillaDetalle
            key={seleccion.id}
            plantilla={seleccion}
            puntos={puntos.filter((p) => (seleccion.puntos_uso_codigos ?? []).includes(p.codigo))}
            canEdit={canEdit}
            onEditar={() => setDialogEditar(true)}
          />
        )}
      </section>

      <PlantillaFormDialog
        open={dialogCrear}
        onOpenChange={setDialogCrear}
        modo="crear"
      />
      <PlantillaFormDialog
        open={dialogEditar}
        onOpenChange={setDialogEditar}
        modo="editar"
        inicial={seleccion ? {
          id: seleccion.id,
          codigo: seleccion.codigo,
          nombre: seleccion.nombre,
          modulo: seleccion.modulo ?? "GENERAL",
          formato: seleccion.formato ?? "PDF",
          origen: seleccion.origen ?? "CODIGO",
          generador: seleccion.generador,
          estado: seleccion.estado ?? "ACTIVA",
          version: seleccion.version ?? "1.0",
          dependencia: seleccion.dependencia,
          editable_nivel: seleccion.editable_nivel,
          notas: seleccion.notas,
        } as PlantillaFormValue : null}
      />
    </div>
  );
}

// ============================================================
// Detalle de una plantilla (6 sub-pestañas)
// ============================================================

function PlantillaDetalle({
  plantilla,
  puntos,
  canEdit,
  onEditar,
}: {
  plantilla: PlantillaInv;
  puntos: PuntoUso[];
  canEdit: boolean;
  onEditar: () => void;
}) {
  const qc = useQueryClient();
  const soloLectura = plantilla.editable_nivel === "SOLO_LECTURA";

  const versionesFn = useServerFn(listarVersionesPlantilla);
  const {
    data: versiones,
    isLoading: cargandoVersiones,
    refetch: refetchVersiones,
  } = useQuery<Version[]>({
    queryKey: ["cm-plantilla-versiones", plantilla.codigo],
    queryFn: async () => (await versionesFn({ data: { plantilla_codigo: plantilla.codigo } })) as Version[],
  });

  const invalidarTodo = () => {
    qc.invalidateQueries({ queryKey: ["cm-plantillas-inv"] });
    refetchVersiones();
    invalidatePlantillaConfig(plantilla.codigo);
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar la plantilla ${plantilla.codigo}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("plantillas_inventario").delete().eq("id", plantilla.id);
    if (error) return toast.error(error.message);
    toast.success("Plantilla eliminada");
    qc.invalidateQueries({ queryKey: ["cm-plantillas-inv"] });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{plantilla.nombre}</h3>
          <p className="text-xs text-muted-foreground">
            {plantilla.codigo} · módulo {plantilla.modulo ?? "—"} · formato {plantilla.formato ?? "—"}
          </p>
          {plantilla.notas && (
            <p className="mt-1 text-sm text-muted-foreground">{plantilla.notas}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={soloLectura ? "outline" : "default"}>
            {NIVEL_LABEL[plantilla.editable_nivel] ?? plantilla.editable_nivel}
          </Badge>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={onEditar}>
                <Pencil className="mr-1 h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={eliminar}>
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Origen" value={plantilla.origen ?? "—"} />
        <Info label="Generador" value={plantilla.generador ?? "—"} />
        <Info label="Estado" value={plantilla.estado ?? "—"} />
        <Info label="Versión activa" value={plantilla.version ?? "—"} />
      </div>

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="mb-3 flex flex-wrap gap-1">
          <TabsTrigger value="preview">
            <Eye className="mr-1 h-3.5 w-3.5" /> Vista previa
          </TabsTrigger>
          <TabsTrigger value="diseno">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Diseño y contenido
          </TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="puntos">
            <MapPin className="mr-1 h-3.5 w-3.5" /> Puntos de uso
          </TabsTrigger>
          <TabsTrigger value="versiones">Versiones</TabsTrigger>
          <TabsTrigger value="historial">
            <History className="mr-1 h-3.5 w-3.5" /> Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <VistaPrevia plantilla={plantilla} />
        </TabsContent>

        <TabsContent value="diseno">
          <EditorCampos plantilla={plantilla} canEdit={canEdit} onSaved={invalidarTodo} />
        </TabsContent>

        <TabsContent value="variables">
          <VariablesLista variables={plantilla.variables_declaradas} />
        </TabsContent>

        <TabsContent value="puntos">
          <PuntosDeUsoDetalle puntos={puntos} />
        </TabsContent>

        <TabsContent value="versiones">
          <VersionesPanel
            plantilla={plantilla}
            versiones={versiones ?? []}
            cargando={cargandoVersiones}
            canEdit={canEdit}
            onChange={invalidarTodo}
          />
        </TabsContent>

        <TabsContent value="historial">
          <HistorialLista versiones={versiones ?? []} cargando={cargandoVersiones} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Vista previa
// ============================================================

function VistaPrevia({ plantilla }: { plantilla: PlantillaInv }) {
  const formato = (plantilla.formato ?? "").toUpperCase();

  if (formato === "HTML") {
    return <PreviewHtml plantilla={plantilla} />;
  }
  if (formato === "PDF" || formato === "XLSX" || formato === "DOCX") {
    return <PreviewDocumento plantilla={plantilla} />;
  }
  if (formato === "TEXTO" || formato === "MENSAJE") {
    return <PreviewTexto plantilla={plantilla} />;
  }
  return (
    <p className="text-sm text-muted-foreground">
      Vista previa no disponible para el formato {plantilla.formato ?? "—"}.
    </p>
  );
}

function PreviewHtml({ plantilla }: { plantilla: PlantillaInv }) {
  const tipoOficio = useMemo(() => {
    switch (plantilla.codigo) {
      case "ENTRANTES_ACEPTACION_HTML":
        return "ACEP";
      case "ENTRANTES_NEGACION_HTML":
        return "NEG";
      case "ENTRANTES_CANCELACION_HTML":
        return "CAN";
      case "ENTRANTES_CRUE_ACEPTACION_HTML":
        return "CRUE_ACEP";
      case "ENTRANTES_CRUE_NEGACION_HTML":
        return "CRUE_NEG";
      default:
        return "ACEP";
    }
  }, [plantilla.codigo]);

  const html = useMemo(() => {
    return buildOficioHTML(tipoOficio, FIXTURE_CASO.codigo, fixtureOficioMensaje(tipoOficio));
  }, [tipoOficio]);

  return (
    <div className="space-y-2">
      <Alert>
        <AlertTitle>Vista previa</AlertTitle>
        <AlertDescription>{AVISO_PREVIEW}</AlertDescription>
      </Alert>
      <iframe
        title={`Vista previa ${plantilla.codigo}`}
        sandbox=""
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#f8fafc;padding:24px;font-family:'Segoe UI',Arial,sans-serif}</style></head><body>${html}</body></html>`}
        className="h-[640px] w-full rounded-lg border border-border bg-white"
      />
    </div>
  );
}

function PreviewDocumento({ plantilla }: { plantilla: PlantillaInv }) {
  const cfg = plantilla.contenido_editable ?? {};
  return (
    <div className="space-y-3">
      <Alert>
        <AlertTitle>Vista previa estructural</AlertTitle>
        <AlertDescription>
          {AVISO_PREVIEW}. Para ver el archivo generado con datos reales, ejecute la acción
          correspondiente desde su punto de uso.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="border-b border-border pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Encabezado
          </p>
          <h4 className="text-lg font-bold">
            {String(cfg.encabezado_titulo ?? plantilla.nombre)}
          </h4>
          {cfg.encabezado_subtitulo ? (
            <p className="text-sm text-muted-foreground">{String(cfg.encabezado_subtitulo)}</p>
          ) : null}
          {cfg.encabezado_codigo ? (
            <p className="mt-1 text-xs font-mono text-muted-foreground">
              Código: {String(cfg.encabezado_codigo)}
            </p>
          ) : null}
        </div>

        <div className="py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contenido
          </p>
          <p className="text-sm text-muted-foreground">
            El contenido se genera dinámicamente por{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {plantilla.generador ?? "generador desconocido"}
            </code>{" "}
            con los datos del caso. Formato: {plantilla.formato}.
          </p>
          {typeof cfg.incluye_seccion_phd === "boolean" && (
            <p className="mt-1 text-xs text-muted-foreground">
              · Sección PHD/PAD/O2: {cfg.incluye_seccion_phd ? "incluida" : "excluida"}
            </p>
          )}
          {typeof cfg.incluye_seccion_negaciones === "boolean" && (
            <p className="mt-1 text-xs text-muted-foreground">
              · Sección de negaciones: {cfg.incluye_seccion_negaciones ? "incluida" : "excluida"}
            </p>
          )}
        </div>

        {cfg.pie_leyenda ? (
          <div className="border-t border-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pie
            </p>
            <p className="text-xs italic text-muted-foreground">{String(cfg.pie_leyenda)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PreviewTexto({ plantilla }: { plantilla: PlantillaInv }) {
  return (
    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm">
      {JSON.stringify(plantilla.contenido_editable ?? {}, null, 2)}
    </pre>
  );
}

// ============================================================
// Editor de campos
// ============================================================

function EditorCampos({
  plantilla,
  canEdit,
  onSaved,
}: {
  plantilla: PlantillaInv;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(plantilla.contenido_editable ?? {});
  const [dirty, setDirty] = useState(false);
  const soloLectura = plantilla.editable_nivel === "SOLO_LECTURA";
  const entries = Object.entries(plantilla.contenido_editable ?? {});

  const guardarDirectamente = async () => {
    // Guardado rápido: escribe directo en plantillas_inventario (v actual).
    // Para trazabilidad completa el admin puede usar "Guardar como nueva versión".
    if (!canEdit || soloLectura) return;
    const { error } = await supabase
      .from("plantillas_inventario")
      .update({ contenido_editable: draft as never })
      .eq("id", plantilla.id);
    if (error) return toast.error(error.message);
    toast.success("Contenido guardado en la versión actual");
    setDirty(false);
    onSaved();
  };

  const setField = (k: string, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  if (soloLectura) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Origen: {plantilla.origen ?? "CÓDIGO"}. Esta plantilla se genera directamente desde código
        (<code className="rounded bg-muted px-1 py-0.5 text-xs">
          {plantilla.generador ?? "generador no registrado"}
        </code>
        ) y no expone campos editables. Para modificar su diseño se requiere una integración técnica.
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta plantilla no declara campos editables todavía.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, initialValue]) => {
        const current = draft[key] ?? initialValue;
        if (typeof initialValue === "boolean") {
          return (
            <label
              key={key}
              className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
            >
              <input
                type="checkbox"
                checked={!!current}
                disabled={!canEdit}
                onChange={(e) => setField(key, e.target.checked)}
              />
              <span className="font-medium">{prettifyKey(key)}</span>
            </label>
          );
        }
        if (typeof initialValue === "string" && initialValue.length > 60) {
          return (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium">{prettifyKey(key)}</label>
              <Textarea
                value={String(current ?? "")}
                disabled={!canEdit}
                onChange={(e) => setField(key, e.target.value)}
                rows={3}
              />
            </div>
          );
        }
        return (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium">{prettifyKey(key)}</label>
            <Input
              value={String(current ?? "")}
              disabled={!canEdit}
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        );
      })}

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={guardarDirectamente} disabled={!dirty}>
            Guardar en versión actual
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Para conservar historial y poder revertir cambios, use la pestaña "Versiones" para crear un
        borrador y publicarlo.
      </p>
    </div>
  );
}

// ============================================================
// Variables
// ============================================================

function VariablesLista({ variables }: { variables: Variable[] }) {
  if (!variables.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta plantilla no declara variables. Consulte el generador para conocer los datos que utiliza.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-left">Código</th>
            <th className="p-2 text-left">Nombre</th>
            <th className="p-2 text-left">Tipo</th>
            <th className="p-2 text-left">Obligatoria</th>
            <th className="p-2 text-left">Valor de prueba</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((v) => (
            <tr key={v.codigo} className="border-t border-border">
              <td className="p-2 font-mono">{`{{${v.codigo}}}`}</td>
              <td className="p-2">{v.nombre}</td>
              <td className="p-2">{v.tipo ?? "—"}</td>
              <td className="p-2">{v.obligatoria ? "Sí" : "No"}</td>
              <td className="p-2 text-muted-foreground">{v.valor_prueba ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Puntos de uso
// ============================================================

function PuntosDeUsoDetalle({ puntos }: { puntos: PuntoUso[] }) {
  if (!puntos.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta plantilla no tiene puntos de uso registrados. Sin puntos de uso no se ejecuta desde
        ningún flujo del sistema.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {puntos.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{p.nombre}</p>
              <p className="text-[11px] text-muted-foreground">{p.codigo}</p>
            </div>
            <Badge variant="outline">{p.estado}</Badge>
          </div>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Módulo" value={p.modulo} />
            <Info label="Ruta" value={p.ruta ?? "—"} />
            <Info label="Ventana" value={p.ventana ?? "—"} />
            <Info label="Paso" value={p.paso ?? "—"} />
            <Info label="Evento" value={p.evento ?? "—"} />
            <Info label="Salida" value={p.tipo_salida} />
            <Info label="Componente" value={p.componente_responsable ?? "—"} className="sm:col-span-2 lg:col-span-3" />
          </div>
          {p.notas && <p className="mt-2 text-xs text-muted-foreground">{p.notas}</p>}
        </div>
      ))}
    </div>
  );
}

function PuntosUsoTabla({
  puntos,
  plantillas,
}: {
  puntos: PuntoUso[];
  plantillas: PlantillaInv[];
}) {
  const nombrePorCodigo = useMemo(() => {
    const m = new Map<string, string>();
    plantillas.forEach((p) => m.set(p.codigo, p.nombre));
    return m;
  }, [plantillas]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-left">Código</th>
            <th className="p-2 text-left">Nombre</th>
            <th className="p-2 text-left">Módulo</th>
            <th className="p-2 text-left">Ruta</th>
            <th className="p-2 text-left">Acción</th>
            <th className="p-2 text-left">Salida</th>
            <th className="p-2 text-left">Plantilla activa</th>
            <th className="p-2 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="p-2 font-mono">{p.codigo}</td>
              <td className="p-2">{p.nombre}</td>
              <td className="p-2">{p.modulo}</td>
              <td className="p-2 text-muted-foreground">{p.ruta ?? "—"}</td>
              <td className="p-2 text-muted-foreground">{p.evento ?? p.paso ?? "—"}</td>
              <td className="p-2">
                <Badge variant="outline">{p.tipo_salida}</Badge>
              </td>
              <td className="p-2">
                {p.plantilla_codigo ? (
                  <span>
                    <span className="font-medium">
                      {nombrePorCodigo.get(p.plantilla_codigo) ?? p.plantilla_codigo}
                    </span>
                    <br />
                    <span className="text-[10px] text-muted-foreground">{p.plantilla_codigo}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin vincular</span>
                )}
              </td>
              <td className="p-2">
                <Badge variant={p.estado === "ACTIVO" ? "default" : "outline"}>{p.estado}</Badge>
              </td>
            </tr>
          ))}
          {puntos.length === 0 && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                No hay puntos de uso registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Versiones + Historial
// ============================================================

function VersionesPanel({
  plantilla,
  versiones,
  cargando,
  canEdit,
  onChange,
}: {
  plantilla: PlantillaInv;
  versiones: Version[];
  cargando: boolean;
  canEdit: boolean;
  onChange: () => void;
}) {
  const crear = useServerFn(crearBorradorPlantilla);
  const publicar = useServerFn(publicarVersionPlantilla);
  const restaurar = useServerFn(restaurarVersionPlantilla);

  const crearBorrador = async () => {
    try {
      await crear({ data: { plantilla_codigo: plantilla.codigo, motivo: "Nuevo borrador" } });
      toast.success("Borrador creado");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    }
  };

  const publicarV = async (id: string) => {
    if (!confirm("¿Publicar esta versión? Reemplazará la activa actual.")) return;
    try {
      await publicar({ data: { version_id: id } });
      toast.success("Versión publicada");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo publicar");
    }
  };

  const restaurarV = async (id: string) => {
    try {
      await restaurar({ data: { version_id: id } });
      toast.success("Restauración creada como borrador");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  };

  if (cargando) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canEdit && plantilla.editable_nivel !== "SOLO_LECTURA" && (
          <Button size="sm" onClick={crearBorrador}>
            <Plus className="mr-1 h-4 w-4" /> Nueva versión (borrador)
          </Button>
        )}
      </div>

      {versiones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin versiones registradas todavía.</p>
      ) : (
        versiones.map((v) => (
          <div key={v.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Versión {v.version}</span>
                <Badge
                  variant={
                    v.estado === "ACTIVA"
                      ? "default"
                      : v.estado === "BORRADOR"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {v.estado}
                </Badge>
              </div>
              <div className="flex gap-2">
                {canEdit && v.estado === "BORRADOR" && (
                  <Button size="sm" onClick={() => publicarV(v.id)}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Publicar
                  </Button>
                )}
                {canEdit && v.estado === "ARCHIVADA" && (
                  <Button size="sm" variant="outline" onClick={() => restaurarV(v.id)}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Restaurar
                  </Button>
                )}
              </div>
            </div>
            {v.motivo && <p className="mt-1 text-xs text-muted-foreground">Motivo: {v.motivo}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Actualizada {new Date(v.updated_at).toLocaleString("es-CO")}
              {v.publicada_at && ` · publicada ${new Date(v.publicada_at).toLocaleString("es-CO")}`}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

function HistorialLista({ versiones, cargando }: { versiones: Version[]; cargando: boolean }) {
  if (cargando) return <Skeleton className="h-32" />;
  if (versiones.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin historial disponible.</p>;
  }
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {versiones.map((v) => (
        <li key={v.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
          <div className="text-sm">
            <span className="font-semibold">v{v.version}</span> · {v.estado}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(v.updated_at).toLocaleString("es-CO")}
          </div>
          {v.motivo && <div className="text-xs text-muted-foreground">Motivo: {v.motivo}</div>}
        </li>
      ))}
    </ol>
  );
}

// ============================================================
// Helpers
// ============================================================

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border border-border/70 bg-background p-2 ${className ?? ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}

function prettifyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
