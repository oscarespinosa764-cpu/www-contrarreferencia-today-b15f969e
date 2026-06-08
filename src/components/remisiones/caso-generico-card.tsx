import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, Pencil, ClipboardCheck, MapPin } from "lucide-react";
import { Field, SelectField, SpecialtyList } from "./form-bits";
import { Cie10Field } from "./cie10-field";
import { SeguimientoDialog } from "./seguimiento-dialog";
import {
  evolucionMeta,
  fmtFechaHora,
  fmtTranscurrido,
  normEvolucion,
  prioridadMeta,
  resumenEvolucion,
  splitEspecialidades,
  tiempoChip,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";

type Row = Record<string, any>;
export type GenericoTipo = "phd" | "interna" | "pendiente";

const SERVICIO_OPCIONES = ["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"];
const PRIORIDAD_OPCIONES = ["ALTA", "MEDIA", "BAJA"];
const TIPO_DOC_OPCIONES = ["CC", "CE", "TI", "RC", "RNV", "ASI", "MSI"];
const PHD_SOLICITUD = [
  "PHD",
  "PAD CRONICO",
  "OXIGENO DOMICILIARIO",
  "PHD + OXIGENO DOMICILIARIO",
  "PAD CRONICO + OXIGENO DOMICILIARIO",
  "UNIDADES ESPECIALES",
];
const REGIMEN_OPCIONES = ["SUBSIDIADO", "CONTRIBUTIVO", "ESPECIAL", "NO APLICA"];
const SI_NO = ["SI", "NO"];
const INTERNA_SOLICITUD = [
  "RESONANCIA",
  "INTERCONSULTA",
  "ECOGRAFIA",
  "TAC",
  "RX",
  "URGENCIAS VITALES",
  "REMISIONES ESPECIALES",
];
const AMBULANCIA_OPCIONES = ["TAB", "TAM", "TAM-N"];
const PHD_ESTADO_OPCIONES = [
  "ACTIVO",
  "PENDIENTE ACEPTACION",
  "ACEPTADO SIN PROGRAMACION DE AMBULANCIA",
  "ACEPTADO CON AMBULANCIA COORDINADA",
  "FINALIZADO",
];
const PENDIENTE_TIPOS = [
  "DEFINICION MEDICA PARA RESPUESTA CORREO",
  "COORDINAR AMBULANCIA",
  "PROGRAMAR RESONANCIA",
  "PROGRAMAR TAC",
  "PROGRAMAR ECOGRAFIA",
  "PROGRAMAR INTERCONSULTA",
  "CONFIRMACION CON IPS",
  "RADICAR REMISION",
  "EVOLUCIONAR",
  "ORDENES EXTRAMURALES",
  "NEGACIONES",
  "AVERIGUAR",
  "CANCELAR",
];

const CONFIG: Record<
  GenericoTipo,
  { tabla: string; tipoCaso: string; evoluciona: boolean; tieneRadicado: boolean }
> = {
  phd: { tabla: "domiciliarios", tipoCaso: "domiciliario", evoluciona: true, tieneRadicado: true },
  interna: { tabla: "referencia_interna", tipoCaso: "referencia_interna", evoluciona: true, tieneRadicado: false },
  pendiente: { tabla: "pendientes", tipoCaso: "pendiente", evoluciona: false, tieneRadicado: false },
};

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function EstadoBadge({ estado }: { estado?: string | null }) {
  const txt = (estado || "").trim();
  const activo = txt.toUpperCase() === "ACTIVO";
  return (
    <Badge
      variant="outline"
      className={
        activo
          ? "border-status-green/40 bg-status-green/15 font-semibold text-status-green"
          : "font-semibold"
      }
    >
      {txt || "—"}
    </Badge>
  );
}

function useTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function evoChip(tipo: GenericoTipo, r: Row) {
  if (tipo === "phd") {
    const esp = splitEspecialidades(r.especialidades_tratantes);
    const res = resumenEvolucion(r.evolucion_detalle, esp);
    return { meta: evolucionMeta[res.estado], label: res.label };
  }
  // interna
  const estado = normEvolucion(r.evolucion);
  return { meta: evolucionMeta[estado], label: evolucionMeta[estado].label };
}

export function CasoGenericoCard({
  tipo,
  r,
  canEdit,
  ultimaGestion,
}: {
  tipo: GenericoTipo;
  r: Row;
  canEdit: boolean;
  ultimaGestion?: { fecha: string | null; responsable: string | null } | null;
}) {
  const cfg = CONFIG[tipo];
  const qc = useQueryClient();
  const [ver, setVer] = useState(false);
  const [editar, setEditar] = useState(false);
  const [seg, setSeg] = useState(false);
  const [tratantes, setTratantes] = useState<string[]>([]);
  useTick();

  const { data: especialidades = [] } = useQuery({
    queryKey: ["cat-especialidad"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "ESPECIALIDAD")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
    enabled: tipo === "phd",
  });

  useEffect(() => {
    if (editar && tipo === "phd") setTratantes(splitEspecialidades(r.especialidades_tratantes));
  }, [editar, tipo, r.especialidades_tratantes]);

  const nombre = (tipo === "pendiente" ? r.paciente_asunto : r.paciente) || "Sin nombre";
  const documento = tipo === "pendiente" ? null : r.documento;
  const radicado = cfg.tieneRadicado ? r.codigo_radicacion?.trim() || "No aplica" : "No aplica";
  const prio = prioridadMeta(r.prioridad);
  const evo = cfg.evoluciona ? evoChip(tipo, r) : null;
  const justif =
    tipo === "pendiente" ? r.observacion_entrega : r.observaciones;
  const invalidateKey =
    tipo === "phd" ? "domiciliarios" : tipo === "interna" ? "referencia-interna" : "pendientes-rem";

  const subParts =
    tipo === "phd"
      ? [r.tipo_solicitud, documento && `Doc: ${documento}`, r.edad && `${r.edad} años`]
      : tipo === "interna"
        ? [r.tipo_solicitud, r.servicio, documento && `Doc: ${documento}`]
        : [r.tipo_pendiente, r.ips_area];

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let payload: Row = {};
    if (tipo === "phd") {
      payload = {
        paciente: String(f.get("paciente")),
        tipo_documento: String(f.get("tipo_documento")),
        documento: String(f.get("documento")),
        edad: String(f.get("edad")),
        cie10: String(f.get("cie10")),
        eapb: String(f.get("eapb")),
        regimen: String(f.get("regimen")),
        servicio: String(f.get("servicio")),
        cama: String(f.get("cama")),
        prioridad: String(f.get("prioridad")),
        tipo_solicitud: String(f.get("tipo_solicitud")),
        requiere_ambulancia: String(f.get("requiere_ambulancia")),
        codigo_radicacion: String(f.get("codigo_radicacion")),
        especialidades_tratantes: tratantes.join(", "),
        contacto_nombre: String(f.get("contacto_nombre")),
        contacto_parentesco: String(f.get("contacto_parentesco")),
        contacto_telefono: String(f.get("contacto_telefono")),
        observaciones: String(f.get("observaciones")),
      };
    } else if (tipo === "interna") {
      payload = {
        paciente: String(f.get("paciente")),
        tipo_documento: String(f.get("tipo_documento")),
        documento: String(f.get("documento")),
        servicio: String(f.get("servicio")),
        tipo_solicitud: String(f.get("tipo_solicitud")),
        tipo_ambulancia: String(f.get("tipo_ambulancia")),
        proveedor_prestador: String(f.get("proveedor_prestador")),
        prioridad: String(f.get("prioridad")),
        observaciones: String(f.get("observaciones")),
      };
    } else {
      payload = {
        paciente_asunto: String(f.get("paciente_asunto")),
        tipo_pendiente: String(f.get("tipo_pendiente")),
        ips_area: String(f.get("ips_area")),
        prioridad: String(f.get("prioridad")),
        observacion_entrega: String(f.get("observacion_entrega")),
      };
    }
    const { error } = await (supabase.from(cfg.tabla as any) as any).update(payload).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Caso actualizado");
    setEditar(false);
    qc.invalidateQueries({ queryKey: [invalidateKey] });
  };

  return (
    <div className={`rounded-xl border border-border border-l-4 ${prio.borderL} bg-card p-3.5 shadow-sm`}>
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-foreground">{nombre}</p>
          <p className="text-[11px] text-muted-foreground">{subParts.filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {r.prioridad && (
            <Badge variant="outline" className={prio.badge}>
              {r.prioridad}
            </Badge>
          )}
          {tipo === "phd" && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              Rad: {radicado}
            </Badge>
          )}
          {(tipo === "interna" || tipo === "pendiente") && <EstadoBadge estado={r.estado} />}
        </div>
      </div>

      {/* Datos compactos */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {tipo === "pendiente" ? (
          <>
            <Dato label="Tipo pendiente" value={r.tipo_pendiente} />
            <Dato label="IPS / área" value={r.ips_area} />
            <Dato label="Prioridad" value={r.prioridad} />
          </>
        ) : (
          <>
            <Dato
              label="Ubicación"
              value={
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {[r.servicio, r.cama].filter(Boolean).join(" · ") || "—"}
                </span>
              }
            />
            {tipo === "phd" && (
              <Dato label="Estado" value={<span className="font-semibold text-foreground">{r.estado || "—"}</span>} />
            )}
            {tipo === "phd" ? (
              <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
            ) : (
              <Dato label="Tipo solicitud" value={r.tipo_solicitud} />
            )}
            <Dato label={tipo === "phd" ? "Tipo solicitud" : "Tipo ambulancia"} value={tipo === "phd" ? r.tipo_solicitud : r.tipo_ambulancia} />
            {evo && (
              <Dato
                label="Evolución"
                value={
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${evo.meta.chip}`}>
                    <span className={`h-2 w-2 rounded-full ${evo.meta.dot}`} />
                    {evo.label}
                  </span>
                }
              />
            )}
          </>
        )}
      </div>

      {justif && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-semibold">{tipo === "pendiente" ? "Observación:" : "Justificación:"}</span> {justif}
        </p>
      )}

      {/* Acciones */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setVer(true)}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Ver caso
          </Button>
          {canEdit && (
            <Button size="sm" className="rounded-full" onClick={() => setSeg(true)}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Seguimiento
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold">Última gestión:</span>{" "}
            {ultimaGestion
              ? `${fmtFechaHora(ultimaGestion.fecha)} · ${ultimaGestion.responsable || "—"}`
              : "Sin seguimientos registrados"}
          </span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tiempoChip(r.created_at)}`}>
          {fmtTranscurrido(r.created_at)}
        </span>
      </div>

      {/* Ver caso */}
      <Dialog open={ver} onOpenChange={setVer}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>Detalle · {nombre}</DialogTitle>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  aria-label="Editar"
                  onClick={() => {
                    setVer(false);
                    setEditar(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {tipo === "phd" && (
              <>
                <Dato label="Paciente" value={r.paciente} />
                <Dato label="Tipo documento" value={r.tipo_documento} />
                <Dato label="Documento" value={r.documento} />
                <Dato label="Edad" value={r.edad} />
                <Dato label="CIE-10" value={r.cie10} />
                <Dato label="EAPB / ERP" value={r.eapb} />
                <Dato label="Régimen" value={r.regimen} />
                <Dato label="Servicio" value={r.servicio} />
                <Dato label="Cama" value={r.cama} />
                <Dato label="Prioridad" value={r.prioridad} />
                <Dato label="N° radicado" value={radicado} />
                <Dato label="Tipo solicitud" value={r.tipo_solicitud} />
                <Dato label="Requiere ambulancia" value={r.requiere_ambulancia} />
                <Dato label="Estado" value={r.estado} />
                <Dato label="Fecha y hora inicio trámite" value={fmtFechaHora(r.fecha_inicio)} />
                <Dato label="Fecha y hora radicación" value={fmtFechaHora(r.fecha_radicado)} />
                <Dato label="Tiempo del trámite" value={fmtTranscurrido(r.fecha_inicio ?? r.created_at)} />
                <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
                <Dato label="Familiar" value={r.contacto_nombre} />
                <Dato label="Parentesco" value={r.contacto_parentesco} />
                <Dato label="Teléfono familiar" value={r.contacto_telefono} />
              </>
            )}
            {tipo === "interna" && (
              <>
                <Dato label="Paciente" value={r.paciente} />
                <Dato label="Tipo documento" value={r.tipo_documento} />
                <Dato label="Documento" value={r.documento} />
                <Dato label="Servicio" value={r.servicio} />
                <Dato label="Tipo solicitud" value={r.tipo_solicitud} />
                <Dato label="Tipo ambulancia" value={r.tipo_ambulancia} />
                <Dato label="Proveedor / prestador" value={r.proveedor_prestador} />
                <Dato label="Prioridad" value={r.prioridad} />
                <Dato label="N° radicado" value={radicado} />
                <Dato label="Estado" value={r.estado} />
                <Dato label="Fecha y hora radicación" value={fmtFechaHora(r.fecha_radicado)} />
                <Dato label="Tiempo del trámite" value={fmtTranscurrido(r.created_at)} />
              </>
            )}
            {tipo === "pendiente" && (
              <>
                <Dato label="Paciente / asunto" value={r.paciente_asunto} />
                <Dato label="Tipo pendiente" value={r.tipo_pendiente} />
                <Dato label="IPS / área" value={r.ips_area} />
                <Dato label="Prioridad" value={r.prioridad} />
                <Dato label="N° radicado" value={radicado} />
                <Dato label="Estado" value={r.estado} />
                <Dato label="Fecha y hora" value={fmtFechaHora(r.created_at)} />
                <Dato label="Tiempo transcurrido" value={fmtTranscurrido(r.created_at)} />
              </>
            )}
          </div>
          {justif && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {tipo === "pendiente" ? "Observación de entrega" : "Observaciones"}
              </p>
              <p className="text-sm text-foreground">{justif}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar caso · {nombre}</DialogTitle>
          </DialogHeader>
          <form key={editar ? "open" : "closed"} onSubmit={handleUpdate} className="space-y-4">
            {tipo === "phd" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field name="fecha_inicio_display" label="Fecha y hora inicio trámite" defaultValue={fmtFechaHora(r.fecha_inicio)} readOnly />
                  <Field name="fecha_radicado_display" label="Fecha y hora radicación" defaultValue={fmtFechaHora(r.fecha_radicado)} readOnly />
                  <Field name="transcurrido_display" label="Tiempo del trámite" defaultValue={fmtTranscurrido(r.fecha_inicio ?? r.created_at)} readOnly />
                  <Field name="paciente" label="Paciente" required defaultValue={r.paciente ?? ""} />
                  <SelectField name="tipo_documento" label="Tipo de documento" options={TIPO_DOC_OPCIONES} required defaultValue={r.tipo_documento ?? ""} />
                  <Field name="documento" label="Documento" required defaultValue={r.documento ?? ""} />
                  <Field name="edad" label="Edad" defaultValue={r.edad ?? ""} />
                  <Cie10Field name="cie10" label="CIE-10" defaultValue={r.cie10 ?? ""} />
                  <Field name="eapb" label="EAPB / ERP" defaultValue={r.eapb ?? ""} />
                  <SelectField name="regimen" label="Régimen" options={REGIMEN_OPCIONES} defaultValue={r.regimen ?? ""} />
                  <SelectField name="servicio" label="Servicio" options={SERVICIO_OPCIONES} required defaultValue={r.servicio ?? ""} />
                  <Field name="cama" label="Cama" defaultValue={r.cama ?? ""} />
                  <SelectField name="prioridad" label="Prioridad" options={PRIORIDAD_OPCIONES} defaultValue={r.prioridad ?? ""} />
                  <Field name="estado_display" label="Estado (se cambia desde Seguimiento)" defaultValue={r.estado ?? ""} readOnly />
                  <SelectField name="tipo_solicitud" label="Tipo de solicitud" options={PHD_SOLICITUD} required defaultValue={r.tipo_solicitud ?? ""} />
                  <SelectField name="requiere_ambulancia" label="Requiere ambulancia" options={SI_NO} defaultValue={r.requiere_ambulancia ?? ""} />
                  <Field name="codigo_radicacion" label="Código de radicación" defaultValue={r.codigo_radicacion ?? ""} />
                </div>
                <SpecialtyList label="Especialidades tratantes" items={tratantes} onChange={setTratantes} suggestions={especialidades} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field name="contacto_nombre" label="Nombre y apellido familiar" defaultValue={r.contacto_nombre ?? ""} />
                  <Field name="contacto_parentesco" label="Parentesco" defaultValue={r.contacto_parentesco ?? ""} />
                  <Field name="contacto_telefono" label="Número telefónico" defaultValue={r.contacto_telefono ?? ""} />
                </div>
              </>
            )}
            {tipo === "interna" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field name="fecha_radicado_display" label="Fecha y hora radicación" defaultValue={fmtFechaHora(r.fecha_radicado)} readOnly />
                <Field name="transcurrido_display" label="Tiempo del trámite" defaultValue={fmtTranscurrido(r.created_at)} readOnly />
                <Field name="paciente" label="Paciente" required defaultValue={r.paciente ?? ""} />
                <SelectField name="tipo_documento" label="Tipo de documento" options={TIPO_DOC_OPCIONES} required defaultValue={r.tipo_documento ?? ""} />
                <Field name="documento" label="Documento" required defaultValue={r.documento ?? ""} />
                <SelectField name="servicio" label="Servicio" options={SERVICIO_OPCIONES} required defaultValue={r.servicio ?? ""} />
                <SelectField name="tipo_solicitud" label="Tipo de solicitud" options={INTERNA_SOLICITUD} required defaultValue={r.tipo_solicitud ?? ""} />
                <SelectField name="tipo_ambulancia" label="Tipo de ambulancia" options={AMBULANCIA_OPCIONES} defaultValue={r.tipo_ambulancia ?? ""} />
                <Field name="proveedor_prestador" label="Proveedor / prestador" defaultValue={r.proveedor_prestador ?? ""} />
                <SelectField name="prioridad" label="Prioridad" options={PRIORIDAD_OPCIONES} defaultValue={r.prioridad ?? ""} />
                <Field name="estado" label="Estado" defaultValue={r.estado ?? ""} />
              </div>
            )}
            {tipo === "pendiente" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="fecha_hora_display" label="Fecha y hora" defaultValue={fmtFechaHora(r.created_at)} readOnly />
                <SelectField name="tipo_pendiente" label="Tipo pendiente" options={PENDIENTE_TIPOS} required defaultValue={r.tipo_pendiente ?? ""} />
                <Field name="paciente_asunto" label="Paciente / asunto" required defaultValue={r.paciente_asunto ?? ""} />
                <Field name="ips_area" label="IPS / área" required defaultValue={r.ips_area ?? ""} />
                <SelectField name="prioridad" label="Prioridad" options={PRIORIDAD_OPCIONES} required defaultValue={r.prioridad ?? ""} />
                <Field name="estado" label="Estado" defaultValue={r.estado ?? ""} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {tipo === "pendiente" ? "Observación de entrega" : "Observaciones"}
              </Label>
              <Textarea
                name={tipo === "pendiente" ? "observacion_entrega" : "observaciones"}
                rows={3}
                defaultValue={(tipo === "pendiente" ? r.observacion_entrega : r.observaciones) ?? ""}
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full">
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Seguimiento */}
      <SeguimientoDialog
        open={seg}
        onOpenChange={setSeg}
        casoId={r.id}
        tipoCaso={cfg.tipoCaso}
        paciente={nombre}
        documento={documento}
        evolucionActual={r.evolucion}
        evolucionDetalle={r.evolucion_detalle}
        especialidades={tipo === "phd" ? r.especialidades_tratantes : null}
        radicadoCaso={cfg.tieneRadicado ? r.codigo_radicacion : null}
        tabla={cfg.tabla}
      />
    </div>
  );
}
