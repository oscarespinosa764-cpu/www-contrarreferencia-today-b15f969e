import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { AppHeader } from "@/components/app-header";
import { FiltersBar, countActiveFilters } from "@/components/filters/filters-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Network,
  Building2,
  XCircle,
  Stethoscope,
  Ambulance,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { RedCard } from "@/components/red/red-card";
import { RedFormDialog } from "@/components/red/red-form-dialog";
import {
  RED_GRUPOS,
  TIPO_RED_LABEL,
  getGrupo,
  grupoDeTipo,
  esCaqueta,
  norm,
  textoBusqueda,
  esActivo,
  ubicacion,
  serviciosList,
  type RedRegistro,
  type RedGrupo,
  type TipoRed,
} from "@/lib/red-ips-utils";

type RedSearch = {
  grupo: string;
  sub: string;
  ambito: string;
  q: string;
  estado: string;
  page: number;
  size: number;
};

function parseSearch(s: Record<string, unknown>): RedSearch {
  const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  return {
    grupo: str(s.grupo, "jornadas_tep"),
    sub: str(s.sub, ""),
    ambito: str(s.ambito, "todos"),
    q: typeof s.q === "string" ? s.q : "",
    estado: str(s.estado, "todos"),
    page: num(s.page, 1),
    size: num(s.size, 20),
  };
}

export const Route = createFileRoute("/_authenticated/red-ips")({
  validateSearch: parseSearch,
  component: RedIpsPage,
});


