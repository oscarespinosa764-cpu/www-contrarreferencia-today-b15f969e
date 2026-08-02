// ============================================================================
// FASE 9 · BLOQUE C.1 — Vinculación de colaboradores del Cuadro de Turno con
// usuarios reales del sistema. Exclusivo para administrador/coordinador.
// Toda escritura pasa por Server Functions auditadas.
// ============================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import {
  listarVinculacionMiembros,
  vincularMiembroUsuario,
  desvincularMiembroUsuario,
  type MiembroVinculo,
} from "@/lib/cuadro-identidad.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const BADGE: Record<MiembroVinculo["estado"], string> = {
  VINCULADO: "bg-emerald-100 text-emerald-800",
  "SUGERENCIA DISPONIBLE": "bg-amber-100 text-amber-900",
  "SIN VÍNCULO": "bg-muted text-muted-foreground",
  "IDENTIDAD AMBIGUA": "bg-destructive/10 text-destructive",
  "USUARIO INACTIVO": "bg-destructive/10 text-destructive",
  "SIN COINCIDENCIA": "bg-muted text-muted-foreground",
};

export function VinculacionPanel() {
  const qc = useQueryClient();
  const [scheduleId, setScheduleId] = useState<string>("");
  const [filtro, setFiltro] = useState("");

  const { data: schedules } = useQuery({
    queryKey: ["shift-schedules-vinculacion"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_schedules")
        .select("id, year, month")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      return data ?? [];
    },
  });

  const activeScheduleId = scheduleId || schedules?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["vinculacion-miembros", activeScheduleId],
    enabled: !!activeScheduleId,
    queryFn: () => listarVinculacionMiembros({ data: { scheduleId: activeScheduleId } }),
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const q = filtro.trim().toLocaleLowerCase();
    return q ? list.filter((m) => m.fullName.toLocaleLowerCase().includes(q)) : list;
  }, [data, filtro]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["vinculacion-miembros"] });
    qc.invalidateQueries({ queryKey: ["cuadro-mensual"] });
    qc.invalidateQueries({ queryKey: ["shift-requests"] });
  };

  const vincular = useMutation({
    mutationFn: (v: { memberId: string; targetUserId: string; sugerencia: boolean }) =>
      vincularMiembroUsuario({
        data: {
          memberId: v.memberId,
          targetUserId: v.targetUserId,
          linkSource: v.sugerencia ? "CONFIRMED_NAME_SUGGESTION" : "MANUAL_ADMIN",
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error ?? "No fue posible vincular.");
      toast.success("Colaborador vinculado.");
      invalidar();
    },
    onError: () => toast.error("No fue posible vincular."),
  });

  const desvincular = useMutation({
    mutationFn: (memberId: string) => desvincularMiembroUsuario({ data: { memberId } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error ?? "No fue posible desvincular.");
      toast.success("Vínculo eliminado.");
      invalidar();
    },
    onError: () => toast.error("No fue posible desvincular."),
  });

  if (data && !data.ok) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No tiene permisos para gestionar la vinculación de colaboradores.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">VINCULACIÓN DE COLABORADORES</CardTitle>
        <p className="text-xs text-muted-foreground">
          Asocie cada colaborador del Cuadro de Turno con su usuario real del sistema. La
          vinculación garantiza que las solicitudes de permiso y cambio de turno reconozcan la
          programación correcta.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeScheduleId} onValueChange={setScheduleId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Cuadro de turno" />
            </SelectTrigger>
            <SelectContent>
              {(schedules ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {MESES[(s.month ?? 1) - 1]} {s.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-64"
            placeholder="Buscar colaborador"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay colaboradores para mostrar.</p>
        )}

        <div className="space-y-2">
          {items.map((m) => (
            <div
              key={m.memberId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-56">
                <p className="text-sm font-medium">{m.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {[m.roleName, m.sede].filter(Boolean).join(" · ") || "—"}
                </p>
                {m.usuarioNombre && (
                  <p className="text-xs text-muted-foreground">
                    Usuario: {m.usuarioNombre}
                    {m.usuarioActivo === false ? " (inactivo)" : ""}
                    {m.linkSource ? ` · ${m.linkSource}` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge className={BADGE[m.estado]} variant="secondary">
                  {m.estado}
                </Badge>

                {m.estado === "SUGERENCIA DISPONIBLE" && m.sugerencias[0] && (
                  <Button
                    size="sm"
                    disabled={vincular.isPending}
                    onClick={() =>
                      vincular.mutate({
                        memberId: m.memberId,
                        targetUserId: m.sugerencias[0]!.userId,
                        sugerencia: true,
                      })
                    }
                  >
                    Confirmar {m.sugerencias[0]!.nombre}
                  </Button>
                )}

                {m.userId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={desvincular.isPending}
                    onClick={() => desvincular.mutate(m.memberId)}
                  >
                    Desvincular
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
