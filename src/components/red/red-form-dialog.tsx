import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AutoComplete } from "@/components/rc/autocomplete";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  JORNADAS,
  ESTADOS_JORNADA,
  TIPOS_AMBULANCIA,
  TIPOS_EAPB,
  TIPOS_LINEA,
  COBERTURAS,
  CATEGORIAS_RECURSO,
  TIPOS_RECURSO,
  getGrupo,
  grupoDeTipo,
  type RedRegistro,
  type TipoRed,
  type RedGrupo,
} from "@/lib/red-ips-utils";


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grupo: RedGrupo;
  editing: RedRegistro | null;
  especialidades: string[];
  ipsOptions: string[];
  /** Subtipo preseleccionado (según la pestaña interna activa). */
  presetTipo?: TipoRed;
  onSubmit: (payload: Record<string, unknown>, id?: string) => Promise<boolean>;
}


type FormState = {
  tipo_red: TipoRed;
  estado: string;
  ambito: string; // caqueta | nacional
  entidad: string;
  nit: string;
  servicio_especialidad: string;
  medico: string;
  sede: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  telefono: string;
  correo: string;
  contacto_principal: string;
  cargo_contacto: string;
  eapb_aseguradoras: string;
  tipo_ambulancia: string;
  tipo_apoyo: string;
  cups: string;
  codigo_principal: string; // extensión (directorio interno)
  cups_descripcion: string;
  recorrido: string;
  empresa_tep: string;
  jornada: string;
  horario: string;
  fecha_inicio: string;
  fecha_final: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  disponible_para_remisiones: boolean;
  observaciones: string;
  // Directorios externos e interno CEDIM (campos aditivos)
  telefonos_alternos: string;
  correos_alternos: string;
  indicativo: string;
  cobertura: string;
  opcion_menu: string;
  tipo_recurso: string;
  descripcion: string;
  categoria: string;
  subcategoria: string; // nombre del recurso
  link: string; // url del recurso
  orden_visualizacion: string;
};


const EMPTY: FormState = {
  tipo_red: "ips_departamental",
  estado: "activo",
  ambito: "caqueta",
  entidad: "",
  nit: "",
  servicio_especialidad: "",
  medico: "",
  sede: "",
  ciudad: "",
  departamento: "",
  direccion: "",
  telefono: "",
  correo: "",
  contacto_principal: "",
  cargo_contacto: "",
  eapb_aseguradoras: "",
  tipo_ambulancia: "",
  tipo_apoyo: "",
  cups: "",
  codigo_principal: "",
  cups_descripcion: "",
  recorrido: "",
  empresa_tep: "",
  jornada: "",
  horario: "",
  fecha_inicio: "",
  fecha_final: "",
  vigencia_desde: "",
  vigencia_hasta: "",
  disponible_para_remisiones: true,
  observaciones: "",
  telefonos_alternos: "",
  correos_alternos: "",
  indicativo: "",
  cobertura: "",
  opcion_menu: "",
  tipo_recurso: "",
  descripcion: "",
  categoria: "",
  subcategoria: "",
  link: "",
  orden_visualizacion: "",
};


function defaultTipo(grupo: RedGrupo): TipoRed {
  switch (grupo) {
    case "jornadas_tep":
      return "jornada_especialidad";
    case "ips":
      return "ips_departamental";
    case "ambulancias":
      return "ambulancia_autorizacion";
    case "especialidades_cedim":
      return "especialista_interno";
    case "directorios_externos":
      return "eapb_eps";
    case "directorio_interno":
      return "directorio_contacto";
  }
}

// Detección de credenciales para bloquear recursos de referencia inseguros.
const PATRONES_CRED = [
  "contraseña", "contrasena", "password", "clave", "token", "api key", "apikey",
  "api_key", "service_role", "secret", "credencial",
];
function contieneCredencial(f: { descripcion: string; observaciones: string; subcategoria: string }): boolean {
  const hay = `${f.descripcion} ${f.observaciones} ${f.subcategoria}`.toLowerCase();
  return PATRONES_CRED.some((p) => hay.includes(p));
}


