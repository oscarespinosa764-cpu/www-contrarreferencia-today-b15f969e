import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getNotificationChannels,
  saveChannelConfig,
  clearChannelToken,
  testChannelConnection,
  sendManualNotification,
  getNotificationLogs,
} from "@/lib/notifications.functions";
import {
  CANALES,
  MENSAJES_CANAL_INACTIVO,
  TIPOS_ALERTA,
  plantillaPorCanal,
  labelAlerta,
} from "@/lib/notifications-utils";
import { Panel } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Send, RefreshCw, Trash2, KeyRound, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { TelegramMultiPanel } from "./telegram-multi-panel";

interface Channel {
  channel_type: string;
  enabled: boolean;
  display_name: string | null;
  destination_label: string | null;
  destination_id: string | null;
  token_configured: boolean;
  config_status: string;
  allowed_alert_types: string[];
  message_template: string | null;
  last_test_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
}

const estadoBadge: Record<string, { label: string; cls: string }> = {
  conectado: { label: "Conectado", cls: "bg-status-green/15 text-status-green" },
  configurado: { label: "Configurado", cls: "bg-status-amber/15 text-status-amber" },
  sin_configurar: { label: "Sin configurar", cls: "bg-muted text-muted-foreground" },
};

// Metadatos específicos por canal para reutilizar el mismo panel.
const CANAL_META: Record<string, {
  label: string;
  nombreDefecto: string;
  usaDestino: boolean;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenConfigLabel: string;
  ayuda: string;
}> = {
  telegram: {
    label: "Telegram",
    nombreDefecto: "Telegram CEDIM",
    usaDestino: true,
    tokenLabel: "Bot token",
    tokenPlaceholder: "Pega el token del bot",
    tokenConfigLabel: "Token configurado",
    ayuda: "Envío real de alertas operativas (sin costo adicional).",
  },
  slack: {
    label: "Slack",
    nombreDefecto: "Slack CEDIM",
    usaDestino: false,
    tokenLabel: "URL del Incoming Webhook",
    tokenPlaceholder: "https://hooks.slack.com/services/…",
    tokenConfigLabel: "Webhook configurado",
    ayuda: "Envío real por Incoming Webhook de Slack (gratis, sin OAuth). El canal lo define el webhook.",
  },
};

