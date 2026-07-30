import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sanitizeOptionalLabel } from "@/lib/seguimiento-orden";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, Pencil, ClipboardCheck, MapPin } from "lucide-react";
import { Field, SelectField, SpecialtyList } from "./form-bits";
import { Cie10Field } from "./cie10-field";
import { SeguimientoDialog } from "./seguimiento-dialog";
import { useAuth } from "@/lib/auth";
import { editarCasoSalienteAdmin } from "@/lib/salientes-admin-edit.functions";

const SERVICIO_OPCIONES = ["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"];
const PRIORIDAD_OPCIONES = ["ALTA", "MEDIA", "BAJA"];
const TIPO_AMB_OPCIONES = ["TAB", "TAM", "TAM-N"];
const REMISION_POR_OPCIONES = [
  "RED NO CONTRATADA",
  "NO RECURSO HUMANO",
  "NO DISPONIBILIDAD DE INSUMO O TECNOLOGIA",
  "NO DISPONIBILIDAD DE UNIDAD",
  "NO DISPONIBILIDAD DE CAMAS",
  "NIVEL DE COMPETENCIA",
  "PETICION VOLUNTARIA",
  "EN TRAMITE",
];
const ESTADO_OPCIONES = [
  "PENDIENTE ACEPTACION",
  "ACEPTADO SIN PROGRAMACION DE AMBULANCIA",
  "ACEPTADO CON AMBULANCIA COORDINADA",
  "PENDIENTE EGRESO REMISION",
  "CERRADO POR REMISION EXITOSA",
  "CERRADO POR TRASLADO EFECTIVO",
  "DESISTIMIENTO IPS",
  "DESISTIMIENTO GENERAL",
];
import { buildPacienteIdentityLine, buildModuleSummaryLine } from "@/lib/caso-cabecera";
import {
  evolucionMeta,
  fmtEdad,
  fmtFechaHora,
  fmtRadicado,
  fmtTranscurrido,
  prioridadMeta,
  resumenEvolucion,
  splitEspecialidades,
  tiempoChip,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";

export type Remision = {
  id: string;
  paciente: string | null;
  documento: string | null;
  tipo_documento: string | null;
  edad: string | null;
  cie10: string | null;
  servicio: string | null;
  cama: string | null;
  asegurador: string | null;
  eapb: string | null;
  regimen: string | null;
  remision_por: string | null;
  alcance_red: string | null;
  tipo_ambulancia: string | null;
  eapb_genera_codigo: boolean | null;
  prioridad: string | null;
  estado: string | null;
  tipo_tramite: string | null;
  fecha_inicio: string | null;
  fecha_radicado: string | null;
  especialidades_tratantes: string | null;
  especialidades_receptoras: string | null;
  codigo_radicacion: string | null;
  contacto_nombre: string | null;
  contacto_parentesco: string | null;
  contacto_telefono: string | null;
  observaciones: string | null;
  especificacion: string | null;
  evolucion: string | null;
  evolucion_detalle: string | null;
  texto_ia: string | null;
  created_at: string | null;
};

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  // A.1: los valores de texto se sanean (nunca "null"/"undefined"/vacío).
  const safe = typeof value === "string" || typeof value === "number" ? sanitizeOptionalLabel(value) : value;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{safe || "—"}</p>
    </div>
  );
}

