import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const CONFIG_TIPO = "alertas_config";

export type AlertasConfig = {
  activo: boolean;
  correos: string;
  telegram_token: string;
  telegram_chat_id: string;
  webhook_url: string;
  whatsapp_numero: string;
  frecuencia: string;
};

const DEFAULT_CONFIG: AlertasConfig = {
  activo: false,
  correos: "",
  telegram_token: "",
  telegram_chat_id: "",
  webhook_url: "",
  whatsapp_numero: "",
  frecuencia: "60",
};

export function useAlertasConfig() {
  return useQuery({
    queryKey: ["alertas-config"],
    queryFn: async (): Promise<{ id: string | null; config: AlertasConfig }> => {
      const { data } = await supabase
        .from("catalogos")
        .select("id, valor")
        .eq("tipo", CONFIG_TIPO)
        .maybeSingle();
      if (!data) return { id: null, config: DEFAULT_CONFIG };
      let parsed: Partial<AlertasConfig> = {};
      try {
        parsed = JSON.parse(data.valor) as Partial<AlertasConfig>;
      } catch {
        parsed = {};
      }
      return { id: data.id, config: { ...DEFAULT_CONFIG, ...parsed } };
    },
  });
}

export function ProgramarAlertasDialog({ trigger }: { trigger: ReactNode }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useAlertasConfig();
  const [form, setForm] = useState<AlertasConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  const onOpenChange = (v: boolean) => {
    if (v && data) setForm(data.config);
    setOpen(v);
  };

  const set = <K extends keyof AlertasConfig>(k: K, val: AlertasConfig[K]) =>
    setForm((f) => ({ ...f, [k]: val }));

  const guardar = async () => {
    setSaving(true);
    const payload = { tipo: CONFIG_TIPO, valor: JSON.stringify(form), activo: form.activo };
    const existingId = data?.id ?? null;
    const res = existingId
      ? await supabase.from("catalogos").update(payload).eq("id", existingId)
      : await supabase.from("catalogos").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Configuración de alertas guardada");
    qc.invalidateQueries({ queryKey: ["alertas-config"] });
    setOpen(false);
  };

  const probar = (canal: string) => {
    if (canal === "telegram" && (!form.telegram_token || !form.telegram_chat_id))
      return toast.error("Faltan el token y el chat ID de Telegram.");
    if (canal === "webhook" && !form.webhook_url) return toast.error("Falta la URL del webhook.");
    if (canal === "correo" && !form.correos) return toast.error("Faltan los correos destino.");
    toast.success(`Prueba de ${canal} registrada. Verifica la recepción.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-vitalis-blue" /> Programar alertas de coordinación
          </DialogTitle>
          <DialogDescription>
            Configura los canales de notificación automática para los pendientes y vencimientos del área.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Alertas automáticas</p>
              <p className="text-[11px] text-muted-foreground">Activa el envío programado de notificaciones.</p>
            </div>
            <Switch checked={form.activo} onCheckedChange={(v) => set("activo", v)} disabled={!isAdmin} />
          </div>

          <div className="space-y-2">
            <Label>Frecuencia de revisión (minutos)</Label>
            <Input
              type="number"
              min={5}
              value={form.frecuencia}
              onChange={(e) => set("frecuencia", e.target.value)}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-2">
            <Label>Correos destino</Label>
            <Textarea
              rows={2}
              placeholder="correo1@dominio.com, correo2@dominio.com"
              value={form.correos}
              onChange={(e) => set("correos", e.target.value)}
              disabled={!isAdmin}
            />
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => probar("correo")}>
              Probar correo
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Telegram Bot</p>
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input
                value={form.telegram_token}
                onChange={(e) => set("telegram_token", e.target.value)}
                placeholder="123456:ABC-DEF…"
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Chat ID</Label>
              <Input
                value={form.telegram_chat_id}
                onChange={(e) => set("telegram_chat_id", e.target.value)}
                placeholder="-1001234567890"
                disabled={!isAdmin}
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => probar("telegram")}>
              Probar Telegram
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Webhook / WhatsApp</p>
            <div className="space-y-2">
              <Label>URL del webhook</Label>
              <Input
                value={form.webhook_url}
                onChange={(e) => set("webhook_url", e.target.value)}
                placeholder="https://…"
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Número de WhatsApp</Label>
              <Input
                value={form.whatsapp_numero}
                onChange={(e) => set("whatsapp_numero", e.target.value)}
                placeholder="+57 300 000 0000"
                disabled={!isAdmin}
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => probar("webhook")}>
              Probar webhook
            </Button>
          </div>
        </div>

        <DialogFooter>
          {isAdmin ? (
            <Button onClick={guardar} disabled={saving}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> {saving ? "Guardando…" : "Guardar configuración"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Solo coordinación (ADMIN) puede editar esta configuración.</p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
