import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AutoComplete } from "@/components/rc/autocomplete";
import {
  Home,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Save,
  Phone,
  Stethoscope,
  Ambulance as AmbulanceIcon,
  ClipboardList,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  RED_TABS,
  TIPO_RED_LABEL,
  JORNADAS,
  TIPOS_APOYO,
  getTab,
  type RedRegistro,
  type TipoRed,
  type RelacionRed,
  type CodigoApoyo,
} from "@/lib/red-ips-utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: TipoRed;
  onTipoChange: (t: TipoRed) => void;
  editing: RedRegistro | null;
  especialidades: string[];
  ipsOptions: string[];
  onSubmit: (payload: Record<string, unknown>, id?: string) => Promise<boolean>;
}

type FormState = {
  estado: string;
  sede: string;
  ciudad: string;
  departamento: string;
  entidad: string;
  servicio_especialidad: string;
  telefono: string;
  correo: string;
  contacto_principal: string;
  direccion: string;
  observaciones: string;
  tipo_apoyo: string;
  fecha_inicio: string;
  fecha_final: string;
  jornada: string;
  horario: string;
  disponible_para_remisiones: boolean;
  novedad_disponibilidad: string;
  relaciones_red: RelacionRed[];
  codigos_apoyo: CodigoApoyo[];
};

const EMPTY: FormState = {
  estado: "activo",
  sede: "",
  ciudad: "",
  departamento: "",
  entidad: "",
  servicio_especialidad: "",
  telefono: "",
  correo: "",
  contacto_principal: "",
  direccion: "",
  observaciones: "",
  tipo_apoyo: "",
  fecha_inicio: "",
  fecha_final: "",
  jornada: "",
  horario: "",
  disponible_para_remisiones: false,
  novedad_disponibilidad: "",
  relaciones_red: [],
  codigos_apoyo: [],
};

function BlockTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-vitalis-blue text-xs font-bold text-white">
        {n}
      </span>
      <h3 className="text-sm font-bold text-foreground">{children}</h3>
    </div>
  );
}

