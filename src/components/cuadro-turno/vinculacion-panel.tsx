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
  buscarUsuariosVinculables,
  type MiembroVinculo,
} from "@/lib/cuadro-identidad.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type UsuarioVinculable = {
  userId: string;
  nombre: string | null;
  cargo: string | null;
  sede: string | null;
  activo: boolean;
};

/**
 * D2 — Búsqueda manual server-side de usuarios vinculables (admin activo).
 * La selección visual NO vincula: siempre requiere confirmación explícita.
 */
function BuscarUsuarioDialog({
  miembro,
  periodo,
  vinculadosEnCuadro,
  pendiente,
  onConfirmar,
  onClose,
}: {
  miembro: MiembroVinculo;
  periodo: string;
  vinculadosEnCuadro: Map<string, string>;
  pendiente: boolean;
  onConfirmar: (u: UsuarioVinculable) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<UsuarioVinculable | null>(null);
  const termino = q.trim();

  const { data, isFetching } = useQuery({
    queryKey: ["vinculacion-buscar-usuarios", termino],
    enabled: termino.length >= 2,
    queryFn: () => buscarUsuariosVinculables({ data: { q: termino } }),
  });

  const resultados: UsuarioVinculable[] = data?.ok ? data.items : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">BUSCAR USUARIO</DialogTitle>
          <DialogDescription className="text-xs">
            {miembro.fullName} · {[miembro.roleName, miembro.sede].filter(Boolean).join(" · ") || "—"}
            {periodo ? ` · ${periodo}` : ""}
          </DialogDescription>
        </DialogHeader>

        {!sel ? (
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Nombre del usuario (mínimo 2 caracteres)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {termino.length < 2 && (
                <p className="text-xs text-muted-foreground">
                  Escriba al menos 2 caracteres para buscar.
                </p>
              )}
              {termino.length >= 2 && isFetching && (
                <p className="text-xs text-muted-foreground">Buscando…</p>
              )}
              {termino.length >= 2 && !isFetching && resultados.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin resultados.</p>
              )}
              {resultados.map((u) => {
                const ocupadoPor = vinculadosEnCuadro.get(u.userId);
                const bloqueado = !!ocupadoPor || !u.activo;
                return (
                  <button
                    key={u.userId}
                    type="button"
                    disabled={bloqueado}
                    onClick={() => setSel(u)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{u.nombre || "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[u.cargo, u.sede].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    {bloqueado && (
                      <Badge variant="secondary" className="text-[10px]">
                        {u.activo ? "YA VINCULADO EN ESTE CUADRO" : "INACTIVO"}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              ¿Vincular {miembro.fullName} con {sel.nombre || "—"}?
            </p>
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <p>
                Colaborador: {miembro.fullName} ·{" "}
                {[miembro.roleName, miembro.sede].filter(Boolean).join(" · ") || "—"}
              </p>
              <p>
                Usuario: {sel.nombre || "—"} · {[sel.cargo, sel.sede].filter(Boolean).join(" · ") || "—"}
              </p>
              <p>Cuadro de Turno: {periodo || "—"}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {sel ? (
            <>
              <Button variant="outline" onClick={() => setSel(null)} disabled={pendiente}>
                Volver
              </Button>
              <Button onClick={() => onConfirmar(sel)} disabled={pendiente}>
                Confirmar vinculación
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

  const [buscando, setBuscando] = useState<MiembroVinculo | null>(null);

  /** userId ya vinculado en este cuadro → nombre del miembro que lo ocupa. */
  const vinculadosEnCuadro = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of data?.items ?? []) if (it.userId) m.set(it.userId, it.fullName);
    return m;
  }, [data]);

  const periodo = useMemo(() => {
    const s = (schedules ?? []).find((x) => x.id === activeScheduleId);
    return s ? `${MESES[(s.month ?? 1) - 1]} ${s.year}` : "";
  }, [schedules, activeScheduleId]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["vinculacion-miembros"] });
    qc.invalidateQueries({ queryKey: ["schedule-members"] });
    qc.invalidateQueries({ queryKey: ["schedule-days"] });
    qc.invalidateQueries({ queryKey: ["cuadro-mensual"] });
    qc.invalidateQueries({ queryKey: ["shift-requests"] });
    qc.invalidateQueries({ queryKey: ["turno-programado"] });
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
      toast.success("Colaborador vinculado correctamente.");
      setBuscando(null);
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

                {!m.userId && (
                  <Button size="sm" variant="secondary" onClick={() => setBuscando(m)}>
                    Buscar usuario
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

        {buscando && (
          <BuscarUsuarioDialog
            miembro={buscando}
            periodo={periodo}
            vinculadosEnCuadro={vinculadosEnCuadro}
            pendiente={vincular.isPending}
            onClose={() => setBuscando(null)}
            onConfirmar={(u) =>
              vincular.mutate({
                memberId: buscando.memberId,
                targetUserId: u.userId,
                sugerencia: false,
              })
            }
          />
        )}
      </CardContent>
    </Card>
  );

}
