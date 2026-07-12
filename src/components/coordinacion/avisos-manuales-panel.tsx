// Administración de AVISOS MANUALES (Control de Mando → Alertas y avisos).
// Crear / editar / archivar avisos manuales + programación de canales.
// Reutiliza AvisoFormDialog y ProgramarAlertasDialog existentes.
// No incluye las alertas de coordinación ([ALT-...]): esas se gestionan aparte.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ProgramarAlertasDialog,
  useAlertasConfig,
} from "@/components/coordinacion/programar-alertas-dialog";
import { AvisoFormDialog, type AvisoFormValues } from "@/components/coordinacion/aviso-form-dialog";
import {
  Search,
  CalendarClock,
  BellRing,
  CheckCircle2,
  Plus,
  Pencil,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { avisoVencido, NIVEL_BADGE, type Aviso } from "@/lib/avisos-reglas";
import { extraerCodigoAlerta } from "@/lib/alertas-coordinacion";

export function AvisosManualesPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Aviso | null>(null);
  const { data: cfg } = useAlertasConfig();

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

  const refrescar = () => qc.invalidateQueries({ queryKey: ["avisos-operativos"] });

  const audit = (accion: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({ data: { accion, modulo: "alertas", tabla: "avisos", detalles } }).catch(() => {});

  // Vencimiento automático de avisos manuales.
  const venceProcesado = useRef(false);
  useEffect(() => {
    if (venceProcesado.current || !avisos || avisos.length === 0) return;
    const vencidos = avisos.filter((a) => !extraerCodigoAlerta(a.mensaje) && avisoVencido(a));
    if (vencidos.length === 0) return;
    venceProcesado.current = true;
    (async () => {
      for (const a of vencidos) {
        await supabase
          .from("avisos")
          .update({ estado: "VENCIDO", archivado: true, updated_at: new Date().toISOString() })
          .eq("id", a.id);
        audit("vencer_aviso", { id: a.id });
      }
      refrescar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisos]);

  const guardar = async (values: AvisoFormValues, id?: string): Promise<boolean> => {
    if (id) {
      const { error } = await supabase.from("avisos").update({ ...values, estado: "ACTIVO" }).eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("editar_aviso", { id });
      toast.success("Aviso actualizado");
    } else {
      const { data, error } = await supabase
        .from("avisos")
        .insert({ ...values, estado: "ACTIVO", archivado: false, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("crear_aviso", { id: data?.id });
      toast.success("Aviso creado");
    }
    refrescar();
    return true;
  };

  const archivarAviso = async (id: string) => {
    const { error } = await supabase.from("avisos").update({ archivado: true, estado: "CERRADO" }).eq("id", id);
    if (error) return toast.error(error.message);
    audit("archivar_aviso", { id });
    toast.success("Aviso archivado");
    refrescar();
  };

  const term = q.trim().toLowerCase();
  const lista = useMemo(
    () =>
      (avisos ?? [])
        // Solo avisos manuales (excluir alertas de coordinación [ALT-...]).
        .filter((a) => !extraerCodigoAlerta(a.mensaje))
        .filter((a) => (verArchivados ? a.archivado : !a.archivado))
        .filter((a) => (term ? (a.mensaje ?? "").toLowerCase().includes(term) : true)),
    [avisos, verArchivados, term],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Programación de canales"
        bodyMaxHeight={null}
        action={
          <ProgramarAlertasDialog
            trigger={
              <Button size="sm" className="rounded-full">
                <CalendarClock className="mr-1.5 h-4 w-4" /> Programar
              </Button>
            }
          />
        }
      >
        <div className="flex flex-col items-center gap-1.5 text-sm">
          {cfg?.config.activo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-green/15 px-3 py-1 font-semibold text-status-green">
              <CheckCircle2 className="h-4 w-4" /> Alertas automáticas activas · cada {cfg.config.frecuencia} min
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
              <BellRing className="h-4 w-4" /> Alertas automáticas desactivadas
            </span>
          )}
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            Las credenciales de los canales (Telegram, correo, Slack, webhook) se administran en
            Control de Mando → Notificaciones externas. Aquí solo se programa su uso.
          </p>
        </div>
      </Panel>

      <Panel
        title={`Avisos manuales · ${lista.length}`}
        bodyMaxHeight={null}
        action={
          isAdmin && (
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo aviso manual
            </Button>
          )
        }
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar aviso…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            variant={verArchivados ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setVerArchivados((v) => !v)}
          >
            <Archive className="mr-1.5 h-4 w-4" /> {verArchivados ? "Ver vigentes" : "Ver archivados"}
          </Button>
        </div>

        <div
          className="scrollbar-invisible overflow-y-auto overflow-x-hidden pr-0.5"
          style={{ maxHeight: "calc(100dvh - 26rem)" }}
        >
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : lista.length > 0 ? (
            <div className="grid gap-3">
              {lista.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-start justify-between gap-3 rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                    a.prioridad === "CRITICO"
                      ? "border-l-status-red"
                      : a.prioridad === "ALTO"
                        ? "border-l-status-amber"
                        : "border-l-status-sky"
                  } ${a.archivado ? "opacity-70" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{a.mensaje}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {a.modulo ?? "General"}
                      {a.fecha_final ? ` · vence ${new Date(a.fecha_final).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${NIVEL_BADGE[a.prioridad ?? "MEDIO"] ?? "bg-muted"}`}>
                      {a.prioridad ?? "MEDIO"}
                    </span>
                    {isAdmin && !a.archivado && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(a);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-status-red"
                          onClick={() => archivarAviso(a.id)}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {verArchivados ? "Sin avisos archivados." : "Sin avisos manuales vigentes."}
            </p>
          )}
        </div>
      </Panel>

      <AvisoFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSubmit={guardar} />
    </div>
  );
}
