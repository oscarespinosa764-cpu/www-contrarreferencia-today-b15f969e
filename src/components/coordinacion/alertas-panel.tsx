import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgramarAlertasDialog, useAlertasConfig } from "@/components/coordinacion/programar-alertas-dialog";
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
import { useAvisosOperativos } from "@/lib/use-avisos-operativos";
import { avisoVencido, NIVEL_BADGE, type Aviso } from "@/lib/avisos-reglas";

export function AlertasPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Aviso | null>(null);
  const { data: cfg } = useAlertasConfig();

  const { avisos, combinados, isLoading } = useAvisosOperativos();

  const refrescar = () => qc.invalidateQueries({ queryKey: ["avisos-operativos"] });

  const audit = (accion: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({ data: { accion, modulo: "alertas", tabla: "avisos", detalles } }).catch(() => {});

  // Vencimiento automático de avisos manuales (archivarAvisosVencidos_).
  const venceProcesado = useRef(false);
  useEffect(() => {
    if (venceProcesado.current || avisos.length === 0) return;
    const vencidos = avisos.filter(avisoVencido);
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
      const { error } = await supabase
        .from("avisos")
        .update({ ...values, estado: "ACTIVO" })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("editar_aviso", { id });
      toast.success("Aviso actualizado");
    } else {
      const { data, error } = await supabase
        .from("avisos")
        .insert({ ...values, estado: "ACTIVO", archivado: false })
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
    const { error } = await supabase
      .from("avisos")
      .update({ archivado: true, estado: "CERRADO" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    audit("archivar_aviso", { id });
    toast.success("Aviso archivado");
    refrescar();
  };

  const term = q.trim().toLowerCase();
  const lista = useMemo(
    () =>
      combinados
        .filter((a) => {
          if (filtro === "manuales") return a.kind === "M";
          if (filtro === "ia") return a.kind === "IA";
          if (filtro === "criticas") return a.severidad === "CRITICO";
          if (filtro === "altas") return a.severidad === "ALTO";
          if (filtro === "medias") return a.severidad === "MEDIO";
          return true;
        })
        .filter((a) => (term ? [a.titulo, a.sub, a.detalle].join(" ").toLowerCase().includes(term) : true)),
    [combinados, filtro, term],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Programación de notificaciones"
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
        <div className="flex items-center justify-center gap-2 py-2 text-sm">
          {cfg?.config.activo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-green/15 px-3 py-1 font-semibold text-status-green">
              <CheckCircle2 className="h-4 w-4" /> Alertas automáticas activas · cada {cfg.config.frecuencia} min
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
              <BellRing className="h-4 w-4" /> Alertas automáticas desactivadas
            </span>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {isAdmin
            ? "Programar configura los canales de correo, Telegram y webhook/WhatsApp. No crea avisos."
            : "Solo coordinación (ADMIN) puede modificar la programación."}
        </p>
      </Panel>

      <Panel
        title={`Avisos operativos · ${lista.length}`}
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
              <Plus className="mr-1.5 h-4 w-4" /> Nueva alerta manual
            </Button>
          )
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar aviso, paciente, módulo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-40 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="manuales">Manuales</SelectItem>
              <SelectItem value="ia">IA</SelectItem>
              <SelectItem value="criticas">Críticas</SelectItem>
              <SelectItem value="altas">Altas</SelectItem>
              <SelectItem value="medias">Medias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : lista.length > 0 ? (
          <div className="grid gap-3">
            {lista.map((a) => {
              const aviso = a.kind === "M" ? avisos.find((x) => x.id === a.sourceId) : null;
              return (
                <div
                  key={a.key}
                  className={`flex items-start justify-between gap-3 rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                    a.severidad === "CRITICO"
                      ? "border-l-status-red"
                      : a.severidad === "ALTO"
                        ? "border-l-status-amber"
                        : a.severidad === "MEDIO"
                          ? "border-l-status-sky"
                          : "border-l-border"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                          a.kind === "M" ? "bg-vitalis-blue/15 text-vitalis-blue" : "bg-status-teal/15 text-status-teal"
                        }`}
                      >
                        {a.kind}
                      </span>
                      {a.titulo}
                    </p>
                    {a.detalle && <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{a.sub || "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${NIVEL_BADGE[a.severidad]}`}>
                      {a.severidad}
                    </span>
                    {a.kind === "M" && isAdmin && aviso && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(aviso);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-status-red"
                          onClick={() => archivarAviso(aviso.id)}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin avisos operativos. {isAdmin ? "Crea uno con «Nueva alerta manual» o define reglas." : ""}
          </p>
        )}
      </Panel>

      <AvisoFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSubmit={guardar} />
    </div>
  );
}
