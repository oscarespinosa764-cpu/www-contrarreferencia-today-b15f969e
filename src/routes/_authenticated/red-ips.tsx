import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  UserRound,
  Ambulance,
  ChevronRight,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { RedCard } from "@/components/red/red-card";
import {
  RED_TABS,
  TIPO_RED_LABEL,
  getTab,
  norm,
  textoBusqueda,
  esActivo,
  ubicacion,
  serviciosList,
  fmtFechaHora,
  type RedRegistro,
  type TipoRed,
} from "@/lib/red-ips-utils";

export const Route = createFileRoute("/_authenticated/red-ips")({
  component: RedIpsPage,
});

const IPS_TIPOS: TipoRed[] = ["ips_nacional", "ips_departamental", "ips_aliada"];

function RedIpsPage() {
  const { canEdit, user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TipoRed>("ips_nacional");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const [detalle, setDetalle] = useState<RedRegistro | null>(null);
  const [verNovedades, setVerNovedades] = useState(false);

  // Confirmación de cambio de disponibilidad + novedad opcional.
  const [dispTarget, setDispTarget] = useState<{ reg: RedRegistro; value: boolean } | null>(null);
  const [novedadInput, setNovedadInput] = useState("");

  const { data: perfiles } = useQuery({
    queryKey: ["perfiles-nombres"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nombre");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.user_id] = p.nombre));
      return map;
    },
    staleTime: 300_000,
  });

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

  // --- Conteos del panel lateral ---
  const conteos = useMemo(() => {
    const ips = all.filter((r) => IPS_TIPOS.includes(r.tipo_red as TipoRed) && esActivo(r));
    return {
      disponibles: ips.filter((r) => r.disponible_para_remisiones).length,
      noDisponibles: ips.filter((r) => !r.disponible_para_remisiones).length,
      especialistas: all.filter((r) => r.tipo_red === "especialista_interno" && esActivo(r)).length,
      ambulancias: all.filter(
        (r) => r.tipo_red === "ambulancia_autorizacion" && esActivo(r),
      ).length,
    };
  }, [all]);

  // --- Novedades del turno ---
  const novedades = useMemo(() => {
    return all
      .filter((r) => (r.novedad_disponibilidad || "").trim())
      .map((r) => ({
        id: r.id,
        texto: r.novedad_disponibilidad!.trim(),
        entidad: r.entidad || "",
        fecha: r.fecha_actualizacion_disponibilidad || r.updated_at || r.created_at,
      }))
      .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
  }, [all]);

  // --- Lista filtrada por pestaña + búsqueda + filtro ---
  const term = norm(q.trim());
  const lista = useMemo(() => {
    return all
      .filter((r) => (r.tipo_red || "ips_departamental") === tab)
      .filter((r) => {
        const disp = !!r.disponible_para_remisiones;
        const act = esActivo(r);
        if (filtro === "disponibles") return disp;
        if (filtro === "no-disponibles") return !disp;
        if (filtro === "activos") return act;
        if (filtro === "inactivos") return !act;
        if (filtro.startsWith("jornada-")) {
          const j = filtro.replace("jornada-", "");
          return norm(r.jornada || "").includes(j);
        }
        return true;
      })
      .filter((r) => (term ? textoBusqueda(r).includes(term) : true));
  }, [all, tab, filtro, term]);

  const tabCfg = getTab(tab);

  const auditar = (accion: string, registroId: string, detalles: Record<string, unknown>) => {
    registrarAuditoria({
      data: { accion, modulo: "red-ips", tabla: "red_operativa", registroId, detalles },
    }).catch(() => {});
  };

  // El operativo puede actualizar disponibilidad durante el turno.
  // Abre la confirmación; el cambio real se aplica en aplicarDisponibilidad().
  const pedirCambio = (r: RedRegistro, value: boolean) => {
    if (!canEdit) {
      toast.error("No tienes permisos para modificar disponibilidad.");
      return;
    }
    setNovedadInput("");
    setDispTarget({ reg: r, value });
  };

  const aplicarDisponibilidad = async () => {
    if (!dispTarget) return;
    const { reg: r, value } = dispTarget;
    const estadoAnterior = r.disponible_para_remisiones ? "disponible" : "no_disponible";
    const estadoNuevo = value ? "disponible" : "no_disponible";
    const novedad =
      novedadInput.trim() ||
      `${r.entidad || "Institución"} marcada como ${
        value ? "DISPONIBLE" : "NO DISPONIBLE"
      } para remisiones.`;
    const { error } = await supabase
      .from("red_operativa")
      .update({
        disponible_para_remisiones: value,
        novedad_disponibilidad: novedad,
        fecha_actualizacion_disponibilidad: new Date().toISOString(),
        usuario_actualizacion: user?.id ?? null,
      })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    auditar("cambiar_disponibilidad_red", r.id, {
      recurso: r.entidad || "",
      tipo_red: r.tipo_red || "",
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      novedad: novedad,
    });
    toast.success(value ? "Recurso marcado como disponible" : "Recurso marcado como no disponible");
    setDispTarget(null);
    setNovedadInput("");
    qc.invalidateQueries({ queryKey: ["red-operativa"] });
  };

  const countCards = [
    { label: "IPS disponibles", value: conteos.disponibles, icon: Building2, color: "green" },
    { label: "IPS no disponibles", value: conteos.noDisponibles, icon: XCircle, color: "red" },
    {
      label: "Especialistas activos",
      value: conteos.especialistas,
      icon: UserRound,
      color: "sky",
    },
    {
      label: "Ambulancias aliadas",
      value: conteos.ambulancias,
      icon: Ambulance,
      color: "violet",
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
        title="Red / Disponibilidad IPS"
        subtitle="Instituciones receptoras y su disponibilidad para recibir remisiones"
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        {/* Rótulo central */}
        <div className="mb-4 flex justify-center">
          <span className="rounded-full border border-border bg-secondary px-4 py-1 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
            Red de instituciones
          </span>
        </div>

        {/* Pestañas internas */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {RED_TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-vitalis-blue bg-vitalis-blue text-white shadow-sm"
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Columna principal */}
          <div className="min-w-0">
            {/* Búsqueda + filtro + agregar */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="rounded-full pl-9"
                  placeholder="Buscar IPS, servicio, contacto…"
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
                  <SelectItem value="disponibles">Disponibles</SelectItem>
                  <SelectItem value="no-disponibles">No disponibles</SelectItem>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                  <SelectItem value="jornada-mañana">Jornada mañana</SelectItem>
                  <SelectItem value="jornada-tarde">Jornada tarde</SelectItem>
                  <SelectItem value="jornada-noche">Jornada noche</SelectItem>
                  <SelectItem value="jornada-completa">Jornada completa</SelectItem>
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
                    tab={tabCfg}
                    canEdit={canEdit}
                    onView={setDetalle}
                    onToggle={pedirCambio}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
                <Network className="h-10 w-10 opacity-40" />
                <p className="max-w-sm text-sm">
                  No hay registros en esta categoría. La gestión administrativa de la red se
                  realiza desde Control de Mando → Históricos → Red y disponibilidad.
                </p>
              </div>
            )}

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              La disponibilidad se actualiza según la información reportada por cada institución.
            </p>
          </div>

          {/* Panel lateral derecho */}
          <aside className="space-y-4">
            <div className="space-y-3">
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
            </div>

            {/* Novedades del turno */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <Bell className="h-4 w-4 text-vitalis-blue" /> Novedades del turno
              </p>
              {novedades.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin novedades registradas en el turno.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {novedades.slice(0, 4).map((n) => (
                    <li key={n.id} className="flex gap-2 text-xs">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vitalis-blue" />
                      <span className="text-muted-foreground">
                        {n.texto}
                        {n.fecha && (
                          <span className="ml-1 text-[10px] opacity-70">
                            · {fmtFechaHora(n.fecha)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {novedades.length > 0 && (
                <button
                  type="button"
                  onClick={() => setVerNovedades(true)}
                  className="mt-3 text-xs font-semibold text-vitalis-blue hover:underline"
                >
                  Ver todas las novedades →
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>



      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>{detalle.entidad || "Registro"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <DetRow k="Tipo" v={TIPO_RED_LABEL[(detalle.tipo_red as TipoRed) || "ips_departamental"]} />
                <DetRow k="Estado" v={esActivo(detalle) ? "Activo" : "Inactivo"} />
                <DetRow
                  k="Disponibilidad"
                  v={detalle.disponible_para_remisiones ? "Disponible" : "No disponible"}
                />
                <DetRow k="Servicios / especialidad" v={serviciosList(detalle).join(", ")} />
                <DetRow k="Ubicación" v={ubicacion(detalle)} />
                <DetRow k="Teléfono" v={detalle.telefono || detalle.contacto || ""} />
                <DetRow k="Correo" v={detalle.correo || ""} />
                <DetRow k="Contacto principal" v={detalle.contacto_principal || ""} />
                <DetRow k="Dirección" v={detalle.direccion || ""} />
                <DetRow k="Sede" v={detalle.sede || ""} />
                <DetRow
                  k="Jornada / horario"
                  v={[detalle.jornada, detalle.horario].filter(Boolean).join(" · ")}
                />
                <DetRow k="Tipo de apoyo" v={detalle.tipo_apoyo || ""} />
                <DetRow k="Observaciones" v={detalle.observaciones || ""} />
                <DetRow k="Novedad" v={detalle.novedad_disponibilidad || ""} />
                <DetRow
                  k="Última actualización"
                  v={
                    detalle.fecha_actualizacion_disponibilidad
                      ? fmtFechaHora(detalle.fecha_actualizacion_disponibilidad)
                      : ""
                  }
                />
                <DetRow
                  k="Actualizado por"
                  v={
                    detalle.usuario_actualizacion && perfiles?.[detalle.usuario_actualizacion]
                      ? perfiles[detalle.usuario_actualizacion]
                      : ""
                  }
                />
                {(detalle.relaciones_red?.length ?? 0) > 0 && (
                  <div>
                    <p className="font-semibold text-foreground">Red externa / IPS aliadas</p>
                    <ul className="ml-3 list-disc text-muted-foreground">
                      {detalle.relaciones_red!.map((rel, i) => (
                        <li key={i}>
                          {[rel.nombre, rel.especialidad, rel.fechas, rel.jornada, rel.contacto]
                            .filter(Boolean)
                            .join(" · ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(detalle.codigos_apoyo?.length ?? 0) > 0 && (
                  <div>
                    <p className="font-semibold text-foreground">Ambulancias y autorizaciones</p>
                    <ul className="ml-3 list-disc text-muted-foreground">
                      {detalle.codigos_apoyo!.map((c, i) => (
                        <li key={i}>
                          {[c.entidad, c.codigo_principal, c.codigo_alterno, c.telefono]
                            .filter(Boolean)
                            .join(" · ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Todas las novedades */}
      <Dialog open={verNovedades} onOpenChange={setVerNovedades}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novedades del turno</DialogTitle>
          </DialogHeader>
          {novedades.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin novedades registradas en el turno.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
              {novedades.map((n) => (
                <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-foreground">{n.texto}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {n.entidad} {n.fecha ? `· ${fmtFechaHora(n.fecha)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar cambio de disponibilidad + novedad */}
      <AlertDialog open={!!dispTarget} onOpenChange={(v) => !v && setDispTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar cambio de disponibilidad?</AlertDialogTitle>
            <AlertDialogDescription>
              {dispTarget && (
                <>
                  «{dispTarget.reg.entidad || "Recurso"}» pasará a{" "}
                  <span
                    className={
                      dispTarget.value ? "font-bold text-status-green" : "font-bold text-status-red"
                    }
                  >
                    {dispTarget.value ? "DISPONIBLE" : "NO DISPONIBLE"}
                  </span>
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dispTarget && !dispTarget.value && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Novedad (opcional)
              </label>
              <textarea
                value={novedadInput}
                onChange={(e) => setNovedadInput(e.target.value)}
                rows={2}
                placeholder="Ej: Sin disponibilidad de UCI adultos por sobreocupación."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarDisponibilidad}>Confirmar</AlertDialogAction>
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