// Convierte ISO a "YYYY-MM-DDTHH:MM" en hora local para <input type="datetime-local">.
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Devuelve ISO (o null si vacío) desde un string "YYYY-MM-DDTHH:MM".
function fromDatetimeLocal(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Reloj que se actualiza cada segundo para el tiempo transcurrido. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function CasoRemisionCard({
  r,
  canEdit,
  ultimaGestion,
}: {
  r: Remision;
  canEdit: boolean;
  ultimaGestion?: { fecha: string | null; responsable: string | null } | null;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const editarAdminFn = useServerFn(editarCasoSalienteAdmin);
  const [ver, setVer] = useState(false);
  const [editar, setEditar] = useState(false);
  const [seg, setSeg] = useState(false);
  const [tratantes, setTratantes] = useState<string[]>([]);
  const [receptoras, setReceptoras] = useState<string[]>([]);
  useTick(true);

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
  });

  // Al abrir el editor, precargar las especialidades actuales.
  useEffect(() => {
    if (editar) {
      setTratantes(splitEspecialidades(r.especialidades_tratantes));
      setReceptoras(splitEspecialidades(r.especialidades_receptoras));
    }
  }, [editar, r.especialidades_tratantes, r.especialidades_receptoras]);

  const evoRes = resumenEvolucion(r.evolucion_detalle, splitEspecialidades(r.especialidades_tratantes));
  const evo = evolucionMeta[evoRes.estado];
  const pendiente = /PENDIENTE/i.test(r.estado || "");
  const nombre = r.paciente || "Sin nombre";
  const radicado = fmtRadicado(r.codigo_radicacion, r.eapb_genera_codigo);
  const aseguradorTxt = r.eapb || r.asegurador || "";
  const prio = prioridadMeta(r.prioridad);

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    if (isAdmin) {
      // Edición total ADMIN: allowlist server-side + auditoría automática.
      const cambios: Record<string, unknown> = {
        paciente: f.get("paciente"),
        tipo_documento: f.get("tipo_documento"),
        documento: f.get("documento"),
        edad: f.get("edad"),
        cie10: f.get("cie10"),
        eapb: f.get("eapb"),
        regimen: f.get("regimen"),
        estado: f.get("estado"),
        codigo_radicacion: f.get("codigo_radicacion"),
        fecha_inicio: fromDatetimeLocal(f.get("fecha_inicio")),
        fecha_radicado: fromDatetimeLocal(f.get("fecha_radicado")),
        servicio: f.get("servicio"),
        cama: f.get("cama"),
        prioridad: f.get("prioridad"),
        remision_por: f.get("remision_por"),
        alcance_red: f.get("alcance_red") || null,
        tipo_ambulancia: f.get("tipo_ambulancia"),
        especialidades_tratantes: tratantes.join(", "),
        especialidades_receptoras: receptoras.join(", "),
        especificacion: f.get("especificacion"),
        contacto_nombre: f.get("contacto_nombre"),
        contacto_parentesco: f.get("contacto_parentesco"),
        contacto_telefono: f.get("contacto_telefono"),
        observaciones: f.get("observaciones"),
      };
      const res = await editarAdminFn({ data: { tabla: "remisiones", casoId: r.id, cambios } });
      if (!res.ok) {
        toast.error(res.error || "No se pudo actualizar.");
        return;
      }
      toast.success("Remisión actualizada (edición admin)");
      setEditar(false);
      qc.invalidateQueries({ queryKey: ["remisiones"] });
      return;
    }

    // Operativa / temporal: comportamiento original (campos restringidos).
    const { error } = await supabase
      .from("remisiones")
      .update({
        cie10: String(f.get("cie10")),
        servicio: String(f.get("servicio")),
        cama: String(f.get("cama")),
        prioridad: String(f.get("prioridad")),
        remision_por: String(f.get("remision_por")),
        tipo_ambulancia: String(f.get("tipo_ambulancia")),
        especialidades_tratantes: tratantes.join(", "),
        especialidades_receptoras: receptoras.join(", "),
        especificacion: String(f.get("especificacion")),
        contacto_nombre: String(f.get("contacto_nombre")),
        contacto_parentesco: String(f.get("contacto_parentesco")),
        contacto_telefono: String(f.get("contacto_telefono")),
        observaciones: String(f.get("observaciones")),
      })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Remisión actualizada");
    setEditar(false);
    qc.invalidateQueries({ queryKey: ["remisiones"] });
  };

  return (
    <div className={`rounded-xl border border-border border-l-4 ${prio.borderL} bg-card p-3.5 shadow-sm`}>
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-foreground">
            {buildPacienteIdentityLine({
              nombre,
              tipoDocumento: r.tipo_documento,
              documento: r.documento,
              edad: r.edad,
            })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {buildModuleSummaryLine([
              [r.remision_por || r.especificacion],
              [aseguradorTxt, r.regimen],
            ]) || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {sanitizeOptionalLabel(r.prioridad) && (
            <Badge variant="outline" className={prio.badge}>
              {sanitizeOptionalLabel(r.prioridad)}
            </Badge>
          )}
          <Badge variant="secondary" className="font-mono text-[10px]">
            Rad: {radicado}
          </Badge>
        </div>
      </div>


      {/* Datos compactos */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <Dato
          label="Ubicación"
          value={
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {[r.servicio, r.cama].filter(Boolean).join(" · ") || "—"}
            </span>
          }
        />
        <Dato
          label="Estado"
          value={
            <span className={pendiente ? "font-semibold text-status-red" : "font-semibold text-foreground"}>
              {sanitizeOptionalLabel(r.estado) || "—"}
            </span>
          }
        />
        <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
        <Dato label="Especialidad destino" value={r.especialidades_receptoras} />
        <Dato
          label="Evolución"
          value={
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${evo.chip}`}>
              <span className={`h-2 w-2 rounded-full ${evo.dot}`} />
              {evoRes.label}
            </span>
          }
        />
      </div>

      {(r.observaciones || r.especificacion) && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-semibold">Justificación remisión:</span> {r.observaciones || r.especificacion}
        </p>
      )}

      {/* Acciones + última gestión + tiempo */}
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
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tiempoChip(r.created_at)}`}
        >
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
            <Dato label="Paciente" value={r.paciente} />
            <Dato label="Tipo documento" value={r.tipo_documento} />
            <Dato label="Documento" value={r.documento} />
            <Dato label="Edad" value={fmtEdad(r.edad)} />
            <Dato label="CIE-10" value={r.cie10} />
            <Dato label="EAPB / EPS / Asegurador" value={aseguradorTxt} />
            <Dato label="Régimen" value={r.regimen} />
            <Dato label="Remisión por" value={r.remision_por} />
            <Dato label="Justificación remisión" value={r.especificacion || r.observaciones} />
            <Dato
              label="Red comentada"
              value={
                r.alcance_red === "LOCAL_NACIONAL"
                  ? "Red local y nacional"
                  : r.alcance_red === "NACIONAL"
                    ? "Red nacional"
                    : r.alcance_red === "LOCAL"
                      ? "Red local"
                      : "—"
              }
            />
            <Dato label="Tipo ambulancia" value={r.tipo_ambulancia} />
            <Dato label="Servicio" value={r.servicio} />
            <Dato label="Cama" value={r.cama} />
            <Dato label="Prioridad" value={r.prioridad} />
            <Dato label="N° radicado" value={radicado} />
            <Dato label="Estado" value={r.estado} />
            <Dato label="Fecha y hora inicio trámite" value={fmtFechaHora(r.fecha_inicio)} />
            <Dato label="Fecha y hora radicación" value={fmtFechaHora(r.fecha_radicado)} />
            <Dato label="Tiempo del trámite" value={fmtTranscurrido(r.fecha_inicio ?? r.created_at)} />
            <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
            <Dato label="Especialidad destino" value={r.especialidades_receptoras} />
            <Dato label="Familiar" value={r.contacto_nombre} />
            <Dato label="Parentesco" value={r.contacto_parentesco} />
            <Dato label="Teléfono familiar" value={r.contacto_telefono} />
          </div>
          {r.observaciones && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observaciones</p>
              <p className="text-sm text-foreground">{r.observaciones}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Editar */}
      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar remisión · {nombre}</DialogTitle>
          </DialogHeader>
          <form key={editar ? "open" : "closed"} onSubmit={handleUpdate} className="space-y-4">
            {isAdmin ? (
              <>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Modo administrador: todos los campos funcionales son editables. Los cambios quedan auditados.
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field name="fecha_inicio" label="Fecha y hora inicio trámite" type="datetime-local" defaultValue={toDatetimeLocal(r.fecha_inicio)} />
                  <Field name="fecha_radicado" label="Fecha y hora radicación" type="datetime-local" defaultValue={toDatetimeLocal(r.fecha_radicado)} />
                  <Field name="transcurrido_display" label="Tiempo del trámite" defaultValue={fmtTranscurrido(r.fecha_inicio ?? r.created_at)} readOnly />
                  <Field name="paciente" label="Paciente" defaultValue={r.paciente ?? ""} />
                  <SelectField name="tipo_documento" label="Tipo de documento" options={["CC","CE","TI","RC","RNV","ASI","MSI"]} defaultValue={r.tipo_documento ?? ""} />
                  <Field name="documento" label="Documento" defaultValue={r.documento ?? ""} />
                  <Field name="edad" label="Edad" defaultValue={r.edad ?? ""} />
                  <Field name="eapb" label="EAPB / EPS / Asegurador" defaultValue={aseguradorTxt} />
                  <SelectField name="regimen" label="Régimen" options={["SUBSIDIADO","CONTRIBUTIVO","ESPECIAL","NO APLICA"]} defaultValue={r.regimen ?? ""} />
                  <SelectField name="estado" label="Estado" options={ESTADO_OPCIONES} defaultValue={r.estado ?? ""} />
                  <Field name="codigo_radicacion" label="N° radicado" defaultValue={r.codigo_radicacion ?? ""} />
                  <SelectField name="alcance_red" label="Alcance red" options={["LOCAL","NACIONAL","LOCAL_NACIONAL","NO_SE_COMENTA"]} defaultValue={r.alcance_red ?? ""} />
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field name="fecha_inicio_display" label="Fecha y hora inicio trámite" defaultValue={fmtFechaHora(r.fecha_inicio)} readOnly />
                <Field name="fecha_radicado_display" label="Fecha y hora radicación" defaultValue={fmtFechaHora(r.fecha_radicado)} readOnly />
                <Field name="transcurrido_display" label="Tiempo del trámite" defaultValue={fmtTranscurrido(r.fecha_inicio ?? r.created_at)} readOnly />
                <Field name="paciente_display" label="Paciente" defaultValue={r.paciente ?? ""} readOnly />
                <Field name="tipo_documento_display" label="Tipo de documento" defaultValue={r.tipo_documento ?? ""} readOnly />
                <Field name="documento_display" label="Documento" defaultValue={r.documento ?? ""} readOnly />
                <Field name="edad_display" label="Edad" defaultValue={fmtEdad(r.edad)} readOnly />
                <Field name="eapb_display" label="EAPB / EPS / Asegurador" defaultValue={aseguradorTxt} readOnly />
                <Field name="regimen_display" label="Régimen" defaultValue={r.regimen ?? ""} readOnly />
                <Field name="estado_display" label="Estado (se cambia desde Seguimiento)" defaultValue={r.estado ?? ""} readOnly />
                <Field name="radicado_display" label="N° radicado (se gestiona desde Seguimiento)" defaultValue={radicado} readOnly />
              </div>
            )}

            {/* Campos editables */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Cie10Field name="cie10" label="CIE-10" defaultValue={r.cie10 ?? ""} />
              <SelectField
                name="servicio"
                label="Servicio"
                options={SERVICIO_OPCIONES}
                required
                defaultValue={r.servicio ?? ""}
              />
              <Field name="cama" label="Cama" required defaultValue={r.cama ?? ""} />
              <SelectField
                name="prioridad"
                label="Prioridad"
                options={PRIORIDAD_OPCIONES}
                required
                defaultValue={r.prioridad ?? ""}
              />
              <SelectField
                name="remision_por"
                label="Remisión por"
                options={REMISION_POR_OPCIONES}
                defaultValue={r.remision_por ?? ""}
              />
              <SelectField
                name="tipo_ambulancia"
                label="Tipo de ambulancia"
                options={TIPO_AMB_OPCIONES}
                defaultValue={r.tipo_ambulancia ?? ""}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SpecialtyList label="Especialidad tratante" items={tratantes} onChange={setTratantes} suggestions={especialidades} />
              <SpecialtyList label="Especialidad destino" items={receptoras} onChange={setReceptoras} suggestions={especialidades} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="especificacion" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Justificación remisión
              </Label>
              <Textarea
                id="especificacion"
                name="especificacion"
                rows={2}
                defaultValue={r.especificacion ?? ""}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field name="contacto_nombre" label="Nombre y apellido familiar" defaultValue={r.contacto_nombre ?? ""} />
              <Field name="contacto_parentesco" label="Parentesco" defaultValue={r.contacto_parentesco ?? ""} />
              <Field name="contacto_telefono" label="Número telefónico" defaultValue={r.contacto_telefono ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observaciones" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones
              </Label>
              <Textarea id="observaciones" name="observaciones" rows={3} defaultValue={r.observaciones ?? ""} />
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
        tipoCaso="remision"
        paciente={nombre}
        documento={r.documento}
        evolucionActual={r.evolucion}
        evolucionDetalle={r.evolucion_detalle}
        especialidades={r.especialidades_tratantes}
        radicadoCaso={r.codigo_radicacion}
        tabla="remisiones"
        estadoOpciones={ESTADO_OPCIONES}
        estadoActual={r.estado}
      />
    </div>
  );
}
