import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getNotificationChannels,
  saveTelegramConfig,
  clearTelegramToken,
  testTelegramConnection,
  sendManualNotification,
  getNotificationLogs,
} from "@/lib/notifications.functions";
import {
  CANALES,
  MENSAJES_CANAL_INACTIVO,
  TIPOS_ALERTA,
  PLANTILLA_TELEGRAM_DEFAULT,
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

export function NotificacionesExternasPanel() {
  const qc = useQueryClient();
  const getChannels = useServerFn(getNotificationChannels);
  const saveTg = useServerFn(saveTelegramConfig);
  const clearTg = useServerFn(clearTelegramToken);
  const testTg = useServerFn(testTelegramConnection);
  const sendManual = useServerFn(sendManualNotification);
  const getLogs = useServerFn(getNotificationLogs);

  const { data: chData } = useQuery({ queryKey: ["notif-channels"], queryFn: () => getChannels() });
  const { data: logData } = useQuery({ queryKey: ["notif-logs"], queryFn: () => getLogs() });
  const channels: Channel[] = (chData?.channels ?? []) as Channel[];
  const tg = channels.find((c) => c.channel_type === "telegram");

  // ---- Estado del formulario Telegram ----
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [destLabel, setDestLabel] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [alertTypes, setAlertTypes] = useState<string[] | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Valores efectivos (estado local o el guardado).
  const vEnabled = enabled ?? tg?.enabled ?? false;
  const vDisplay = displayName ?? tg?.display_name ?? "Telegram CEDIM";
  const vDestLabel = destLabel ?? tg?.destination_label ?? "";
  const vDestId = destId ?? tg?.destination_id ?? "";
  const vAlerts = alertTypes ?? tg?.allowed_alert_types ?? [];
  const vTemplate = template ?? tg?.message_template ?? PLANTILLA_TELEGRAM_DEFAULT;

  const toggleAlert = (value: string) => {
    const cur = [...vAlerts];
    const i = cur.indexOf(value);
    if (i >= 0) cur.splice(i, 1); else cur.push(value);
    setAlertTypes(cur);
  };

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["notif-channels"] });
    qc.invalidateQueries({ queryKey: ["notif-logs"] });
  };

  const guardar = async () => {
    setBusy("save");
    try {
      const res = await saveTg({ data: {
        enabled: vEnabled,
        display_name: vDisplay,
        destination_label: vDestLabel,
        destination_id: vDestId,
        allowed_alert_types: vAlerts,
        message_template: vTemplate,
        new_token: newToken || undefined,
      } });
      if (res.ok) { toast.success("Configuración guardada."); setNewToken(""); refetch(); }
      else toast.error(res.error || "No se pudo guardar.");
    } finally { setBusy(null); }
  };

  const probar = async () => {
    setBusy("test");
    try {
      const res = await testTg();
      if (res.ok) toast.success("Mensaje de prueba enviado a Telegram.");
      else toast.error(`No se pudo enviar: ${res.error}`);
      refetch();
    } finally { setBusy(null); }
  };

  const limpiar = async (full: boolean) => {
    setBusy("clear");
    try {
      const res = await clearTg({ data: { full } });
      if (res.ok) { toast.success(full ? "Configuración limpiada." : "Token eliminado."); refetch(); }
      else toast.error(res.error || "No se pudo limpiar.");
    } finally { setBusy(null); }
  };

  const estado = estadoBadge[tg?.config_status ?? "sin_configurar"] ?? estadoBadge.sin_configurar;

  return (
    <div className="space-y-4">
      {/* ---- Telegram (canal real) ---- */}
      <Panel
        title="Telegram"
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${estado.cls}`}>{estado.label}</span>}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <p className="text-sm font-semibold">Activar canal Telegram</p>
              <p className="text-xs text-muted-foreground">Envío real de alertas operativas (sin costo adicional).</p>
            </div>
            <Switch checked={vEnabled} onCheckedChange={(v) => setEnabled(v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Nombre visible</Label><Input value={vDisplay} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div><Label className="text-xs">Nombre del destino (grupo/chat)</Label><Input value={vDestLabel} onChange={(e) => setDestLabel(e.target.value)} placeholder="Ej: Grupo Coordinación" /></div>
            <div><Label className="text-xs">Chat ID / Grupo destino</Label><Input value={vDestId} onChange={(e) => setDestId(e.target.value)} placeholder="Ej: -1001234567890" /></div>
            <div>
              <Label className="text-xs">Bot token</Label>
              <Input
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder={tg?.token_configured ? "•••• Token configurado (escribe para reemplazar)" : "Pega el token del bot"}
                autoComplete="off"
              />
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                {tg?.token_configured
                  ? <span className="inline-flex items-center gap-1 text-status-green"><KeyRound className="h-3 w-3" /> Token configurado</span>
                  : <span className="text-muted-foreground">Sin token</span>}
                {tg?.token_configured && (
                  <button type="button" className="text-status-red hover:underline" onClick={() => limpiar(false)}>Limpiar token</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Tipos de alerta que se envían por Telegram</Label>
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
            {tg?.last_test_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Última prueba: {fmtFechaHora(tg.last_test_at)}</span>}
            {tg?.last_success_at && <span className="inline-flex items-center gap-1 text-status-green"><CheckCircle2 className="h-3 w-3" /> Último envío: {fmtFechaHora(tg.last_success_at)}</span>}
            {tg?.last_error_at && <span className="inline-flex items-center gap-1 text-status-red"><XCircle className="h-3 w-3" /> Último error: {tg.last_error_message}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={guardar} disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Guardar configuración
            </Button>
            <Button variant="outline" onClick={probar} disabled={busy !== null}>
              {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Probar conexión
            </Button>
            <Button variant="outline" onClick={() => setManualOpen(true)} disabled={busy !== null}>
              <Send className="mr-1.5 h-4 w-4" /> Enviar aviso manual
            </Button>
            <Button variant="ghost" className="text-status-red" onClick={() => limpiar(true)} disabled={busy !== null}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Limpiar configuración
            </Button>
          </div>
        </div>
      </Panel>

      {/* ---- Canales preparados (inactivos) ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
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
        <DialogHeader><DialogTitle>Enviar aviso manual por Telegram</DialogTitle></DialogHeader>
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