export function NotificacionesExternasPanel() {
  const qc = useQueryClient();
  const getChannels = useServerFn(getNotificationChannels);
  const getLogs = useServerFn(getNotificationLogs);
  const sendManual = useServerFn(sendManualNotification);

  const { data: chData } = useQuery({ queryKey: ["notif-channels"], queryFn: () => getChannels() });
  const { data: logData } = useQuery({ queryKey: ["notif-logs"], queryFn: () => getLogs() });
  const channels: Channel[] = (chData?.channels ?? []) as Channel[];

  const [manualOpen, setManualOpen] = useState(false);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["notif-channels"] });
    qc.invalidateQueries({ queryKey: ["notif-logs"] });
  };

  return (
    <div className="space-y-4">
      {/* ---- Telegram multi-destino (token en Cloud Secrets) ---- */}
      <TelegramMultiPanel />

      {/* ---- Slack (webhook por canal) ---- */}
      <CanalPanel
        channelType="slack"
        channel={channels.find((c) => c.channel_type === "slack")}
        onRefetch={refetch}
        onManual={() => setManualOpen(true)}
      />


      {/* ---- Canales preparados (inactivos) ---- */}
      <div className="grid gap-3 sm:grid-cols-2">
        {CANALES.filter((c) => !c.activo).map((c) => (
          <Card key={c.type} className="p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-bold">{c.label}</p>
              <Badge variant="outline" className="text-[10px]">Inactivo / Preparado</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{MENSAJES_CANAL_INACTIVO[c.type]}</p>
            <p className="mt-2 text-[11px] italic text-muted-foreground">Canal preparado, no activo en esta versión.</p>
          </Card>
        ))}
      </div>

      {/* ---- Historial ---- */}
      <Panel title="Historial de envíos" action={<Button variant="ghost" size="sm" onClick={refetch}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Actualizar</Button>}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha/hora</TableHead><TableHead>Canal</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Módulo</TableHead><TableHead>Mensaje</TableHead><TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logData?.logs ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">Sin envíos registrados.</TableCell></TableRow>
              ) : (
                (logData?.logs ?? []).map((l: Record<string, string>) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtFechaHora(l.created_at)}</TableCell>
                    <TableCell className="text-xs capitalize">{l.channel_type}</TableCell>
                    <TableCell className="text-xs">{labelAlerta(l.alert_type)}</TableCell>
                    <TableCell className="text-xs">{l.module || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={l.message_preview}>{l.message_preview || "—"}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        l.status === "sent" ? "bg-status-green/15 text-status-green"
                        : l.status === "error" ? "bg-status-red/15 text-status-red"
                        : "bg-muted text-muted-foreground"}`}>
                        {l.status === "sent" ? "Enviado" : l.status === "error" ? "Error" : l.status === "duplicate" ? "Duplicado" : "Omitido"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <ManualDialog open={manualOpen} onOpenChange={setManualOpen} onSend={sendManual} onDone={refetch} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel reutilizable de un canal (Telegram o Slack).                  */
/* ------------------------------------------------------------------ */
function CanalPanel({
  channelType, channel, onRefetch, onManual,
}: {
  channelType: "telegram" | "slack";
  channel?: Channel;
  onRefetch: () => void;
  onManual: () => void;
}) {
  const meta = CANAL_META[channelType];
  const saveCh = useServerFn(saveChannelConfig);
  const clearCh = useServerFn(clearChannelToken);
  const testCh = useServerFn(testChannelConnection);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [destLabel, setDestLabel] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [alertTypes, setAlertTypes] = useState<string[] | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const defaultTpl = plantillaPorCanal(channelType);
  const vEnabled = enabled ?? channel?.enabled ?? false;
  const vDisplay = displayName ?? channel?.display_name ?? meta.nombreDefecto;
  const vDestLabel = destLabel ?? channel?.destination_label ?? "";
  const vDestId = destId ?? channel?.destination_id ?? "";
  const vAlerts = alertTypes ?? channel?.allowed_alert_types ?? [];
  const vTemplate = template ?? channel?.message_template ?? defaultTpl;

  const toggleAlert = (value: string) => {
    const cur = [...vAlerts];
    const i = cur.indexOf(value);
    if (i >= 0) cur.splice(i, 1); else cur.push(value);
    setAlertTypes(cur);
  };

  const guardar = async () => {
    setBusy("save");
    try {
      const res = await saveCh({ data: {
        channel_type: channelType,
        enabled: vEnabled,
        display_name: vDisplay,
        destination_label: vDestLabel,
        destination_id: vDestId,
        allowed_alert_types: vAlerts,
        message_template: vTemplate,
        new_token: newToken || undefined,
      } });
      if (res.ok) { toast.success("Configuración guardada."); setNewToken(""); onRefetch(); }
      else toast.error(res.error || "No se pudo guardar.");
    } finally { setBusy(null); }
  };

  const probar = async () => {
    setBusy("test");
    try {
      const res = await testCh({ data: { channel_type: channelType } });
      if (res.ok) toast.success(`Mensaje de prueba enviado a ${meta.label}.`);
      else toast.error(`No se pudo enviar: ${res.error}`);
      onRefetch();
    } finally { setBusy(null); }
  };

  const limpiar = async (full: boolean) => {
    setBusy("clear");
    try {
      const res = await clearCh({ data: { channel_type: channelType, full } });
      if (res.ok) { toast.success(full ? "Configuración limpiada." : "Credencial eliminada."); onRefetch(); }
      else toast.error(res.error || "No se pudo limpiar.");
    } finally { setBusy(null); }
  };

  const estado = estadoBadge[channel?.config_status ?? "sin_configurar"] ?? estadoBadge.sin_configurar;

  return (
    <Panel
      title={meta.label}
      action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${estado.cls}`}>{estado.label}</span>}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-sm font-semibold">Activar canal {meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.ayuda}</p>
          </div>
          <Switch checked={vEnabled} onCheckedChange={(v) => setEnabled(v)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Nombre visible</Label><Input value={vDisplay} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div>
            <Label className="text-xs">{meta.usaDestino ? "Nombre del destino (grupo/chat)" : "Nombre del canal de Slack"}</Label>
            <Input value={vDestLabel} onChange={(e) => setDestLabel(e.target.value)} placeholder={meta.usaDestino ? "Ej: Grupo Coordinación" : "Ej: #alertas-cedim"} />
          </div>
          {meta.usaDestino && (
            <div><Label className="text-xs">Chat ID / Grupo destino</Label><Input value={vDestId} onChange={(e) => setDestId(e.target.value)} placeholder="Ej: -1001234567890" /></div>
          )}
          <div className={meta.usaDestino ? "" : "sm:col-span-1"}>
            <Label className="text-xs">{meta.tokenLabel}</Label>
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder={channel?.token_configured ? "•••• Configurado (escribe para reemplazar)" : meta.tokenPlaceholder}
              autoComplete="off"
            />
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              {channel?.token_configured
                ? <span className="inline-flex items-center gap-1 text-status-green"><KeyRound className="h-3 w-3" /> {meta.tokenConfigLabel}</span>
                : <span className="text-muted-foreground">Sin configurar</span>}
              {channel?.token_configured && (
                <button type="button" className="text-status-red hover:underline" onClick={() => limpiar(false)}>Limpiar</button>
              )}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs">Tipos de alerta que se envían por {meta.label}</Label>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {TIPOS_ALERTA.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-xs">
                <Checkbox checked={vAlerts.includes(t.value)} onCheckedChange={() => toggleAlert(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">Plantilla de mensaje</Label>
          <Textarea value={vTemplate} onChange={(e) => setTemplate(e.target.value)} rows={5} className="font-mono text-xs" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Placeholders permitidos: {"{{tipo_alerta}} {{modulo}} {{paciente_iniciales}} {{documento_enmascarado}} {{codigo}} {{estado}} {{accion}} {{fecha_hora}} {{usuario}} {{funcionario}}"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {channel?.last_test_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Última prueba: {fmtFechaHora(channel.last_test_at)}</span>}
          {channel?.last_success_at && <span className="inline-flex items-center gap-1 text-status-green"><CheckCircle2 className="h-3 w-3" /> Último envío: {fmtFechaHora(channel.last_success_at)}</span>}
          {channel?.last_error_at && <span className="inline-flex items-center gap-1 text-status-red"><XCircle className="h-3 w-3" /> Último error: {channel.last_error_message}</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={guardar} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Guardar configuración
          </Button>
          <Button variant="outline" onClick={probar} disabled={busy !== null}>
            {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Probar conexión
          </Button>
          <Button variant="outline" onClick={onManual} disabled={busy !== null}>
            <Send className="mr-1.5 h-4 w-4" /> Enviar aviso manual
          </Button>
          <Button variant="ghost" className="text-status-red" onClick={() => limpiar(true)} disabled={busy !== null}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Limpiar configuración
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function ManualDialog({
  open, onOpenChange, onSend, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSend: (a: any) => Promise<{ ok: boolean; error?: string | null }>;
  onDone: () => void;
}) {
  const [alertType, setAlertType] = useState("AVISO_MANUAL");
  const [modulo, setModulo] = useState("");
  const [prioridad, setPrioridad] = useState("Informativo");
  const [mensaje, setMensaje] = useState("");
  const [sending, setSending] = useState(false);

  const enviar = async () => {
    if (!mensaje.trim()) return toast.error("Escribe el mensaje.");
    setSending(true);
    try {
      const res = await onSend({ data: { alert_type: alertType, module: modulo || undefined, priority: prioridad, message: mensaje } });
      if (res.ok) { toast.success("Mensaje enviado correctamente."); setMensaje(""); onOpenChange(false); onDone(); }
      else toast.error(`No se pudo enviar el mensaje: ${res.error}`);
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Enviar aviso manual (a todos los canales activos)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de aviso</Label>
              <Select value={alertType} onValueChange={setAlertType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ALERTA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridad</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Informativo">Informativo</SelectItem>
                  <SelectItem value="Alerta">Alerta</SelectItem>
                  <SelectItem value="Crítico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Módulo relacionado (opcional)</Label><Input value={modulo} onChange={(e) => setModulo(e.target.value)} /></div>
          <div><Label className="text-xs">Mensaje</Label><Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={enviar} disabled={sending}>{sending ? "Enviando…" : "Enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