export function RedFormDialog({
  open,
  onOpenChange,
  grupo,
  editing,
  especialidades,
  ipsOptions,
  presetTipo,
  onSubmit,
}: Props) {
  const cfg = getGrupo(grupo);
  const [f, setF] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setF({
        tipo_red: (editing.tipo_red as TipoRed) || defaultTipo(grupo),
        estado: editing.estado || "activo",
        ambito: editing.ambito || (grupoDeTipo(editing.tipo_red) === "ips" ? "caqueta" : "caqueta"),
        entidad: editing.entidad || "",
        nit: editing.nit || "",
        servicio_especialidad: editing.servicio_especialidad || "",
        medico: editing.medico || "",
        sede: editing.sede || "",
        ciudad: editing.ciudad || "",
        departamento: editing.departamento || "",
        direccion: editing.direccion || "",
        telefono: editing.telefono || editing.contacto || "",
        correo: editing.correo || "",
        contacto_principal: editing.contacto_principal || "",
        cargo_contacto: editing.cargo_contacto || "",
        eapb_aseguradoras: editing.eapb_aseguradoras || "",
        tipo_ambulancia: editing.tipo_ambulancia || "",
        tipo_apoyo: editing.tipo_apoyo || "",
        cups: editing.cups || "",
        codigo_principal: editing.codigo_principal || "",
        cups_descripcion: editing.cups_descripcion || "",
        recorrido: editing.recorrido || "",
        empresa_tep: editing.empresa_tep || "",
        jornada: editing.jornada || "",
        horario: editing.horario || "",
        fecha_inicio: editing.fecha_inicio || "",
        fecha_final: editing.fecha_final || "",
        vigencia_desde: editing.vigencia_desde || "",
        vigencia_hasta: editing.vigencia_hasta || "",
        disponible_para_remisiones: editing.disponible_para_remisiones ?? true,
        observaciones: editing.observaciones || "",
        telefonos_alternos: editing.telefonos_alternos || "",
        correos_alternos: editing.correos_alternos || "",
        indicativo: editing.indicativo || "",
        cobertura: editing.cobertura || "",
        opcion_menu: editing.opcion_menu || "",
        tipo_recurso: editing.tipo_recurso || "",
        descripcion: editing.descripcion || "",
        categoria: editing.categoria || "",
        subcategoria: editing.subcategoria || "",
        link: editing.link || "",
        orden_visualizacion:
          editing.orden_visualizacion != null ? String(editing.orden_visualizacion) : "",
      });
    } else {
      setF({ ...EMPTY, tipo_red: presetTipo ?? defaultTipo(grupo) });
    }

  }, [open, editing, grupo, presetTipo]);

  const inactivo = f.estado === "inactivo";
  const disponibleEff = inactivo ? false : f.disponible_para_remisiones;

  // ¿Qué subtipo aplica según el grupo?
  const esTEP = f.tipo_red === "codigo_tep";
  const esJornada = f.tipo_red === "jornada_especialidad";
  const esEspecialidad = grupo === "especialidades_cedim";
  const esAmbulancia = grupo === "ambulancias";
  const esIps = grupo === "ips";
  const esDirectorio = grupo === "directorio_interno";
  const esRef = f.tipo_red === "directorio_referencia";
  const esSede = f.tipo_red === "sede";
  const esContacto = f.tipo_red === "directorio_contacto";
  // Directorios externos
  const esExterno = grupo === "directorios_externos";
  const esEapb = f.tipo_red === "eapb_eps";
  const esCrue = f.tipo_red === "crue";
  const esLinea = f.tipo_red === "linea_emergencia";
  const esRecurso = f.tipo_red === "recurso_referencia";

  const validar = (): string | null => {
    if (grupo === "jornadas_tep") {
      if (esTEP) {
        if (!f.empresa_tep.trim()) return "Indica la empresa TEP";
        if (!f.tipo_ambulancia) return "Indica el tipo de ambulancia";
      } else {
        if (!f.servicio_especialidad.trim()) return "Indica la especialidad";
        if (!f.entidad.trim()) return "Indica la IPS de la jornada";
      }
      return null;
    }
    if (esExterno) {
      if (esRecurso) {
        if (!f.subcategoria.trim()) return "Indica el nombre del recurso";
        if (contieneCredencial(f)) return "No se permiten credenciales en recursos de referencia";
        return null;
      }
      if (!f.entidad.trim()) return "Indica el nombre de la entidad";
      return null;
    }
    if (esDirectorio) {
      if (esRef && !f.entidad.trim()) return "Indica el nombre de la institución";
      if (esSede && !f.entidad.trim()) return "Indica el nombre de la sede";
      if (esContacto && !f.entidad.trim()) return "Indica la dependencia / área";
      return null;
    }
    if (!f.entidad.trim())
      return esEspecialidad ? "Indica el profesional / especialidad" : "Indica el nombre";
    if (esEspecialidad && !f.servicio_especialidad.trim()) return "Indica la especialidad";
    if (esAmbulancia && !f.tipo_ambulancia) return "Indica el tipo de ambulancia";
    if (!esEspecialidad && !f.ciudad.trim()) return "Indica la ciudad / municipio";
    return null;
  };


  const guardar = async () => {
    const err = validar();
    if (err) return toast.error(err);
    setBusy(true);
    // Ajuste de tipo_red según ámbito para IPS
    let tipoRed = f.tipo_red;
    if (esIps) tipoRed = f.ambito === "nacional" ? "ips_nacional" : "ips_departamental";
    const payload: Record<string, unknown> = {
      tipo_red: tipoRed,
      estado: f.estado,
      ambito: cfg.tieneAmbito ? f.ambito : null,
      entidad:
        (esEspecialidad ? f.medico || f.entidad : f.entidad).trim() || null,
      nit: f.nit.trim() || null,
      servicio_especialidad: f.servicio_especialidad.trim() || null,
      medico: esEspecialidad ? (f.medico || f.entidad).trim() || null : f.medico.trim() || null,
      sede: f.sede.trim() || null,
      ciudad: f.ciudad.trim() || null,
      departamento: f.departamento.trim() || null,
      direccion: f.direccion.trim() || null,
      telefono: f.telefono.trim() || null,
      contacto: f.telefono.trim() || null,
      correo: f.correo.trim() || null,
      contacto_principal: f.contacto_principal.trim() || null,
      cargo_contacto: f.cargo_contacto.trim() || null,
      eapb_aseguradoras: f.eapb_aseguradoras.trim() || null,
      tipo_ambulancia: f.tipo_ambulancia || null,
      tipo_apoyo: f.tipo_apoyo.trim() || null,
      cups: f.cups.trim() || null,
      codigo_principal: f.codigo_principal.trim() || null,
      cups_descripcion: f.cups_descripcion.trim() || null,
      recorrido: f.recorrido.trim() || null,
      empresa_tep: f.empresa_tep.trim() || null,
      jornada: f.jornada || null,
      horario: f.horario.trim() || null,
      fecha_inicio: f.fecha_inicio || null,
      fecha_final: f.fecha_final || null,
      vigencia_desde: f.vigencia_desde || null,
      vigencia_hasta: f.vigencia_hasta || null,
      disponible_para_remisiones: disponibleEff,
      observaciones: f.observaciones.trim() || null,
      // Directorios externos e interno CEDIM
      telefonos_alternos: f.telefonos_alternos.trim() || null,
      correos_alternos: f.correos_alternos.trim() || null,
      indicativo: f.indicativo.trim() || null,
      cobertura: f.cobertura.trim() || null,
      opcion_menu: f.opcion_menu.trim() || null,
      tipo_recurso: f.tipo_recurso.trim() || null,
      descripcion: f.descripcion.trim() || null,
      categoria: f.categoria.trim() || null,
      subcategoria: f.subcategoria.trim() || null,
      link: f.link.trim() || null,
      orden_visualizacion: f.orden_visualizacion.trim()
        ? Number(f.orden_visualizacion.replace(/[^0-9-]/g, "")) || null
        : null,
    };

    const ok = await onSubmit(payload, editing?.id);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar" : "Nuevo"} · {cfg.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de subtipo para JORNADAS / CÓDIGOS TEP */}
          {grupo === "jornadas_tep" && (
            <div className="space-y-1.5">
              <Label>Tipo de registro</Label>
              <Select value={f.tipo_red} onValueChange={(v) => set("tipo_red", v as TipoRed)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jornada_especialidad">
                    Jornada de especialidad / IPS
                  </SelectItem>
                  <SelectItem value="codigo_tep">Código TEP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selector de subtipo para DIRECTORIO INTERNO */}
          {esDirectorio && (
            <div className="space-y-1.5">
              <Label>Tipo de registro</Label>
              <Select value={f.tipo_red} onValueChange={(v) => set("tipo_red", v as TipoRed)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="directorio_referencia">
                    Datos generales de referencia
                  </SelectItem>
                  <SelectItem value="sede">Sede CEDIM IPS</SelectItem>
                  <SelectItem value="directorio_contacto">
                    Directorio telefónico / correo institucional
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selector de subtipo para DIRECTORIOS EXTERNOS */}
          {esExterno && (
            <div className="space-y-1.5">
              <Label>Tipo de registro</Label>
              <Select value={f.tipo_red} onValueChange={(v) => set("tipo_red", v as TipoRed)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eapb_eps">EAPB / EPS</SelectItem>
                  <SelectItem value="crue">CRUE</SelectItem>
                  <SelectItem value="linea_emergencia">Línea de emergencia</SelectItem>
                  <SelectItem value="recurso_referencia">Recurso de referencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}



          {/* Estado + ámbito */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={f.estado} onValueChange={(v) => set("estado", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {esJornada ? (
                    ESTADOS_JORNADA.map((e) => (
                      <SelectItem key={e} value={e.toLowerCase()}>
                        {e}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            {cfg.tieneAmbito && (
              <div className="space-y-1.5">
                <Label>Ámbito</Label>
                <Select value={f.ambito} onValueChange={(v) => set("ambito", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caqueta">Departamental — Caquetá</SelectItem>
                    <SelectItem value="nacional">Nacional — fuera del Caquetá</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ====== JORNADAS / CÓDIGOS TEP ====== */}
          {grupo === "jornadas_tep" && esTEP && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Empresa TEP</Label>
                <Input value={f.empresa_tep} onChange={(e) => set("empresa_tep", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de ambulancia</Label>
                <Select value={f.tipo_ambulancia} onValueChange={(v) => set("tipo_ambulancia", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_AMBULANCIA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Recorrido / cobertura</Label>
                <Input value={f.recorrido} onChange={(e) => set("recorrido", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Código CUPS</Label>
                <Input value={f.cups} onChange={(e) => set("cups", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción del CUPS</Label>
                <Input
                  value={f.cups_descripcion}
                  onChange={(e) => set("cups_descripcion", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>EAPB / aseguradora</Label>
                <Input
                  value={f.eapb_aseguradoras}
                  onChange={(e) => set("eapb_aseguradoras", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <div className="space-y-1.5">
                  <Label>Vigencia desde</Label>
                  <Input
                    type="date"
                    value={f.vigencia_desde}
                    onChange={(e) => set("vigencia_desde", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Vigencia hasta</Label>
                  <Input
                    type="date"
                    value={f.vigencia_hasta}
                    onChange={(e) => set("vigencia_hasta", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {grupo === "jornadas_tep" && esJornada && (
            <div className="grid gap-3 sm:grid-cols-2">
              <AutoComplete
                label="Especialidad"
                value={f.servicio_especialidad}
                onChange={(v) => set("servicio_especialidad", v)}
                options={especialidades}
                placeholder="Neurocirugía…"
              />
              <AutoComplete
                label="IPS que tendrá la jornada"
                value={f.entidad}
                onChange={(v) => set("entidad", v)}
                options={ipsOptions}
              />
              <div className="space-y-1.5">
                <Label>Ciudad / departamento</Label>
                <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Médico / profesional</Label>
                <Input value={f.medico} onChange={(e) => set("medico", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                <Input value={f.horario} onChange={(e) => set("horario", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contacto</Label>
                <Input
                  value={f.contacto_principal}
                  onChange={(e) => set("contacto_principal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Correo</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
            </div>
          )}

          {/* ====== IPS / AMBULANCIAS / ESPECIALIDADES CEDIM ====== */}
          {(esIps || esAmbulancia || esEspecialidad) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  {esEspecialidad
                    ? "Profesional / médico"
                    : esAmbulancia
                      ? "Nombre de la empresa"
                      : "Nombre de la IPS"}
                </Label>
                <Input
                  value={esEspecialidad ? f.medico || f.entidad : f.entidad}
                  onChange={(e) =>
                    esEspecialidad ? set("medico", e.target.value) : set("entidad", e.target.value)
                  }
                />
              </div>

              {esEspecialidad ? (
                <AutoComplete
                  label="Especialidad"
                  value={f.servicio_especialidad}
                  onChange={(v) => set("servicio_especialidad", v)}
                  options={especialidades}
                />
              ) : (
                <div className="space-y-1.5">
                  <Label>NIT (si aplica)</Label>
                  <Input value={f.nit} onChange={(e) => set("nit", e.target.value)} />
                </div>
              )}

              {esAmbulancia && (
                <div className="space-y-1.5">
                  <Label>Tipo(s) de ambulancia</Label>
                  <Select value={f.tipo_ambulancia} onValueChange={(v) => set("tipo_ambulancia", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_AMBULANCIA.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!esEspecialidad && (
                <>
                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Input
                      value={f.departamento}
                      onChange={(e) => set("departamento", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ciudad / municipio</Label>
                    <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dirección (si aplica)</Label>
                    <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
                  </div>
                </>
              )}

              {esEspecialidad && (
                <>
                  <div className="space-y-1.5">
                    <Label>Sede</Label>
                    <Input value={f.sede} onChange={(e) => set("sede", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Servicio relacionado</Label>
                    <Input
                      value={f.tipo_apoyo}
                      onChange={(e) => set("tipo_apoyo", e.target.value)}
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
                    <Input value={f.horario} onChange={(e) => set("horario", e.target.value)} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Teléfono(s) de contacto</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contacto responsable</Label>
                <Input
                  value={f.contacto_principal}
                  onChange={(e) => set("contacto_principal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo del contacto</Label>
                <Input
                  value={f.cargo_contacto}
                  onChange={(e) => set("cargo_contacto", e.target.value)}
                />
              </div>

              {!esEspecialidad && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{esAmbulancia ? "Servicios / cobertura / recorridos" : "Especialidades y servicios"}</Label>
                  <Input
                    value={f.servicio_especialidad}
                    onChange={(e) => set("servicio_especialidad", e.target.value)}
                    placeholder={esAmbulancia ? "Traslados, cobertura…" : "UCI, Hospitalización, Urgencias…"}
                  />
                </div>
              )}

              {esAmbulancia && (
                <>
                  <div className="space-y-1.5">
                    <Label>Recorrido / cobertura</Label>
                    <Input value={f.recorrido} onChange={(e) => set("recorrido", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Códigos CUPS (si aplica)</Label>
                    <Input value={f.cups} onChange={(e) => set("cups", e.target.value)} />
                  </div>
                </>
              )}

              {!esEspecialidad && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>EAPB y aseguradoras que atiende</Label>
                  <Input
                    value={f.eapb_aseguradoras}
                    onChange={(e) => set("eapb_aseguradoras", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ====== DIRECTORIOS EXTERNOS: EAPB / EPS ====== */}
          {esExterno && esEapb && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de entidad</Label>
                <Select value={f.tipo_apoyo} onValueChange={(v) => set("tipo_apoyo", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_EAPB.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nombre de la entidad</Label>
                <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad / municipio</Label>
                <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del contacto</Label>
                <Input
                  value={f.contacto_principal}
                  onChange={(e) => set("contacto_principal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad, área o cargo</Label>
                <Input value={f.cargo_contacto} onChange={(e) => set("cargo_contacto", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono principal</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfonos alternos</Label>
                <Input
                  value={f.telefonos_alternos}
                  onChange={(e) => set("telefonos_alternos", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Extensión (si aplica)</Label>
                <Input value={f.codigo_principal} onChange={(e) => set("codigo_principal", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Dirección (si aplica)</Label>
                <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
              </div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Para varios contactos de una misma entidad, registra cada contacto en Observaciones
                o crea filas por contacto en la plantilla; no dupliques la entidad.
              </p>
            </div>
          )}

          {/* ====== DIRECTORIOS EXTERNOS: CRUE ====== */}
          {esExterno && esCrue && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre del CRUE</Label>
                <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Indicativo (si aplica)</Label>
                <Input value={f.indicativo} onChange={(e) => set("indicativo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad / municipio</Label>
                <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del contacto / representante</Label>
                <Input
                  value={f.contacto_principal}
                  onChange={(e) => set("contacto_principal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input value={f.cargo_contacto} onChange={(e) => set("cargo_contacto", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono principal</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfonos alternos</Label>
                <Input
                  value={f.telefonos_alternos}
                  onChange={(e) => set("telefonos_alternos", e.target.value)}
                  placeholder="Separa varios con , o salto de línea"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Correo principal</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correos alternos</Label>
                <Input
                  value={f.correos_alternos}
                  onChange={(e) => set("correos_alternos", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cobertura</Label>
                <Input value={f.cobertura} onChange={(e) => set("cobertura", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Dirección</Label>
                <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
              </div>
            </div>
          )}

          {/* ====== DIRECTORIOS EXTERNOS: LÍNEAS DE EMERGENCIA ====== */}
          {esExterno && esLinea && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Entidad</Label>
                <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de entidad</Label>
                <Select value={f.tipo_apoyo} onValueChange={(v) => set("tipo_apoyo", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_LINEA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Municipio</Label>
                <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del contacto / representante</Label>
                <Input
                  value={f.contacto_principal}
                  onChange={(e) => set("contacto_principal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo o dependencia</Label>
                <Input value={f.cargo_contacto} onChange={(e) => set("cargo_contacto", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono principal</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Números alternos</Label>
                <Input
                  value={f.telefonos_alternos}
                  onChange={(e) => set("telefonos_alternos", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cobertura</Label>
                <Select value={f.cobertura} onValueChange={(v) => set("cobertura", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COBERTURAS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ====== DIRECTORIOS EXTERNOS: RECURSOS DE REFERENCIA ====== */}
          {esExterno && esRecurso && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={f.categoria} onValueChange={(v) => set("categoria", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_RECURSO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Entidad</Label>
                <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del recurso</Label>
                <Input value={f.subcategoria} onChange={(e) => set("subcategoria", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de recurso</Label>
                <Select value={f.tipo_recurso} onValueChange={(v) => set("tipo_recurso", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_RECURSO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descripción</Label>
                <Input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>URL</Label>
                <Input value={f.link} onChange={(e) => set("link", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Orden de visualización</Label>
                <Input
                  type="number"
                  value={f.orden_visualizacion}
                  onChange={(e) => set("orden_visualizacion", e.target.value)}
                />
              </div>
              <p className="sm:col-span-2 rounded-md bg-status-amber/10 p-2 text-xs text-status-amber-foreground">
                No registres contraseñas, tokens, llaves API ni credenciales de acceso en esta
                sección.
              </p>
            </div>
          )}



          {/* ====== DIRECTORIO INTERNO ====== */}
          {esDirectorio && (
            <div className="grid gap-3 sm:grid-cols-2">
              {esRef && (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nombre de la institución</Label>
                    <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Indicativo</Label>
                    <Input value={f.indicativo} onChange={(e) => set("indicativo", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Número general</Label>
                    <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Extensión de referencia</Label>
                    <Input
                      value={f.codigo_principal}
                      onChange={(e) => set("codigo_principal", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Correo de referencia</Label>
                    <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ciudad</Label>
                    <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Dirección principal</Label>
                    <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Horario de atención (si aplica)</Label>
                    <Input value={f.horario} onChange={(e) => set("horario", e.target.value)} />
                  </div>
                </>
              )}


              {esSede && (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nombre de la sede</Label>
                    <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ciudad</Label>
                    <Input value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Input
                      value={f.departamento}
                      onChange={(e) => set("departamento", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Dirección</Label>
                    <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Teléfono</Label>
                    <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Extensión (si aplica)</Label>
                    <Input
                      value={f.codigo_principal}
                      onChange={(e) => set("codigo_principal", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Correo institucional de la sede</Label>
                    <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Horario de atención</Label>
                    <Input value={f.horario} onChange={(e) => set("horario", e.target.value)} />
                  </div>
                </>
              )}

              {esContacto && (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Área / servicio</Label>
                    <Input value={f.entidad} onChange={(e) => set("entidad", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Funcionario responsable (si aplica)</Label>
                    <Input value={f.medico} onChange={(e) => set("medico", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cargo</Label>
                    <Input
                      value={f.cargo_contacto}
                      onChange={(e) => set("cargo_contacto", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Extensión</Label>
                    <Input
                      value={f.codigo_principal}
                      onChange={(e) => set("codigo_principal", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Teléfono directo (si aplica)</Label>
                    <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Correo institucional</Label>
                    <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sede asociada</Label>
                    <Input value={f.sede} onChange={(e) => set("sede", e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Observaciones */}
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <DictationTextarea
              dictationKey="red.observaciones"
              rows={2}
              value={f.observaciones}
              onChange={(e) => set("observaciones", e.target.value)}
            />
          </div>

          {/* Disponibilidad operativa (dato interno, sin switch en tarjeta) */}
          {(esIps || esAmbulancia || esEspecialidad) && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <Switch
                checked={disponibleEff}
                disabled={inactivo}
                onCheckedChange={(v) => set("disponible_para_remisiones", v)}
              />
              <span className="text-sm font-medium text-foreground">
                Disponibilidad operativa (dato interno)
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={busy}>
            <Save className="mr-1.5 h-4 w-4" /> {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
