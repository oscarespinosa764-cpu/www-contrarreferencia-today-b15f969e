// ============================================================
// FASE 5 — Editor administrativo del Reporte General Operativo
// (Remisiones Activas). Se monta dentro del panel de Plantillas
// del sistema cuando la plantilla seleccionada es
// REPORTE_GENERAL_SALIENTES.
//
// - Escribe en plantillas_inventario.contenido_editable la forma
//   canónica (schema_version: 1) más un mirror de pie_leyenda
//   para que Entrega de Turno (que también lee esta plantilla)
//   no vea un cambio funcional inesperado.
// - No expone HTML libre ni claves arbitrarias: sólo indicadores
//   y columnas de la allowlist.
// - Invalida la caché runtime del generador tras guardar.
// - Reutiliza el sistema de versiones existente: para publicar
//   con historial completo el admin usa la pestaña "Versiones".
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
import { ArrowDown, ArrowUp, Info, RotateCcw } from "lucide-react";
import {
  ReporteGeneralSalientesConfigSchema,
  getReporteGeneralSalientesDefaults,
  INDICATOR_KEYS,
  INDICATOR_DEFAULT_LABELS,
  INDICATOR_MANDATORY,
  COLUMN_KEYS,
  COLUMN_DEFAULT_LABELS,
  COLUMN_MANDATORY,
  COLUMN_CLASIFICACION,
  invalidateReporteGeneralSalientesConfig,
  type IndicatorKey,
  type ColumnKey,
  type ReporteGeneralSalientesConfig,
} from "@/lib/reporte-general-salientes-config";

interface Props {
  plantillaId: string;
  contenidoActual: Record<string, unknown>;
  canEdit: boolean;
  onSaved: () => void;
}

type IndicatorRow = { key: IndicatorKey; label: string; visible: boolean; order: number };
type ColumnRow = {
  key: ColumnKey;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  alignment: "left" | "center" | "right";
};

function seedFrom(cfg: ReporteGeneralSalientesConfig): {
  indicators: IndicatorRow[];
  columns: ColumnRow[];
} {
  const iMap = new Map(cfg.summary.indicators.map((i) => [i.key, i] as const));
  const indicators = INDICATOR_KEYS.map((key, idx) => {
    const o = iMap.get(key);
    return {
      key,
      label: o?.label ?? INDICATOR_DEFAULT_LABELS[key],
      visible: INDICATOR_MANDATORY[key] ? true : (o?.visible ?? true),
      order: o?.order ?? idx,
    };
  }).sort((a, b) => a.order - b.order);

  const cMap = new Map(cfg.table.columns.map((c) => [c.key, c] as const));
  const columns = COLUMN_KEYS.map((key, idx) => {
    const o = cMap.get(key);
    return {
      key,
      label: o?.label ?? COLUMN_DEFAULT_LABELS[key],
      visible: COLUMN_MANDATORY[key] === true ? true : (o?.visible ?? true),
      order: o?.order ?? idx,
      width: o?.width,
      alignment: o?.alignment ?? ("left" as const),
    };
  }).sort((a, b) => a.order - b.order);

  return { indicators, columns };
}

