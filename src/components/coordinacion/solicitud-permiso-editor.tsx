// ============================================================
// FASE 7 — Editor administrativo del documento
// "SOLICITUD DE PERMISO O CAMBIO DE TURNO" (TH-FR-09).
//
// Montado dentro del panel de Plantillas del sistema cuando la
// plantilla seleccionada tiene código TH-FR-09.
//
// - Escribe la forma canónica (schema_version: 1) en
//   plantillas_inventario.contenido_editable.
// - Sólo etiquetas, textos, márgenes, tipografía y visibilidad
//   autorizadas por el esquema Zod. Sin HTML/CSS/JS libres.
// - Invalida la caché runtime del generador tras guardar.
// - COMPONENTES PROTEGIDOS (funcionario, documento, cargo, turno,
//   motivo, clasificación, fechas, horas, duración, saldo,
//   reemplazo, estado, aprobación, firma) NO editables aquí.
// - Vista previa: descarga el PDF real (renderizador productivo)
//   con una solicitud FICTICIA, sin efectos en el Cuadro de Turno.
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
import { Info, Lock, RotateCcw, Eye, Plus, Trash2 } from "lucide-react";
import {
  SolicitudPermisoConfigSchema,
  getSolicitudPermisoDefaults,
  invalidateSolicitudPermisoConfig,
  type SolicitudPermisoConfig,
} from "@/lib/solicitud-permiso-config";
import { generarSolicitudPDF } from "@/lib/solicitud-pdf";
import type { ShiftRequest } from "@/lib/cuadro-turno-utils";

interface Props {
  plantillaId: string;
  contenidoActual: Record<string, unknown>;
  canEdit: boolean;
  onSaved: () => void;
}

