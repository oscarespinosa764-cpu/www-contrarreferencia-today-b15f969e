// ============================================================
// FASE 6 — Editor administrativo del documento
// "LISTA DE CHEQUEO CONFIRMADA · ENTREGA DOCUMENTAL FIRMADA".
//
// Se monta dentro del panel de Plantillas del sistema cuando la
// plantilla seleccionada es ENTREGA_FIRMA_QR.
//
// - Escribe la forma canónica (schema_version: 1) en
//   plantillas_inventario.contenido_editable.
// - No expone HTML libre ni claves arbitrarias: sólo etiquetas,
//   textos, márgenes y visibilidad autorizadas por el esquema.
// - Invalida la caché runtime del generador tras guardar.
// - Los COMPONENTES PROTEGIDOS (firma, código, hash, respuestas,
//   ítems, firmante) NO son editables; se marcan con badge.
// - Vista previa: descarga el PDF real (renderizador productivo)
//   con datos ficticios visibles y marcados como "DEMOSTRACIÓN".
// ============================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Lock, RotateCcw, Eye } from "lucide-react";
import {
  ListaChequeoConfirmadaConfigSchema,
  getListaChequeoConfirmadaDefaults,
  invalidateListaChequeoConfirmadaConfig,
  type ListaChequeoConfirmadaConfig,
} from "@/lib/lista-chequeo-confirmada-config";
import { descargarFirmadoPDF } from "@/lib/entrega-firma-pdf";

interface Props {
  plantillaId: string;
  contenidoActual: Record<string, unknown>;
  canEdit: boolean;
  onSaved: () => void;
}