export function RedFormDialog({
  open,
  onOpenChange,
  tipo,
  onTipoChange,
  editing,
  especialidades,
  ipsOptions,
  onSubmit,
}: Props) {
  const tab = getTab(tipo);
  const [f, setF] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setF({
        estado: editing.estado || "activo",
        sede: editing.sede || "",
        ciudad: editing.ciudad || "",
        departamento: editing.departamento || "",
        entidad: editing.entidad || "",
        servicio_especialidad: editing.servicio_especialidad || "",
        telefono: editing.telefono || editing.contacto || "",
        correo: editing.correo || "",
        contacto_principal: editing.contacto_principal || "",
        direccion: editing.direccion || "",
        observaciones: editing.observaciones || "",
        tipo_apoyo: editing.tipo_apoyo || "",
        fecha_inicio: editing.fecha_inicio || "",
        fecha_final: editing.fecha_final || "",
        jornada: editing.jornada || "",
        horario: editing.horario || "",
        disponible_para_remisiones: !!editing.disponible_para_remisiones,
        novedad_disponibilidad: editing.novedad_disponibilidad || "",
        relaciones_red: Array.isArray(editing.relaciones_red) ? editing.relaciones_red : [],
        codigos_apoyo: Array.isArray(editing.codigos_apoyo) ? editing.codigos_apoyo : [],
      });
    } else {
      setF(EMPTY);
    }
  }, [open, editing]);

  const inactivo = f.estado === "inactivo";
  // Si el registro está inactivo, no puede estar disponible para remisiones.
  const disponibleEff = inactivo ? false : f.disponible_para_remisiones;

  const resumen = useMemo(
    () => ({
      tipo: TIPO_RED_LABEL[tipo],
      estado: f.estado === "inactivo" ? "Inactivo" : "Activo",
      disponible: disponibleEff,
    }),
    [tipo, f.estado, disponibleEff],
  );

  const validar = (): string | null => {
    if (!f.entidad.trim())
      return tab.esEspecialista
        ? "Indica el nombre del médico / contacto"
        : tab.esAmbulancia
          ? "Indica el nombre de la empresa / entidad"
          : "Indica el nombre de la institución";
    if (!f.ciudad.trim()) return "Indica la ciudad / departamento";
    if (!f.telefono.trim() && !f.correo.trim()) return "Indica al menos teléfono o correo";
    if (tab.esEspecialista && !f.servicio_especialidad.trim())
      return "Indica la especialidad";
    if (tab.esAmbulancia && !f.tipo_apoyo.trim()) return "Indica el tipo de apoyo";
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) return toast.error(err);
    setBusy(true);
    const payload: Record<string, unknown> = {
      tipo_red: tipo,
      estado: f.estado,
      sede: f.sede.trim() || null,
      ciudad: f.ciudad.trim() || null,
      departamento: f.departamento.trim() || null,
      entidad: f.entidad.trim(),
      medico: tab.esEspecialista ? f.entidad.trim() : null,
      servicio_especialidad: f.servicio_especialidad.trim() || null,
      telefono: f.telefono.trim() || null,
      contacto: f.telefono.trim() || null,
      correo: f.correo.trim() || null,
      contacto_principal: f.contacto_principal.trim() || null,
      direccion: f.direccion.trim() || null,
      observaciones: f.observaciones.trim() || null,
      tipo_apoyo: tab.esAmbulancia ? f.tipo_apoyo.trim() || null : null,
      fecha_inicio: f.fecha_inicio || null,
      fecha_final: f.fecha_final || null,
      jornada: f.jornada || null,
      horario: f.horario.trim() || null,
      disponible_para_remisiones: disponibleEff,
      novedad_disponibilidad: f.novedad_disponibilidad.trim() || null,
      relaciones_red: f.relaciones_red,
      codigos_apoyo: f.codigos_apoyo,
    };
    const ok = await onSubmit(payload, editing?.id);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  // --- relaciones_red helpers ---
  const addRelacion = () =>
    set("relaciones_red", [...f.relaciones_red, { nombre: "" }]);
  const updRelacion = (i: number, patch: Partial<RelacionRed>) =>
    set(
      "relaciones_red",
      f.relaciones_red.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  const delRelacion = (i: number) =>
    set("relaciones_red", f.relaciones_red.filter((_, idx) => idx !== i));

  // --- codigos_apoyo helpers ---
  const addCodigo = () =>
    set("codigos_apoyo", [...f.codigos_apoyo, { entidad: "" }]);
  const updCodigo = (i: number, patch: Partial<CodigoApoyo>) =>
    set(
      "codigos_apoyo",
      f.codigos_apoyo.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  const delCodigo = (i: number) =>
    set("codigos_apoyo", f.codigos_apoyo.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
        {/* Encabezado */}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Home className="h-4 w-4 text-vitalis-blue" />
              <span className="font-semibold text-vitalis-blue">Red de instituciones</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>{editing ? "Editar registro" : "Nuevo registro"}</span>
            </p>
            <span className="rounded-full border border-vitalis-blue/30 bg-vitalis-blue/10 px-4 py-1 text-xs font-bold uppercase tracking-wide text-vitalis-blue">
              Ingreso de información
            </span>
          </div>
          {/* Pestañas de tipo */}
          <div className="mt-3 flex flex-wrap gap-2">
            {RED_TABS.map((t) => {
              const Icon = t.icon;
              const active = t.key === tipo;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTipoChange(t.key)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                    active
                      ? "border-vitalis-blue bg-vitalis-blue text-white"
                      : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[1fr_300px]">
          {/* Columna principal de bloques */}
          <div className="space-y-6">
            {/* Bloque 1 */}
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <BlockTitle n={1}>Información general</BlockTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tipo de registro</Label>
                  <Select value={tipo} onValueChange={(v) => onTipoChange(v as TipoRed)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RED_TABS.map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {TIPO_RED_LABEL[t.key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado del registro</Label>
                  <Select value={f.estado} onValueChange={(v) => set("estado", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sede / institución</Label>
                  <Input value={f.sede} onChange={(e) => set("sede", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ciudad / departamento</Label>
                  <Input
                    value={f.ciudad}
                    onChange={(e) => set("ciudad", e.target.value)}
                    placeholder="Florencia, Caquetá"
                  />
                </div>
              </div>
            </section>

            {/* Bloque 2 */}
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <BlockTitle n={2}>Datos del profesional o institución</BlockTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    {tab.esEspecialista
                      ? "Nombre del médico / contacto"
                      : tab.esAmbulancia
                        ? "Nombre de empresa / entidad"
                        : "Nombre de la institución"}
                  </Label>
                  <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
                </div>

                {tab.esEspecialista ? (
                  <AutoComplete
                    label="Especialidad"
                    value={f.servicio_especialidad}
                    onChange={(v) => set("servicio_especialidad", v)}
                    options={especialidades}
                    placeholder="Neurocirugía…"
                  />
                ) : tab.esAmbulancia ? (
                  <div className="space-y-1.5">
                    <Label>Tipo de apoyo</Label>
                    <Select value={f.tipo_apoyo} onValueChange={(v) => set("tipo_apoyo", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_APOYO.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Servicios</Label>
                    <Input
                      value={f.servicio_especialidad}
                      onChange={(e) => set("servicio_especialidad", e.target.value)}
                      placeholder="UCI Adultos, Hospitalización, Urgencias"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Teléfono / WhatsApp</Label>
                  <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Correo electrónico</Label>
                  <Input
                    type="email"
                    value={f.correo}
                    onChange={(e) => set("correo", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contacto principal</Label>
                  <Input
                    value={f.contacto_principal}
                    onChange={(e) => set("contacto_principal", e.target.value)}
                  />
                </div>
                {!tab.esEspecialista && (
                  <div className="space-y-1.5">
                    <Label>Dirección</Label>
                    <Input
                      value={f.direccion}
                      onChange={(e) => set("direccion", e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea
                    rows={2}
                    value={f.observaciones}
                    onChange={(e) => set("observaciones", e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Bloque 3 */}
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <BlockTitle n={3}>Disponibilidad y jornadas</BlockTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Fecha inicio</Label>
                  <Input
                    type="date"
                    value={f.fecha_inicio}
                    onChange={(e) => set("fecha_inicio", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha fin</Label>
                  <Input
                    type="date"
                    value={f.fecha_final}
                    onChange={(e) => set("fecha_final", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Jornada</Label>
                  <Select value={f.jornada} onValueChange={(v) => set("jornada", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {JORNADAS.map((j) => (
                        <SelectItem key={j} value={j}>
                          {j}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Horario</Label>
                  <Input
                    value={f.horario}
                    onChange={(e) => set("horario", e.target.value)}
                    placeholder="07:00 - 13:00"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <Switch
                  checked={disponibleEff}
                  disabled={inactivo}
                  onCheckedChange={(v) => set("disponible_para_remisiones", v)}
                />
                <span className="text-sm font-medium text-foreground">
                  Disponible para remisiones
                </span>
                {inactivo && (
                  <span className="text-[11px] text-muted-foreground">
                    (registro inactivo → no disponible)
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Novedades</Label>
                <Textarea
                  rows={2}
                  value={f.novedad_disponibilidad}
                  onChange={(e) => set("novedad_disponibilidad", e.target.value)}
                  placeholder="Disponible del 25 al 30 de junio. No agenda los jueves…"
                />
              </div>
            </section>

            {/* Bloque 4 */}
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between">
                <BlockTitle n={4}>Red externa / IPS aliadas</BlockTitle>
                <Button type="button" size="sm" variant="outline" onClick={addRelacion}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              {f.relaciones_red.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin instituciones relacionadas.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {f.relaciones_red.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">
                          Relación {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => delRelacion(i)}
                          className="text-status-red"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2">
                        <AutoComplete
                          value={r.nombre}
                          onChange={(v) => updRelacion(i, { nombre: v })}
                          options={ipsOptions}
                          placeholder="Nombre IPS aliada"
                        />
                        <Input
                          value={r.especialidad || ""}
                          onChange={(e) => updRelacion(i, { especialidad: e.target.value })}
                          placeholder="Especialidad / servicio"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={r.fechas || ""}
                            onChange={(e) => updRelacion(i, { fechas: e.target.value })}
                            placeholder="Fechas"
                          />
                          <Input
                            value={r.jornada || ""}
                            onChange={(e) => updRelacion(i, { jornada: e.target.value })}
                            placeholder="Jornada"
                          />
                        </div>
                        <Input
                          value={r.contacto || ""}
                          onChange={(e) => updRelacion(i, { contacto: e.target.value })}
                          placeholder="Contacto"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Bloque 5 */}
            <section className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between">
                <BlockTitle n={5}>Ambulancias y autorizaciones</BlockTitle>
                <Button type="button" size="sm" variant="outline" onClick={addCodigo}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              {f.codigos_apoyo.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin entidades de apoyo / códigos.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {f.codigos_apoyo.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">
                          Entidad {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => delCodigo(i)}
                          className="text-status-red"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2">
                        <Input
                          value={c.entidad}
                          onChange={(e) => updCodigo(i, { entidad: e.target.value })}
                          placeholder="Entidad"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1">
                            <Input
                              value={c.codigo_principal || ""}
                              onChange={(e) => updCodigo(i, { codigo_principal: e.target.value })}
                              placeholder="Código principal"
                            />
                            {c.codigo_principal && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(c.codigo_principal!);
                                  toast.success("Código copiado");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          <Input
                            value={c.codigo_alterno || ""}
                            onChange={(e) => updCodigo(i, { codigo_alterno: e.target.value })}
                            placeholder="Código alterno"
                          />
                        </div>
                        <Input
                          value={c.telefono || ""}
                          onChange={(e) => updCodigo(i, { telefono: e.target.value })}
                          placeholder="Teléfono"
                        />
                        <Input
                          value={c.observacion || ""}
                          onChange={(e) => updCodigo(i, { observacion: e.target.value })}
                          placeholder="Observación"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Panel lateral derecho */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <ClipboardList className="h-4 w-4 text-vitalis-blue" /> Resumen del registro
              </p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="text-right font-medium text-foreground">{resumen.tipo}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd className="text-right font-medium text-foreground">{resumen.estado}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Disponibilidad</dt>
                  <dd
                    className={`text-right font-medium ${
                      resumen.disponible ? "text-status-green" : "text-status-red"
                    }`}
                  >
                    {resumen.disponible ? "● Sí" : "● No"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <Phone className="h-4 w-4 text-vitalis-blue" /> Contactos rápidos
              </p>
              <div className="space-y-2 text-sm">
                <button
                  type="button"
                  onClick={() => onTipoChange("ips_nacional")}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2 text-left hover:bg-accent"
                >
                  <Home className="h-4 w-4 text-vitalis-blue" />
                  <span>
                    <span className="block font-medium text-foreground">IPS</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Instituciones receptoras
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onTipoChange("especialista_interno")}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2 text-left hover:bg-accent"
                >
                  <Stethoscope className="h-4 w-4 text-vitalis-blue" />
                  <span>
                    <span className="block font-medium text-foreground">Especialistas</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Directorio médico interno
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onTipoChange("ambulancia_autorizacion")}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2 text-left hover:bg-accent"
                >
                  <AmbulanceIcon className="h-4 w-4 text-vitalis-blue" />
                  <span>
                    <span className="block font-medium text-foreground">Ambulancias</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Autorizaciones y traslados
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <Info className="h-4 w-4 text-vitalis-blue" /> Ayuda / recomendaciones
              </p>
              <ul className="space-y-1.5 text-[12px] text-muted-foreground">
                <li>• Verifique correo y teléfono.</li>
                <li>• Registrar novedades del turno.</li>
                <li>• Actualizar fechas de disponibilidad.</li>
                <li>• Validar disponibilidad antes de comentar remisiones.</li>
              </ul>
            </div>
          </aside>
        </div>

        {/* Pie */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            Revise la información antes de guardar el registro.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={busy}>
              <Save className="mr-1.5 h-4 w-4" /> {busy ? "Guardando…" : "Guardar registro"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
