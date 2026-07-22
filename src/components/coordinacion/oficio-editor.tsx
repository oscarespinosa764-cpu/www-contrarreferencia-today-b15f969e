// ============================================================
// FASE 9 — Editor único para los OFICIOS INSTITUCIONALES HTML
// (8 variantes: ACEP, NEG, CAN, AMP, ING, CRUE_ACEP, CRUE_NEG,
// CRUE_NR). Mismo esquema, mismo renderizador, misma UI.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Save } from "lucide-react";
import {
  ACCENT_COLORS,
  ACCENT_KEYS,
  ICON_KEYS,
  OFICIO_TIPO_A_CODIGO,
  OficioConfigSchema,
  codigoDocumentalPara,
  getOficioDefaults,
  invalidateOficioConfig,
  type AccentKey,
  type IconKey,
  type OficioConfig,
  type OficioTipo,
} from "@/lib/oficio-config";
import { buildOficioHTML } from "@/lib/oficio";
import { fixtureOficioMensaje, FIXTURE_CASO, AVISO_PREVIEW } from "@/lib/plantillas-preview-fixtures";

const TIPO_LABELS: Record<OficioTipo, string> = {
  ACEP: "Aceptación",
  NEG: "Negación",
  CAN: "Cancelación",
  AMP: "Ampliación",
  ING: "Ingreso",
  CRUE_ACEP: "CRUE — Aceptación",
  CRUE_NEG: "CRUE — Negación",
  CRUE_NR: "CRUE — No requerimiento",
};

const ICON_LABELS: Record<IconKey, string> = {
  CHECK: "✓  Aprobación",
  CROSS: "✕  Rechazo",
  PLUS: "+  Ampliación",
  INFO: "i  Informativo",
};

function tipoFromCodigo(codigo: string): OficioTipo {
  for (const [tipo, cod] of Object.entries(OFICIO_TIPO_A_CODIGO) as [OficioTipo, string][]) {
    if (cod === codigo) return tipo;
  }
  return "ACEP";
}

interface Props {
  plantillaId: string;
  codigo: string;
  contenidoActual: Record<string, unknown>;
  canEdit: boolean;
  onSaved: () => void;
}

