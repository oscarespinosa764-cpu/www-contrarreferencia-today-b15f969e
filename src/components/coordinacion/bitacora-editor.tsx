// ============================================================
// FASE 8 — Editor administrativo de la "Bitácora operativa"
// (documento PDF "GESTIÓN DE REFERENCIA").
//
// Se monta dentro del panel de Plantillas del sistema cuando la
// plantilla seleccionada es BITACORA_ENTRANTES (código canónico
// compartido por Entrantes, Salientes, PHD/PAD/O2, Interna y
// Consolidada).
//
// - Escribe la forma canónica (schema_version: 1) en
//   plantillas_inventario.contenido_editable.
// - No expone HTML libre ni claves arbitrarias.
// - Invalida la caché runtime del generador tras guardar.
// - Los COMPONENTES PROTEGIDOS (paciente, caso, seguimientos,
//   estados, fechas, funcionarios y orden cronológico) NO son
//   editables; se marcan con badge.
// - Vista previa: descarga el PDF real (renderizador productivo)
//   con datos ficticios y marca "DEMOSTRACIÓN".
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Lock, RotateCcw, Eye, GripVertical } from "lucide-react";
import {
  BitacoraConfigSchema,
  getBitacoraDefaults,
  invalidateBitacoraConfig,
  normalizarColumnas,
  BITACORA_COLUMN_KEYS,
  type BitacoraConfig,
  type BitacoraColumnKey,
} from "@/lib/bitacora-config";
import { generarBitacoraConsolidadaPDF } from "@/lib/bitacora-pdf";

interface Props {
  plantillaId: string;
  contenidoActual: Record<string, unknown>;
  canEdit: boolean;
  onSaved: () => void;
}

const OBLIGATORIAS: BitacoraColumnKey[] = ["fecha", "observaciones", "funcionario"];

