/**
 * Panel Telegram multi-destino en Control de Mando.
 * - Token vive solo en Cloud Secrets: nunca se muestra ni se pide en la UI.
 * - Todas las llamadas van por server functions (nunca a Telegram desde el navegador).
 * - Muestra chat_id enmascarado en tablas; el ID completo solo se ve al editar (admin).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  telegramStatus,
  telegramValidateBot,
  telegramDetectDestinations,
  telegramListDestinations,
  telegramSaveDestination,
  telegramToggleDestination,
  telegramDeleteDestination,
  telegramSendTest,
} from "@/lib/telegram.functions";
import { TIPOS_ALERTA, labelAlerta } from "@/lib/notifications-utils";
import { Panel } from "@/components/stat-card";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, RefreshCw, Send, Trash2, Pencil, CheckCircle2, XCircle, ScanSearch, ShieldCheck, Plus,
} from "lucide-react";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";

const PRIORIDADES = ["Crítico", "Alerta", "Informativo"] as const;
const MODULOS = [
  "entrantes", "salientes", "phd", "coordinacion", "red", "cuadro_turno",
  "auditoria", "control_mando", "otros",
] as const;

const CHAT_TYPE_LABEL: Record<string, string> = {
  private: "Privado", group: "Grupo", supergroup: "Supergrupo", channel: "Canal",
};

function mask(id: string | null | undefined): string {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}

interface Destino {
  id: string;
  display_name: string;
  destination_id: string;
  destination_label: string | null;
  chat_type: string | null;
  chat_title: string | null;
  description: string | null;
  enabled: boolean;
  silent: boolean;
  allowed_alert_types: string[];
  allowed_priorities: string[];
  allowed_modules: string[];
  link_url: string | null;
  config_status: string;
  last_test_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
}

export function TelegramMultiPanel() {
  const qc = useQueryClient();
  const status = useServerFn(telegramStatus);
  const validate = useServerFn(telegramValidateBot);
  const detect = useServerFn(telegramDetectDestinations);
  const list = useServerFn(telegramListDestinations);
  const toggle = useServerFn(telegramToggleDestination);
  const del = useServerFn(telegramDeleteDestination);
  const sendTest = useServerFn(telegramSendTest);

  const st = useQuery({ queryKey: ["tg-status"], queryFn: () => status() });
  const lst = useQuery({ queryKey: ["tg-destinos"], queryFn: () => list() });
  const destinos: Destino[] = ((lst.data?.ok ? lst.data.destinos : []) as Destino[]) ?? [];

  const [botInfo, setBotInfo] = useState<{ username?: string; id?: number } | null>(null);
  const [validating, setValidating] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [detected, setDetected] = useState<
    Array<{ chat_id: string; chat_type: string; chat_title: string | null; chat_username: string | null; last_date: string | null; ya_guardado?: boolean }>
  >([]);
  const [detecting, setDetecting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Destino> | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["tg-status"] });
    qc.invalidateQueries({ queryKey: ["tg-destinos"] });
    qc.invalidateQueries({ queryKey: ["notif-logs"] });
  };

  const doValidate = async () => {
    setValidating(true);
    try {
      const r = await validate();
      if (r.ok) {
        setBotInfo({ username: r.bot.username, id: r.bot.id });
        toast.success(`BOT CONECTADO CORRECTAMENTE${r.bot.username ? ` (@${r.bot.username})` : ""}`);
      } else {
        toast.error(r.error || "No se pudo validar el bot.");
      }
    } finally {
      setValidating(false);
    }
  };

  const doDetect = async () => {
    setDetecting(true);
    try {
      const r = await detect();
      if (!r.ok) {
        toast.error(r.error || "No se pudieron detectar destinos.");
        return;
      }
      setDetected(r.destinos);
      if (r.destinos.length === 0) {
        toast.message("Sin destinos detectados. Envíe un mensaje al bot y vuelva a intentarlo.");
      }
    } finally {
      setDetecting(false);
    }
  };

  const abrirDesdeDetectado = (d: (typeof detected)[number]) => {
    setEditing({
      display_name: d.chat_title || d.chat_username || `Chat ${d.chat_id}`,
      destination_id: d.chat_id,
      chat_type: d.chat_type,
      chat_title: d.chat_title || undefined,
      allowed_alert_types: [],
      allowed_priorities: [],
      allowed_modules: [],
      silent: false,
      enabled: true,
    });
    setDetectOpen(false);
    setEditOpen(true);
  };

  const abrirNuevo = () => {
    setEditing({
      display_name: "",
      destination_id: "",
      chat_type: "group",
      allowed_alert_types: [],
      allowed_priorities: [],
      allowed_modules: [],
      silent: false,
      enabled: true,
    });
    setEditOpen(true);
  };

  const abrirEditar = (d: Destino) => {
    setEditing({ ...d });
    setEditOpen(true);
  };

  const doTest = async (d: Destino) => {
    setTestingId(d.id);
    try {
      const r = await sendTest({ data: { id: d.id } });
      if (r.ok) toast.success(`Prueba enviada · msg ${r.message_id} · ${r.elapsed_ms} ms`);
      else toast.error(r.error || "Fallo en el envío de prueba.");
    } finally {
      setTestingId(null);
      refetch();
    }
  };

  const doToggle = async (d: Destino) => {
    const r = await toggle({ data: { id: d.id, enabled: !d.enabled } });
    if (r.ok) { toast.success(!d.enabled ? "Destino habilitado" : "Destino deshabilitado"); refetch(); }
    else toast.error(r.error || "No se pudo actualizar.");
  };

  const doDelete = async (d: Destino) => {
    if (!confirm(`¿Eliminar destino "${d.display_name}"?`)) return;
    const r = await del({ data: { id: d.id } });
    if (r.ok) { toast.success("Destino eliminado."); refetch(); }
    else toast.error(r.error || "No se pudo eliminar.");
  };

  const s = st.data;
  const tokenOk = s?.ok && s.token_configured;

  return (
    <Panel
      title="Telegram · Destinos y reglas de envío"
      action={
        <Button variant="ghost" size="sm" onClick={refetch}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Actualizar
        </Button>
      }
    >
      {/* Estado */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <EstadoTile
          label="TOKEN"
          value={tokenOk ? "CONFIGURADO" : "SIN CONFIGURAR"}
          ok={!!tokenOk}
          hint={tokenOk ? "Guardado en Cloud → Secrets." : "Registre TELEGRAM_BOT_TOKEN en Cloud → Secrets."}
        />
        <EstadoTile
          label="BOT"
          value={botInfo?.username ? `@${botInfo.username}` : "Sin validar"}
          ok={!!botInfo?.username}
          hint={botInfo?.id ? `ID ${botInfo.id}` : "Presione Validar bot."}
        />
        <EstadoTile
          label="DESTINOS ACTIVOS"
          value={`${s?.ok ? s.destinos_activos : 0} / ${s?.ok ? s.destinos_total : 0}`}
          ok={(s?.ok ? s.destinos_activos : 0) > 0}
          hint="Grupos, canales o chats habilitados."
        />
        <EstadoTile
          label="ENVÍO DESDE"
          value="Servidor"
          ok
          hint="Nunca se llama a Telegram desde el navegador."
        />
      </div>

      {/* Botones de acción */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={doValidate} disabled={!tokenOk || validating}>
          {validating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
          Validar bot
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDetectOpen(true)} disabled={!tokenOk}>
          <ScanSearch className="mr-1 h-4 w-4" /> Detectar destinos
        </Button>
        <Button size="sm" onClick={abrirNuevo} disabled={!tokenOk}>
          <Plus className="mr-1 h-4 w-4" /> Agregar destino manual
        </Button>
      </div>

      {/* Tabla destinos */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Chat ID</TableHead>
              <TableHead>Tipos permitidos</TableHead>
              <TableHead>Prioridades</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última prueba</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {destinos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground">
                  Sin destinos configurados. Use “Detectar destinos” o “Agregar destino manual”.
                </TableCell>
              </TableRow>
            ) : (
              destinos.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs font-medium">{d.display_name}</TableCell>
                  <TableCell className="text-xs">{CHAT_TYPE_LABEL[d.chat_type || ""] || d.chat_type || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{mask(d.destination_id)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-[11px]" title={(d.allowed_alert_types || []).map(labelAlerta).join(", ")}>
                    {(d.allowed_alert_types || []).length === 0 ? <em className="text-muted-foreground">Ninguno</em> : `${d.allowed_alert_types.length} tipo(s)`}
                  </TableCell>
                  <TableCell className="text-[11px]">
                    {(d.allowed_priorities || []).join(", ") || <em className="text-muted-foreground">Todas</em>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.enabled ? "default" : "outline"} className="text-[10px]">
                      {d.enabled ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {d.last_test_at ? fmtFechaHora(d.last_test_at) : "—"}
                    {d.last_error_message && (
                      <div className="text-[10px] text-status-red" title={d.last_error_message}>
                        <XCircle className="mr-0.5 inline h-3 w-3" /> Último error
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => doTest(d)} disabled={testingId === d.id || !d.enabled}>
                        {testingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => abrirEditar(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Switch checked={d.enabled} onCheckedChange={() => doToggle(d)} />
                      <Button size="sm" variant="ghost" onClick={() => doDelete(d)}>
                        <Trash2 className="h-3.5 w-3.5 text-status-red" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        El token del bot vive únicamente en Cloud → Secrets (<code>TELEGRAM_BOT_TOKEN</code>). Nunca se muestra
        ni se envía al navegador. Los envíos se hacen por el servidor mediante <code>sendMessage</code>.
      </p>

      {/* Diálogo: detectar destinos */}
      <Dialog open={detectOpen} onOpenChange={setDetectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detectar destinos de Telegram</DialogTitle>
            <DialogDescription>
              1. Agregue el bot al grupo o canal. 2. Envíe un mensaje dirigido al bot. 3. Presione “Detectar”.
            </DialogDescription>
          </DialogHeader>
          <div className="mb-3">
            <Button size="sm" onClick={doDetect} disabled={detecting}>
              {detecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
              Detectar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destino</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Chat ID</TableHead><TableHead>Último evento</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detected.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                      Sin destinos detectados aún.
                    </TableCell>
                  </TableRow>
                ) : detected.map((d) => (
                  <TableRow key={d.chat_id}>
                    <TableCell className="text-xs">{d.chat_title || d.chat_username || <em>Sin nombre</em>}</TableCell>
                    <TableCell className="text-xs">{CHAT_TYPE_LABEL[d.chat_type] || d.chat_type}</TableCell>
                    <TableCell className="font-mono text-xs">{mask(d.chat_id)}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {d.last_date ? fmtFechaHora(d.last_date) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.ya_guardado ? (
                        <Badge variant="outline" className="text-[10px]">Ya guardado</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => abrirDesdeDetectado(d)}>
                          Agregar como destino
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar/crear destino */}
      <EditDestinoDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        onSaved={() => { setEditOpen(false); setEditing(null); refetch(); }}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
function EstadoTile({ label, value, ok, hint }: { label: string; value: string; ok: boolean; hint: string }) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? "border-status-green/30 bg-status-green/5" : "border-status-amber/30 bg-status-amber/5"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-bold">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-status-green" /> : <XCircle className="h-3.5 w-3.5 text-status-amber" />}
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function EditDestinoDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Partial<Destino> | null;
  onSaved: () => void;
}) {
  const save = useServerFn(telegramSaveDestination);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Destino>>(editing ?? {});

  // Sync when editing changes
  useSyncOnOpen(open, editing, setForm);

  const doSave = async () => {
    if (!form.display_name?.trim() || !form.destination_id?.trim() || !form.chat_type) {
      toast.error("Nombre, chat_id y tipo son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const r = await save({
        data: {
          id: (form.id as string | undefined) || undefined,
          display_name: form.display_name.trim(),
          destination_id: String(form.destination_id).trim(),
          chat_type: form.chat_type as "private" | "group" | "supergroup" | "channel",
          chat_title: form.chat_title ?? null,
          destination_label: form.destination_label ?? null,
          description: form.description ?? null,
          allowed_alert_types: form.allowed_alert_types ?? [],
          allowed_priorities: form.allowed_priorities ?? [],
          allowed_modules: form.allowed_modules ?? [],
          schedule: {},
          silent: !!form.silent,
          link_url: form.link_url || null,
          enabled: form.enabled ?? true,
        },
      });
      if (r.ok) { toast.success("Destino guardado."); onSaved(); }
      else toast.error(r.error || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArr = (key: "allowed_alert_types" | "allowed_priorities" | "allowed_modules", value: string) => {
    setForm((prev) => {
      const arr = new Set<string>((prev[key] as string[]) ?? []);
      if (arr.has(value)) arr.delete(value); else arr.add(value);
      return { ...prev, [key]: Array.from(arr) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar destino" : "Nuevo destino"} Telegram</DialogTitle>
          <DialogDescription>
            Configure qué alertas, prioridades y módulos se enviarán a este destino. El token del bot no se solicita
            aquí: se lee de Cloud Secrets en el servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nombre visible</Label>
            <Input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div>
            <Label>Tipo de chat</Label>
            <Select value={(form.chat_type as string) || "group"} onValueChange={(v) => setForm({ ...form, chat_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Privado</SelectItem>
                <SelectItem value="group">Grupo</SelectItem>
                <SelectItem value="supergroup">Supergrupo</SelectItem>
                <SelectItem value="channel">Canal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input value={form.destination_id ?? ""} onChange={(e) => setForm({ ...form, destination_id: e.target.value })} placeholder="-1001234567890 o 123456789" />
          </div>
          <div>
            <Label>Título del chat (opcional)</Label>
            <Input value={form.chat_title ?? ""} onChange={(e) => setForm({ ...form, chat_title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descripción / uso</Label>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Grupo de Coordinación · alertas críticas de salientes" />
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1 block">Tipos de alerta permitidos</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border p-2 md:grid-cols-3">
              {TIPOS_ALERTA.map((t) => {
                const checked = (form.allowed_alert_types ?? []).includes(t.value);
                return (
                  <label key={t.value} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={checked} onCheckedChange={() => toggleArr("allowed_alert_types", t.value)} />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Prioridades</Label>
            <div className="flex flex-wrap gap-2">
              {PRIORIDADES.map((p) => {
                const checked = (form.allowed_priorities ?? []).includes(p);
                return (
                  <label key={p} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={checked} onCheckedChange={() => toggleArr("allowed_priorities", p)} />
                    {p}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Sin selección = todas.</p>
          </div>
          <div>
            <Label className="mb-1 block">Módulos</Label>
            <div className="grid grid-cols-2 gap-1">
              {MODULOS.map((m) => {
                const checked = (form.allowed_modules ?? []).includes(m);
                return (
                  <label key={m} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={checked} onCheckedChange={() => toggleArr("allowed_modules", m)} />
                    {m}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Sin selección = todos.</p>
          </div>

          <div>
            <Label>Enlace al aplicativo</Label>
            <Input value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://www.contrarreferencia.today" />
          </div>
          <div className="flex flex-col justify-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!form.silent} onCheckedChange={(v) => setForm({ ...form, silent: v })} />
              Envío silencioso (sin notificación sonora)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.enabled ?? true} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              Habilitado
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={doSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Sincroniza el form cada vez que se abre el diálogo con datos nuevos.
import { useEffect } from "react";
function useSyncOnOpen(open: boolean, editing: Partial<Destino> | null, setForm: (v: Partial<Destino>) => void) {
  useEffect(() => {
    if (open) setForm(editing ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
}