export function ReporteGeneralSalientesEditor({
  plantillaId,
  contenidoActual,
  canEdit,
  onSaved,
}: Props) {
  const initialParsed = useMemo(() => {
    const parsed = ReporteGeneralSalientesConfigSchema.safeParse(contenidoActual);
    return parsed.success ? parsed.data : getReporteGeneralSalientesDefaults();
  }, [contenidoActual]);

  const [cfg, setCfg] = useState<ReporteGeneralSalientesConfig>(initialParsed);
  const [rows, setRows] = useState(() => seedFrom(initialParsed));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const markDirty = () => setDirty(true);

  // ────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────
  const setPage = (patch: Partial<ReporteGeneralSalientesConfig["page"]>) => {
    setCfg((c) => ({ ...c, page: { ...c.page, ...patch } }));
    markDirty();
  };
  const setHeader = (patch: Partial<ReporteGeneralSalientesConfig["header"]>) => {
    setCfg((c) => ({ ...c, header: { ...c.header, ...patch } }));
    markDirty();
  };
  const setFooter = (patch: Partial<ReporteGeneralSalientesConfig["footer"]>) => {
    setCfg((c) => ({ ...c, footer: { ...c.footer, ...patch } }));
    markDirty();
  };
  const setTable = (patch: Partial<ReporteGeneralSalientesConfig["table"]>) => {
    setCfg((c) => ({ ...c, table: { ...c.table, ...patch } }));
    markDirty();
  };

  const updateIndicator = (key: IndicatorKey, patch: Partial<IndicatorRow>) => {
    setRows((r) => ({ ...r, indicators: r.indicators.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
    markDirty();
  };
  const moveIndicator = (idx: number, dir: -1 | 1) => {
    setRows((r) => {
      const arr = [...r.indicators];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return r;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...r, indicators: arr.map((i, k) => ({ ...i, order: k })) };
    });
    markDirty();
  };

  const updateColumn = (key: ColumnKey, patch: Partial<ColumnRow>) => {
    setRows((r) => ({ ...r, columns: r.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
    markDirty();
  };
  const moveColumn = (idx: number, dir: -1 | 1) => {
    setRows((r) => {
      const arr = [...r.columns];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return r;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...r, columns: arr.map((c, k) => ({ ...c, order: k })) };
    });
    markDirty();
  };

  const restaurarDefaults = () => {
    if (!confirm("Restaurar todos los valores al diseño predeterminado. ¿Continuar?")) return;
    const d = getReporteGeneralSalientesDefaults();
    setCfg(d);
    setRows(seedFrom(d));
    markDirty();
  };

  // ────────────────────────────────────────────────────────────
  // Validación previa
  // ────────────────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    const visibleCols = rows.columns.filter((c) => c.visible);
    if (visibleCols.length === 0) errs.push("Debe haber al menos una columna visible.");
    for (const k of Object.keys(COLUMN_MANDATORY) as ColumnKey[]) {
      if (!COLUMN_MANDATORY[k]) continue;
      const c = rows.columns.find((x) => x.key === k);
      if (c && !c.visible) errs.push(`La columna obligatoria "${COLUMN_DEFAULT_LABELS[k]}" no puede ocultarse.`);
    }
    // Total obligatorio para indicadores
    const total = rows.indicators.find((i) => i.key === "total_activas");
    if (total && !total.visible) errs.push('El indicador "TOTAL REMISIONES ACTIVAS" es obligatorio.');
    // Ancho total dentro de límites razonables
    const totalWidth = visibleCols.reduce((s, c) => s + (c.width ?? 0), 0);
    // Para landscape legal: 355 - 16 = ~339 mm útiles; para portrait: 200 mm.
    const maxUsable = cfg.page.orientation === "landscape" ? 340 : 200;
    if (totalWidth > maxUsable) {
      errs.push(`La suma de anchos definidos (${totalWidth} mm) excede el área útil (${maxUsable} mm).`);
    }
    return errs;
  }, [rows, cfg.page.orientation]);

  const guardar = async () => {
    if (!canEdit) return;
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    setSaving(true);
    try {
      const nextConfig: ReporteGeneralSalientesConfig = {
        ...cfg,
        summary: {
          indicators: rows.indicators.map((i) => ({
            key: i.key,
            label: i.label,
            visible: i.visible,
            order: i.order,
          })),
        },
        table: {
          ...cfg.table,
          columns: rows.columns.map((c) => ({
            key: c.key,
            label: c.label,
            visible: c.visible,
            order: c.order,
            width: c.width,
            alignment: c.alignment,
          })),
        },
      };
      const validated = ReporteGeneralSalientesConfigSchema.parse(nextConfig);
      // Mirror de pie_leyenda para compatibilidad con Entrega de Turno.
      const payload = {
        ...validated,
        pie_leyenda: validated.footer.left_text,
      } as unknown as Record<string, unknown>;
      const { error } = await supabase
        .from("plantillas_inventario")
        .update({ contenido_editable: payload as never })
        .eq("id", plantillaId);
      if (error) throw error;
      invalidateReporteGeneralSalientesConfig();
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

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Editor administrativo del Reporte General Operativo</AlertTitle>
        <AlertDescription>
          Configura la presentación autorizada del documento. Las fórmulas, filtros y estados
          técnicos no son configurables. Para conservar historial completo, use "Versiones" para
          crear y publicar un borrador.
        </AlertDescription>
      </Alert>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Configuración inválida</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc text-xs">
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── PÁGINA ────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">1. Página</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Orientación</Label>
            <Select
              value={cfg.page.orientation}
              onValueChange={(v) => setPage({ orientation: v as "landscape" | "portrait" })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">Horizontal</SelectItem>
                <SelectItem value="portrait">Vertical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tamaño</Label>
            <Select
              value={cfg.page.page_size}
              onValueChange={(v) => setPage({ page_size: v as "legal" | "letter" | "a4" })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="letter">Carta</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField label="Fuente base (pt)" value={cfg.page.base_font_size} min={5} max={9} step={0.1} disabled={disabled} onChange={(v) => setPage({ base_font_size: v })} />
          <NumField label="Margen sup." value={cfg.page.margin_top} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_top: v })} />
          <NumField label="Margen der." value={cfg.page.margin_right} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_right: v })} />
          <NumField label="Margen inf." value={cfg.page.margin_bottom} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_bottom: v })} />
          <NumField label="Margen izq." value={cfg.page.margin_left} min={4} max={40} disabled={disabled} onChange={(v) => setPage({ margin_left: v })} />
        </div>
      </section>

      {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">2. Encabezado</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Institución" value={cfg.header.institution_name} maxLength={160} disabled={disabled} onChange={(v) => setHeader({ institution_name: v })} />
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <TextField label="Etiqueta ID" value={cfg.header.institution_identifier_label} maxLength={20} disabled={disabled} onChange={(v) => setHeader({ institution_identifier_label: v })} />
            <TextField label="Valor ID" value={cfg.header.institution_identifier_value} maxLength={40} disabled={disabled} onChange={(v) => setHeader({ institution_identifier_value: v })} />
          </div>
          <TextField label="Título" value={cfg.header.report_title} maxLength={120} disabled={disabled} onChange={(v) => setHeader({ report_title: v })} />
          <TextField label="Subtítulo" value={cfg.header.report_subtitle} maxLength={160} disabled={disabled} onChange={(v) => setHeader({ report_subtitle: v })} />
          <TextField label='Etiqueta "Generado por"' value={cfg.header.generated_by_label} maxLength={40} disabled={disabled} onChange={(v) => setHeader({ generated_by_label: v })} />
          <div>
            <Label className="text-xs">Alineación</Label>
            <Select value={cfg.header.alignment} onValueChange={(v) => setHeader({ alignment: v as "left" | "center" | "right" })} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Izquierda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Derecha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <SwitchField label="Mostrar logo institucional" checked={cfg.header.show_logo} disabled={disabled} onChange={(v) => setHeader({ show_logo: v })} />
          <SwitchField label='Mostrar "Generado por"' checked={cfg.header.show_generated_by} disabled={disabled} onChange={(v) => setHeader({ show_generated_by: v })} />
          <SwitchField label="Mostrar fecha de generación" checked={cfg.header.show_generated_at} disabled={disabled} onChange={(v) => setHeader({ show_generated_at: v })} />
        </div>
      </section>

      {/* ── INDICADORES ────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">3. Indicadores superiores</h3>
        <p className="text-[11px] text-muted-foreground">
          Etiquetas y visibilidad configurables. Fórmulas y estados no son editables.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Clave</th>
                <th className="p-2 text-left">Etiqueta</th>
                <th className="p-2 text-center">Visible</th>
                <th className="p-2 text-center">Orden</th>
              </tr>
            </thead>
            <tbody>
              {rows.indicators.map((i, idx) => {
                const mandatory = INDICATOR_MANDATORY[i.key];
                return (
                  <tr key={i.key} className="border-t border-border">
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{i.key}</td>
                    <td className="p-2">
                      <Input
                        className="h-7 text-xs"
                        value={i.label}
                        maxLength={80}
                        disabled={disabled}
                        onChange={(e) => updateIndicator(i.key, { label: e.target.value })}
                      />
                    </td>
                    <td className="p-2 text-center">
                      {mandatory ? (
                        <Badge variant="outline">Obligatorio</Badge>
                      ) : (
                        <Switch checked={i.visible} disabled={disabled} onCheckedChange={(v) => updateIndicator(i.key, { visible: v })} />
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled || idx === 0} onClick={() => moveIndicator(idx, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled || idx === rows.indicators.length - 1} onClick={() => moveIndicator(idx, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── COLUMNAS ───────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">4. Columnas de la tabla</h3>
        <p className="text-[11px] text-muted-foreground">
          Sólo columnas de la allowlist institucional. La fuente lógica del dato no es editable.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Clave</th>
                <th className="p-2 text-left">Etiqueta</th>
                <th className="p-2 text-left">Clasif.</th>
                <th className="p-2 text-center">Visible</th>
                <th className="p-2 text-center">Ancho (mm)</th>
                <th className="p-2 text-center">Alineación</th>
                <th className="p-2 text-center">Orden</th>
              </tr>
            </thead>
            <tbody>
              {rows.columns.map((c, idx) => {
                const mandatory = COLUMN_MANDATORY[c.key] === true;
                return (
                  <tr key={c.key} className="border-t border-border">
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{c.key}</td>
                    <td className="p-2">
                      <Input
                        className="h-7 text-xs"
                        value={c.label}
                        maxLength={80}
                        disabled={disabled}
                        onChange={(e) => updateColumn(c.key, { label: e.target.value })}
                      />
                    </td>
                    <td className="p-2 text-[10px] text-muted-foreground">{COLUMN_CLASIFICACION[c.key]}</td>
                    <td className="p-2 text-center">
                      {mandatory ? (
                        <Badge variant="outline" className="text-[10px]">Obligatoria</Badge>
                      ) : (
                        <Switch checked={c.visible} disabled={disabled} onCheckedChange={(v) => updateColumn(c.key, { visible: v })} />
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <Input
                        type="number"
                        className="h-7 w-20 text-xs"
                        value={c.width ?? ""}
                        min={4}
                        max={80}
                        step={1}
                        placeholder="auto"
                        disabled={disabled}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === "") return updateColumn(c.key, { width: undefined });
                          const n = Number(val);
                          if (!Number.isNaN(n)) updateColumn(c.key, { width: n });
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Select
                        value={c.alignment}
                        onValueChange={(v) => updateColumn(c.key, { alignment: v as "left" | "center" | "right" })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Izq.</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="right">Der.</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-center">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled || idx === 0} onClick={() => moveColumn(idx, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled || idx === rows.columns.length - 1} onClick={() => moveColumn(idx, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <SwitchField label="Repetir encabezado en cada página" checked={cfg.table.repeat_header} disabled={disabled} onChange={(v) => setTable({ repeat_header: v })} />
        </div>
      </section>

      {/* ── PIE ────────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">5. Pie de página</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Texto izquierdo" value={cfg.footer.left_text} maxLength={160} disabled={disabled} onChange={(v) => setFooter({ left_text: v })} />
          <TextField label='Etiqueta "Generado"' value={cfg.footer.generated_at_label} maxLength={40} disabled={disabled} onChange={(v) => setFooter({ generated_at_label: v })} />
          <TextField label="Nombre del sistema" value={cfg.footer.system_name} maxLength={80} disabled={disabled} onChange={(v) => setFooter({ system_name: v })} />
          <div>
            <Label className="text-xs">Alineación derecha</Label>
            <Select value={cfg.footer.alignment} onValueChange={(v) => setFooter({ alignment: v as "left" | "center" | "right" })} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Izquierda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Derecha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <SwitchField label="Número de página" checked={cfg.footer.show_page_number} disabled={disabled} onChange={(v) => setFooter({ show_page_number: v })} />
          <SwitchField label="Total de páginas" checked={cfg.footer.show_total_pages} disabled={disabled} onChange={(v) => setFooter({ show_total_pages: v })} />
          <SwitchField label="Fecha de generación" checked={cfg.footer.show_generated_at} disabled={disabled} onChange={(v) => setFooter({ show_generated_at: v })} />
          <SwitchField label="Nombre del sistema" checked={cfg.footer.show_system_name} disabled={disabled} onChange={(v) => setFooter({ show_system_name: v })} />
        </div>
      </section>

      {/* ── ACCIONES ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[11px] text-muted-foreground">
          Al guardar se invalida la caché runtime. La siguiente generación del reporte usará el nuevo
          diseño. Para historial y publicación con motivo, use la pestaña "Versiones".
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={restaurarDefaults} disabled={disabled}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar predeterminados
          </Button>
          <Button size="sm" onClick={guardar} disabled={disabled || !dirty || validationErrors.length > 0}>
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-componentes reutilizables
// ────────────────────────────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8 text-xs"
        value={value}
        maxLength={maxLength}
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
