// Subventana ALERTAS DE COORDINACIÓN (solo visualización + gestión, sin configuradores).
// Fase 1: lista las alertas de coordinación persistidas hoy en `avisos`
// (identificadas por el código [ALT-...] en el mensaje) con filtros de estado,
// prioridad, módulo y búsqueda. El ciclo de vida completo (revisión, cierre,
// hallazgo, trazabilidad) y el motor backend con tabla propia se conectan en la
// fase 2 (migración aparte). No mostrar reglas ni credenciales aquí.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldAlert } from "lucide-react";
import { NIVEL_BADGE, type Aviso } from "@/lib/avisos-reglas";
import {
  extraerCodigoAlerta,
  reglaPorCodigo,
  ESTADO_BADGE,
} from "@/lib/alertas-coordinacion";

/** Mapea el estado crudo del aviso al vocabulario del ciclo de vida de coordinación. */
function estadoAlerta(a: Aviso): string {
  const e = (a.estado ?? "").toUpperCase();
  if (e === "ACTIVO" || e === "" ) return "ABIERTA";
  if (e === "EN REVISION" || e === "REVISION") return "EN REVISIÓN";
  if (e === "GESTIONADO" || e === "GESTIONADA") return "GESTIONADA";
  if (e === "CERRADO" || e === "CERRADA") return "CERRADA SIN IRREGULARIDAD";
  return e;
}

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

export function AlertasCoordinacionPanel() {
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("todas");
  const [fPrioridad, setFPrioridad] = useState("todas");
  const [fModulo, setFModulo] = useState("todos");

  const { data: avisos, isLoading } = useQuery({
    queryKey: ["avisos-operativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
  });

  // Solo las alertas de coordinación (mensaje con código [ALT-...]).
  const alertas = useMemo(
    () => (avisos ?? []).filter((a) => extraerCodigoAlerta(a.mensaje)),
    [avisos],
  );

  const term = q.trim().toLowerCase();
  const lista = useMemo(
    () =>
      alertas.filter((a) => {
        const estado = estadoAlerta(a);
        if (fEstado !== "todas" && estado !== fEstado) return false;
        if (fPrioridad !== "todas" && (a.prioridad ?? "").toUpperCase() !== fPrioridad) return false;
        if (fModulo !== "todos" && (a.modulo ?? "") !== fModulo) return false;
        if (term && !(a.mensaje ?? "").toLowerCase().includes(term)) return false;
        return true;
      }),
    [alertas, fEstado, fPrioridad, fModulo, term],
  );

  const modulos = useMemo(
    () => Array.from(new Set(alertas.map((a) => a.modulo).filter(Boolean))) as string[],
    [alertas],
  );

  return (
    <Panel title={`Alertas de coordinación · ${lista.length}`} bodyMaxHeight={null}>
      <p className="mb-3 text-center text-[11px] text-muted-foreground">
        Registros persistentes que requieren revisión de coordinación. Las reglas que las generan se
        administran en Control de Mando → Alertas y avisos → Reglas de coordinación.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar alerta…"
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
            <SelectItem value="CERRADA SIN IRREGULARIDAD">Cerradas</SelectItem>
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

      <div
        className="scrollbar-invisible overflow-y-auto overflow-x-hidden pr-0.5"
        style={{ maxHeight: "calc(100dvh - 24rem)" }}
      >
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : lista.length > 0 ? (
          <div className="grid gap-3">
            {lista.map((a) => {
              const codigo = extraerCodigoAlerta(a.mensaje);
              const regla = reglaPorCodigo(codigo);
              const estado = estadoAlerta(a);
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
                        {regla?.nombre ?? "Alerta de coordinación"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {codigo && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono font-semibold text-secondary-foreground">
                            {codigo}
                          </span>
                        )}
                        {a.modulo && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{a.modulo}</span>
                        )}
                        {regla && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                            {regla.subventana === "ENTRANTES" ? "Entrantes" : "Salientes"}
                          </span>
                        )}
                      </p>
                      {a.mensaje && <p className="mt-1.5 text-xs text-muted-foreground">{a.mensaje}</p>}
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Generada: {fmtFecha(a.fecha_inicio ?? a.created_at)} · Tiempo abierta:{" "}
                        {tiempoAbierto(a.fecha_inicio ?? a.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${NIVEL_BADGE[a.prioridad ?? "MEDIO"] ?? "bg-muted"}`}>
                        {a.prioridad ?? "MEDIO"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_BADGE[estado] ?? "bg-muted"}`}>
                        {estado}
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