function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function RedIpsPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const grupo = (search.grupo as RedGrupo) ?? "jornadas_tep";
  const grupoCfg = getGrupo(grupo);
  const subActiva =
    grupoCfg.subsecciones?.find((s) => s.key === search.sub) ??
    grupoCfg.subsecciones?.[0] ??
    null;

  // Input local para búsqueda con debounce
  const [qInput, setQInput] = useState(search.q);
  useEffect(() => setQInput(search.q), [search.q]);
  const qDebounced = useDebounced(qInput, 400);
  useEffect(() => {
    if (qDebounced !== search.q) {
      navigate({ search: (p: RedSearch) => ({ ...p, q: qDebounced, page: 1 }), replace: true });
    }
  }, [qDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSearch = (patch: Partial<RedSearch>) => {
    navigate({ search: (p: RedSearch) => ({ ...p, ...patch }), replace: true });
  };

  const [detalle, setDetalle] = useState<RedRegistro | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RedRegistro | null>(null);
  const [aEliminar, setAEliminar] = useState<RedRegistro | null>(null);

  const { data: registros, isLoading, isError } = useQuery({
    queryKey: ["red-operativa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("red_operativa")
        .select("*")
        .eq("archivado", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RedRegistro[];
    },
  });

  const all = registros ?? [];

  // Conteos reales para tarjetas superiores
  const conteos = useMemo(() => {
    const enGrupo = (k: RedGrupo) => all.filter((r) => grupoDeTipo(r.tipo_red) === k);
    const ips = enGrupo("ips");
    return {
      ipsActivas: ips.filter((r) => esActivo(r)).length,
      ipsNoDisp: ips.filter((r) => !esActivo(r)).length,
      especialidades: enGrupo("especialidades_cedim").filter((r) => esActivo(r)).length,
      ambulancias: enGrupo("ambulancias").filter((r) => esActivo(r)).length,
    };
  }, [all]);

  const conteoSub = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of all) m[String(r.tipo_red)] = (m[String(r.tipo_red)] ?? 0) + 1;
    return m;
  }, [all]);

  const term = norm(qDebounced.trim());
  const listaFiltrada = useMemo(() => {
    return all
      .filter((r) =>
        subActiva ? r.tipo_red === subActiva.tipo : grupoDeTipo(r.tipo_red) === grupo,
      )
      .filter((r) => {
        if (!grupoCfg.tieneAmbito || search.ambito === "todos") return true;
        return search.ambito === "caqueta" ? esCaqueta(r) : !esCaqueta(r);
      })
      .filter((r) => {
        const act = esActivo(r);
        if (search.estado === "activos") return act;
        if (search.estado === "inactivos") return !act;
        return true;
      })
      .filter((r) => (term ? textoBusqueda(r).includes(term) : true));
  }, [all, grupo, grupoCfg, subActiva, search.ambito, search.estado, term]);

  // Paginación local
  const pageSize = Math.max(5, search.size);
  const totalPages = Math.max(1, Math.ceil(listaFiltrada.length / pageSize));
  const page = Math.min(Math.max(1, search.page), totalPages);
  const lista = listaFiltrada.slice((page - 1) * pageSize, page * pageSize);

  // Handlers de tarjetas superiores
  const goToGrupo = (g: RedGrupo, estado: "todos" | "activos" | "inactivos" = "todos") => {
    const cfg = getGrupo(g);
    setSearch({
      grupo: g,
      sub: cfg.subsecciones?.[0]?.key ?? "",
      ambito: "todos",
      estado,
      page: 1,
    });
  };

  const especialidadesOpts = useMemo(
    () =>
      Array.from(
        new Set(all.map((r) => (r.servicio_especialidad || "").trim()).filter(Boolean)),
      ).sort(),
    [all],
  );
  const ipsOpts = useMemo(
    () =>
      Array.from(
        new Set(
          all
            .filter((r) => grupoDeTipo(r.tipo_red) === "ips")
            .map((r) => (r.entidad || "").trim())
            .filter(Boolean),
        ),
      ).sort(),
    [all],
  );

  const abrirNuevo = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const abrirEditar = (r: RedRegistro) => {
    setEditing(r);
    setFormOpen(true);
  };

  const guardarRegistro = async (
    payload: Record<string, unknown>,
    id?: string,
  ): Promise<boolean> => {
    try {
      if (id) {
        const { error } = await supabase
          .from("red_operativa")
          .update(payload as never)
          .eq("id", id);
        if (error) throw error;
        void registrarAuditoria({
          data: {
            accion: "editar_red",
            modulo: "red-ips",
            tabla: "red_operativa",
            registroId: id,
            detalles: { tipo_red: payload.tipo_red, grupo },
          },
        }).catch(() => {});
        toast.success("Registro actualizado");
      } else {
        const { data, error } = await supabase
          .from("red_operativa")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        void registrarAuditoria({
          data: {
            accion: "crear_red",
            modulo: "red-ips",
            tabla: "red_operativa",
            registroId: (data as { id?: string } | null)?.id ?? null,
            detalles: { tipo_red: payload.tipo_red, grupo },
          },
        }).catch(() => {});
        toast.success("Registro creado");
      }
      qc.invalidateQueries({ queryKey: ["red-operativa"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar. Verifique permisos.");
      return false;
    }
  };

  const eliminarRegistro = async () => {
    if (!aEliminar) return;
    try {
      const { error } = await supabase
        .from("red_operativa")
        .update({ archivado: true } as never)
        .eq("id", aEliminar.id);
      if (error) throw error;
      void registrarAuditoria({
        data: {
          accion: "archivar_red",
          modulo: "red-ips",
          tabla: "red_operativa",
          registroId: aEliminar.id,
          detalles: { tipo_red: aEliminar.tipo_red, grupo },
        },
      }).catch(() => {});
      toast.success("Registro archivado");
      qc.invalidateQueries({ queryKey: ["red-operativa"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo archivar. Verifique permisos.");
    } finally {
      setAEliminar(null);
    }
  };

  const cards = [
    {
      key: "ips-activas",
      label: "IPS Activas",
      value: conteos.ipsActivas,
      icon: Building2,
      color: "green",
      onClick: () => goToGrupo("ips", "activos"),
      sub: "Total instituciones activas",
    },
    {
      key: "ips-inactivas",
      label: "IPS Inactivas",
      value: conteos.ipsNoDisp,
      icon: XCircle,
      color: "red",
      onClick: () => goToGrupo("ips", "inactivos"),
      sub: "Total instituciones inactivas",
    },
    {
      key: "esp",
      label: "Especialidades CEDIM Activas",
      value: conteos.especialidades,
      icon: Stethoscope,
      color: "sky",
      onClick: () => goToGrupo("especialidades_cedim", "activos"),
      sub: "Total especialidades activas",
    },
    {
      key: "amb",
      label: "Ambulancias Activas",
      value: conteos.ambulancias,
      icon: Ambulance,
      color: "violet",
      onClick: () => goToGrupo("ambulancias", "activos"),
      sub: "Total ambulancias activas",
    },
  ] as const;

  const colorMap: Record<string, string> = {
    green: "bg-status-green/10 text-status-green",
    red: "bg-status-red/10 text-status-red",
    sky: "bg-status-sky/10 text-status-sky",
    violet: "bg-vitalis-blue/10 text-vitalis-blue",
  };

  return (
    <div>
      <AppHeader
        title="RED HOSPITALARIA Y DISPONIBILIDAD"
        subtitle="Instituciones receptoras, ambulancias, jornadas y especialidades CEDIM"
      />

      {/* Tarjetas superiores permanentes */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              aria-label={`${c.label}: ${c.value}`}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorMap[c.color]}`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-extrabold leading-tight text-foreground">{c.value}</p>
                <p className="truncate text-[10px] text-muted-foreground">{c.sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex justify-center">
          <span className="rounded-full border border-border bg-secondary px-4 py-1 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
            Red de instituciones
          </span>
        </div>

        {/* Pestañas principales (grupos) */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {RED_GRUPOS.map((g) => {
            const Icon = g.icon;
            const active = g.key === grupo;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() =>
                  setSearch({
                    grupo: g.key,
                    sub: g.subsecciones?.[0]?.key ?? "",
                    ambito: "todos",
                    page: 1,
                  })
                }
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-vitalis-blue bg-vitalis-blue text-white shadow-sm"
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" /> {g.label}
              </button>
            );
          })}
        </div>

        {/* Subpestañas */}
        {grupoCfg.subsecciones && (
          <div className="mb-4 flex flex-wrap gap-2">
            {grupoCfg.subsecciones.map((s) => {
              const active = (subActiva?.key ?? "") === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSearch({ sub: s.key, page: 1 })}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-vitalis-blue bg-vitalis-blue/10 text-vitalis-blue"
                      : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s.label}
                  <span className="ml-1 opacity-70">({conteoSub[s.tipo] ?? 0})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Ámbito (IPS / Ambulancias) */}
        {grupoCfg.tieneAmbito && (
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { k: "todos", l: "Todas" },
              { k: "caqueta", l: "Departamentales — Caquetá" },
              { k: "nacional", l: "Nacionales — Fuera del Caquetá" },
            ].map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setSearch({ ambito: c.k, page: 1 })}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  search.ambito === c.k
                    ? "border-vitalis-blue bg-vitalis-blue/10 text-vitalis-blue"
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
        )}

        {/* Búsqueda + filtro estado + botón nuevo */}
        <FiltersBar
          className="mb-4"
          activeCount={countActiveFilters(
            { q: qInput, estado: search.estado },
            { q: "", estado: "todos" },
          )}
          onClear={() => {
            setQInput("");
            navigate({ search: (p: RedSearch) => ({ ...p, q: "", estado: "todos", page: 1 }), replace: true });
          }}
          primary={
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="rounded-full pl-9"
                placeholder={grupoCfg.buscarPlaceholder}
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                aria-label="Buscar en la sección actual"
              />
            </div>
          }
          secondary={
            <Select value={search.estado} onValueChange={(v) => setSearch({ estado: v, page: 1 })}>
              <SelectTrigger className="w-full rounded-full sm:w-40" aria-label="Filtro de estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="activos">Activos / Disponibles</SelectItem>
                <SelectItem value="inactivos">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          }
          extraActions={
            canEdit ? (
              <Button onClick={abrirNuevo} className="ml-auto rounded-full">
                <Plus className="mr-1.5 h-4 w-4" /> Nuevo registro ·{" "}
                {subActiva ? subActiva.label : grupoCfg.label}
              </Button>
            ) : null
          }
        />


        {/* Listado */}
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-status-red">
            NO FUE POSIBLE CARGAR LA INFORMACIÓN. INTENTA NUEVAMENTE.
          </p>
        ) : lista.length > 0 ? (
          <div className="space-y-3">
            {lista.map((r) => (
              <RedCard
                key={r.id}
                reg={r}
                grupo={grupoCfg}
                canEdit={canEdit}
                onView={setDetalle}
                onEdit={abrirEditar}
                onDelete={setAEliminar}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
            <Network className="h-10 w-10 opacity-40" />
            <p className="max-w-sm text-sm">
              NO SE ENCONTRARON REGISTROS PARA LOS FILTROS SELECCIONADOS.
              {canEdit && " Usa «Nuevo registro» para agregar el primero."}
            </p>
          </div>
        )}

        {/* Paginación */}
        {listaFiltrada.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
            <div>
              Mostrando{" "}
              <span className="font-semibold text-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, listaFiltrada.length)}
              </span>{" "}
              de{" "}
              <span className="font-semibold text-foreground">{listaFiltrada.length}</span>{" "}
              registros
            </div>
            <div className="flex items-center gap-2">
              <span>Por página</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setSearch({ size: Number(v), page: 1 })}
              >
                <SelectTrigger className="h-8 w-20 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full"
                disabled={page <= 1}
                onClick={() => setSearch({ page: page - 1 })}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full"
                disabled={page >= totalPages}
                onClick={() => setSearch({ page: page + 1 })}
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          La disponibilidad se actualiza según la información reportada por cada institución.
        </p>
      </div>

      {/* Detalle por bloques */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-w-2xl">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detalle.entidad || detalle.empresa_tep || "Registro"}
                  {esActivo(detalle) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-green/10 px-2 py-0.5 text-[10px] font-bold uppercase text-status-green">
                      <CheckCircle2 className="h-3 w-3" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      Inactivo
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
                <Bloque titulo="Información general">
                  <DetRow k="Tipo" v={TIPO_RED_LABEL[(detalle.tipo_red as TipoRed) || "ips_departamental"]} />
                  <DetRow k="NIT" v={detalle.nit || ""} />
                  <DetRow k="Empresa TEP" v={detalle.empresa_tep || ""} />
                  <DetRow k="Tipo de ambulancia" v={detalle.tipo_ambulancia || ""} />
                  <DetRow k="Servicios / especialidad" v={serviciosList(detalle).join(", ")} />
                  <DetRow k="Médico / profesional" v={detalle.medico || ""} />
                </Bloque>

                <Bloque titulo="Ubicación">
                  <DetRow k="Sede" v={detalle.sede || ""} />
                  <DetRow k="Ubicación" v={ubicacion(detalle)} />
                  <DetRow k="Dirección" v={detalle.direccion || ""} />
                  <DetRow k="Cobertura" v={detalle.cobertura || ""} />
                  <DetRow k="Recorrido" v={detalle.recorrido || ""} />
                </Bloque>

                <Bloque titulo="Datos de contacto">
                  <DetRow k="Teléfono" v={detalle.telefono || detalle.contacto || ""} />
                  <DetRow k="Teléfonos alternos" v={detalle.telefonos_alternos || ""} />
                  <DetRow k="Indicativo" v={detalle.indicativo || ""} />
                  <DetRow k="Extensión / código" v={detalle.codigo_principal || ""} />
                  <DetRow k="Correo" v={detalle.correo || ""} />
                  <DetRow k="Correos alternos" v={detalle.correos_alternos || ""} />
                  <DetRow k="Contacto responsable" v={detalle.contacto_principal || ""} />
                  <DetRow k="Cargo" v={detalle.cargo_contacto || ""} />
                </Bloque>

                <Bloque titulo="Disponibilidad">
                  <DetRow
                    k="Jornada / horario"
                    v={[detalle.jornada, detalle.horario].filter(Boolean).join(" · ")}
                  />
                  <DetRow
                    k="Fechas"
                    v={[detalle.fecha_inicio, detalle.fecha_final].filter(Boolean).join(" → ")}
                  />
                  <DetRow
                    k="Vigencia"
                    v={[detalle.vigencia_desde, detalle.vigencia_hasta].filter(Boolean).join(" → ")}
                  />
                </Bloque>

                <Bloque titulo="Contratos y relaciones">
                  <DetRow k="EAPB / aseguradoras" v={detalle.eapb_aseguradoras || ""} />
                  <DetRow k="CUPS" v={detalle.cups || ""} />
                  <DetRow k="Descripción CUPS" v={detalle.cups_descripcion || ""} />
                  <DetRow k="Categoría" v={detalle.categoria || ""} />
                  <DetRow k="Recurso" v={detalle.subcategoria || ""} />
                  <DetRow k="Tipo de recurso" v={detalle.tipo_recurso || ""} />
                  <DetRow k="Opción de menú" v={detalle.opcion_menu || ""} />
                  <DetRow k="Enlace / URL" v={detalle.link || ""} />
                </Bloque>

                {detalle.observaciones && (
                  <Bloque titulo="Observaciones">
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {detalle.observaciones}
                    </p>
                  </Bloque>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Formulario contextual */}
      {canEdit && (
        <RedFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          grupo={grupo}
          editing={editing}
          presetTipo={subActiva?.tipo}
          especialidades={especialidadesOpts}
          ipsOptions={ipsOpts}
          onSubmit={guardarRegistro}
        />
      )}

      {/* Confirmación de archivado (borrado lógico) */}
      <AlertDialog open={!!aEliminar} onOpenChange={(v) => !v && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              «{aEliminar?.entidad || aEliminar?.empresa_tep || "registro"}» se archivará
              (borrado lógico) y dejará de aparecer en RED/DISPONIBILIDAD. Los datos se
              conservan y podrán restaurarse por administración.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarRegistro}>Archivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-secondary/30 p-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function DetRow({ k, v }: { k: string; v: string }) {
  if (!v || !v.trim()) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 pb-1 last:border-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v}</span>
    </div>
  );
}
