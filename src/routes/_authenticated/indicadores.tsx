import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { StatCard, Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  type Indicador,
  type Medicion,
  type Semaforo,
  TIPOS_INDICADOR,
  UNIDADES_INDICADOR,
  SENTIDOS_INDICADOR,
  calcularResultado,
  calcularSemaforo,
  ultimaMedicionPorIndicador,
  historialIndicador,
  tendenciaTexto,
  lecturaBrecha,
  avanceContraMeta,
  formatearPeriodo,
  SEMAFORO_LABEL,
} from "@/lib/indicadores-utils";

export const Route = createFileRoute("/_authenticated/indicadores")({
  component: IndicadoresPage,
});

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const pillCls: Record<Semaforo, string> = {
  VERDE: "bg-status-green/15 text-status-green",
  AMARILLO: "bg-status-amber/15 text-status-amber",
  ROJO: "bg-status-red/15 text-status-red",
  GRIS: "bg-muted text-muted-foreground",
};

const borderCls: Record<Semaforo, string> = {
  VERDE: "border-l-status-green",
  AMARILLO: "border-l-status-amber",
  ROJO: "border-l-status-red",
  GRIS: "border-l-border",
};

function IndicadoresPage() {
  const { isAdmin, canEdit } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Indicador | null>(null);
  

  const { data: indicadores, isLoading } = useQuery({
    queryKey: ["indicadores-cfg"],
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

  const { data: mediciones } = useQuery({
    queryKey: ["mediciones-ind"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mediciones_indicadores")
        .select("*")
        .order("periodo", { ascending: true });
      if (error) throw error;
      return data as Medicion[];
    },
  });

  const inds = useMemo(() => indicadores ?? [], [indicadores]);
  const meds = useMemo(() => mediciones ?? [], [mediciones]);
  const ultimas = useMemo(() => ultimaMedicionPorIndicador(meds), [meds]);

  const resumen = useMemo(() => {
    const activos = inds.filter((i) => i.activo);
    let verdes = 0,
      amarillos = 0,
      rojos = 0,
      sinDato = 0;
    for (const ind of activos) {
      const m = ultimas[ind.id];
      switch (m?.semaforo) {
        case "VERDE":
          verdes++;
          break;
        case "AMARILLO":
          amarillos++;
          break;
        case "ROJO":
          rojos++;
          break;
        default:
          sinDato++;
      }
    }
    return { total: activos.length, verdes, amarillos, rojos, sinDato };
  }, [inds, ultimas]);

  const term = q.trim().toLowerCase();
  const indsF = useMemo(
    () =>
      inds.filter((i) =>
        term
          ? [i.nombre, i.codigo, i.tipo, i.responsable]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [inds, term],
  );

  const onGuardarIndicador = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      nombre: String(f.get("nombre") || "").trim(),
      codigo: String(f.get("codigo") || "").trim() || null,
      tipo: String(f.get("tipo") || "PROPORCION"),
      descripcion: String(f.get("descripcion") || "").trim() || null,
      numerador: String(f.get("numerador") || "").trim() || null,
      denominador: String(f.get("denominador") || "").trim() || null,
      meta: f.get("meta") ? Number(f.get("meta")) : null,
      unidad: String(f.get("unidad") || "%"),
      sentido: String(f.get("sentido") || "MAYOR_ES_MEJOR"),
      responsable: String(f.get("responsable") || "").trim() || null,
      fuente: String(f.get("fuente") || "").trim() || null,
      activo: String(f.get("activo") || "SI") === "SI",
    };
    if (!payload.nombre) return toast.error("El nombre del indicador es obligatorio.");

    const { error } = editing
      ? await supabase.from("indicadores").update(payload).eq("id", editing.id)
      : await supabase.from("indicadores").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Indicador actualizado" : "Indicador creado");
    setFormOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["indicadores-cfg"] });
  };

  const onArchivar = async (ind: Indicador) => {
    if (!confirm(`¿Archivar el indicador "${ind.nombre}"?`)) return;
    const { error } = await supabase
      .from("indicadores")
      .update({ archivado: true })
      .eq("id", ind.id);
    if (error) return toast.error(error.message);
    toast.success("Indicador archivado");
    qc.invalidateQueries({ queryKey: ["indicadores-cfg"] });
  };

  const onGuardarMedicion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const indId = String(f.get("indicador") || "");
    const ind = inds.find((i) => i.id === indId);
    if (!ind) return toast.error("Seleccione un indicador válido.");
    const periodo = String(f.get("periodo") || "");
    if (!periodo) return toast.error("El periodo de medición es obligatorio.");
    const num = Number(f.get("numerador") || 0);
    const den = Number(f.get("denominador") || 0);
    const resultado = calcularResultado(ind.tipo, num, den);
    const semaforo = calcularSemaforo(resultado, ind.meta, ind.sentido);
    const { error } = await supabase.from("mediciones_indicadores").insert({
      indicador_id: indId,
      periodo,
      numerador_valor: num,
      denominador_valor: den,
      resultado,
      meta: ind.meta,
      unidad: ind.unidad,
      semaforo,
      comentario: String(f.get("comentario") || "").trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Medición guardada · ${resultado ?? "—"} ${ind.unidad ?? ""}`);
    form.reset();
    qc.invalidateQueries({ queryKey: ["mediciones-ind"] });
  };

  const abrirNuevo = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const abrirEditar = (ind: Indicador) => {
    setEditing(ind);
    setFormOpen(true);
  };

  return (
    <div>
      <AppHeader title="Indicadores" subtitle="Panel de KPIs · Mediciones y semáforo de cumplimiento." />

      {/* Resumen / semáforo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Indicadores activos" value={resumen.total} caption="Configurados" color="blue" />
        <StatCard title="En meta (verde)" value={resumen.verdes} caption="Cumplen objetivo" color="green" />
        <StatCard title="Alerta (amarillo)" value={resumen.amarillos} caption="Cerca del umbral" color="amber" />
        <StatCard title="Crítico (rojo)" value={resumen.rojos} caption="Fuera de meta" color="red" />
        <StatCard title="Sin medición" value={resumen.sinDato} caption="Pendientes de registrar" color="sky" />
      </div>



      {/* Buscador + nuevo indicador */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar indicador…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button className="rounded-full" onClick={abrirNuevo}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo indicador
          </Button>
        )}
      </div>

      {/* Tarjetas de indicadores */}
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando indicadores…</p>
      ) : indsF.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {inds.length === 0 ? "Sin indicadores configurados." : "Sin resultados para la búsqueda."}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {indsF.map((ind) => (
            <IndicadorCard
              key={ind.id}
              ind={ind}
              med={ultimas[ind.id]}
              historial={historialIndicador(meds, ind.id)}
              canEdit={canEdit}
              isAdmin={isAdmin}
              onEdit={() => abrirEditar(ind)}
              onArchive={() => onArchivar(ind)}
            />
          ))}
        </div>
      )}

      {/* Captura mensual */}
      {canEdit && (
        <div className="mt-6">
          <Panel title="Captura mensual de indicadores" bodyMaxHeight={null}>
            <form onSubmit={onGuardarMedicion} className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Indicador</Label>
                <select name="indicador" className={selectCls} defaultValue="" required>
                  <option value="" disabled>
                    Seleccione…
                  </option>
                  {inds
                    .filter((i) => i.activo)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.codigo} · {i.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Periodo</Label>
                <Input
                  name="periodo"
                  type="month"
                  defaultValue={new Date().toISOString().slice(0, 7)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Numerador / valor acumulado</Label>
                <Input name="numerador" type="number" step="any" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Denominador / casos</Label>
                <Input name="denominador" type="number" step="any" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Comentario</Label>
                <Input name="comentario" placeholder="Análisis breve o compromiso de mejora" />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit">Guardar medición</Button>
              </div>
            </form>

            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Últimas mediciones
              </p>
              <MedicionesList mediciones={meds} indicadores={inds} />
            </div>
          </Panel>
        </div>
      )}

      <IndicadorFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        onSubmit={onGuardarIndicador}
      />
    </div>

  );
}

function IndicadorCard({
  ind,
  med,
  historial,
  canEdit,
  isAdmin,
  onEdit,
  onArchive,
}: {
  ind: Indicador;
  med: Medicion | undefined;
  historial: Medicion[];
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const sem = (med?.semaforo as Semaforo) || "GRIS";
  const tieneResultado =
    med?.resultado !== undefined && med?.resultado !== null && !Number.isNaN(Number(med?.resultado));
  const unidad = med?.unidad || ind.unidad || "";
  const { ancho, etiqueta } = avanceContraMeta(ind, med);
  const vals = historial.map((m) => Number(m.resultado)).filter((v) => !Number.isNaN(v));
  const maxSpark = Math.max(1, ...vals);

  return (
    <div className={`flex flex-col rounded-2xl border border-border border-l-4 ${borderCls[sem]} bg-card p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-extrabold leading-snug text-foreground">{ind.nombre}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillCls[sem]}`}>
          {SEMAFORO_LABEL[sem]}
        </span>
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {ind.codigo || "Sin código"} · {ind.tipo} · {ind.responsable || "Coordinación"}
      </p>

      {/* KPIs */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Resultado</p>
          <p className="text-lg font-extrabold text-foreground">
            {tieneResultado ? `${med?.resultado} ${unidad}` : "Sin dato"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {med?.periodo ? formatearPeriodo(med.periodo) : "Sin periodo registrado"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Meta</p>
          <p className="text-lg font-extrabold text-foreground">
            {ind.meta != null ? `${ind.meta} ${ind.unidad || ""}` : "Pendiente"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {etiqueta !== "Pendiente" ? `Cumplimiento ${etiqueta}` : "Sin cumplimiento"}
          </p>
        </div>
      </div>

      {/* Avance contra meta */}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Avance contra meta</span>
          <span>{etiqueta}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${ancho}%` }} />
        </div>
      </div>

      {/* Tendencia */}
      <div className="mt-3 flex h-12 items-end gap-1 rounded-lg border border-border/60 bg-background/40 p-2">
        {vals.length === 0 ? (
          <p className="w-full text-center text-[11px] italic text-muted-foreground">
            Sin tendencia mensual registrada.
          </p>
        ) : (
          vals.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm bg-primary/60"
              style={{ height: `${Math.max(15, Math.round((v / maxSpark) * 100))}%` }}
            />
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-bold text-foreground">Lectura: </span>
        {lecturaBrecha(ind, med)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <p className="font-bold uppercase tracking-wide text-muted-foreground">Numerador</p>
          <p className="text-foreground">{ind.numerador || "Pendiente"}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <p className="font-bold uppercase tracking-wide text-muted-foreground">Denominador</p>
          <p className="text-foreground">{ind.denominador || "Pendiente"}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
        <span className="text-[11px] text-muted-foreground">{tendenciaTexto(historial, ind.sentido)}</span>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs text-status-red hover:text-status-red"
                onClick={onArchive}
              >
                <Archive className="mr-1 h-3.5 w-3.5" /> Archivar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MedicionesList({
  mediciones,
  indicadores,
}: {
  mediciones: Medicion[];
  indicadores: Indicador[];
}) {
  const nombre = (id: string) => indicadores.find((i) => i.id === id)?.nombre || id;
  const items = [...mediciones].reverse().slice(0, 15);
  if (items.length === 0) {
    return <p className="py-4 text-center text-sm italic text-muted-foreground">Sin mediciones registradas.</p>;
  }
  const pill: Record<string, string> = {
    VERDE: "bg-status-green/15 text-status-green",
    AMARILLO: "bg-status-amber/15 text-status-amber",
    ROJO: "bg-status-red/15 text-status-red",
  };
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{nombre(m.indicador_id)}</p>
            <p className="text-muted-foreground">
              {formatearPeriodo(m.periodo)}
              {m.comentario ? ` · ${m.comentario}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">
              {m.resultado ?? "—"} {m.unidad || ""}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pill[m.semaforo || ""] || "bg-muted text-muted-foreground"}`}
            >
              {m.semaforo || "SIN DATO"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IndicadorFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Indicador | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar indicador" : "Nuevo indicador"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre del indicador</Label>
            <Input name="nombre" defaultValue={editing?.nombre ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input name="codigo" defaultValue={editing?.codigo ?? ""} placeholder="IND-XXX-000" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select name="tipo" className={selectCls} defaultValue={editing?.tipo ?? "PROPORCION"}>
              {TIPOS_INDICADOR.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea name="descripcion" rows={2} defaultValue={editing?.descripcion ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Numerador</Label>
            <Input name="numerador" defaultValue={editing?.numerador ?? ""} placeholder="Qué se cuenta" />
          </div>
          <div className="space-y-1.5">
            <Label>Denominador</Label>
            <Input name="denominador" defaultValue={editing?.denominador ?? ""} placeholder="Base de medición" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta</Label>
            <Input name="meta" type="number" step="any" defaultValue={editing?.meta ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Unidad</Label>
            <select name="unidad" className={selectCls} defaultValue={editing?.unidad ?? "%"}>
              {UNIDADES_INDICADOR.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Sentido</Label>
            <select name="sentido" className={selectCls} defaultValue={editing?.sentido ?? "MAYOR_ES_MEJOR"}>
              {SENTIDOS_INDICADOR.map((s) => (
                <option key={s} value={s}>
                  {s === "MAYOR_ES_MEJOR" ? "Mayor es mejor" : "Menor es mejor"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <select name="activo" className={selectCls} defaultValue={editing?.activo === false ? "NO" : "SI"}>
              <option value="SI">Activo</option>
              <option value="NO">Inactivo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Input name="responsable" defaultValue={editing?.responsable ?? "Coordinacion de referencia"} />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente</Label>
            <Input name="fuente" defaultValue={editing?.fuente ?? "Bitacora operativa"} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editing ? "Guardar cambios" : "Guardar indicador"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