export function BitacoraEditor({ plantillaId, contenidoActual, canEdit, onSaved }: Props) {
  const initial = useMemo(() => {
    const p = BitacoraConfigSchema.safeParse(contenidoActual);
    const cfg = p.success ? p.data : getBitacoraDefaults();
    return { ...cfg, entries_table: { columns: normalizarColumnas(cfg) } };
  }, [contenidoActual]);

  const [cfg, setCfg] = useState<BitacoraConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const mark = () => setDirty(true);
  const setPage = (patch: Partial<BitacoraConfig["page"]>) => {
    setCfg((c) => ({ ...c, page: { ...c.page, ...patch } }));
    mark();
  };
  const setHeader = (patch: Partial<BitacoraConfig["header"]>) => {
    setCfg((c) => ({ ...c, header: { ...c.header, ...patch } }));
    mark();
  };
  const setPatient = (patch: Partial<BitacoraConfig["patient_section"]>) => {
    setCfg((c) => ({ ...c, patient_section: { ...c.patient_section, ...patch } }));
    mark();
  };
  const setCase = (patch: Partial<BitacoraConfig["case_section"]>) => {
    setCfg((c) => ({ ...c, case_section: { ...c.case_section, ...patch } }));
    mark();
  };
  const setTimeline = (patch: Partial<BitacoraConfig["timeline_section"]>) => {
    setCfg((c) => ({ ...c, timeline_section: { ...c.timeline_section, ...patch } }));
    mark();
  };
  const setFooter = (patch: Partial<BitacoraConfig["footer"]>) => {
    setCfg((c) => ({ ...c, footer: { ...c.footer, ...patch } }));
    mark();
  };
  const setColumn = (idx: number, patch: Partial<BitacoraConfig["entries_table"]["columns"][number]>) => {
    setCfg((c) => {
      const cols = c.entries_table.columns.slice();
      cols[idx] = { ...cols[idx], ...patch };
      return { ...c, entries_table: { columns: cols } };
    });
    mark();
  };
  const moveColumn = (idx: number, delta: number) => {
    setCfg((c) => {
      const cols = c.entries_table.columns.slice();
      const next = idx + delta;
      if (next < 0 || next >= cols.length) return c;
      [cols[idx], cols[next]] = [cols[next], cols[idx]];
      return { ...c, entries_table: { columns: cols } };
    });
    mark();
  };

  const restaurar = () => {
    if (!confirm("Restaurar valores predeterminados del documento. ¿Continuar?")) return;
    setCfg(getBitacoraDefaults());
    mark();
  };

  const guardar = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const normalizado = { ...cfg, entries_table: { columns: normalizarColumnas(cfg) } };
      const validated = BitacoraConfigSchema.parse(normalizado);
      const { error } = await supabase
        .from("plantillas_inventario")
        .update({ contenido_editable: validated as never })
        .eq("id", plantillaId);
      if (error) throw error;
      invalidateBitacoraConfig();
      toast.success("Configuración guardada. La próxima bitácora usará el nuevo diseño.");
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
      const ahora = new Date();
      await generarBitacoraConsolidadaPDF({
        referencia: "DEMOSTRACION",
        usuario: "USUARIO DE DEMOSTRACIÓN",
        configOverride: cfg,
        datosPaciente: [
          { label: "PACIENTE", value: "PACIENTE DE DEMOSTRACIÓN" },
          { label: "DOCUMENTO", value: "CC 00000000" },
          { label: "EAPB", value: "EAPB DE DEMOSTRACIÓN" },
          { label: "SEDE", value: "SEDE PRINCIPAL" },
        ],
        bloques: [
          {
            tipoDocumento: "CASO DE DEMOSTRACIÓN",
            datosReferencia: [
              { label: "TIPO", value: "REMISIÓN SALIENTE (DEMO)" },
              { label: "RADICADO", value: "DEMO-000001" },
              { label: "SERVICIO", value: "MEDICINA INTERNA" },
              { label: "IPS DESTINO", value: "IPS DE DEMOSTRACIÓN" },
            ],
            seguimientos: [
              {
                fecha: ahora.toLocaleString("es-CO"),
                entidad: "IPS DE DEMOSTRACIÓN",
                observaciones: "Registro de demostración. Este documento NO es oficial.",
                estado: "REMITIDO",
                accion: "LLAMADA",
                funcionario: "FUNCIONARIO DEMO",
                _orden: ahora.getTime(),
              },
              {
                fecha: new Date(ahora.getTime() - 3600000).toLocaleString("es-CO"),
                entidad: "COORDINACIÓN",
                observaciones: "Segundo registro de demostración con texto más largo para visualizar el ajuste de línea automático en la columna de observaciones.",
                estado: "EN GESTIÓN",
                accion: "SEGUIMIENTO",
                funcionario: "COORDINADOR DEMO",
                _orden: ahora.getTime() - 3600000,
              },
            ],
          },
        ],
      });
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
        <AlertTitle>Editor del documento: BITÁCORA OPERATIVA</AlertTitle>
        <AlertDescription>
          Configura la <strong>presentación autorizada</strong> del PDF "GESTIÓN DE REFERENCIA"
          usado por Entrantes, Salientes, PHD/PAD/O2, Referencia interna y bitácora consolidada
          por paciente. Los <strong>datos operativos</strong> (paciente, caso, seguimientos,
          estados, fechas, funcionarios y orden cronológico) son componentes protegidos y no
          pueden modificarse desde aquí. Para publicar con historial completo use la pestaña{" "}
          <em>Versiones</em>.
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
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">Carta</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField label="Fuente base (pt)" value={cfg.page.base_font_size} min={6} max={12} step={0.5} disabled={disabled} onChange={(v) => setPage({ base_font_size: v })} />
          <NumField label="Margen sup." value={cfg.page.margin_top} min={6} max={30} disabled={disabled} onChange={(v) => setPage({ margin_top: v })} />
          <NumField label="Margen der." value={cfg.page.margin_right} min={6} max={30} disabled={disabled} onChange={(v) => setPage({ margin_right: v })} />
          <NumField label="Margen inf." value={cfg.page.margin_bottom} min={6} max={30} disabled={disabled} onChange={(v) => setPage({ margin_bottom: v })} />
          <NumField label="Margen izq." value={cfg.page.margin_left} min={6} max={30} disabled={disabled} onChange={(v) => setPage({ margin_left: v })} />
        </div>
      </section>

      {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">2. Encabezado institucional</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Institución" value={cfg.header.institution_name} max={160} disabled={disabled} onChange={(v) => setHeader({ institution_name: v })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Etiqueta identificación" value={cfg.header.institution_identifier_label} max={20} disabled={disabled} onChange={(v) => setHeader({ institution_identifier_label: v })} />
            <TextField label="Valor identificación" value={cfg.header.institution_identifier_value} max={40} disabled={disabled} onChange={(v) => setHeader({ institution_identifier_value: v })} />
          </div>
          <TextField label="Título del reporte" value={cfg.header.report_title} max={80} disabled={disabled} onChange={(v) => setHeader({ report_title: v })} />
          <TextField label="Subtítulo (opcional)" value={cfg.header.report_subtitle} max={120} disabled={disabled} onChange={(v) => setHeader({ report_subtitle: v })} />
          <TextField label="Etiqueta fecha de impresión" value={cfg.header.generated_at_label} max={40} disabled={disabled} onChange={(v) => setHeader({ generated_at_label: v })} />
        </div>
        <div className="flex flex-wrap gap-6">
          <SwitchField label="Mostrar logo institucional" checked={cfg.header.show_logo} disabled={disabled} onChange={(v) => setHeader({ show_logo: v })} />
          <SwitchField label="Mostrar fecha de impresión" checked={cfg.header.show_generated_at} disabled={disabled} onChange={(v) => setHeader({ show_generated_at: v })} />
        </div>
      </section>

      {/* ── SECCIONES ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">3. Títulos de secciones</h3>
        <p className="text-[11px] text-muted-foreground">
          Los valores mostrados (paciente, caso, seguimientos) se toman del caso real. Aquí sólo
          se configuran los <strong>títulos</strong> de cada bloque y el mensaje cuando no hay
          seguimientos.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Datos del paciente" value={cfg.patient_section.title} max={60} disabled={disabled} onChange={(v) => setPatient({ title: v })} />
          <TextField label="Datos de referencia (caso)" value={cfg.case_section.title} max={60} disabled={disabled} onChange={(v) => setCase({ title: v })} />
          <TextField label="Seguimientos" value={cfg.timeline_section.title} max={80} disabled={disabled} onChange={(v) => setTimeline({ title: v })} />
          <TextField label="Mensaje cuando no hay seguimientos" value={cfg.timeline_section.empty_text} max={120} disabled={disabled} onChange={(v) => setTimeline({ empty_text: v })} />
        </div>
        <SwitchField label="Repetir encabezado de tabla en cada página" checked={cfg.timeline_section.repeat_header} disabled={disabled} onChange={(v) => setTimeline({ repeat_header: v })} />
      </section>

      {/* ── TABLA DE SEGUIMIENTOS ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">4. Columnas de la tabla de seguimientos</h3>
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Fecha, Observaciones y Funcionario: obligatorias</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Puede renombrar el encabezado, ajustar el ancho y la alineación, y ocultar columnas
          opcionales. El orden se define con las flechas. Las columnas obligatorias no pueden
          ocultarse por trazabilidad clínica.
        </p>
        <div className="space-y-2">
          {cfg.entries_table.columns.map((col, idx) => {
            const obligatoria = OBLIGATORIAS.includes(col.key);
            return (
              <div
                key={col.key}
                className="grid grid-cols-12 items-end gap-2 rounded-md border border-border bg-background/40 p-2"
              >
                <div className="col-span-1 flex items-center justify-center pb-2 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="col-span-3">
                  <Label className="text-[11px]">Clave</Label>
                  <div className="flex h-8 items-center gap-2 rounded-md bg-muted px-2 text-xs font-mono">
                    {col.key}
                    {obligatoria && <Lock className="h-3 w-3" />}
                  </div>
                </div>
                <div className="col-span-3">
                  <TextField
                    label="Encabezado"
                    value={col.label}
                    max={40}
                    disabled={disabled}
                    onChange={(v) => setColumn(idx, { label: v })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px]">Ancho (mm, vacío = auto)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={col.width ?? ""}
                    min={10}
                    max={120}
                    disabled={disabled}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") { setColumn(idx, { width: null }); return; }
                      const n = Number(raw);
                      if (!Number.isNaN(n) && n >= 10 && n <= 120) setColumn(idx, { width: n });
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px]">Alineación</Label>
                  <Select
                    value={col.alignment}
                    onValueChange={(v) => setColumn(idx, { alignment: v as "left" | "center" | "right" })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Izquierda</SelectItem>
                      <SelectItem value="center">Centro</SelectItem>
                      <SelectItem value="right">Derecha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex flex-col items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={disabled || idx === 0} onClick={() => moveColumn(idx, -1)} title="Subir">↑</Button>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={disabled || idx === cfg.entries_table.columns.length - 1} onClick={() => moveColumn(idx, 1)} title="Bajar">↓</Button>
                </div>
                <div className="col-span-12 flex justify-end">
                  <SwitchField
                    label={obligatoria ? "Visible (obligatoria)" : "Visible"}
                    checked={col.visible}
                    disabled={disabled || obligatoria}
                    onChange={(v) => setColumn(idx, { visible: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Claves disponibles: {BITACORA_COLUMN_KEYS.join(", ")}.
        </p>
      </section>

      {/* ── PIE ────────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">5. Pie de página</h3>
        <TextField label="Línea institucional" value={cfg.footer.institution_line} max={160} disabled={disabled} onChange={(v) => setFooter({ institution_line: v })} />
        <div className="flex flex-wrap gap-6">
          <SwitchField label="Mostrar usuario que imprime" checked={cfg.footer.show_generated_by} disabled={disabled} onChange={(v) => setFooter({ show_generated_by: v })} />
          <SwitchField label="Mostrar número de página" checked={cfg.footer.show_page_numbers} disabled={disabled} onChange={(v) => setFooter({ show_page_numbers: v })} />
        </div>
      </section>

      {/* ── ACCIONES ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={restaurar} disabled={disabled}>
          <RotateCcw className="mr-1 h-4 w-4" /> Restaurar valores predeterminados
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={previsualizar} disabled={previewing}>
            <Eye className="mr-1 h-4 w-4" />
            {previewing ? "Generando..." : "Vista previa (borrador)"}
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
