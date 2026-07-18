import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { AppHeader } from "@/components/app-header";
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
  ChevronRight,
  Plus,
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

export const Route = createFileRoute("/_authenticated/red-ips")({
  component: RedIpsPage,
});

function RedIpsPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();

  const [grupo, setGrupo] = useState<RedGrupo>("jornadas_tep");
  const [subKey, setSubKey] = useState<string>(""); // subsección activa (directorios)
  const [ambito, setAmbito] = useState("todos"); // todos | caqueta | nacional
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const [detalle, setDetalle] = useState<RedRegistro | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RedRegistro | null>(null);
  const [aEliminar, setAEliminar] = useState<RedRegistro | null>(null);





  const { data: registros, isLoading } = useQuery({
    queryKey: ["red-operativa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("red_operativa")
        .select("*")
        .eq("archivado", false)
        .order("entidad");
      if (error) throw error;
      return (data ?? []) as unknown as RedRegistro[];
    },
  });

  const all = registros ?? [];
  const grupoCfg = getGrupo(grupo);

  // Subsección activa (directorios externos / interno). Vacía si el grupo no tiene.
  const subActiva =
    grupoCfg.subsecciones?.find((s) => s.key === subKey) ?? grupoCfg.subsecciones?.[0] ?? null;

  // --- Indicadores laterales ---
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

  // Conteo por subsección (para las pestañas internas).
  const conteoSub = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of all) m[String(r.tipo_red)] = (m[String(r.tipo_red)] ?? 0) + 1;
    return m;
  }, [all]);

  // --- Lista filtrada por grupo/subsección + ámbito + búsqueda + filtro ---
  const term = norm(q.trim());
  const lista = useMemo(() => {
    return all
      .filter((r) =>
        subActiva
          ? r.tipo_red === subActiva.tipo
          : grupoDeTipo(r.tipo_red) === grupo,
      )
      .filter((r) => {
        if (!grupoCfg.tieneAmbito || ambito === "todos") return true;
        return ambito === "caqueta" ? esCaqueta(r) : !esCaqueta(r);
      })
      .filter((r) => {
        const act = esActivo(r);
        if (filtro === "activos") return act;
        if (filtro === "inactivos") return !act;
        return true;
      })
      .filter((r) => (term ? textoBusqueda(r).includes(term) : true));
  }, [all, grupo, grupoCfg, subActiva, ambito, filtro, term]);


  // Opciones de autocompletado para el formulario contextual.
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

  // --- Creación / edición contextual (solo administrador; RLS lo refuerza) ---
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
      const { error } = await supabase.from("red_operativa").delete().eq("id", aEliminar.id);
      if (error) throw error;
      void registrarAuditoria({
        data: {
          accion: "eliminar_red",
          modulo: "red-ips",
          tabla: "red_operativa",
          registroId: aEliminar.id,
          detalles: { tipo_red: aEliminar.tipo_red, grupo },
        },
      }).catch(() => {});
      toast.success("Registro eliminado");
      qc.invalidateQueries({ queryKey: ["red-operativa"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar. Verifique permisos.");
    } finally {
      setAEliminar(null);
    }
  };


  const countCards = [
    { label: "IPS Activas", value: conteos.ipsActivas, icon: Building2, color: "green" },
    { label: "IPS Inactivas", value: conteos.ipsNoDisp, icon: XCircle, color: "red" },
    {
      label: "Especialidades CEDIM Activas",
      value: conteos.especialidades,
      icon: Stethoscope,
      color: "sky",
    },
    { label: "Ambulancias Activas", value: conteos.ambulancias, icon: Ambulance, color: "violet" },
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
        title="RED HOSPITALARIA & DISPONIBILIDAD"
        subtitle="IPS, Ambulancias, Jornadas de Salud y Especialidades"
      />

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
                onClick={() => {
                  setGrupo(g.key);
                  setAmbito("todos");
                  setSubKey(g.subsecciones?.[0]?.key ?? "");
                }}
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

        {/* Pestañas internas (subsecciones) para directorios */}
        {grupoCfg.subsecciones && (
          <div className="mb-4 flex flex-wrap gap-2">
            {grupoCfg.subsecciones.map((s) => {
              const active = (subActiva?.key ?? "") === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSubKey(s.key)}
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

        {/* Acción de creación contextual (solo administrador) */}
        {canEdit && (
          <div className="mb-4 flex justify-end">
            <Button onClick={abrirNuevo} className="rounded-full">
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo registro ·{" "}
              {subActiva ? subActiva.label : grupoCfg.label}
            </Button>
          </div>
        )}


        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {/* Segmentación interna por ámbito (IPS / Ambulancias) */}
            {grupoCfg.tieneAmbito && (
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { k: "todos", l: "Todas" },
                  { k: "caqueta", l: "Departamentales — Caquetá" },
                  { k: "nacional", l: "Nacionales — fuera del Caquetá" },
                ].map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    onClick={() => setAmbito(c.k)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                      ambito === c.k
                        ? "border-vitalis-blue bg-vitalis-blue/10 text-vitalis-blue"
                        : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {c.l}
                  </button>
                ))}
              </div>
            )}

            {/* Búsqueda + filtro */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="rounded-full pl-9"
                  placeholder={grupoCfg.buscarPlaceholder}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={filtro} onValueChange={setFiltro}>
                <SelectTrigger className="w-40 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Listado */}
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
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
                  No hay registros en esta categoría.
                  {canEdit
                    ? " Usa «Nuevo registro» para agregar el primero."
                    : " Solo los administradores pueden crear registros."}
                </p>
              </div>
            )}

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              La disponibilidad se actualiza según la información reportada por cada institución.
            </p>
          </div>

          {/* Panel lateral derecho — solo indicadores */}
          <aside className="space-y-3">
            {countCards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${colorMap[c.color]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-2xl font-extrabold leading-tight text-foreground">
                      {c.value}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </aside>
        </div>
      </div>

      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>{detalle.entidad || detalle.empresa_tep || "Registro"}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto text-sm">
                <DetRow k="Tipo" v={TIPO_RED_LABEL[(detalle.tipo_red as TipoRed) || "ips_departamental"]} />
                <DetRow k="Estado" v={esActivo(detalle) ? "Activo" : "Inactivo"} />
                <DetRow k="NIT" v={detalle.nit || ""} />
                <DetRow k="Empresa TEP" v={detalle.empresa_tep || ""} />
                <DetRow k="Tipo de ambulancia" v={detalle.tipo_ambulancia || ""} />
                <DetRow k="Servicios / especialidad" v={serviciosList(detalle).join(", ")} />
                <DetRow k="Recorrido / cobertura" v={detalle.recorrido || ""} />
                <DetRow k="CUPS" v={detalle.cups || ""} />
                <DetRow k="Descripción CUPS" v={detalle.cups_descripcion || ""} />
                <DetRow k="EAPB / aseguradoras" v={detalle.eapb_aseguradoras || ""} />
                <DetRow k="Ubicación" v={ubicacion(detalle)} />
                <DetRow k="Teléfono" v={detalle.telefono || detalle.contacto || ""} />
                <DetRow k="Extensión" v={detalle.codigo_principal || ""} />
                <DetRow k="Correo" v={detalle.correo || ""} />
                <DetRow k="Contacto responsable" v={detalle.contacto_principal || ""} />
                <DetRow k="Cargo del contacto" v={detalle.cargo_contacto || ""} />
                <DetRow k="Dirección" v={detalle.direccion || ""} />
                <DetRow k="Sede" v={detalle.sede || ""} />
                <DetRow k="Médico / profesional" v={detalle.medico || ""} />
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
                <DetRow k="Indicativo" v={detalle.indicativo || ""} />
                <DetRow k="Teléfonos alternos" v={detalle.telefonos_alternos || ""} />
                <DetRow k="Correos alternos" v={detalle.correos_alternos || ""} />
                <DetRow k="Cobertura" v={detalle.cobertura || ""} />
                <DetRow k="Opción de menú" v={detalle.opcion_menu || ""} />
                <DetRow k="Categoría" v={detalle.categoria || ""} />
                <DetRow k="Recurso" v={detalle.subcategoria || ""} />
                <DetRow k="Tipo de recurso" v={detalle.tipo_recurso || ""} />
                <DetRow k="Descripción" v={detalle.descripcion || ""} />
                <DetRow k="Enlace / URL" v={detalle.link || ""} />
                <DetRow k="Observaciones" v={detalle.observaciones || ""} />

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Formulario contextual de creación / edición (solo administrador) */}
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

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!aEliminar} onOpenChange={(v) => !v && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{aEliminar?.entidad || aEliminar?.empresa_tep || "registro"}» de
              RED/DISPONIBILIDAD. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarRegistro}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function DetRow({ k, v }: { k: string; v: string }) {
  if (!v || !v.trim()) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 pb-1">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v}</span>
    </div>
  );
}
