import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { invalidatePlantillaConfig } from "@/lib/plantillas-inventario-config";
import { AlertTriangle, RefreshCw } from "lucide-react";

// ============================================================
// Inventario de plantillas del sistema (Fase Q5).
// - Muestra las 7 plantillas registradas en plantillas_inventario.
// - Las marcadas PARCIAL exponen los campos declarados en
//   contenido_editable (JSON) para que el admin ajuste títulos,
//   encabezados y leyendas SIN tocar código.
// - Las SOLO_LECTURA muestran la leyenda oficial "DISEÑO
//   ADMINISTRABLE PENDIENTE DE DESARROLLO".
// - No cambia los generadores. La integración por generador es
//   un paso siguiente por-plantilla.
// ============================================================

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
};

export function PlantillasInventarioPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [moduloFiltro, setModuloFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("activas");
  const [busqueda, setBusqueda] = useState("");

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
          "id, codigo, nombre, modulo, editable_nivel, formato, origen, generador, estado, version, dependencia, notas, contenido_editable",
        )
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        contenido_editable: (r.contenido_editable ?? {}) as Record<string, unknown>,
      })) as PlantillaInv[];
    },
  });


  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);
  const modulos = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.modulo).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (moduloFiltro !== "todos" && r.modulo !== moduloFiltro) return false;
      if (estadoFiltro === "activas" && r.estado !== "ACTIVA") return false;
      if (estadoFiltro === "inactivas" && r.estado === "ACTIVA") return false;
      if (!q) return true;
      return [r.codigo, r.nombre, r.modulo ?? "", r.formato ?? "", r.origen ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [busqueda, estadoFiltro, moduloFiltro, rows]);
  const seleccion = useMemo(
    () => filtradas.find((r) => r.codigo === selectedCodigo) ?? filtradas[0] ?? null,
    [filtradas, selectedCodigo],
  );

  const errorMessage = error instanceof Error ? error.message : "No fue posible leer las plantillas.";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <aside className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div>
          <h3 className="text-sm font-semibold">Plantillas del sistema</h3>
          <p className="text-[11px] text-muted-foreground">
            {filtradas.length} visibles · {rows?.length ?? 0} registradas
          </p>
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
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudieron leer las plantillas</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{errorMessage}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ul className="space-y-1">
          {!isLoading && !isError && filtradas.map((r) => {
            const active = seleccion?.id === r.id;
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.codigo}</span>
                    <Badge
                      variant={
                        r.editable_nivel === "PARCIAL"
                          ? "default"
                          : r.editable_nivel === "COMPLETA"
                            ? "default"
                            : "outline"
                      }
                    >
                      {r.editable_nivel}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{r.nombre}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {r.formato ?? "—"} · {r.modulo ?? "—"} · {r.origen ?? "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Estado {r.estado ?? "—"} · v{r.version ?? "—"}
                  </div>
                </button>
              </li>
            );
          })}
          {!isLoading && !isError && filtradas.length === 0 && (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {(rows?.length ?? 0) === 0
                ? "Aún no hay plantillas registradas."
                : "No hay plantillas que coincidan con los filtros visibles."}
            </li>
          )}
        </ul>
      </aside>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        {!seleccion ? (
          <p className="text-sm text-muted-foreground">Seleccione una plantilla.</p>
        ) : (
          <PlantillaEditor
            key={seleccion.id}
            plantilla={seleccion}
            canEdit={isAdmin}
            onSaved={() => qc.invalidateQueries({ queryKey: ["cm-plantillas-inv"] })}
          />
        )}
      </section>
    </div>
  );
}

function PlantillaEditor({
  plantilla,
  canEdit,
  onSaved,
}: {
  plantilla: PlantillaInv;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    plantilla.contenido_editable ?? {},
  );
  const [dirty, setDirty] = useState(false);

  const soloLectura = plantilla.editable_nivel === "SOLO_LECTURA";
  const entries = Object.entries(plantilla.contenido_editable ?? {});

  const guardar = async () => {
    if (!canEdit || soloLectura) return;
    const { error } = await supabase
      .from("plantillas_inventario")
      .update({ contenido_editable: draft as never })
      .eq("id", plantilla.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Contenido guardado");
      setDirty(false);
      invalidatePlantillaConfig(plantilla.codigo);
      onSaved();
    }
  };

  const setField = (k: string, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{plantilla.nombre}</h3>
          <p className="text-xs text-muted-foreground">
            {plantilla.codigo} · módulo {plantilla.modulo ?? "—"} · formato{" "}
            {plantilla.formato ?? "—"}
          </p>
          {plantilla.notas && (
            <p className="mt-1 text-sm text-muted-foreground">{plantilla.notas}</p>
          )}
        </div>
        <Badge variant={soloLectura ? "outline" : "default"}>{plantilla.editable_nivel}</Badge>
      </header>

      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Origen" value={plantilla.origen ?? "—"} />
        <Info label="Generador" value={plantilla.generador ?? "—"} />
        <Info label="Estado" value={plantilla.estado ?? "—"} />
        <Info label="Versión" value={plantilla.version ?? "—"} />
        <Info label="Dependencia" value={plantilla.dependencia ?? "—"} className="sm:col-span-2" />
        <Info label="Editabilidad" value={plantilla.editable_nivel} />
      </div>

      {soloLectura ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          ORIGEN: {plantilla.origen ?? "CÓDIGO"}. DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO.
          Esta plantilla se genera directamente desde código: <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {plantilla.generador ?? "generador no registrado"}
          </code>
          .
        </div>

      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta plantilla no declara campos editables todavía.
        </p>
      ) : (
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
            <div className="flex justify-end">
              <Button size="sm" onClick={guardar} disabled={!dirty}>
                Guardar cambios
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border border-border/70 bg-background p-2 ${className ?? ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}

function prettifyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