export function OficioEditor({ plantillaId, codigo, contenidoActual, canEdit, onSaved }: Props) {
  const tipo = useMemo(() => tipoFromCodigo(codigo), [codigo]);

  // Estado inicial: parsea el contenido publicado con Zod; ante error usa defaults.
  const initial = useMemo<OficioConfig>(() => {
    const defaults = getOficioDefaults(tipo);
    const merged = {
      ...defaults,
      ...contenidoActual,
      institution: { ...defaults.institution, ...((contenidoActual.institution as object) ?? {}) },
      header: { ...defaults.header, ...((contenidoActual.header as object) ?? {}) },
      variant: { ...defaults.variant, ...((contenidoActual.variant as object) ?? {}) },
      body: { ...defaults.body, ...((contenidoActual.body as object) ?? {}) },
      notice: { ...defaults.notice, ...((contenidoActual.notice as object) ?? {}) },
      footer: { ...defaults.footer, ...((contenidoActual.footer as object) ?? {}) },
    };
    const parsed = OficioConfigSchema.safeParse(merged);
    return parsed.success ? parsed.data : defaults;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const [draft, setDraft] = useState<OficioConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setDirty(false);
  }, [initial]);

  const set = <K extends keyof OficioConfig>(section: K, value: Partial<OficioConfig[K]>) => {
    setDraft((d) => ({
      ...d,
      [section]: { ...(d[section] as object), ...(value as object) } as OficioConfig[K],
    }));
    setDirty(true);
  };

  const restaurar = () => {
    setDraft(getOficioDefaults(tipo));
    setDirty(true);
  };

  const guardar = async () => {
    if (!canEdit) return;
    const parsed = OficioConfigSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("La configuración tiene valores inválidos");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("plantillas_inventario")
        .update({ contenido_editable: parsed.data as never })
        .eq("id", plantillaId);
      if (error) throw error;
      invalidateOficioConfig(codigo);
      toast.success("Configuración del oficio guardada");
      setDirty(false);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // Vista previa (draft) — dato ficticio, nunca real.
  const previewHtml = useMemo(() => {
    const mensaje = fixtureOficioMensaje(tipo);
    try {
      return buildOficioHTML(tipo, FIXTURE_CASO.codigo, mensaje, draft);
    } catch {
      return buildOficioHTML(tipo, FIXTURE_CASO.codigo, mensaje);
    }
  }, [draft, tipo]);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Oficio institucional — variante {TIPO_LABELS[tipo]}</AlertTitle>
        <AlertDescription>
          Este editor administra únicamente la <strong>presentación</strong> del oficio (encabezado,
          título, ícono, color acentuado, cuerpo, aviso y pie). El mensaje real, el código de gestión
          y los datos del caso NO se modifican desde aquí — se toman del caso al momento de generarlo.
          {AVISO_PREVIEW}.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-5">
          {/* Institución */}
          <Section title="Institución">
            <Field label="Nombre corto">
              <Input
                value={draft.institution.short_name}
                disabled={!canEdit}
                maxLength={80}
                onChange={(e) => set("institution", { short_name: e.target.value })}
              />
            </Field>
            <Field label="Nombre completo">
              <Input
                value={draft.institution.long_name}
                disabled={!canEdit}
                maxLength={160}
                onChange={(e) => set("institution", { long_name: e.target.value })}
              />
            </Field>
            <Field label="Sede">
              <Input
                value={draft.institution.site_name}
                disabled={!canEdit}
                maxLength={160}
                onChange={(e) => set("institution", { site_name: e.target.value })}
              />
            </Field>
            <Field label="Oficina responsable">
              <Input
                value={draft.institution.office_name}
                disabled={!canEdit}
                maxLength={160}
                onChange={(e) => set("institution", { office_name: e.target.value })}
              />
            </Field>
            <Field label="Ciudad">
              <Input
                value={draft.institution.city_name}
                disabled={!canEdit}
                maxLength={160}
                onChange={(e) => set("institution", { city_name: e.target.value })}
              />
            </Field>
          </Section>

          {/* Encabezado */}
          <Section title="Encabezado">
            <ToggleRow
              label="Mostrar logo institucional"
              checked={draft.header.show_logo}
              disabled={!canEdit}
              onChange={(v) => set("header", { show_logo: v })}
            />
            <ToggleRow
              label="Mostrar mascota (CECI)"
              checked={draft.header.show_mascot}
              disabled={!canEdit}
              onChange={(v) => set("header", { show_mascot: v })}
            />
            <ToggleRow
              label="Mostrar textos de institución"
              checked={draft.header.institution_text_visible}
              disabled={!canEdit}
              onChange={(v) => set("header", { institution_text_visible: v })}
            />
            <ToggleRow
              label="Mostrar franja de oficina"
              checked={draft.header.office_strip_visible}
              disabled={!canEdit}
              onChange={(v) => set("header", { office_strip_visible: v })}
            />
            <Field label="Alineación del encabezado">
              <Select
                value={draft.header.alignment}
                disabled={!canEdit}
                onValueChange={(v) => set("header", { alignment: v as "left" | "center" | "right" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Izquierda</SelectItem>
                  <SelectItem value="center">Centrada</SelectItem>
                  <SelectItem value="right">Derecha</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>

          {/* Variante */}
          <Section title="Variante del oficio">
            <Field label="Título mostrado">
              <Input
                value={draft.variant.title}
                disabled={!canEdit}
                maxLength={120}
                onChange={(e) => set("variant", { title: e.target.value })}
              />
            </Field>
            <Field label="Ícono">
              <Select
                value={draft.variant.icon_key}
                disabled={!canEdit}
                onValueChange={(v) => set("variant", { icon_key: v as IconKey })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>{ICON_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Color acentuado">
              <Select
                value={draft.variant.accent_color}
                disabled={!canEdit}
                onValueChange={(v) => set("variant", { accent_color: v as AccentKey })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCENT_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border"
                          style={{ background: ACCENT_COLORS[k] }}
                        />
                        {k}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>
        </div>

        <div className="space-y-5">
          {/* Cuerpo */}
          <Section title="Cuerpo del mensaje">
            <Field label={`Tamaño de fuente (${draft.body.base_font_size} px)`}>
              <Input
                type="number"
                min={11}
                max={18}
                value={draft.body.base_font_size}
                disabled={!canEdit}
                onChange={(e) => set("body", { base_font_size: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Interlineado (${draft.body.line_height})`}>
              <Input
                type="number"
                min={1.2}
                max={2}
                step={0.05}
                value={draft.body.line_height}
                disabled={!canEdit}
                onChange={(e) => set("body", { line_height: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Espacio entre párrafos (${draft.body.paragraph_spacing} px)`}>
              <Input
                type="number"
                min={2}
                max={20}
                value={draft.body.paragraph_spacing}
                disabled={!canEdit}
                onChange={(e) => set("body", { paragraph_spacing: Number(e.target.value) })}
              />
            </Field>
            <Field label="Alineación del texto">
              <Select
                value={draft.body.text_alignment}
                disabled={!canEdit}
                onValueChange={(v) => set("body", { text_alignment: v as "left" | "center" | "right" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Izquierda</SelectItem>
                  <SelectItem value="center">Centrada</SelectItem>
                  <SelectItem value="right">Derecha</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ToggleRow
              label="Mostrar barra acentuada bajo el título"
              checked={draft.body.accent_visible}
              disabled={!canEdit}
              onChange={(v) => set("body", { accent_visible: v })}
            />
          </Section>

          {/* Aviso */}
          <Section title="Aviso legal (opcional)">
            <ToggleRow
              label="Mostrar bloque de aviso"
              checked={draft.notice.visible}
              disabled={!canEdit}
              onChange={(v) => set("notice", { visible: v })}
            />
            <Field label="Etiqueta">
              <Input
                value={draft.notice.label}
                disabled={!canEdit || !draft.notice.visible}
                maxLength={30}
                onChange={(e) => set("notice", { label: e.target.value })}
              />
            </Field>
            <Field label="Texto del aviso">
              <Textarea
                rows={2}
                value={draft.notice.text}
                disabled={!canEdit || !draft.notice.visible}
                maxLength={300}
                onChange={(e) => set("notice", { text: e.target.value })}
              />
            </Field>
          </Section>

          {/* Pie */}
          <Section title="Pie de página">
            <ToggleRow
              label="Mostrar pie de página"
              checked={draft.footer.visible}
              disabled={!canEdit}
              onChange={(v) => set("footer", { visible: v })}
            />
            <Field label="Texto de copyright">
              <Input
                value={draft.footer.copyright_text}
                disabled={!canEdit || !draft.footer.visible}
                maxLength={160}
                onChange={(e) => set("footer", { copyright_text: e.target.value })}
              />
            </Field>
            <ToggleRow
              label="Incluir ciudad"
              checked={draft.footer.show_city}
              disabled={!canEdit || !draft.footer.visible}
              onChange={(v) => set("footer", { show_city: v })}
            />
            <ToggleRow
              label="Incluir año actual"
              checked={draft.footer.show_year}
              disabled={!canEdit || !draft.footer.visible}
              onChange={(v) => set("footer", { show_year: v })}
            />
            <Field label="Alineación">
              <Select
                value={draft.footer.alignment}
                disabled={!canEdit || !draft.footer.visible}
                onValueChange={(v) => set("footer", { alignment: v as "left" | "center" | "right" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Izquierda</SelectItem>
                  <SelectItem value="center">Centrada</SelectItem>
                  <SelectItem value="right">Derecha</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Vista previa (datos ficticios)</Label>
        <iframe
          title={`Vista previa ${codigo}`}
          sandbox=""
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#f8fafc;padding:24px;font-family:'Segoe UI',Arial,sans-serif}</style></head><body>${previewHtml}</body></html>`}
          className="h-[560px] w-full rounded-lg border border-border bg-white"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={restaurar} disabled={!canEdit || busy}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Restaurar por defecto
        </Button>
        <Button type="button" onClick={guardar} disabled={!canEdit || !dirty || busy}>
          <Save className="mr-1.5 h-4 w-4" />
          {busy ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

// Compat: valida que se use únicamente en códigos autorizados.
export function isOficioEditorCode(codigo: string): boolean {
  return !!codigoDocumentalPara(tipoFromCodigo(codigo)) && codigoDocumentalPara(tipoFromCodigo(codigo)) === codigo;
}
