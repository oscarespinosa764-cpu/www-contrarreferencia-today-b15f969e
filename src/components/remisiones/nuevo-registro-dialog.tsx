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
  phdGeneraCodigo,
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
  const [eapbSel, setEapbSel] = useState(""); // autocompletado EAPB / ERP
  const [plataformaFunc, setPlataformaFunc] = useState<string>(""); // "SI" | "NO" | ""
  const [remisionPor, setRemisionPor] = useState("");
  const [redLocal, setRedLocal] = useState(false);
  const [redNacional, setRedNacional] = useState(false);
  const [ipsSel, setIpsSel] = useState<string[]>([]);
  const [deptosSel, setDeptosSel] = useState<string[]>([]);
  const [deptoOtro, setDeptoOtro] = useState("");
  const [indigoOpen, setIndigoOpen] = useState(false);
  const [indigoTexto, setIndigoTexto] = useState("");

  // --- PHD/PAD/O2/Especiales ---
  const [phdEapb, setPhdEapb] = useState("");
  const [phdTipoSolicitud, setPhdTipoSolicitud] = useState("");
  const [phdUnidadEspecial, setPhdUnidadEspecial] = useState("");
  const [phdRequiereAmb, setPhdRequiereAmb] = useState("");
  const [phdTipoAmb, setPhdTipoAmb] = useState("");
  const [phdRegimen, setPhdRegimen] = useState("");

  // --- Ref. Interna ---
  const [internaEapb, setInternaEapb] = useState("");

  // --- Pendiente ---
  const [pendTipo, setPendTipo] = useState("");
  const [pendCual, setPendCual] = useState("");
  const [pendDestinoTipo, setPendDestinoTipo] = useState<"IPS" | "AREA" | "">("");
  const [pendIps, setPendIps] = useState("");
  const [pendArea, setPendArea] = useState("");
  const [pendPrioridad, setPendPrioridad] = useState("");
  const [pendEvoEn, setPendEvoEn] = useState<string[]>([]);



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

  // EAPB con sus flags (tipo entidad / tiene plataforma / genera código / radicado por tipo).
  const { data: eapbList = [] } = useQuery({
    queryKey: ["cat-eapb-flags"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select(
          "valor, extra1, extra2, extra3, radica_phd, radica_pad, radica_oxigeno, radica_unidad_especial",
        )
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .order("valor");
      return (data ?? []) as {
        valor: string;
        extra1: string | null;
        extra2: string | null;
        extra3: string | null;
        radica_phd: boolean | null;
        radica_pad: boolean | null;
        radica_oxigeno: boolean | null;
        radica_unidad_especial: boolean | null;
      }[];
    },
  });

  const { data: regimenes = [] } = useQuery({
    queryKey: ["cat-regimen"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "REGIMEN")
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

  // Catálogo de IPS (autocompletado para pendientes).
  const { data: ipsCatalogo = [] } = useQuery({
    queryKey: ["cat-ips-valores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "IPS")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
  });

  // Opciones de EAPB para el autocompletado.
  const eapbOptions = useMemo(() => eapbList.map((e) => e.valor), [eapbList]);
  const eapbActual = useMemo(
    () => eapbList.find((e) => e.valor === eapbSel) ?? null,
    [eapbList, eapbSel],
  );
  const tipoEntidad = (eapbActual?.extra3 ?? "").toUpperCase();
  // SOAT se infiere por tipo de entidad = ASEGURADORA.
  const esSoat = /aseguradora/i.test(tipoEntidad);
  const tienePlataforma = (eapbActual?.extra1 ?? "").toUpperCase() === "SI";
  const generaCodigo = !esSoat && (eapbActual?.extra2 ?? "").toUpperCase() === "SI";
  const mostrarPreguntaPlataforma = tienePlataforma && !esSoat;
  const incluyeNacional = redNacional;
  // Para la plantilla Índigo se mantiene la lógica original (LOCAL / LOCAL_NACIONAL).
  const alcance: AlcanceRed = redNacional ? "LOCAL_NACIONAL" : "LOCAL";
  // Para almacenamiento/visualización se distingue también "NACIONAL".
  const alcanceStore = redLocal && redNacional ? "LOCAL_NACIONAL" : redNacional ? "NACIONAL" : "LOCAL";
  // El tipo de trámite se deriva (ya no se selecciona manualmente).
  const tipoTramiteDerivado = derivarTipoTramite(remisionPor, tipoEntidad);

  // EAPB seleccionada en la pestaña PHD (con sus flags de plataforma / radicado por tipo).
  const phdEapbActual = useMemo(
    () => eapbList.find((e) => e.valor === phdEapb) ?? null,
    [eapbList, phdEapb],
  );
  const phdTienePlataforma = (phdEapbActual?.extra1 ?? "").toUpperCase() === "SI";
  const phdGenera = phdGeneraCodigo(phdTipoSolicitud, phdEapbActual ?? undefined);
  const phdEsUnidadEspecial = /unidad/i.test(phdTipoSolicitud);


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
    setRemisionPor("");
    setRedLocal(false);
    setRedNacional(false);
    setIpsSel([]);
    setDeptosSel([]);
    setDeptoOtro("");
    setPhdEapb("");
    setPhdTipoSolicitud("");
    setPhdUnidadEspecial("");
    setPhdRequiereAmb("");
    setPhdTipoAmb("");
    setPhdRegimen("");
    setInternaEapb("");
    setPendTipo("");
    setPendCual("");
    setPendDestinoTipo("");
    setPendIps("");
    setPendArea("");
    setPendPrioridad("");
    setPendEvoEn([]);
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

    // Validaciones de campos obligatorios.
    if (tratantes.length === 0)
      return toast.error("Agrega al menos una especialidad tratante");
    if (receptoras.length === 0)
      return toast.error("Agrega al menos una especialidad receptora");
    if (!remisionPor) return toast.error("Selecciona el motivo en 'Remisión por'");
    if (!String(f.get("regimen") || "").trim())
      return toast.error("Selecciona el régimen");
    if (!eapbSel.trim()) return toast.error("Indica la EAPB / ERP");
    if (!redLocal && !redNacional)
      return toast.error("Marca la red a la que se comenta (local y/o nacional)");
    if (!String(f.get("especificacion") || "").trim())
      return toast.error("Escribe la justificación de la remisión");
    if (mostrarPreguntaPlataforma && !plataformaFunc)
      return toast.error("Indica si la plataforma se encuentra funcionando");
    if (redLocal && ipsSel.length === 0)
      return toast.error("Marca al menos una IPS de red local");
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

    const trazabilidad = generarPlantillaInicio({
      tipoTramite: tipoTramiteDerivado,
      tienePlataforma,
      plataformaFuncionando,
      generaCodigo,
      alcance,
      ipsRedLocal: ipsSel,
      departamentos: deptosFinal,
    });

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
        remision_por: remisionPor,
        especificacion: String(f.get("especificacion")),
        tipo_tramite: tipoTramiteDerivado,
        tipo_ambulancia: String(f.get("tipo_ambulancia")),
        regimen: String(f.get("regimen") || ""),
        asegurador: eapbSel || null,
        contacto_nombre: String(f.get("contacto_nombre")),
        contacto_parentesco: String(f.get("contacto_parentesco")),
        contacto_telefono: String(f.get("contacto_telefono")),
        observaciones: String(f.get("observaciones")),
        // Trazabilidad ÍNDIGO
        eapb: eapbSel || null,
        alcance_red: alcanceStore,
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
        _detalles: { tipo_tramite: tipoTramiteDerivado, alcance },
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

    // Validaciones de campos obligatorios.
    if (!String(f.get("fecha_inicio") || "").trim())
      return toast.error("Indica la fecha y hora de inicio del trámite");
    if (!String(f.get("servicio") || "").trim()) return toast.error("Selecciona el servicio");
    if (!String(f.get("cama") || "").trim()) return toast.error("Indica la cama");
    if (!String(f.get("paciente") || "").trim()) return toast.error("Indica el nombre del paciente");
    if (!String(f.get("tipo_documento") || "").trim())
      return toast.error("Selecciona el tipo de documento");
    if (!String(f.get("documento") || "").trim()) return toast.error("Indica el documento");
    if (!String(f.get("edad") || "").trim()) return toast.error("Indica la edad");
    if (!String(f.get("cie10") || "").trim()) return toast.error("Indica el CIE-10");
    if (phdTratantes.length === 0)
      return toast.error("Agrega al menos una especialidad tratante");
    if (!phdTipoSolicitud) return toast.error("Selecciona el tipo de solicitud");
    if (!phdEapb.trim()) return toast.error("Indica la EAPB / ERP");
    if (!phdRegimen) return toast.error("Selecciona el régimen");
    if (!phdRequiereAmb) return toast.error("Indica si requiere ambulancia");
    if (phdRequiereAmb === "SI" && !phdTipoAmb)
      return toast.error("Selecciona el tipo de ambulancia");
    if (phdEsUnidadEspecial && !phdUnidadEspecial.trim())
      return toast.error("Indica la unidad especial");

    const { data: u } = await supabase.auth.getUser();
    const inicioRaw = String(f.get("fecha_inicio") || "");
    const genera = phdGenera;
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
      tipo_solicitud: phdTipoSolicitud,
      tipo_solicitud_detalle: phdEsUnidadEspecial ? phdUnidadEspecial.trim() : null,
      unidad_especial: phdEsUnidadEspecial ? phdUnidadEspecial.trim() : null,
      eapb: phdEapb || null,
      regimen: phdRegimen,
      codigo_radicacion: codigoInicial(genera),
      eapb_tiene_plataforma: phdTienePlataforma,
      eapb_genera_codigo: genera,
      requiere_ambulancia: phdRequiereAmb,
      tipo_ambulancia: phdRequiereAmb === "SI" ? phdTipoAmb : null,
      contacto_nombre: String(f.get("contacto_nombre")),
      contacto_parentesco: String(f.get("contacto_parentesco")),
      contacto_telefono: String(f.get("contacto_telefono")),
      observaciones: String(f.get("observaciones")),
      estado: "PENDIENTE ACEPTACION",
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
      eapb: internaEapb || null,
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

    if (!pendTipo) return toast.error("Selecciona el tipo de pendiente");
    if (pendTipo === "OTRO" && !pendCual.trim())
      return toast.error("Indica cuál es el pendiente (campo CUÁL)");
    if (!String(f.get("paciente_asunto") || "").trim())
      return toast.error("Indica el paciente / asunto");
    if (!pendPrioridad) return toast.error("Selecciona la prioridad");
    if (!pendDestinoTipo) return toast.error("Selecciona el tipo de destino (IPS o ÁREA)");
    if (pendDestinoTipo === "IPS" && !pendIps.trim())
      return toast.error("Indica el nombre de la IPS");
    if (pendDestinoTipo === "AREA" && !pendArea) return toast.error("Selecciona el área");

    const { data: u } = await supabase.auth.getUser();
    const destinoValor = pendDestinoTipo === "IPS" ? pendIps.trim() : pendArea;
    const tipoFinal = pendTipo === "OTRO" ? `OTRO: ${pendCual.trim().toUpperCase()}` : pendTipo;
    const detalles: Record<string, unknown> = {
      destino_tipo: pendDestinoTipo,
      destino: destinoValor,
    };
    if (pendTipo === "OTRO") detalles.cual = pendCual.trim();
    if (pendTipo === "EVOLUCIONAR") detalles.evolucion_pendiente_en = pendEvoEn;

    const { error } = await supabase.from("pendientes").insert({
      tipo_pendiente: tipoFinal,
      ips_area: destinoValor,
      paciente_asunto: String(f.get("paciente_asunto")),
      prioridad: pendPrioridad,
      observacion_entrega: String(f.get("observacion_entrega") || ""),
      detalles: detalles as never,
      estado: "ABIERTO",
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Pendiente registrado");
    reset();
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
                <SpecialtyList label="Esp. tratantes *" items={tratantes} onChange={handleTratantesChange} suggestions={especialidades} />
                <SpecialtyList label="Esp. receptoras *" items={receptoras} onChange={setReceptoras} suggestions={especialidades} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  name="prioridad"
                  label="Prioridad"
                  options={["ALTA", "MEDIA", "BAJA"]}
                  required
                />
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Remisión por *
                  </Label>
                  <select
                    value={remisionPor}
                    onChange={(e) => setRemisionPor(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Selecciona…</option>
                    {[
                      "RED NO CONTRATADA",
                      "NO RECURSO HUMANO",
                      "NO DISPONIBILIDAD DE INSUMO O TECNOLOGIA",
                      "NO DISPONIBILIDAD DE UNIDAD",
                      "NO DISPONIBILIDAD DE CAMAS",
                      "NIVEL DE COMPETENCIA",
                      "PETICION VOLUNTARIA",
                      "EN TRAMITE",
                    ].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {remisionPor === "RED NO CONTRATADA" && (
                    <p className="text-[10px] text-muted-foreground">
                      Se interpreta como trámite administrativo cancelable.
                    </p>
                  )}
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
                    <AutoComplete
                      label="EAPB / ERP"
                      value={eapbSel}
                      options={eapbOptions}
                      placeholder="Escribe para buscar EAPB / ERP…"
                      onChange={(v) => {
                        setEapbSel(v);
                        setPlataformaFunc("");
                      }}
                      onPick={(v) => {
                        setEapbSel(v);
                        setPlataformaFunc("");
                      }}
                    />
                    {eapbActual && (
                      <p className="text-[10px] text-muted-foreground">
                        {tipoEntidad || "SIN TIPO"} · {tienePlataforma ? "Tiene plataforma" : "Sin plataforma"} ·{" "}
                        {generaCodigo ? "Genera código" : "No genera código"}
                      </p>
                    )}
                  </div>

                  <SelectField
                    name="regimen"
                    label="Régimen"
                    required
                    options={
                      regimenes.length > 0
                        ? regimenes
                        : [
                            "CONTRIBUTIVO",
                            "SUBSIDIADO",
                            "ESPECIAL",
                            "EXCEPCIÓN",
                            "PARTICULAR",
                            "SOAT",
                            "ARL",
                            "PREPAGADA",
                            "NO APLICA",
                          ]
                    }
                  />



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
                      Red a la que se comenta *
                    </Label>
                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={redLocal} onCheckedChange={(v) => setRedLocal(!!v)} />
                        RED LOCAL
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={redNacional} onCheckedChange={(v) => setRedNacional(!!v)} />
                        RED NACIONAL
                      </label>
                    </div>
                  </div>
                </div>

                {redLocal && (
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="especificacion" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Justificación remisión <span className="text-status-red">*</span>
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
