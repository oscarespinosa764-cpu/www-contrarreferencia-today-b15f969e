import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgramarAlertasDialog, useAlertasConfig } from "@/components/coordinacion/programar-alertas-dialog";
import { Search, CalendarClock, BellRing, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PlantillasEnPaso } from "@/components/coordinacion/plantillas-en-paso";

function estadoBadge(estado: string) {
  const e = estado.toUpperCase();
  if (e === "CERRADA" || e === "RESUELTA") return "bg-status-green/15 text-status-green";
  return "bg-status-amber/15 text-status-amber";
}

export function AlertasPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: cfg } = useAlertasConfig();

  const { data: alertas, isLoading } = useQuery({
    queryKey: ["coordinacion-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coordinacion")
        .select("*")
        .eq("archivado", false)
        .order("fecha_alerta", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const cerrar = async (id: string) => {
    const { error } = await supabase.from("coordinacion").update({ estado: "CERRADA" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Alerta cerrada");
    qc.invalidateQueries({ queryKey: ["coordinacion-alertas"] });
  };

  const term = q.trim().toLowerCase();
  const alertasF = useMemo(
    () =>
      (alertas ?? []).filter((a) =>
        term
          ? [a.paciente, a.documento, a.detalle, a.tipo].filter(Boolean).join(" ").toLowerCase().includes(term)
          : true,
      ),
    [alertas, term],
  );

  const abiertas = (alertas ?? []).filter(
    (a) => String(a.estado ?? "ABIERTA").toUpperCase() === "ABIERTA",
  ).length;

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
            ? "Configura los canales de correo, Telegram y webhook/WhatsApp con el botón Programar."
            : "Solo coordinación (ADMIN) puede modificar la programación."}
        </p>
      </Panel>

      <Panel title={`Alertas de coordinación · ${abiertas} abierta(s)`}>
        <div className="relative mb-4 mx-auto max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar alerta, paciente, documento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : alertasF.length > 0 ? (
          <div className="grid gap-3">
            {alertasF.map((a) => {
              const estado = String(a.estado ?? "ABIERTA").toUpperCase();
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border border-l-4 border-l-status-amber bg-card p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <BellRing className="h-4 w-4 text-status-amber" />
                      {a.paciente || a.tipo || "Alerta"}
                    </p>
                    {a.detalle && <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[a.documento && `Doc: ${a.documento}`, a.tipo].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${estadoBadge(estado)}`}>
                      {estado}
                    </span>
                    <PlantillasEnPaso
                      paso="alertas_gestion"
                      condicion={a.tipo}
                      datos={{
                        PACIENTE: a.paciente,
                        DOCUMENTO: a.documento,
                        ESTADO: estado,
                      }}
                    />
                    {estado === "ABIERTA" && isAdmin && (
                      <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={() => cerrar(a.id)}>
                        Cerrar
                      </Button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin alertas de coordinación registradas.
          </p>
        )}
      </Panel>
    </div>
  );
}