export function ListaChequeoConfirmadaEditor({
  plantillaId,
  contenidoActual,
  canEdit,
  onSaved,
}: Props) {
  const initial = useMemo(() => {
    const p = ListaChequeoConfirmadaConfigSchema.safeParse(contenidoActual);
    return p.success ? p.data : getListaChequeoConfirmadaDefaults();
  }, [contenidoActual]);

  const [cfg, setCfg] = useState<ListaChequeoConfirmadaConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const mark = () => setDirty(true);
  const setPage = (patch: Partial<ListaChequeoConfirmadaConfig["page"]>) => {
    setCfg((c) => ({ ...c, page: { ...c.page, ...patch } }));
    mark();
  };
  const setHeader = (patch: Partial<ListaChequeoConfirmadaConfig["header"]>) => {
    setCfg((c) => ({ ...c, header: { ...c.header, ...patch } }));
    mark();
  };
  const setPatient = (patch: Partial<ListaChequeoConfirmadaConfig["patient_section"]>) => {
    setCfg((c) => ({ ...c, patient_section: { ...c.patient_section, ...patch } }));
    mark();
  };
  const setTable = (patch: Partial<ListaChequeoConfirmadaConfig["checklist_table"]>) => {
    setCfg((c) => ({ ...c, checklist_table: { ...c.checklist_table, ...patch } }));
    mark();
  };
  const setResp = (patch: Partial<ListaChequeoConfirmadaConfig["responsible_section"]>) => {
    setCfg((c) => ({ ...c, responsible_section: { ...c.responsible_section, ...patch } }));
    mark();
  };
  const setSigner = (patch: Partial<ListaChequeoConfirmadaConfig["signer_section"]>) => {
    setCfg((c) => ({ ...c, signer_section: { ...c.signer_section, ...patch } }));
    mark();
  };
  const setAccept = (patch: Partial<ListaChequeoConfirmadaConfig["acceptance_section"]>) => {
    setCfg((c) => ({ ...c, acceptance_section: { ...c.acceptance_section, ...patch } }));
    mark();
  };
  const setVerif = (patch: Partial<ListaChequeoConfirmadaConfig["verification_section"]>) => {
    setCfg((c) => ({ ...c, verification_section: { ...c.verification_section, ...patch } }));
    mark();
  };
  const setFooter = (patch: Partial<ListaChequeoConfirmadaConfig["footer"]>) => {
    setCfg((c) => ({ ...c, footer: { ...c.footer, ...patch } }));
    mark();
  };

  const restaurar = () => {
    if (!confirm("Restaurar valores predeterminados del documento. ¿Continuar?")) return;
    setCfg(getListaChequeoConfirmadaDefaults());
    mark();
  };

  const guardar = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const validated = ListaChequeoConfirmadaConfigSchema.parse(cfg);
      const { error } = await supabase
        .from("plantillas_inventario")
        .update({ contenido_editable: validated as never })
        .eq("id", plantillaId);
      if (error) throw error;
      invalidateListaChequeoConfirmadaConfig();
      toast.success("Configuración guardada. La próxima generación usará el nuevo diseño.");
      setDirty(false);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar la configuración.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const previsualizar = async () => {
    setPreviewing(true);
    try {
      // Datos ficticios claramente marcados; NO se guardan, NO se firma real.
      await descargarFirmadoPDF(
        {
          paciente: "PACIENTE DE DEMOSTRACIÓN",
          documento: "00000000",
          tipo_documento: "CC",
          ips_receptora: "IPS RECEPTORA DE DEMOSTRACIÓN",
          empresa_traslado: "AMBULANCIAS DE DEMOSTRACIÓN",
          fecha_entrega: new Date().toLocaleString("es-CO"),
          cie10: "Z00.0",
          entidad_pago: "EAPB DE DEMOSTRACIÓN",
          origen: "EPS",
          responsable_checklist: "RESPONSABLE DE DEMOSTRACIÓN",
          cargo_responsable: "COORDINADOR/A",
          documentos: [
            { label: "HISTORIA CLÍNICA", marcado: true, grupo: "DOCUMENTOS CLÍNICOS" },
            { label: "PARACLÍNICOS", marcado: true, grupo: "DOCUMENTOS CLÍNICOS" },
            { label: "ORDEN MÉDICA", marcado: false, grupo: "DOCUMENTOS ADMINISTRATIVOS" },
            { label: "AUTORIZACIÓN EAPB", marcado: true, grupo: "DOCUMENTOS ADMINISTRATIVOS" },
          ],
        },
        {
          nombre: "FIRMANTE DE DEMOSTRACIÓN",
          cargo: "AUXILIAR DE AMBULANCIA",
          empresa: "AMBULANCIAS DE DEMOSTRACIÓN",
          documento: "00000000",
          telefono: "3000000000",
          firma_data: "",
          firmado_at: new Date().toISOString(),
          codigo_verificacion: "DEMO-000000",
          pdf_hash: "DEMOSTRACION-HASH-NO-VALIDO",
        },
        cfg, // ← borrador; NO afecta producción.
      );
      toast.success("Vista previa generada (documento NO oficial).");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al generar la vista previa.";
      toast.error(msg);
    } finally {
      setPreviewing(false);
    }
  };

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Editor del documento: LISTA DE CHEQUEO CONFIRMADA</AlertTitle>
        <AlertDescription>
          Configura la <strong>presentación autorizada</strong> del PDF firmado por QR. Los
          ítems, respuestas, firma, firmante, código de verificación, hash y evidencia son
          <strong> componentes protegidos</strong> y no pueden modificarse desde aquí. Para
          publicar con historial completo use la pestaña <em>Versiones</em>.
        </AlertDescription>
      </Alert>

      {/* ── PÁGINA ────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">1. Página</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Orientación</Label>
            <Select
              value={cfg.page.orientation}
              onValueChange={(v) => setPage({ orientation: v as "portrait" | "landscape" })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Vertical</SelectItem>
                <SelectItem value="landscape">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tamaño</Label>
            <Select
              value={cfg.page.page_size}
              onValueChange={(v) => setPage({ page_size: v as "letter" | "legal" | "a4" })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letter">Carta</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField label="Fuente base (pt)" value={cfg.page.base_font_size} min={6} max={12} step={0.5} disabled={disabled} onChange={(v) => setPage({ base_font_size: v })} />
          <NumField label="Margen sup." value={cfg.page.margin_top} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_top: v })} />
          <NumField label="Margen der." value={cfg.page.margin_right} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_right: v })} />
          <NumField label="Margen inf." value={cfg.page.margin_bottom} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_bottom: v })} />
          <NumField label="Margen izq." value={cfg.page.margin_left} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_left: v })} />
        </div>
      </section>

      {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">2. Encabezado institucional</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Institución" value={cfg.header.institution_name} max={160} disabled={disabled} onChange={(v) => setHeader({ institution_name: v })} />
          <TextField label="Área / Proceso" value={cfg.header.document_area} max={80} disabled={disabled} onChange={(v) => setHeader({ document_area: v })} />
          <TextField label="Código de formato (visible)" value={cfg.header.format_code_label} max={30} disabled={disabled} onChange={(v) => setHeader({ format_code_label: v })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Etiqueta versión" value={cfg.header.version_label} max={20} disabled={disabled} onChange={(v) => setHeader({ version_label: v })} />
            <TextField label="Valor versión" value={cfg.header.version_value} max={10} disabled={disabled} onChange={(v) => setHeader({ version_value: v })} />
          </div>
          <TextField label="Etiqueta aprobado" value={cfg.header.approval_label} max={20} disabled={disabled} onChange={(v) => setHeader({ approval_label: v })} />
          <TextField label="Título del documento" value={cfg.header.document_title} max={160} disabled={disabled} onChange={(v) => setHeader({ document_title: v })} />
          <TextField label="Subtítulo (opcional)" value={cfg.header.document_subtitle} max={160} disabled={disabled} onChange={(v) => setHeader({ document_subtitle: v })} />
        </div>
        <SwitchField label="Mostrar logo institucional" checked={cfg.header.show_logo} disabled={disabled} onChange={(v) => setHeader({ show_logo: v })} />
      </section>

      {/* ── DATOS DEL PACIENTE ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">3. Datos del paciente</h3>
        <p className="text-[11px] text-muted-foreground">
          Sólo etiquetas configurables. Los valores provienen del caso real.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta FECHA" value={cfg.patient_section.label_fecha} max={40} disabled={disabled} onChange={(v) => setPatient({ label_fecha: v })} />
          <TextField label="Etiqueta EAPB" value={cfg.patient_section.label_eapb} max={40} disabled={disabled} onChange={(v) => setPatient({ label_eapb: v })} />
          <TextField label="Etiqueta NOMBRES" value={cfg.patient_section.label_nombres} max={60} disabled={disabled} onChange={(v) => setPatient({ label_nombres: v })} />
          <TextField label="Etiqueta TIPO DOC" value={cfg.patient_section.label_tipo_documento} max={40} disabled={disabled} onChange={(v) => setPatient({ label_tipo_documento: v })} />
          <TextField label="Etiqueta No. DOC" value={cfg.patient_section.label_no_documento} max={40} disabled={disabled} onChange={(v) => setPatient({ label_no_documento: v })} />
          <TextField label="Etiqueta CIE-10" value={cfg.patient_section.label_cie10} max={40} disabled={disabled} onChange={(v) => setPatient({ label_cie10: v })} />
          <TextField label="Etiqueta ORIGEN" value={cfg.patient_section.label_origen} max={40} disabled={disabled} onChange={(v) => setPatient({ label_origen: v })} />
        </div>
        <SwitchField label="Mostrar ORIGEN (opcional)" checked={cfg.patient_section.show_origen} disabled={disabled} onChange={(v) => setPatient({ show_origen: v })} />
      </section>

      {/* ── TABLA DE DOCUMENTOS ────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">4. Tabla de documentos (Lista de chequeo)</h3>
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Ítems y respuestas: protegidos</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Los ítems y respuestas C/NC/NA se obtienen del checklist real ejecutado. Aquí sólo se
          configuran el texto introductorio, encabezados y etiquetas de columna.
        </p>
        <TextField label="Texto introductorio" value={cfg.checklist_table.intro_text} max={240} disabled={disabled} onChange={(v) => setTable({ intro_text: v })} />
        <div className="grid gap-3 md:grid-cols-4">
          <TextField label='Columna "N°"' value={cfg.checklist_table.col_numero} max={10} disabled={disabled} onChange={(v) => setTable({ col_numero: v })} />
          <TextField label='Columna "Detalle"' value={cfg.checklist_table.col_detalle} max={30} disabled={disabled} onChange={(v) => setTable({ col_detalle: v })} />
          <TextField label='Columna "Referencia"' value={cfg.checklist_table.col_referencia} max={30} disabled={disabled} onChange={(v) => setTable({ col_referencia: v })} />
          <TextField label='Columna "Personal traslado"' value={cfg.checklist_table.col_personal} max={40} disabled={disabled} onChange={(v) => setTable({ col_personal: v })} />
          <TextField label='Etiqueta "C"' value={cfg.checklist_table.label_c} max={4} disabled={disabled} onChange={(v) => setTable({ label_c: v })} />
          <TextField label='Etiqueta "NC"' value={cfg.checklist_table.label_nc} max={4} disabled={disabled} onChange={(v) => setTable({ label_nc: v })} />
          <TextField label='Etiqueta "NA"' value={cfg.checklist_table.label_na} max={4} disabled={disabled} onChange={(v) => setTable({ label_na: v })} />
        </div>
      </section>

      {/* ── RESPONSABLE ────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">5. Responsable de la verificación</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta nombre" value={cfg.responsible_section.label_nombre} max={60} disabled={disabled} onChange={(v) => setResp({ label_nombre: v })} />
          <TextField label="Etiqueta cargo" value={cfg.responsible_section.label_cargo} max={40} disabled={disabled} onChange={(v) => setResp({ label_cargo: v })} />
          <TextField label="Etiqueta hora" value={cfg.responsible_section.label_hora} max={60} disabled={disabled} onChange={(v) => setResp({ label_hora: v })} />
          <TextField label="Etiqueta observaciones" value={cfg.responsible_section.label_observaciones} max={40} disabled={disabled} onChange={(v) => setResp({ label_observaciones: v })} />
        </div>
      </section>

      {/* ── FIRMANTE Y FIRMA ───────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">6. Firmante y firma</h3>
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Firma real: protegida</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          La identidad del firmante, la imagen de la firma y la fecha/hora real se toman del
          proceso de firma por QR. Aquí sólo se configuran etiquetas visibles.
        </p>
        <TextField label="Título del bloque" value={cfg.signer_section.title} max={80} disabled={disabled} onChange={(v) => setSigner({ title: v })} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta nombre" value={cfg.signer_section.label_nombre} max={40} disabled={disabled} onChange={(v) => setSigner({ label_nombre: v })} />
          <TextField label="Etiqueta cargo" value={cfg.signer_section.label_cargo} max={40} disabled={disabled} onChange={(v) => setSigner({ label_cargo: v })} />
          <TextField label="Etiqueta documento" value={cfg.signer_section.label_documento} max={40} disabled={disabled} onChange={(v) => setSigner({ label_documento: v })} />
          <TextField label="Etiqueta teléfono" value={cfg.signer_section.label_telefono} max={40} disabled={disabled} onChange={(v) => setSigner({ label_telefono: v })} />
          <TextField label="Etiqueta empresa" value={cfg.signer_section.label_empresa} max={40} disabled={disabled} onChange={(v) => setSigner({ label_empresa: v })} />
          <TextField label="Etiqueta fecha/hora firma" value={cfg.signer_section.label_fecha_firma} max={40} disabled={disabled} onChange={(v) => setSigner({ label_fecha_firma: v })} />
        </div>
      </section>

      {/* ── ACEPTACIÓN ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">7. Aceptación de recibido</h3>
        <TextField label="Título" value={cfg.acceptance_section.title} max={60} disabled={disabled} onChange={(v) => setAccept({ title: v })} />
        <div>
          <Label className="text-xs">Texto de la declaración</Label>
          <Textarea
            className="min-h-[80px] text-xs"
            value={cfg.acceptance_section.text}
            maxLength={600}
            disabled={disabled}
            onChange={(e) => setAccept({ text: e.target.value })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            No se permite HTML ni JavaScript. Sólo texto plano institucional.
          </p>
        </div>
      </section>

      {/* ── VERIFICACIÓN ───────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">8. Verificación (código y hash)</h3>
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Valores: protegidos</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          El código de verificación y el hash de evidencia se generan y almacenan en el backend.
          Aquí sólo se configuran las etiquetas y si el hash abreviado se muestra en el PDF.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label='Etiqueta "Firma"' value={cfg.verification_section.label_firma} max={20} disabled={disabled} onChange={(v) => setVerif({ label_firma: v })} />
          <TextField label="Etiqueta código" value={cfg.verification_section.label_codigo} max={60} disabled={disabled} onChange={(v) => setVerif({ label_codigo: v })} />
          <TextField label="Etiqueta hash" value={cfg.verification_section.label_hash} max={60} disabled={disabled} onChange={(v) => setVerif({ label_hash: v })} />
        </div>
        <SwitchField label="Mostrar hash abreviado en el PDF" checked={cfg.verification_section.show_hash} disabled={disabled} onChange={(v) => setVerif({ show_hash: v })} />
      </section>

      {/* ── PIE ────────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">9. Pie de página</h3>
        <TextField label="Texto institucional" value={cfg.footer.left_text} max={160} disabled={disabled} onChange={(v) => setFooter({ left_text: v })} />
        <SwitchField label="Mostrar fecha de generación" checked={cfg.footer.show_generated_at} disabled={disabled} onChange={(v) => setFooter({ show_generated_at: v })} />
      </section>

      {/* ── ACCIONES ───────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
        <div className="text-xs text-muted-foreground">
          {dirty ? "Cambios sin guardar." : "Sin cambios pendientes."}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={restaurar} disabled={disabled}>
            <RotateCcw className="mr-1 h-4 w-4" /> Restaurar predeterminado
          </Button>
          <Button variant="outline" size="sm" onClick={previsualizar} disabled={previewing}>
            <Eye className="mr-1 h-4 w-4" /> {previewing ? "Generando..." : "Vista previa (no oficial)"}
          </Button>
          <Button size="sm" onClick={guardar} disabled={disabled || !dirty}>
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  disabled,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  max?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8 text-xs"
        value={value}
        maxLength={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="h-8 text-xs"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </div>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}
