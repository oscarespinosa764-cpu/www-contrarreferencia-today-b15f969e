// Subventana ALERTAS DE COORDINACIÓN (visualización + gestión de ciclo de vida).
// Etapa 2: lee de la tabla persistente `alertas_coordinacion` (motor server-side
// e idempotente). El admin/coordinación gestiona el ciclo de vida (revisión,
// gestión, cierre con/sin hallazgo, descarte con justificación) vía server fn.
// No muestra reglas ni credenciales: las reglas se administran en su subventana.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldAlert, SlidersHorizontal, X, Zap, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { NIVEL_BADGE } from "@/lib/avisos-reglas";
import {
  reglaPorCodigo,
  ESTADO_BADGE,
  type EstadoAlerta,
} from "@/lib/alertas-coordinacion";
import { gestionarAlertaCoordinacion } from "@/lib/alertas-coordinacion.functions";
import type { Tables } from "@/integrations/supabase/types";

type Alerta = Tables<"alertas_coordinacion">;

function fmtFecha(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function tiempoAbierto(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "menos de 1 h";
  if (h < 24) return `${h} h`;
  const dias = Math.floor(h / 24);
  return `${dias} día${dias > 1 ? "s" : ""} ${h % 24} h`;
}

// Una alerta es "automática" cuando la generó el cron de evaluación por umbral.
function esAutomatica(a: Alerta): boolean {
  const d = a.detalles as { origen?: string } | null;
  return d?.origen === "cron";
}

// Próximas transiciones disponibles según el estado actual.
function transicionesDe(estado: string): { estado: EstadoAlerta; label: string }[] {
  switch (estado) {
    case "ABIERTA":
      return [{ estado: "EN REVISIÓN", label: "Tomar en revisión" }];
    case "EN REVISIÓN":
      return [
        { estado: "GESTIONADA", label: "Marcar gestionada" },
        { estado: "CERRADA SIN IRREGULARIDAD", label: "Cerrar sin irregularidad" },
        { estado: "CERRADA CON HALLAZGO", label: "Cerrar con hallazgo" },
        { estado: "DESCARTADA CON JUSTIFICACIÓN", label: "Descartar" },
      ];
    case "GESTIONADA":
      return [
        { estado: "CERRADA SIN IRREGULARIDAD", label: "Cerrar sin irregularidad" },
        { estado: "CERRADA CON HALLAZGO", label: "Cerrar con hallazgo" },
      ];
    default:
      return [];
  }
}

export function AlertasCoordinacionPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("todas");
  const [fPrioridad, setFPrioridad] = useState("todas");
  const [fModulo, setFModulo] = useState("todos");
  const [filtrosOpen, setFiltrosOpen] = useState(false);

  const { data: alertas, isLoading } = useQuery({
    queryKey: ["alertas-coordinacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas_coordinacion")
        .select("*")
        .order("evento_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Alerta[];
    },
  });

  const gestionar = useMutation({
    mutationFn: async (vars: { id: string; estado: EstadoAlerta; nota?: string }) => {
      await gestionarAlertaCoordinacion({
        data: {
          id: vars.id,
          estado: vars.estado,
          hallazgo: vars.estado === "CERRADA CON HALLAZGO" ? vars.nota : undefined,
          justificacion:
            vars.estado === "DESCARTADA CON JUSTIFICACIÓN" ? vars.nota : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Alerta actualizada");
      qc.invalidateQueries({ queryKey: ["alertas-coordinacion"] });
    },
    onError: () => toast.error("No se pudo actualizar la alerta"),
  });

  const term = q.trim().toLowerCase();
  const lista = useMemo(
    () =>
      (alertas ?? []).filter((a) => {
        if (fEstado !== "todas" && a.estado !== fEstado) return false;
        if (fPrioridad !== "todas" && (a.prioridad ?? "").toUpperCase() !== fPrioridad) return false;
        if (fModulo !== "todos" && (a.modulo ?? "") !== fModulo) return false;
        if (term && !(a.mensaje ?? "").toLowerCase().includes(term) && !(a.caso_codigo ?? "").toLowerCase().includes(term))
          return false;
        return true;
      }),
    [alertas, fEstado, fPrioridad, fModulo, term],
  );

  const modulos = useMemo(
    () => Array.from(new Set((alertas ?? []).map((a) => a.modulo).filter(Boolean))) as string[],
    [alertas],
  );

  // Resumen de estados (sección 11): abiertas, en revisión, gestionadas.
  const resumen = useMemo(() => {
    const t = alertas ?? [];
    return {
      abiertas: t.filter((a) => a.estado === "ABIERTA").length,
      revision: t.filter((a) => a.estado === "EN REVISIÓN").length,
      gestionadas: t.filter((a) => a.estado === "GESTIONADA").length,
    };
  }, [alertas]);

  const filtrosActivos =
    q.trim() !== "" || fEstado !== "todas" || fPrioridad !== "todas" || fModulo !== "todos";

  const manejar = (a: Alerta, estado: EstadoAlerta) => {
    let nota: string | undefined;
    if (estado === "CERRADA CON HALLAZGO") {
      nota = window.prompt("Describa el hallazgo:") ?? undefined;
      if (!nota) return;
    } else if (estado === "DESCARTADA CON JUSTIFICACIÓN") {
      nota = window.prompt("Justifique el descarte:") ?? undefined;
      if (!nota) return;
    }
    gestionar.mutate({ id: a.id, estado, nota });
  };

  return (
    <Panel title={`Alertas de coordinación · ${lista.length}`} bodyMaxHeight={null}>
      <p className="mb-3 text-center text-[11px] text-muted-foreground">
        Registros persistentes que requieren revisión de coordinación. Las reglas que las generan se
        administran en Control de Mando → Alertas y avisos → Reglas de coordinación.
      </p>

      {/* Resumen de estados + botón compacto de filtros (no ocupan espacio permanente) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-status-red/15 px-2.5 py-0.5 text-status-red">
            {resumen.abiertas} abiertas
          </span>
          <span className="rounded-full bg-status-amber/15 px-2.5 py-0.5 text-status-amber">
            {resumen.revision} en revisión
          </span>
          <span className="rounded-full bg-status-sky/15 px-2.5 py-0.5 text-status-sky">
            {resumen.gestionadas} gestionadas
          </span>
        </div>
        <Button
          type="button"
          variant={filtrosActivos ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => setFiltrosOpen((o) => !o)}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          Filtrar{filtrosActivos ? " ·" : ""}
        </Button>
      </div>

      {filtrosOpen && (
        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Filtros</span>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQ("");
                setFEstado("todas");
                setFPrioridad("todas");
                setFModulo("todos");
              }}
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="rounded-full pl-9"
                placeholder="Buscar alerta o cupo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={fEstado} onValueChange={setFEstado}>
              <SelectTrigger className="rounded-full"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="ABIERTA">Abiertas</SelectItem>
                <SelectItem value="EN REVISIÓN">En revisión</SelectItem>
                <SelectItem value="GESTIONADA">Gestionadas</SelectItem>
                <SelectItem value="CERRADA SIN IRREGULARIDAD">Cerradas sin irregularidad</SelectItem>
                <SelectItem value="CERRADA CON HALLAZGO">Cerradas con hallazgo</SelectItem>
                <SelectItem value="DESCARTADA CON JUSTIFICACIÓN">Descartadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fPrioridad} onValueChange={setFPrioridad}>
              <SelectTrigger className="rounded-full"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda prioridad</SelectItem>
                <SelectItem value="CRITICO">Crítica</SelectItem>
                <SelectItem value="ALTO">Alta</SelectItem>
                <SelectItem value="MEDIO">Media</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fModulo} onValueChange={setFModulo}>
              <SelectTrigger className="rounded-full"><SelectValue placeholder="Módulo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los módulos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div
        className="scrollbar-invisible overflow-y-auto overflow-x-hidden pr-0.5"
        style={{ maxHeight: "calc(100dvh - 24rem)" }}
      >
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : lista.length > 0 ? (
          <div className="grid gap-3">
            {lista.map((a) => {
              const regla = reglaPorCodigo(a.codigo);
              const transiciones = isAdmin ? transicionesDe(a.estado) : [];
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                    a.prioridad === "CRITICO"
                      ? "border-l-status-red"
                      : a.prioridad === "ALTO"
                        ? "border-l-status-amber"
                        : "border-l-status-sky"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-status-amber" />
                        {a.nombre ?? regla?.nombre ?? "Alerta de coordinación"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono font-semibold text-secondary-foreground">
                          {a.codigo}
                        </span>
                        {a.modulo && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{a.modulo}</span>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                          {a.subventana === "ENTRANTES" ? "Entrantes" : "Salientes"}
                        </span>
                        {a.caso_codigo && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">Cupo {a.caso_codigo}</span>
                        )}
                      </p>
                      {a.mensaje && <p className="mt-1.5 text-xs text-muted-foreground">{a.mensaje}</p>}
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Generada: {fmtFecha(a.evento_at)} · Tiempo abierta: {tiempoAbierto(a.evento_at)}
                      </p>
                      {a.hallazgo && (
                        <p className="mt-1 text-[11px] text-vitalis-blue">Hallazgo: {a.hallazgo}</p>
                      )}
                      {a.justificacion && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Justificación: {a.justificacion}
                        </p>
                      )}
                      {transiciones.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {transiciones.map((t) => (
                            <Button
                              key={t.estado}
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-full text-[11px]"
                              disabled={gestionar.isPending}
                              onClick={() => manejar(a, t.estado)}
                            >
                              {t.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${NIVEL_BADGE[a.prioridad] ?? "bg-muted"}`}>
                        {a.prioridad}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_BADGE[a.estado] ?? "bg-muted"}`}>
                        {a.estado}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay alertas de coordinación con los filtros seleccionados.
          </p>
        )}
      </div>
    </Panel>
  );
}