export function SolicitudPermisoEditor({
  plantillaId,
  contenidoActual,
  canEdit,
  onSaved,
}: Props) {
  const initial = useMemo(() => {
    const p = SolicitudPermisoConfigSchema.safeParse(contenidoActual);
    return p.success ? p.data : getSolicitudPermisoDefaults();
  }, [contenidoActual]);

  const [cfg, setCfg] = useState<SolicitudPermisoConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const mark = () => setDirty(true);
  const setPage = (patch: Partial<SolicitudPermisoConfig["page"]>) => {
    setCfg((c) => ({ ...c, page: { ...c.page, ...patch } })); mark();
  };
  const setHeader = (patch: Partial<SolicitudPermisoConfig["header"]>) => {
    setCfg((c) => ({ ...c, header: { ...c.header, ...patch } })); mark();
  };
  const setEmp = (patch: Partial<SolicitudPermisoConfig["employee_section"]>) => {
    setCfg((c) => ({ ...c, employee_section: { ...c.employee_section, ...patch } })); mark();
  };
  const setReq = (patch: Partial<SolicitudPermisoConfig["request_section"]>) => {
    setCfg((c) => ({ ...c, request_section: { ...c.request_section, ...patch } })); mark();
  };
  const setSch = (patch: Partial<SolicitudPermisoConfig["schedule_section"]>) => {
    setCfg((c) => ({ ...c, schedule_section: { ...c.schedule_section, ...patch } })); mark();
  };
  const setRep = (patch: Partial<SolicitudPermisoConfig["replacement_section"]>) => {
    setCfg((c) => ({ ...c, replacement_section: { ...c.replacement_section, ...patch } })); mark();
  };
  const setRec = (patch: Partial<SolicitudPermisoConfig["recovery_section"]>) => {
    setCfg((c) => ({ ...c, recovery_section: { ...c.recovery_section, ...patch } })); mark();
  };
  const setSig = (patch: Partial<SolicitudPermisoConfig["signatures_section"]>) => {
    setCfg((c) => ({ ...c, signatures_section: { ...c.signatures_section, ...patch } })); mark();
  };
  const setFooter = (patch: Partial<SolicitudPermisoConfig["footer"]>) => {
    setCfg((c) => ({ ...c, footer: { ...c.footer, ...patch } })); mark();
  };
  const setNota = (i: number, v: string) => {
    setCfg((c) => {
      const notas = [...c.declaration_section.notas];
      notas[i] = v;
      return { ...c, declaration_section: { ...c.declaration_section, notas } };
    });
    mark();
  };
  const addNota = () => {
    setCfg((c) => ({
      ...c,
      declaration_section: {
        ...c.declaration_section,
        notas: [...c.declaration_section.notas, "Nueva nota institucional"],
      },
    }));
    mark();
  };
  const delNota = (i: number) => {
    setCfg((c) => ({
      ...c,
      declaration_section: {
        ...c.declaration_section,
        notas: c.declaration_section.notas.filter((_, idx) => idx !== i),
      },
    }));
    mark();
  };

  const restaurar = () => {
    if (!confirm("Restaurar valores predeterminados del documento. ¿Continuar?")) return;
    setCfg(getSolicitudPermisoDefaults()); mark();
  };

  const guardar = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const validated = SolicitudPermisoConfigSchema.parse(cfg);
      const { error } = await supabase
        .from("plantillas_inventario")
        .update({ contenido_editable: validated as never })
        .eq("id", plantillaId);
      if (error) throw error;
      invalidateSolicitudPermisoConfig();
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
      const demo: ShiftRequest = {
        id: "00000000-0000-0000-0000-demostracion",
        created_at: new Date().toISOString(),
        request_type: "permiso",
        status: "APROBADA",
        requester_name: "COLABORADOR DE DEMOSTRACIÓN",
        requester_identification: "00000000",
        requester_role: "AUXILIAR DE ENFERMERÍA",
        requester_sede: "SEDE DEMOSTRACIÓN",
        reason_type: "Cita médica",
        reason_detail: "Control médico programado (dato ficticio para vista previa).",
        observations: "",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        start_time: "08:00",
        end_time: "12:00",
        will_recover_time: false,
        requires_replacement: true,
        paid: true,
        replacement_name: "REEMPLAZO DE DEMOSTRACIÓN",
        replacement_role: "AUXILIAR DE ENFERMERÍA",
        return_date: null,
        return_shift_code: null,
        return_person_name: null,
        original_shift_code: null,
        original_shift_date: null,
        requested_shift_code: null,
        requested_shift_date: null,
        swap_partner_name: null,
        requester_signature_hash: "DEMOSTRACION-HASH-NO-VALIDO",
      } as unknown as ShiftRequest;
      await generarSolicitudPDF(demo, {
        usuario: "USUARIO DEMOSTRACIÓN",
        configOverride: cfg,
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
        <AlertTitle>Editor del documento: SOLICITUD DE PERMISO / CAMBIO DE TURNO</AlertTitle>
        <AlertDescription>
          Configura la <strong>presentación autorizada</strong> del PDF TH-FR-09. Funcionario,
          documento, cargo, turno programado, motivo, clasificación recuperable/no recuperable,
          fechas, horas, duración, saldo, reemplazo, estado, aprobación y firma son{" "}
          <strong>componentes protegidos</strong> y provienen del Cuadro de Turno.
        </AlertDescription>
      </Alert>

      {/* 1. PÁGINA */}
      <Section title="1. Página">
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
      </Section>

      {/* 2. ENCABEZADO */}
      <Section title="2. Encabezado institucional">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Área / Proceso" value={cfg.header.institution_area} max={80} disabled={disabled} onChange={(v) => setHeader({ institution_area: v })} />
          <TextField label="Etiqueta “Formato”" value={cfg.header.format_label} max={30} disabled={disabled} onChange={(v) => setHeader({ format_label: v })} />
          <TextField label="Título del documento" value={cfg.header.document_title} max={160} disabled={disabled} onChange={(v) => setHeader({ document_title: v })} />
          <TextField label="Código visible" value={cfg.header.format_code_visible} max={30} disabled={disabled} onChange={(v) => setHeader({ format_code_visible: v })} />
          <TextField label="Etiqueta versión" value={cfg.header.version_label} max={30} disabled={disabled} onChange={(v) => setHeader({ version_label: v })} />
          <TextField label="Etiqueta aprobado" value={cfg.header.approval_label} max={40} disabled={disabled} onChange={(v) => setHeader({ approval_label: v })} />
        </div>
        <SwitchField label="Mostrar logo institucional" checked={cfg.header.show_logo} disabled={disabled} onChange={(v) => setHeader({ show_logo: v })} />
      </Section>

      {/* 3. FUNCIONARIO */}
      <Section title="3. Funcionario" locked="Valores del funcionario: protegidos (Cuadro de Turno)">
        <TextField label="Título de la banda" value={cfg.employee_section.band_title} max={60} disabled={disabled} onChange={(v) => setEmp({ band_title: v })} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta fecha de solicitud" value={cfg.employee_section.label_fecha_solicitud} max={40} disabled={disabled} onChange={(v) => setEmp({ label_fecha_solicitud: v })} />
          <TextField label="Etiqueta nombre" value={cfg.employee_section.label_nombre} max={40} disabled={disabled} onChange={(v) => setEmp({ label_nombre: v })} />
          <TextField label="Etiqueta identificación" value={cfg.employee_section.label_identificacion} max={40} disabled={disabled} onChange={(v) => setEmp({ label_identificacion: v })} />
          <TextField label="Etiqueta cargo" value={cfg.employee_section.label_cargo} max={20} disabled={disabled} onChange={(v) => setEmp({ label_cargo: v })} />
          <TextField label="Etiqueta sede" value={cfg.employee_section.label_sede} max={20} disabled={disabled} onChange={(v) => setEmp({ label_sede: v })} />
        </div>
      </Section>

      {/* 4. SOLICITUD (MOTIVO) */}
      <Section title="4. Solicitud · Motivo" locked="Motivo y clasificación: catálogo MOTIVO_PERMISO (protegido)">
        <TextField label="Título de la banda" value={cfg.request_section.band_title} max={60} disabled={disabled} onChange={(v) => setReq({ band_title: v })} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta “No recuperable”" value={cfg.request_section.label_no_recuperable} max={30} disabled={disabled} onChange={(v) => setReq({ label_no_recuperable: v })} />
          <TextField label="Etiqueta “Recuperable”" value={cfg.request_section.label_recuperable} max={30} disabled={disabled} onChange={(v) => setReq({ label_recuperable: v })} />
        </div>
      </Section>

      {/* 5. TURNO PROGRAMADO / DESCRIPCIÓN */}
      <Section title="5. Turno programado · Descripción del permiso" locked="Fechas, horas, duración, turno real: protegidos">
        <TextField label="Título de la banda" value={cfg.schedule_section.band_title} max={60} disabled={disabled} onChange={(v) => setSch({ band_title: v })} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Etiqueta turno original" value={cfg.schedule_section.label_turno_original} max={30} disabled={disabled} onChange={(v) => setSch({ label_turno_original: v })} />
          <TextField label="Etiqueta nuevo turno" value={cfg.schedule_section.label_turno_nuevo} max={30} disabled={disabled} onChange={(v) => setSch({ label_turno_nuevo: v })} />
          <TextField label="Etiqueta “cambia con”" value={cfg.schedule_section.label_cambia_con} max={30} disabled={disabled} onChange={(v) => setSch({ label_cambia_con: v })} />
          <TextField label="Etiqueta fecha inicial" value={cfg.schedule_section.label_fecha_inicial} max={30} disabled={disabled} onChange={(v) => setSch({ label_fecha_inicial: v })} />
          <TextField label="Etiqueta fecha final" value={cfg.schedule_section.label_fecha_final} max={30} disabled={disabled} onChange={(v) => setSch({ label_fecha_final: v })} />
          <TextField label="Etiqueta hora inicial" value={cfg.schedule_section.label_hora_inicial} max={20} disabled={disabled} onChange={(v) => setSch({ label_hora_inicial: v })} />
          <TextField label="Etiqueta hora final" value={cfg.schedule_section.label_hora_final} max={20} disabled={disabled} onChange={(v) => setSch({ label_hora_final: v })} />
          <TextField label="Etiqueta “será recuperado”" value={cfg.schedule_section.label_recuperado} max={40} disabled={disabled} onChange={(v) => setSch({ label_recuperado: v })} />
          <TextField label="Etiqueta “requiere reemplazo”" value={cfg.schedule_section.label_reemplazo} max={40} disabled={disabled} onChange={(v) => setSch({ label_reemplazo: v })} />
          <TextField label="Etiqueta “remunerado”" value={cfg.schedule_section.label_remunerado} max={30} disabled={disabled} onChange={(v) => setSch({ label_remunerado: v })} />
          <TextField label="Etiqueta detalle del motivo" value={cfg.schedule_section.label_motivo_detalle} max={60} disabled={disabled} onChange={(v) => setSch({ label_motivo_detalle: v })} />
        </div>
      </Section>

      {/* 6. REEMPLAZO */}
      <Section title="6. Reemplazo (cuando aplique)" locked="Identidad y disponibilidad del reemplazo: protegidas">
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Etiqueta nombre" value={cfg.replacement_section.label_nombre} max={30} disabled={disabled} onChange={(v) => setRep({ label_nombre: v })} />
          <TextField label="Etiqueta cargo" value={cfg.replacement_section.label_cargo} max={20} disabled={disabled} onChange={(v) => setRep({ label_cargo: v })} />
          <TextField label="Etiqueta firma" value={cfg.replacement_section.label_firma} max={20} disabled={disabled} onChange={(v) => setRep({ label_firma: v })} />
        </div>
      </Section>

      {/* 7. RECUPERACIÓN */}
      <Section title="7. Recuperación · Bitácora" locked="Cálculos y saldos: protegidos">
        <TextField label="Título de la banda" value={cfg.recovery_section.band_title} max={80} disabled={disabled} onChange={(v) => setRec({ band_title: v })} />
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Columna “Fecha”" value={cfg.recovery_section.col_fecha} max={20} disabled={disabled} onChange={(v) => setRec({ col_fecha: v })} />
          <TextField label="Columna “Horario”" value={cfg.recovery_section.col_horario} max={40} disabled={disabled} onChange={(v) => setRec({ col_horario: v })} />
          <TextField label="Columna “Verificado por”" value={cfg.recovery_section.col_verificado} max={30} disabled={disabled} onChange={(v) => setRec({ col_verificado: v })} />
        </div>
      </Section>

      {/* 8. FIRMAS (respuesta administrativa impresa) */}
      <Section title="8. Bloque de firmas" locked="Firma real y estado de aprobación: protegidos">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Firma del colaborador" value={cfg.signatures_section.label_colaborador} max={40} disabled={disabled} onChange={(v) => setSig({ label_colaborador: v })} />
          <TextField label="Vo. Bo. Jefe Inmediato" value={cfg.signatures_section.label_jefe} max={40} disabled={disabled} onChange={(v) => setSig({ label_jefe: v })} />
          <TextField label="Vo. Bo. Subgerencia" value={cfg.signatures_section.label_subgerencia} max={40} disabled={disabled} onChange={(v) => setSig({ label_subgerencia: v })} />
          <TextField label="Vo. Bo. Gerente" value={cfg.signatures_section.label_gerente} max={40} disabled={disabled} onChange={(v) => setSig({ label_gerente: v })} />
        </div>
      </Section>

      {/* 9. DECLARACIÓN / NOTAS */}
      <Section title="9. Declaración institucional (notas al pie)">
        <p className="text-[11px] text-muted-foreground">
          Texto plano institucional. No se permite HTML ni JavaScript.
        </p>
        <div className="space-y-2">
          {cfg.declaration_section.notas.map((n, i) => (
            <div key={i} className="flex items-start gap-2">
              <Textarea
                className="min-h-[46px] text-xs"
                value={n}
                maxLength={400}
                disabled={disabled}
                onChange={(e) => setNota(i, e.target.value)}
              />
              <Button variant="ghost" size="icon" onClick={() => delNota(i)} disabled={disabled}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addNota}
            disabled={disabled || cfg.declaration_section.notas.length >= 12}
          >
            <Plus className="mr-1 h-4 w-4" /> Agregar nota
          </Button>
        </div>
      </Section>

      {/* 10. PIE */}
      <Section title="10. Pie de página">
        <TextField label="Texto institucional" value={cfg.footer.left_text} max={160} disabled={disabled} onChange={(v) => setFooter({ left_text: v })} />
        <SwitchField label="Mostrar hash de verificación (cuando exista)" checked={cfg.footer.show_verification} disabled={disabled} onChange={(v) => setFooter({ show_verification: v })} />
      </Section>

      {/* ACCIONES */}
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
function Section({
  title,
  locked,
  children,
}: {
  title: string;
  locked?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {locked && (
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" /> {locked}
          </Badge>
        )}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label, value, onChange, disabled, max,
}: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; max?: number;
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
  label, value, min, max, step = 1, onChange, disabled,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; disabled?: boolean;
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
  label, checked, onChange, disabled,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}
