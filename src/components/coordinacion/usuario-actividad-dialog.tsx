import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Activity, Loader2, CalendarRange, X } from "lucide-react";

type AuditRow = {
  id: string;
  accion: string;
  modulo: string | null;
  tabla: string | null;
  resultado: string;
  created_at: string;
};

// Gestiones registradas con una etiqueta legible. Si no está en el mapa, se
// transforma el código (crear_caso_saliente → "Crear caso saliente").
const accionLabels: Record<string, string> = {
  crear_caso_entrante: "Crear caso entrante",
  crear_caso_saliente: "Crear caso saliente",
  crear_caso_domiciliario: "Crear PHD / PAD / O2 / especial",
  crear_caso_interna: "Crear referencia interna",
  crear_pendiente: "Crear pendiente",
  crear_seguimiento: "Registrar seguimiento",
  radicacion_en_plataforma: "Radicación en plataforma",
  generar_plantilla_indigo_inicial: "Generar plantilla Índigo",
  copiar_plantilla_indigo: "Copiar plantilla Índigo",
  confirmar_ingreso: "Confirmar ingreso",
  ampliar_cupo: "Ampliar cupo",
  cancelar_cupo: "Cancelar cupo",
  archivar_vencimiento: "Archivar por vencimiento",
  crear_reglas_base: "Crear reglas base",
  exportar_pdf_bitacora: "Exportar PDF bitácora",
  exportar_pdf_bitacora_consolidada: "Exportar PDF bitácora consolidada",
  exportar_excel_seccion: "Exportar Excel sección",
  exportar_excel_unificado: "Exportar Excel unificado",
};

const moduloLabels: Record<string, string> = {
  remisiones: "Remisiones",
  entrantes: "Entrantes",
  domiciliarios: "PHD/PAD/O2/Esp.",
  referencia_interna: "Ref. interna",
  pendientes: "Pendientes",
  historial: "Historial",
  reglas: "Reglas",
  alertas: "Alertas",
  red: "Red IPS",
};

const resultadoColor: Record<string, string> = {
  exito: "text-status-green",
  fallido: "text-status-red",
  rechazado: "text-status-amber",
};

const etiquetaAccion = (a: string) =>
  accionLabels[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const etiquetaModulo = (m: string | null) => (m ? moduloLabels[m] ?? m : "—");

// Separación máxima (minutos) entre dos eventos para considerarlos parte de la
// misma sesión de trabajo. Si pasa más tiempo, se abre una nueva sesión.
const GAP_SESION_MIN = 30;

type Sesion = {
  inicio: string;
  fin: string;
  eventos: AuditRow[];
};

function agruparSesiones(rows: AuditRow[]): Sesion[] {
  // rows llegan en orden descendente. Ordenamos ascendente para agrupar.
  const asc = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const sesiones: Sesion[] = [];
  let actual: AuditRow[] = [];
  for (const ev of asc) {
    if (actual.length === 0) {
      actual.push(ev);
      continue;
    }
    const prev = actual[actual.length - 1];
    const gap =
      (new Date(ev.created_at).getTime() - new Date(prev.created_at).getTime()) / 60000;
    if (gap > GAP_SESION_MIN) {
      sesiones.push({
        inicio: actual[0].created_at,
        fin: actual[actual.length - 1].created_at,
        eventos: [...actual].reverse(),
      });
      actual = [ev];
    } else {
      actual.push(ev);
    }
  }
  if (actual.length > 0) {
    sesiones.push({
      inicio: actual[0].created_at,
      fin: actual[actual.length - 1].created_at,
      eventos: [...actual].reverse(),
    });
  }
  // Más reciente primero.
  return sesiones.reverse();
}

const fmtFechaHora = (s: string) => new Date(s).toLocaleString("es-CO");
const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const fmtHora = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  nombre: string;
  email: string | null;
};

export function UsuarioActividadDialog({ open, onOpenChange, userId, nombre, email }: Props) {
  // Filtro por rango de fecha/hora (A → B). Vacío = últimas 2 sesiones.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const conFiltro = Boolean(desde || hasta);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["audit-usuario", userId, desde, hasta],
    enabled: open && Boolean(userId),
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("id, accion, modulo, tabla, resultado, created_at")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (desde) query = query.gte("created_at", new Date(desde).toISOString());
      if (hasta) query = query.lte("created_at", new Date(hasta).toISOString());
      const { data } = await query;
      return (data ?? []) as AuditRow[];
    },
  });

  const sesiones = useMemo(() => agruparSesiones(rows ?? []), [rows]);
  // Sin filtro mostramos solo las últimas 2 sesiones; con filtro, todas.
  const sesionesVisibles = conFiltro ? sesiones : sesiones.slice(0, 2);

  const limpiarFiltro = () => {
    setDesde("");
    setHasta("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-status-blue" />
            Actividad de {nombre}
          </DialogTitle>
          <DialogDescription>
            {email || "Usuario interno"} ·{" "}
            {conFiltro
              ? "Eventos del rango seleccionado"
              : "Últimas 2 sesiones de trabajo registradas"}
          </DialogDescription>
        </DialogHeader>

        {/* Filtro por rango de fecha/hora */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Filtrar por fecha y hora
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Desde</Label>
              <Input
                type="datetime-local"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-9 w-[200px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Hasta</Label>
              <Input
                type="datetime-local"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-9 w-[200px]"
              />
            </div>
            {conFiltro && (
              <Button variant="ghost" size="sm" className="h-9 rounded-full" onClick={limpiarFiltro}>
                <X className="mr-1 h-4 w-4" /> Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Resultado */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando actividad…
          </div>
        ) : sesionesVisibles.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {conFiltro
              ? "Sin gestiones registradas en el rango seleccionado."
              : "Este usuario aún no tiene gestiones registradas."}
          </p>
        ) : (
          <div className="space-y-4">
            {sesionesVisibles.map((s, i) => (
              <div key={s.inicio + i} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm font-semibold text-foreground">
                    {conFiltro ? `Sesión ${sesionesVisibles.length - i}` : i === 0 ? "Última sesión" : "Sesión anterior"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)} ·{" "}
                    {s.eventos.length} {s.eventos.length === 1 ? "gestión" : "gestiones"}
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {s.eventos.map((ev) => (
                    <li key={ev.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {etiquetaAccion(ev.accion)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {etiquetaModulo(ev.modulo)} · {fmtFechaHora(ev.created_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold ${resultadoColor[ev.resultado] ?? "text-muted-foreground"}`}
                      >
                        {ev.resultado}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
