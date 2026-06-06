import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, SpecialtyList } from "./form-bits";
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
  };


  const handleRemision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("remisiones").insert({
      paciente: String(f.get("paciente")),
      documento: String(f.get("documento")),
      edad: String(f.get("edad")),
      asegurador: String(f.get("asegurador")),
      regimen: String(f.get("regimen")),
      servicio: String(f.get("servicio")),
      cama: String(f.get("cama")),
      cie10: String(f.get("cie10")),
      prioridad: String(f.get("prioridad")),
      remision_por: String(f.get("remision_por")),
      tipo_tramite: String(f.get("tipo_tramite")),
      especialidades_tratantes: tratantes.join(", "),
      especialidades_receptoras: receptoras.join(", "),
      tipo_ambulancia: String(f.get("tipo_ambulancia")),
      contacto_nombre: String(f.get("contacto_nombre")),
      contacto_telefono: String(f.get("contacto_telefono")),
      contacto_parentesco: String(f.get("contacto_parentesco")),
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
    const { error } = await supabase.from("domiciliarios").insert({
      tipo_solicitud: String(f.get("tipo_solicitud")),
      unidad_especial: String(f.get("unidad_especial")),
      paciente: String(f.get("paciente")),
      documento: String(f.get("documento")),
      ips: String(f.get("ips")),
      prioridad: String(f.get("prioridad")),
      detalle: String(f.get("detalle")),
      observaciones: String(f.get("observaciones")),
      estado: "ACTIVO",
      evolucion: "sin",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitud especial registrada");
    onOpenChange(false);
    invalidate();
  };

  const handleRefInterna = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("referencia_interna").insert({
      tipo_solicitud: String(f.get("tipo_solicitud")),
      servicio: String(f.get("servicio")),
      proveedor_prestador: String(f.get("proveedor_prestador")),
      paciente: String(f.get("paciente")),
      documento: String(f.get("documento")),
      prioridad: String(f.get("prioridad")),
      observaciones: String(f.get("observaciones")),
      estado: "ACTIVO",
      evolucion: "sin",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Referencia interna registrada");
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
                <Field name="paciente" label="Paciente" required />
                <Field name="documento" label="Documento" required />
                <Field name="edad" label="Edad" required />
                <Field name="asegurador" label="Asegurador" required />
                <Field name="regimen" label="Régimen" required />
                <Field name="servicio" label="Servicio" required />
                <Field name="cama" label="Cama" required />
                <Field name="cie10" label="CIE-10" required />
                <Field name="prioridad" label="Prioridad" placeholder="Alta / Media / Baja" required />
                <Field name="remision_por" label="Remisión por" required />
                <Field name="tipo_tramite" label="Tipo trámite" required />
                <Field name="tipo_ambulancia" label="Ambulancia" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SpecialtyList label="Esp. tratantes" items={tratantes} onChange={setTratantes} />
                <SpecialtyList label="Esp. receptoras" items={receptoras} onChange={setReceptoras} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field name="contacto_nombre" label="Nombre familiar" />
                <Field name="contacto_telefono" label="Teléfono" />
                <Field name="contacto_parentesco" label="Parentesco" />
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="tipo_solicitud" label="Tipo solicitud" placeholder="PHD / PAD / O₂ / Especial" required />
                <Field name="unidad_especial" label="Unidad especial" />
                <Field name="paciente" label="Paciente" required />
                <Field name="documento" label="Documento" required />
                <Field name="ips" label="IPS / prestador" />
                <Field name="prioridad" label="Prioridad" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phd-detalle" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalle
                </Label>
                <Textarea id="phd-detalle" name="detalle" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phd-obs" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observaciones
                </Label>
                <Textarea id="phd-obs" name="observaciones" rows={2} />
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="tipo_solicitud" label="Tipo solicitud" required />
                <Field name="servicio" label="Servicio" required />
                <Field name="proveedor_prestador" label="Proveedor / prestador" />
                <Field name="paciente" label="Paciente" required />
                <Field name="documento" label="Documento" required />
                <Field name="prioridad" label="Prioridad" />
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
                <Field name="tipo_pendiente" label="Tipo pendiente" />
                <Field name="ips_area" label="IPS / área" />
                <Field name="paciente_asunto" label="Paciente / asunto" required />
                <Field name="prioridad" label="Prioridad" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pend-obs" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Observación de entrega
                </Label>
                <Textarea id="pend-obs" name="observacion_entrega" rows={2} />
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
