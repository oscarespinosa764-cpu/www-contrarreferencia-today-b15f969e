import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, SelectField, SpecialtyList } from "./form-bits";
import { PatientBlock } from "./patient-block";
import { Cie10Field } from "./cie10-field";
import { toast } from "sonner";

export function NuevoRegistroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("remision");
  const [tratantes, setTratantes] = useState<string[]>([]);
  const [receptoras, setReceptoras] = useState<string[]>([]);
  const [phdTratantes, setPhdTratantes] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const reset = () => {
    setTratantes([]);
    setReceptoras([]);
    setPhdTratantes([]);
    setResetKey((k) => k + 1);
  };




  const handleRemision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const inicioRaw = String(f.get("fecha_inicio") || "");
    const { error } = await supabase.from("remisiones").insert({
      fecha_inicio: inicioRaw ? new Date(inicioRaw).toISOString() : null,
      fecha_radicado: new Date().toISOString(),
      servicio: String(f.get("servicio")),
      cama: String(f.get("cama")),
      paciente: String(f.get("paciente")),
      tipo_documento: String(f.get("tipo_documento")),
      documento: String(f.get("documento")),
      edad: String(f.get("edad")),
      cie10: String(f.get("cie10")),
      especialidades_tratantes: tratantes.join(", "),
      especialidades_receptoras: receptoras.join(", "),
      prioridad: String(f.get("prioridad")),
      remision_por: String(f.get("remision_por")),
      especificacion: String(f.get("especificacion")),
      tipo_tramite: String(f.get("tipo_tramite")),
      tipo_ambulancia: String(f.get("tipo_ambulancia")),
      contacto_nombre: String(f.get("contacto_nombre")),
      contacto_parentesco: String(f.get("contacto_parentesco")),
      contacto_telefono: String(f.get("contacto_telefono")),
      observaciones: String(f.get("observaciones")),
      estado: "PENDIENTE ACEPTACION",
      evolucion: "sin",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Remisión registrada");
    reset();
    onOpenChange(false);
    invalidate();
  };

  const handlePHD = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const inicioRaw = String(f.get("fecha_inicio") || "");
    const { error } = await supabase.from("domiciliarios").insert({
      fecha_inicio: inicioRaw ? new Date(inicioRaw).toISOString() : null,
      fecha_radicado: new Date().toISOString(),
      servicio: String(f.get("servicio")),
      cama: String(f.get("cama")),
      paciente: String(f.get("paciente")),
      tipo_documento: String(f.get("tipo_documento")),
      documento: String(f.get("documento")),
      edad: String(f.get("edad")),
      cie10: String(f.get("cie10")),
      especialidades_tratantes: phdTratantes.join(", "),
      tipo_solicitud: String(f.get("tipo_solicitud")),
      eapb: String(f.get("eapb")),
      regimen: String(f.get("regimen")),
      codigo_radicacion: String(f.get("codigo_radicacion")),
      requiere_ambulancia: String(f.get("requiere_ambulancia")),
      contacto_nombre: String(f.get("contacto_nombre")),
      contacto_parentesco: String(f.get("contacto_parentesco")),
      contacto_telefono: String(f.get("contacto_telefono")),
      observaciones: String(f.get("observaciones")),
      estado: "ACTIVO",
      evolucion: "sin",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitud especial registrada");
    reset();
    onOpenChange(false);
    invalidate();
  };

  const handleRefInterna = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const inicioRaw = String(f.get("fecha_inicio") || "");
    const { error } = await supabase.from("referencia_interna").insert({
      fecha_inicio: inicioRaw ? new Date(inicioRaw).toISOString() : null,
      fecha_radicado: new Date().toISOString(),
      servicio: String(f.get("servicio")),
      paciente: String(f.get("paciente")),
      tipo_documento: String(f.get("tipo_documento")),
      documento: String(f.get("documento")),
      tipo_solicitud: String(f.get("tipo_solicitud")),
      tipo_ambulancia: String(f.get("tipo_ambulancia")),
      observaciones: String(f.get("observaciones")),
      estado: "ACTIVO",
      evolucion: "sin",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Referencia interna registrada");
    reset();
    onOpenChange(false);
    invalidate();
  };

  const handlePendiente = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("pendientes").insert({
      tipo_pendiente: String(f.get("tipo_pendiente")),
      ips_area: String(f.get("ips_area")),
      paciente_asunto: String(f.get("paciente_asunto")),
      prioridad: String(f.get("prioridad")),
      observacion_entrega: String(f.get("observacion_entrega")),
      estado: "ABIERTO",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Pendiente registrado");
    onOpenChange(false);
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo registro</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="remision">📋 Remisión</TabsTrigger>
            <TabsTrigger value="phd">🚑 PHD/PAD/O₂/Especiales</TabsTrigger>
            <TabsTrigger value="interna">🏥 Ref. Interna</TabsTrigger>
            <TabsTrigger value="pendiente">⏳ Pendiente</TabsTrigger>
          </TabsList>

          {/* REMISIÓN */}
          <TabsContent value="remision" className="pt-4">
            <form onSubmit={handleRemision} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  name="fecha_inicio"
                  label="Fecha y hora inicio trámite"
                  type="datetime-local"
                  required
                />
                <Field
                  name="fecha_radicado_display"
                  label="Fecha y hora radicación"
                  defaultValue="Se asigna automáticamente al guardar"
                  readOnly
                />
                <SelectField
                  name="servicio"
                  label="Servicio"
                  options={["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"]}
                  required
                />
                <Field name="cama" label="Cama" required />
                <PatientBlock key={`rem-pac-${resetKey}`} />
                <Field name="edad" label="Edad" placeholder="Ej: 15 años" required />
                <Cie10Field key={`rem-cie-${resetKey}`} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SpecialtyList label="Esp. tratantes" items={tratantes} onChange={setTratantes} suggestions={especialidades} />
                <SpecialtyList label="Esp. receptoras" items={receptoras} onChange={setReceptoras} suggestions={especialidades} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  name="prioridad"
                  label="Prioridad"
                  options={["ALTA", "MEDIA", "BAJA"]}
                  required
                />
                <SelectField
                  name="remision_por"
                  label="Remisión por"
                  options={[
                    "RED NO CONTRATADA",
                    "NO RECURSO HUMANO",
                    "NO DISPONIBILIDAD DE INSUMO O TECNOLOGIA",
                    "NO DISPONIBILIDAD DE UNIDAD",
                    "NO DISPONIBILIDAD DE CAMAS",
                    "NIVEL DE COMPETENCIA",
                    "PETICION VOLUNTARIA",
                  ]}
                  required
                />
                <SelectField
                  name="tipo_tramite"
                  label="Tipo trámite"
                  options={["TRAMITE ADMINISTRATIVO", "PERTINENCIA MEDICA", "PETICION VOLUNTARIA"]}
                  required
                />
                <SelectField
                  name="tipo_ambulancia"
                  label="Tipo de ambulancia"
                  options={["TAB", "TAM", "TAM-N"]}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="especificacion" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Justificación remisión
                </Label>
                <Textarea id="especificacion" name="especificacion" rows={2} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field name="contacto_nombre" label="Nombre y apellido familiar" />
                <Field name="contacto_parentesco" label="Parentesco" />
                <Field name="contacto_telefono" label="Número telefónico" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="observaciones" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observaciones
                </Label>
                <Textarea id="observaciones" name="observaciones" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">
                  Guardar remisión
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* PHD */}
          <TabsContent value="phd" className="pt-4">
            <form onSubmit={handlePHD} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  name="fecha_inicio"
                  label="Fecha y hora inicio trámite"
                  type="datetime-local"
                  required
                />
                <Field
                  name="fecha_radicado_display"
                  label="Fecha y hora radicación"
                  defaultValue="Se asigna automáticamente al guardar"
                  readOnly
                />
                <SelectField
                  name="servicio"
                  label="Servicio"
                  options={["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"]}
                  required
                />
                <Field name="cama" label="Cama" />
                <Field name="paciente" label="Nombres y apellidos paciente" required />
                <SelectField
                  name="tipo_documento"
                  label="Tipo de documento"
                  options={["CC", "CE", "TI", "RC", "RNV", "ASI", "MSI"]}
                  required
                />
                <Field name="documento" label="Documento" required />
                <Field name="edad" label="Edad" placeholder="Ej: 15 años" />
                <Field name="cie10" label="CIE-10" />
              </div>
              <SpecialtyList
                label="Especialidades tratantes"
                items={phdTratantes}
                onChange={setPhdTratantes}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  name="tipo_solicitud"
                  label="Tipo de solicitud"
                  options={[
                    "PHD",
                    "PAD CRONICO",
                    "OXIGENO DOMICILIARIO",
                    "PHD + OXIGENO DOMICILIARIO",
                    "PAD CRONICO + OXIGENO DOMICILIARIO",
                    "UNIDADES ESPECIALES",
                  ]}
                  required
                />
                <Field name="eapb" label="EAPB / ERP" placeholder="Ej: NUEVA EPS, SAVIA SALUD…" />
                <SelectField
                  name="regimen"
                  label="Régimen"
                  options={["SUBSIDIADO", "CONTRIBUTIVO", "ESPECIAL", "NO APLICA"]}
                />
                <Field name="codigo_radicacion" label="Código de radicación" />
                <SelectField
                  name="requiere_ambulancia"
                  label="Requiere ambulancia"
                  options={["SI", "NO"]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field name="contacto_nombre" label="Nombre y apellido familiar" />
                <Field name="contacto_parentesco" label="Parentesco" />
                <Field name="contacto_telefono" label="Número telefónico" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phd-obs" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observaciones
                </Label>
                <Textarea id="phd-obs" name="observaciones" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>


          {/* REF INTERNA */}
          <TabsContent value="interna" className="pt-4">
            <form onSubmit={handleRefInterna} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  name="fecha_inicio"
                  label="Fecha y hora inicio trámite"
                  type="datetime-local"
                  required
                />
                <Field
                  name="fecha_radicado_display"
                  label="Fecha y hora radicación"
                  defaultValue="Se asigna automáticamente al guardar"
                  readOnly
                />
                <SelectField
                  name="servicio"
                  label="Servicio"
                  options={["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"]}
                  required
                />
                <Field name="paciente" label="Nombres y apellidos paciente" required />
                <SelectField
                  name="tipo_documento"
                  label="Tipo de documento"
                  options={["CC", "CE", "TI", "RC", "RNV", "ASI", "MSI"]}
                  required
                />
                <Field name="documento" label="Documento" required />
                <SelectField
                  name="tipo_solicitud"
                  label="Tipo de solicitud"
                  options={[
                    "RESONANCIA",
                    "INTERCONSULTA",
                    "ECOGRAFIA",
                    "TAC",
                    "RX",
                    "URGENCIAS VITALES",
                    "REMISIONES ESPECIALES",
                  ]}
                  required
                />
                <SelectField
                  name="tipo_ambulancia"
                  label="Tipo de ambulancia"
                  options={["TAB", "TAM", "TAM-N"]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ri-obs" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observaciones
                </Label>
                <Textarea id="ri-obs" name="observaciones" rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* PENDIENTE */}
          <TabsContent value="pendiente" className="pt-4">
            <form onSubmit={handlePendiente} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="fecha_hora_display"
                  label="Fecha y hora"
                  defaultValue="Se asigna automáticamente al guardar"
                  readOnly
                />
                <SelectField
                  name="tipo_pendiente"
                  label="Tipo pendiente"
                  options={[
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
                  ]}
                  required
                />
                <Field name="paciente_asunto" label="Paciente / asunto" required />
                <Field name="ips_area" label="IPS / área" />
                <SelectField
                  name="prioridad"
                  label="Prioridad"
                  options={["ALTA", "MEDIA", "BAJA"]}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pend-obs" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observación de entrega
                </Label>
                <Textarea id="pend-obs" name="observacion_entrega" rows={2} required />
              </div>
              <DialogFooter>
                <Button type="submit" className="rounded-full">
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
