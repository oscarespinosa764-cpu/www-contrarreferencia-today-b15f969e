import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getMyDeviceStatus,
  requestDeviceChallenge,
  registerDeviceAndRequest,
  verifyDeviceAndLinkSession,
  bootstrapAuthorizeCurrentDevice,
} from "@/lib/devices.functions";
import {
  getLocalDevicePublicId,
  setLocalDevicePublicId,
  getPublicKeyJwk,
  signChallenge,
  clearLocalDevice,
} from "@/lib/devices-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

type DeviceRow = {
  id: string;
  device_public_id: string;
  estado: string;
  nombre_dispositivo: string | null;
  autorizado_at: string | null;
  expiracion_at: string | null;
  motivo: string | null;
};

type StatusResp = {
  mode: string;
  device: DeviceRow | null;
  sessionLinked: boolean;
};

export function DeviceGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [localId, setLocalId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [nombre, setNombre] = useState("");

  const status = useServerFn(getMyDeviceStatus);
  const reqCh = useServerFn(requestDeviceChallenge);
  const register = useServerFn(registerDeviceAndRequest);
  const verify = useServerFn(verifyDeviceAndLinkSession);
  const bootstrap = useServerFn(bootstrapAuthorizeCurrentDevice);

  useEffect(() => {
    getLocalDevicePublicId().then((v) => setLocalId(v));
  }, []);

  const q = useQuery<StatusResp>({
    queryKey: ["device-status", localId],
    enabled: localId !== undefined,
    queryFn: () => status({ data: { devicePublicId: localId ?? null } }) as Promise<StatusResp>,
    refetchInterval: 15000,
  });

  const linkExisting = useCallback(async () => {
    if (!localId) return;
    setBusy(true);
    try {
      const { challenge } = (await reqCh({
        data: { purpose: "LINK_SESSION", devicePublicId: localId },
      })) as { challenge: string };
      const signature = await signChallenge(challenge);
      const res = (await verify({
        data: { devicePublicId: localId, challenge, signature },
      })) as { status: string };
      if (res.status === "AUTORIZADO") {
        toast.success("Dispositivo verificado.");
        q.refetch();
      } else if (res.status === "PENDIENTE") {
        toast.info("Este dispositivo está pendiente de aprobación.");
      } else {
        toast.error(`Dispositivo ${res.status.toLowerCase()}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al verificar el dispositivo.");
    } finally {
      setBusy(false);
    }
  }, [localId, reqCh, verify, q]);

  const doRegister = useCallback(
    async (asBootstrap: boolean) => {
      setBusy(true);
      try {
        await clearLocalDevice();
        const publicKey = await getPublicKeyJwk();
        const { challenge } = (await reqCh({
          data: { purpose: "REGISTER_DEVICE" },
        })) as { challenge: string };
        const signature = await signChallenge(challenge);
        const fn = asBootstrap ? bootstrap : register;
        const res = (await fn({
          data: {
            publicKey,
            challenge,
            signature,
            nombreDispositivo: nombre.trim() || undefined,
          },
        })) as { devicePublicId: string };
        await setLocalDevicePublicId(res.devicePublicId);
        setLocalId(res.devicePublicId);
        if (asBootstrap) {
          toast.success("Dispositivo administrador autorizado.");
        } else {
          toast.success("Solicitud enviada al administrador.");
        }
        q.refetch();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo registrar el dispositivo.");
      } finally {
        setBusy(false);
      }
    },
    [nombre, reqCh, register, bootstrap, q],
  );

  // Cargando estado inicial
  if (localId === undefined || q.isLoading || !q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { mode, device, sessionLinked } = q.data;

  // Modos permisivos: no bloquear la app
  if (mode === "DISABLED" || mode === "BOOTSTRAP") {
    return <>{children}</>;
  }

  // El administrador real puede entrar desde cualquier navegador; el control aplica al rol operativo.
  if (isAdmin && (mode === "ENFORCED" || mode === "EMERGENCY_RECOVERY")) {
    return <>{children}</>;
  }

  // Modo EMERGENCY_RECOVERY: solo el administrador entra; el resto queda bloqueado
  if (mode === "EMERGENCY_RECOVERY") {
    return (
      <BlockCard
        title="Acceso en recuperación"
        icon="alert"
        message="El sistema está en modo de recuperación de emergencia. Solo el administrador puede ingresar en este momento."
      />
    );
  }

  // Modo ENFORCED
  if (sessionLinked && device?.estado === "AUTORIZADO") {
    return <>{children}</>;
  }

  // Dispositivo autorizado pero sesión no vinculada (p. ej. cambio de turno,
  // otro usuario en el mismo equipo autorizado): vincular silenciosamente
  // sin mostrar UI ni requerir acción del operativo.
  if (device?.estado === "AUTORIZADO" && localId) {
    return (
      <SilentLinker
        busy={busy}
        onLink={linkExisting}
      />
    );
  }

  if (device?.estado === "PENDIENTE") {
    return (
      <BlockCard
        title="Esperando aprobación"
        icon="alert"
        message="Tu solicitud fue enviada al administrador. Podrás ingresar cuando sea autorizada."
      />
    );
  }

  if (device && ["REVOCADO", "BLOQUEADO", "RECHAZADO", "EXPIRADO"].includes(device.estado)) {
    return (
      <BlockCard
        title={`Dispositivo ${device.estado.toLowerCase()}`}
        icon="alert"
        message={device.motivo ?? "Este dispositivo no está autorizado. Contacta al administrador."}
      />
    );
  }

  // Sin dispositivo registrado en este navegador
  return (
    <BlockCard
      title="Autorización de este navegador"
      icon="ok"
      message="Este navegador aún no está autorizado. Envía una solicitud al administrador para poder ingresar."
    >
      <div className="mb-3">
        <Label htmlFor="dev-nombre">Nombre para este dispositivo</Label>
        <Input
          id="dev-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Estación coordinación 1"
          className="mt-1"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => doRegister(false)} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Solicitar autorización
        </Button>
        {isAdmin ? (
          <Button variant="outline" onClick={() => doRegister(true)} disabled={busy}>
            Autorizar como administrador (BOOTSTRAP)
          </Button>
        ) : null}
      </div>
    </BlockCard>
  );
}

function BlockCard({
  title,
  message,
  icon,
  children,
}: {
  title: string;
  message: string;
  icon: "ok" | "alert";
  children?: React.ReactNode;
}) {
  const Icon = icon === "ok" ? ShieldCheck : ShieldAlert;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 shadow-modern">
        <div className="mb-3 flex items-center gap-2">
          <Icon className={`h-6 w-6 ${icon === "ok" ? "text-status-green" : "text-status-amber"}`} />
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        {children}
      </div>
    </div>
  );
}
