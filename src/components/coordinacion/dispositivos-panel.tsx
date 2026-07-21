import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ShieldCheck, ShieldOff, Ban, Check, X, Unlock } from "lucide-react";
import {
  adminListDevices,
  adminListDeviceRequests,
  adminApproveDevice,
  adminRejectDevice,
  adminRevokeDevice,
  adminBlockDevice,
  adminUnblockDevice,
  getSystemMode,
  adminSetGlobalMode,
} from "@/lib/devices.functions";

type Device = {
  id: string;
  user_id: string;
  device_public_id: string;
  nombre_dispositivo: string | null;
  descripcion: string | null;
  navegador: string | null;
  sistema_operativo: string | null;
  tipo_dispositivo: string | null;
  estado: string;
  autorizado_at: string | null;
  expiracion_at: string | null;
  ultima_actividad_at: string | null;
  motivo: string | null;
  created_at: string;
};

const badgeCls: Record<string, string> = {
  AUTORIZADO: "bg-status-green/15 text-status-green",
  PENDIENTE: "bg-status-amber/15 text-status-amber",
  RECHAZADO: "bg-muted text-muted-foreground",
  REVOCADO: "bg-status-red/15 text-status-red",
  BLOQUEADO: "bg-status-red/15 text-status-red",
  EXPIRADO: "bg-muted text-muted-foreground",
};

export function DispositivosPanel() {
  const qc = useQueryClient();
  const listDevices = useServerFn(adminListDevices);
  const listRequests = useServerFn(adminListDeviceRequests);
  const approve = useServerFn(adminApproveDevice);
  const reject = useServerFn(adminRejectDevice);
  const revoke = useServerFn(adminRevokeDevice);
  const block = useServerFn(adminBlockDevice);
  const unblock = useServerFn(adminUnblockDevice);
  const getMode = useServerFn(getSystemMode);
  const setMode = useServerFn(adminSetGlobalMode);

  const devicesQ = useQuery<Device[]>({
    queryKey: ["admin-devices"],
    queryFn: () => listDevices({}) as Promise<Device[]>,
  });

  const modeQ = useQuery<{ mode: string }>({
    queryKey: ["device-mode"],
    queryFn: () => getMode({}) as Promise<{ mode: string }>,
  });

  const reqQ = useQuery({
    queryKey: ["admin-device-requests"],
    queryFn: () => listRequests({}),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-devices"] });
    qc.invalidateQueries({ queryKey: ["admin-device-requests"] });
    qc.invalidateQueries({ queryKey: ["device-mode"] });
  };

  const [nuevoModo, setNuevoModo] = useState<string>("");
  const [frase, setFrase] = useState("");

  const changeMode = useMutation({
    mutationFn: async () =>
      (await setMode({ data: { mode: nuevoModo, frase } })) as { ok: true },
    onSuccess: () => {
      toast.success("Modo actualizado.");
      setFrase("");
      setNuevoModo("");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo cambiar el modo."),
  });

  const act = async (fn: (args: { data: { deviceId: string; motivo?: string } }) => Promise<unknown>, deviceId: string, label: string, askMotivo = false) => {
    const motivo = askMotivo ? window.prompt(`Motivo (${label}):`) ?? undefined : undefined;
    try {
      await fn({ data: { deviceId, motivo } });
      toast.success(`${label} correctamente.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `No se pudo ${label.toLowerCase()}.`);
    }
  };

  const devices = devicesQ.data ?? [];
  const requests = (reqQ.data as { id: string; device_id: string; navegador: string | null; sistema_operativo: string | null; solicitado_at: string }[]) ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Modo global de control de dispositivos"
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Recargar
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Modo actual:</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">
            {modeQ.data?.mode ?? "…"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Nuevo modo</Label>
            <Select value={nuevoModo} onValueChange={setNuevoModo}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DISABLED">DISABLED — Sin restricciones</SelectItem>
                <SelectItem value="BOOTSTRAP">BOOTSTRAP — Registro inicial</SelectItem>
                <SelectItem value="ENFORCED">ENFORCED — Solo autorizados</SelectItem>
                <SelectItem value="EMERGENCY_RECOVERY">EMERGENCY_RECOVERY — Solo admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {nuevoModo === "ENFORCED" ? (
            <div className="sm:col-span-2">
              <Label>Frase de confirmación</Label>
              <Input
                className="mt-1"
                value={frase}
                onChange={(e) => setFrase(e.target.value)}
                placeholder="ACTIVAR CONTROL DE DISPOSITIVOS"
              />
            </div>
          ) : null}
          <div className="sm:col-span-3">
            <Button
              onClick={() => changeMode.mutate()}
              disabled={!nuevoModo || changeMode.isPending}
            >
              {changeMode.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aplicar modo
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              ENFORCED requiere al menos un dispositivo administrador AUTORIZADO y escribir exactamente
              <span className="mx-1 font-mono">ACTIVAR CONTROL DE DISPOSITIVOS</span>.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title={`Solicitudes pendientes (${requests.length})`}>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{r.navegador ?? "Navegador"} · {r.sistema_operativo ?? "SO"}</p>
                  <p className="text-xs text-muted-foreground">Solicitado {new Date(r.solicitado_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => act(approve as never, r.device_id, "Aprobado")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(reject as never, r.device_id, "Rechazado", true)}>
                    <X className="mr-1 h-3.5 w-3.5" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Dispositivos registrados (${devices.length})`}>
        {devicesQ.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay dispositivos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2">Dispositivo</th>
                  <th className="py-2 pr-2">Navegador / SO</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2">Última actividad</th>
                  <th className="py-2 pr-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-2">
                      <p className="font-semibold">{d.nombre_dispositivo ?? "Sin nombre"}</p>
                      <p className="text-[11px] text-muted-foreground">{d.device_public_id.slice(0, 8)}…</p>
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {d.navegador ?? "—"} · {d.sistema_operativo ?? "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeCls[d.estado] ?? "bg-muted"}`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {d.ultima_actividad_at ? new Date(d.ultima_actividad_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {d.estado === "PENDIENTE" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(approve as never, d.id, "Aprobado")}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => act(reject as never, d.id, "Rechazado", true)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {d.estado === "AUTORIZADO" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(revoke as never, d.id, "Revocado", true)}>
                              <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revocar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => act(block as never, d.id, "Bloqueado", true)}>
                              <Ban className="mr-1 h-3.5 w-3.5" /> Bloquear
                            </Button>
                          </>
                        ) : null}
                        {d.estado === "BLOQUEADO" ? (
                          <Button size="sm" variant="outline" onClick={() => act(unblock as never, d.id, "Desbloqueado")}>
                            <Unlock className="mr-1 h-3.5 w-3.5" /> Desbloquear
                          </Button>
                        ) : null}
                        {d.estado === "REVOCADO" ? (
                          <span className="text-[11px] text-muted-foreground">
                            <ShieldCheck className="mr-1 inline h-3 w-3" />
                            Debe re-registrarse
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
