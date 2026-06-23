import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, SelectField, SpecialtyList, EdadField } from "./form-bits";
import { PatientBlock } from "./patient-block";
import { Cie10Field } from "./cie10-field";
import { toast } from "sonner";
import { PlantillasEnPaso } from "@/components/coordinacion/plantillas-en-paso";
import { IndigoPanel } from "./indigo-panel";
import { AutoComplete } from "@/components/rc/autocomplete";
import {
  generarPlantillaInicio,
  codigoInicial,
  derivarTipoTramite,
  type AlcanceRed,
} from "@/lib/indigo-trazabilidad";

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

  // --- Trazabilidad ÍNDIGO (remisión saliente) ---
  const [eapbSel, setEapbSel] = useState("");
  const [plataformaFunc, setPlataformaFunc] = useState<string>(""); // "SI" | "NO" | ""
  const [tipoTramiteSel, setTipoTramiteSel] = useState("");
  const [alcance, setAlcance] = useState<AlcanceRed | "">("");
  const [ipsSel, setIpsSel] = useState<string[]>([]);
  const [deptosSel, setDeptosSel] = useState<string[]>([]);
  const [deptoOtro, setDeptoOtro] = useState("");
  const [motivoNota, setMotivoNota] = useState<MotivoNota>("ninguno");
  const [indigoOpen, setIndigoOpen] = useState(false);
  const [indigoTexto, setIndigoTexto] = useState("");

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

  // EAPB con sus flags (tiene plataforma / genera código).
  const { data: eapbList = [] } = useQuery({
    queryKey: ["cat-eapb-flags"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor, extra1, extra2")
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .order("valor");
      return (data ?? []) as { valor: string; extra1: string | null; extra2: string | null }[];
    },
  });

  const { data: tiposTramite = [] } = useQuery({
    queryKey: ["cat-tipo-tramite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "TIPO_TRAMITE")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
  });

  const { data: ipsLocales = [] } = useQuery({
    queryKey: ["cat-ips-local"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "IPS_LOCAL")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
  });

  const { data: departamentos = [] } = useQuery({
    queryKey: ["cat-departamento"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "DEPARTAMENTO")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
  });

  const eapbActual = useMemo(
    () => eapbList.find((e) => e.valor === eapbSel) ?? null,
    [eapbList, eapbSel],
  );
  const esSoat = esTramiteSoat(tipoTramiteSel);
  const tienePlataforma = (eapbActual?.extra1 ?? "").toUpperCase() === "SI";
  const generaCodigo = !esSoat && (eapbActual?.extra2 ?? "").toUpperCase() === "SI";
  const mostrarPreguntaPlataforma = tienePlataforma && !esSoat;
  const incluyeNacional = alcance === "LOCAL_NACIONAL";

  const toggleList = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

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
    setEapbSel("");
    setPlataformaFunc("");
    setTipoTramiteSel("");
    setAlcance("");
    setIpsSel([]);
    setDeptosSel([]);
    setDeptoOtro("");
    setMotivoNota("ninguno");
  };

  // Al agregar/quitar en tratantes, migra automáticamente a receptoras
  const handleTratantesChange = (next: string[]) => {
    const added = next.filter((s) => !tratantes.includes(s));
    const removed = tratantes.filter((s) => !next.includes(s));
    setTratantes(next);
    setReceptoras((prev) => {
      let updated = [...prev];
      // agrega los nuevos que no estén ya en receptoras
      added.forEach((s) => {
        if (!updated.includes(s)) updated.push(s);
      });
      // quita de receptoras los que se quitaron de tratantes (si seguían migrados)
      updated = updated.filter((s) => !removed.includes(s));
      return updated;
    });
  };




  const handleRemision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    // Validaciones de trazabilidad ÍNDIGO.
    if (!tipoTramiteSel) return toast.error("Selecciona el tipo de trámite");
    if (!alcance) return toast.error("Selecciona el alcance de gestión / red comentada");
    if (mostrarPreguntaPlataforma && !plataformaFunc)
      return toast.error("Indica si la plataforma se encuentra funcionando");
    if (ipsSel.length === 0) return toast.error("Marca al menos una IPS de red local");
    const deptosFinal = [
      ...deptosSel.filter((d) => d !== "Otro"),
      ...(deptosSel.includes("Otro") && deptoOtro.trim() ? [deptoOtro.trim()] : []),
    ];
    if (incluyeNacional && deptosFinal.length === 0)
      return toast.error("Marca al menos un departamento de red nacional");

    const plataformaFuncionando = mostrarPreguntaPlataforma
      ? plataformaFunc === "SI"
      : null;
    const codigoRad = codigoInicial(generaCodigo);

    const plantilla = generarPlantillaInicio({
      tipoTramite: tipoTramiteSel,
      tienePlataforma,
      plataformaFuncionando,
      generaCodigo,
      alcance,
      ipsRedLocal: ipsSel,
      departamentos: deptosFinal,
    });
    const nota = generarNotaAclaratoria({ motivo: motivoNota });
    const trazabilidad = nota ? `${plantilla}\n\n${nota}` : plantilla;

    const { data: u } = await supabase.auth.getUser();
    const inicioRaw = String(f.get("fecha_inicio") || "");
    const { data: inserted, error } = await supabase
      .from("remisiones")
      .insert({
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
        tipo_tramite: tipoTramiteSel,
        tipo_ambulancia: String(f.get("tipo_ambulancia")),
        contacto_nombre: String(f.get("contacto_nombre")),
        contacto_parentesco: String(f.get("contacto_parentesco")),
        contacto_telefono: String(f.get("contacto_telefono")),
        observaciones: String(f.get("observaciones")),
        // Trazabilidad ÍNDIGO
        eapb: eapbSel || null,
        alcance_red: alcance,
        ips_red_local: ipsSel.join(", "),
        departamentos_red_nacional: deptosFinal.join(", "),
        eapb_tiene_plataforma: tienePlataforma,
        eapb_genera_codigo: generaCodigo,
        plataforma_funcionando: plataformaFuncionando,
        codigo_radicacion: codigoRad,
        trazabilidad_indigo: trazabilidad,
        estado: "PENDIENTE ACEPTACION",
        evolucion: "sin",
        created_by: u.user?.id,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);

    // Auditoría (no bloquea el flujo).
    try {
      await (supabase as any).rpc("registrar_auditoria", {
        _accion: "crear_caso_saliente",
        _modulo: "remisiones",
        _tabla: "remisiones",
        _registro_id: inserted?.id ?? null,
        _resultado: "exito",
        _detalles: { tipo_tramite: tipoTramiteSel, alcance },
      });
      await (supabase as any).rpc("registrar_auditoria", {
        _accion: "generar_plantilla_indigo_inicial",
        _modulo: "remisiones",
        _tabla: "remisiones",
        _registro_id: inserted?.id ?? null,
        _resultado: "exito",
      });
    } catch {
      /* la auditoría no debe interrumpir el registro */
    }

    toast.success("Remisión registrada");
    setIndigoTexto(trazabilidad);
    reset();
    onOpenChange(false);
    invalidate();
    setIndigoOpen(true);
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
    const { error } = await supabase.from("referencia_interna").insert({
      fecha_inicio: null,
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
    <>
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
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
                <EdadField key={`rem-edad-${resetKey}`} required />
                <Cie10Field key={`rem-cie-${resetKey}`} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SpecialtyList label="Esp. tratantes" items={tratantes} onChange={handleTratantesChange} suggestions={especialidades} />
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
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tipo de trámite *
                  </Label>
                  <select
                    value={tipoTramiteSel}
                    onChange={(e) => setTipoTramiteSel(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Selecciona…</option>
                    {tiposTramite.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <SelectField
                  name="tipo_ambulancia"
                  label="Tipo de ambulancia"
                  options={["TAB", "TAM", "TAM-N"]}
                  required
                />
              </div>

              {/* === Trazabilidad ÍNDIGO === */}
              <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Trazabilidad Índigo
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      EAPB / ERP
                    </Label>
                    <select
                      value={eapbSel}
                      onChange={(e) => {
                        setEapbSel(e.target.value);
                        setPlataformaFunc("");
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">Selecciona…</option>
                      {eapbList.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.valor}
                        </option>
                      ))}
                    </select>
                    {eapbActual && (
                      <p className="text-[10px] text-muted-foreground">
                        {tienePlataforma ? "Tiene plataforma" : "Sin plataforma"} ·{" "}
                        {generaCodigo ? "Genera código" : "No genera código"}
                      </p>
                    )}
                  </div>

                  {mostrarPreguntaPlataforma && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        ¿La plataforma se encuentra funcionando? *
                      </Label>
                      <select
                        value={plataformaFunc}
                        onChange={(e) => setPlataformaFunc(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="">Selecciona…</option>
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Alcance de gestión / red comentada *
                    </Label>
                    <select
                      value={alcance}
                      onChange={(e) => setAlcance(e.target.value as AlcanceRed | "")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">Selecciona…</option>
                      <option value="LOCAL">Red local</option>
                      <option value="LOCAL_NACIONAL">Red local + red nacional</option>
                    </select>
                  </div>
                </div>

                {alcance && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      IPS de red local * (marca al menos una)
                    </Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ipsLocales.map((ips) => (
                        <label key={ips} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={ipsSel.includes(ips)}
                            onCheckedChange={() => toggleList(ipsSel, ips, setIpsSel)}
                          />
                          {ips}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {incluyeNacional && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Departamentos de red nacional * (marca al menos uno)
                    </Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[...departamentos, "Otro"].map((d) => (
                        <label key={d} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={deptosSel.includes(d)}
                            onCheckedChange={() => toggleList(deptosSel, d, setDeptosSel)}
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                    {deptosSel.includes("Otro") && (
                      <Input
                        value={deptoOtro}
                        onChange={(e) => setDeptoOtro(e.target.value)}
                        placeholder="Escribe el departamento o región"
                        className="mt-2"
                      />
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nota aclaratoria (solo si aplica)
                  </Label>
                  <select
                    value={motivoNota}
                    onChange={(e) => setMotivoNota(e.target.value as MotivoNota)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {MOTIVOS_NOTA.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
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
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="observaciones" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Observaciones
                  </Label>
                  <PlantillasEnPaso paso="salientes_inicio" datos={{}} />
                </div>
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
                <PatientBlock key={`phd-pac-${resetKey}`} />
                <EdadField key={`phd-edad-${resetKey}`} />
                <Cie10Field key={`phd-cie-${resetKey}`} />
              </div>
              <SpecialtyList
                label="Especialidades tratantes"
                items={phdTratantes}
                onChange={setPhdTratantes}
                suggestions={especialidades}
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
                  name="fecha_hora_display"
                  label="Fecha y hora"
                  defaultValue="Se asigna automáticamente al guardar"
                  readOnly
                />
                <SelectField
                  name="servicio"
                  label="Servicio"
                  options={["URGENCIAS", "HOSPITALIZACION", "UCI ADULTOS", "QUIROFANO"]}
                  required
                />
                <PatientBlock key={`ri-pac-${resetKey}`} />
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
                <Field name="ips_area" label="IPS / área" required />
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

    <IndigoPanel
      open={indigoOpen}
      onOpenChange={setIndigoOpen}
      titulo="INICIO DE TRÁMITE DE REMISIÓN - TRAZABILIDAD ÍNDIGO"
      plantillaBase={indigoTexto}
    />
    </>
  );
}
