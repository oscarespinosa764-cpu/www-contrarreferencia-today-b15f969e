import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EVO_CANALES,
  canalesFaltantes,
  evolucionFromDetalle,
  evolucionMeta,
  fmtFechaHora,
  parseEvolucionDetalle,
  splitEspecialidades,
  type EvoEspecialidad,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";
import { PlantillasEnPaso } from "@/components/coordinacion/plantillas-en-paso";
import { Copy, RotateCcw } from "lucide-react";
import {
  AMBULANCIA_VARIANTES,
  CANCELACION_SUBTIPOS,
  CIERRE_SUBTIPOS,
  EVO_SITUACIONES,
  PERTINENCIA_SUBTIPOS,
  esTramiteSoat,
  generarPlantillaAmbulancia,
  generarPlantillaCanal,
  generarPlantillaCancelacion,
  generarPlantillaCierre,
  generarPlantillaEvolucion,
  generarPlantillaOtro,
  generarPlantillaPertinencia,
  generarPlantillaRadicacion,
  generarPlantillaRespuestaIps,
  plantillaRechazoFamilia,
  type AmbulanciaVariante,
  type CancelacionSubtipo,
  type CierreSubtipo,
  type EvolucionSituacion,
  type PertinenciaSubtipo,
  type RadicacionTipo,
} from "@/lib/indigo-trazabilidad";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  documento?: string | null;
  evolucionActual?: string | null;
  /** JSON con el detalle de evolución por especialidad. */
  evolucionDetalle?: string | null;
  /** Especialidades tratantes/remisoras (texto separado por comas). */
  especialidades?: string | null;
  /** Radicado guardado en el caso. */
  radicadoCaso?: string | null;
  /** Tabla a actualizar para la evolución del caso (remisiones, domiciliarios, etc.). */
  tabla?: string;
  /** Opciones de estado del caso (solo remisiones y PHD lo cambian desde aquí). */
  estadoOpciones?: string[];
  /** Estado actual del caso. */
  estadoActual?: string | null;
};

// --- Tipos de seguimiento para REMISIONES SALIENTES (lista limpia, sin duplicados) ---
const T = {
  RADICADO: "Radicado de caso",
  EVOLUCION: "Evolución diaria",
  CORREO: "Correo electrónico",
  PLATAFORMA: "Plataforma web",
  FISICO: "Físico o presencial",
  LLAMADA: "Llamada al centro receptor / contacto telefónico",
  RESPUESTA: "Respuesta de IPS",
  AMBULANCIA: "Coordinación de ambulancia",
  CIERRE: "Cierre de trámite",
  CANCELACION: "Cancelación de trámite administrativo",
  PERTINENCIA: "Validación de pertinencia médica",
  OTRO: "Otro seguimiento",
} as const;

const TIPOS_SALIENTES = [
  T.RADICADO,
  T.EVOLUCION,
  T.CORREO,
  T.PLATAFORMA,
  T.FISICO,
  T.LLAMADA,
  T.RESPUESTA,
  T.AMBULANCIA,
  T.CIERRE,
  T.CANCELACION,
  T.PERTINENCIA,
  T.OTRO,
];

// Lista heredada para otros módulos (domiciliarios, PHD, etc.). No se modifica su flujo.
const TIPOS_LEGACY = [
  "Radicado / inicio trámite de remisión",
  "Telefónico / celular",
  "Correo electrónico",
  "Plataforma web",
  "Físico o presencial",
  "Respuesta de IPS",
  "Gestión ambulancia",
  "Actualización clínica",
  "Contacto familiar",
  "Otro",
];

const ESTADOS_SOLICITUD = ["Sí acepta", "No acepta", "Pendiente", "No aplica"];

function splitComma(v?: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SeguimientoDialog({
  open,
  onOpenChange,
  casoId,
  tipoCaso,
  paciente,
  documento,
  evolucionDetalle,
  especialidades,
  radicadoCaso,
  tabla,
  estadoOpciones,
  estadoActual,
}: Props) {
  const qc = useQueryClient();
  const especialidadesList = useMemo(() => splitEspecialidades(especialidades), [especialidades]);

  const esSaliente = tabla === "remisiones";
  const TIPOS_SEG = esSaliente ? TIPOS_SALIENTES : TIPOS_LEGACY;

  const [nuevoRadicado, setNuevoRadicado] = useState(false);
  const [noAplicaRadicado, setNoAplicaRadicado] = useState(false);
  const [radicado, setRadicado] = useState("");
  const [tipoSeg, setTipoSeg] = useState("");
  const [detalle, setDetalle] = useState("");
  const [estadoSolicitud, setEstadoSolicitud] = useState("");
  const [nombreContacto, setNombreContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [evoDetalle, setEvoDetalle] = useState<Record<string, EvoEspecialidad>>({});
  // Snapshot de lo ya guardado: los canales en true quedan bloqueados.
  const [inicial, setInicial] = useState<Record<string, EvoEspecialidad>>({});
  const [motivoEvo, setMotivoEvo] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyEvo, setBusyEvo] = useState(false);
  const [estadoCaso, setEstadoCaso] = useState("");

  // --- Índigo: plantilla editable y campos por tipo de seguimiento ---
  const [indigoTexto, setIndigoTexto] = useState("");
  const [indigoEditada, setIndigoEditada] = useState(false);
  const [evoSituacion, setEvoSituacion] = useState<EvolucionSituacion>("estandar");
  const [evoAgregarNacional, setEvoAgregarNacional] = useState(false);
  const [evoDeptos, setEvoDeptos] = useState<string[]>([]);
  const [destinatario, setDestinatario] = useState("");
  const [ipsReceptora, setIpsReceptora] = useState("");
  const [rechazoFamilia, setRechazoFamilia] = useState(false);
  const [ambVariante, setAmbVariante] = useState<AmbulanciaVariante>("empresa");
  const [empresaAmb, setEmpresaAmb] = useState("");
  const [fechaTraslado, setFechaTraslado] = useState("");
  const [horaTraslado, setHoraTraslado] = useState("");
  const [cierreSub, setCierreSub] = useState<CierreSubtipo>("rechazo_familia");
  const [funcionarioFact, setFuncionarioFact] = useState("");
  const [cancelSub, setCancelSub] = useState<CancelacionSubtipo>("notificacion");
  const [pertinenciaSub, setPertinenciaSub] = useState<PertinenciaSubtipo>("con_nota");

  // Datos completos del caso (solo remisiones salientes) para alimentar las plantillas.
  const { data: caso } = useQuery({
    queryKey: ["remision-indigo-caso", casoId],
    enabled: open && esSaliente,
    queryFn: async () => {
      const { data } = await supabase
        .from("remisiones")
        .select(
          "eapb, tipo_tramite, alcance_red, ips_red_local, departamentos_red_nacional, eapb_tiene_plataforma, eapb_genera_codigo, plataforma_funcionando, ips_receptora",
        )
        .eq("id", casoId)
        .maybeSingle();
      return data as {
        eapb: string | null;
        tipo_tramite: string | null;
        alcance_red: string | null;
        ips_red_local: string | null;
        departamentos_red_nacional: string | null;
        eapb_tiene_plataforma: boolean | null;
        eapb_genera_codigo: boolean | null;
        plataforma_funcionando: boolean | null;
        ips_receptora: string | null;
      } | null;
    },
  });

  const { data: catDeptos = [] } = useQuery({
    queryKey: ["cat-departamento"],
    enabled: open && esSaliente,
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

  // Inicializar el checklist por especialidad y los campos al abrir.
  useEffect(() => {
    if (open) {
      const parsed = parseEvolucionDetalle(evolucionDetalle, especialidadesList);
      setEvoDetalle(parsed);
      setInicial(parseEvolucionDetalle(evolucionDetalle, especialidadesList));
      setMotivoEvo("");
      setEstadoCaso(estadoActual ?? "");
      setIndigoEditada(false);
      setEvoSituacion("estandar");
      setEvoAgregarNacional(false);
    }
  }, [open, evolucionDetalle, especialidadesList, estadoActual]);

  // Prefill desde los datos del caso cuando llegan.
  useEffect(() => {
    if (open && caso) {
      setIpsReceptora(caso.ips_receptora ?? "");
      setEvoDeptos(caso.alcance_red === "LOCAL_NACIONAL" ? splitComma(caso.departamentos_red_nacional) : []);
    }
  }, [open, caso]);

  const { data: historial } = useQuery({
    queryKey: ["seguimientos-caso", casoId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("seguimientos")
        .select("*")
        .eq("caso_id", casoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // --- Flags y datos derivados del caso ---
  const generaCodigo = caso?.eapb_genera_codigo === true;
  const plataformaFueCaida = caso?.plataforma_funcionando === false;
  const tienePlataforma = caso?.eapb_tiene_plataforma === true;
  const esSoatCaso = esTramiteSoat(caso?.tipo_tramite ?? "");
  const casoLocalNacional = caso?.alcance_red === "LOCAL_NACIONAL";
  const ipsLocalArr = splitComma(caso?.ips_red_local);

  const esRadicado = esSaliente && tipoSeg === T.RADICADO;
  const esEvolucion = esSaliente && tipoSeg === T.EVOLUCION;

  const radicacionTipo: RadicacionTipo = !generaCodigo
    ? "sin_codigo"
    : plataformaFueCaida
      ? "plataforma_restablecida"
      : "con_codigo";

  // ¿La evolución incluye red nacional?
  const evoConNacional = casoLocalNacional ? true : evoAgregarNacional;
  const evoDeptosUsar = casoLocalNacional
    ? evoDeptos.length
      ? evoDeptos
      : splitComma(caso?.departamentos_red_nacional)
    : evoDeptos;

  // Plantilla Índigo generada según el tipo de seguimiento.
  const plantillaGenerada = useMemo(() => {
    if (!esSaliente || !tipoSeg) return "";
    switch (tipoSeg) {
      case T.RADICADO:
        return generarPlantillaRadicacion(radicacionTipo, radicado);
      case T.EVOLUCION:
        return generarPlantillaEvolucion({
          tienePlataforma,
          plataformaFuncionando: caso?.plataforma_funcionando ?? null,
          esSoat: esSoatCaso,
          conNacional: evoConNacional,
          ipsRedLocal: ipsLocalArr,
          departamentos: evoDeptosUsar,
          situacion: evoSituacion,
        });
      case T.CORREO:
        return generarPlantillaCanal("correo", { destinatario });
      case T.PLATAFORMA:
        return generarPlantillaCanal("plataforma", {});
      case T.FISICO:
        return generarPlantillaCanal("fisico", {});
      case T.LLAMADA:
        return generarPlantillaCanal("llamada", { nombre: nombreContacto, telefono, detalle });
      case T.RESPUESTA:
        return rechazoFamilia
          ? plantillaRechazoFamilia(ipsReceptora)
          : generarPlantillaRespuestaIps(estadoSolicitud, ipsReceptora, detalle);
      case T.AMBULANCIA:
        return generarPlantillaAmbulancia(ambVariante, empresaAmb, fechaTraslado, horaTraslado);
      case T.CIERRE:
        return generarPlantillaCierre(cierreSub, ipsReceptora, funcionarioFact);
      case T.CANCELACION:
        return generarPlantillaCancelacion(cancelSub);
      case T.PERTINENCIA:
        return generarPlantillaPertinencia(pertinenciaSub);
      case T.OTRO:
        return generarPlantillaOtro(detalle);
      default:
        return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    esSaliente,
    tipoSeg,
    radicacionTipo,
    radicado,
    tienePlataforma,
    caso?.plataforma_funcionando,
    esSoatCaso,
    evoConNacional,
    ipsLocalArr.join("|"),
    evoDeptosUsar.join("|"),
    evoSituacion,
    destinatario,
    nombreContacto,
    telefono,
    detalle,
    rechazoFamilia,
    ipsReceptora,
    estadoSolicitud,
    ambVariante,
    empresaAmb,
    fechaTraslado,
    horaTraslado,
    cierreSub,
    funcionarioFact,
    cancelSub,
    pertinenciaSub,
  ]);

  // Regenera el textarea mientras el usuario no lo haya editado manualmente.
  useEffect(() => {
    if (!indigoEditada) setIndigoTexto(plantillaGenerada);
  }, [plantillaGenerada, indigoEditada]);

  // Al cambiar el tipo de seguimiento, se vuelve a permitir la auto-generación.
  useEffect(() => {
    setIndigoEditada(false);
  }, [tipoSeg]);

  const regenerar = () => {
    setIndigoEditada(false);
    setIndigoTexto(plantillaGenerada);
  };

  const copiarIndigo = async () => {
    try {
      await navigator.clipboard.writeText(indigoTexto);
      toast.success("Texto copiado para Índigo");
      try {
        await (supabase as any).rpc("registrar_auditoria", {
          _accion: "copiar_plantilla_indigo",
          _modulo: "remisiones",
          _tabla: tabla ?? "seguimientos",
          _registro_id: casoId,
          _resultado: "exito",
          _detalles: { tipo_seguimiento: tipoSeg },
        });
      } catch {
        /* la auditoría no debe interrumpir el copiado */
      }
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  };

  const radicadoExistente =
    radicadoCaso?.trim() || (historial ?? []).find((h) => h.radicado)?.radicado || "";
  const radicadoEnUso = noAplicaRadicado
    ? "No aplica"
    : nuevoRadicado || !radicadoExistente
      ? radicado
      : radicadoExistente;

  const isLocked = (esp: string, key: keyof EvoEspecialidad) => !!inicial[esp]?.[key];

  const toggleEvo = (esp: string, key: keyof EvoEspecialidad) => {
    if (isLocked(esp, key)) return; // No se puede desmarcar lo ya guardado.
    setEvoDetalle((prev) => ({
      ...prev,
      [esp]: { ...prev[esp], [key]: !prev[esp]?.[key] },
    }));
  };

  const toggleDepto = (d: string) =>
    setEvoDeptos((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const evolucionCalc = evolucionFromDetalle(evoDetalle);
  const metaCalc = evolucionMeta[evolucionCalc];
  const faltan = canalesFaltantes(evoDetalle);
  const requiereMotivo = evolucionCalc === "parcial";

  // ¿Mostrar el bloque de evolución diaria por especialidad?
  // En salientes solo cuando el tipo es "Evolución diaria"; en otros módulos siempre.
  const mostrarEvolucionDiaria = esSaliente ? esEvolucion : true;
  // Panel Índigo: solo para remisiones salientes y con un tipo seleccionado.
  const mostrarIndigo = esSaliente && !!tipoSeg;

  // Crea, actualiza o archiva el pendiente automático de evolución.
  const sincronizarPendiente = async (uid: string | undefined) => {
    const { data: existentes } = await supabase
      .from("pendientes")
      .select("id")
      .eq("caso_id", casoId)
      .eq("origen", "evolucion")
      .eq("archivado", false);
    const ids = (existentes ?? []).map((e) => e.id);

    if (evolucionCalc === "parcial") {
      const payload = {
        tipo_pendiente: "Evolución pendiente",
        paciente_asunto: documento ? `${paciente} · ${documento}` : paciente,
        prioridad: "ALTA",
        estado: "ABIERTO",
        observacion_entrega:
          `Falta: ${faltan.join(", ") || "—"}.` + (motivoEvo.trim() ? ` Motivo: ${motivoEvo.trim()}` : ""),
        fecha: new Date().toISOString().slice(0, 10),
        caso_id: casoId,
        tipo_caso: tipoCaso,
        origen: "evolucion",
      };
      if (ids.length > 0) {
        await supabase.from("pendientes").update(payload).eq("id", ids[0]);
        if (ids.length > 1)
          await supabase.from("pendientes").update({ archivado: true }).in("id", ids.slice(1));
      } else {
        await supabase.from("pendientes").insert({ ...payload, created_by: uid });
      }
    } else if (ids.length > 0) {
      // Completo o sin evolucionar → se elimina (archiva) el pendiente.
      await supabase.from("pendientes").update({ archivado: true }).in("id", ids);
    }
  };

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["seguimientos-caso", casoId] });
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["pendientes"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-ult"] });
  };

  const guardar = async () => {
    if (!tipoSeg) {
      toast.error("Selecciona el tipo de seguimiento");
      return;
    }
    if (requiereMotivo && mostrarEvolucionDiaria && !motivoEvo.trim()) {
      toast.error("Indica el motivo de la evolución pendiente");
      return;
    }
    if (esRadicado && generaCodigo && !radicado.trim()) {
      toast.error("El código de radicación es obligatorio para este seguimiento");
      return;
    }
    if (esEvolucion && evoConNacional && evoDeptosUsar.length === 0) {
      toast.error("Selecciona al menos un departamento de red nacional");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("user_id", u.user?.id ?? "")
      .maybeSingle();

    const { error } = await supabase.from("seguimientos").insert({
      caso_id: casoId,
      tipo_caso: tipoCaso,
      radicado: radicadoEnUso || null,
      tipo_seguimiento: tipoSeg,
      detalle: detalle || null,
      estado_solicitud: estadoSolicitud || null,
      nombre_contacto: nombreContacto.trim() || null,
      telefono: telefono.trim() || null,
      nombre_usuario: perfil?.nombre || u.user?.email || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    if (tabla) {
      const update: {
        evolucion: string;
        evolucion_detalle?: string;
        evolucion_actualizada_at?: string;
        evolucion_motivo?: string | null;
        codigo_radicacion?: string;
        estado?: string;
        trazabilidad_indigo?: string;
      } = { evolucion: evolucionCalc };
      if (especialidadesList.length > 0 && mostrarEvolucionDiaria) {
        update.evolucion_detalle = JSON.stringify(evoDetalle);
        update.evolucion_actualizada_at = new Date().toISOString();
        update.evolucion_motivo = requiereMotivo ? motivoEvo.trim() : null;
      }
      if (radicadoEnUso) update.codigo_radicacion = radicadoEnUso;
      if (esRadicado && generaCodigo && radicado.trim()) update.codigo_radicacion = radicado.trim();
      if (estadoOpciones && estadoCaso) update.estado = estadoCaso;
      if (esSaliente && indigoTexto.trim()) update.trazabilidad_indigo = indigoTexto.trim();
      await supabase
        .from(tabla as "remisiones")
        .update(update)
        .eq("id", casoId);
      if (especialidadesList.length > 0 && mostrarEvolucionDiaria)
        await sincronizarPendiente(u.user?.id);
    }

    // Auditoría de seguimiento y radicación (no bloquea el flujo).
    try {
      await (supabase as any).rpc("registrar_auditoria", {
        _accion: esRadicado ? "radicacion_en_plataforma" : "crear_seguimiento",
        _modulo: "remisiones",
        _tabla: tabla ?? "seguimientos",
        _registro_id: casoId,
        _resultado: "exito",
        _detalles: { tipo_seguimiento: tipoSeg },
      });
    } catch {
      /* la auditoría no debe interrumpir el seguimiento */
    }

    toast.success("Seguimiento registrado");
    setDetalle("");
    setTipoSeg("");
    setEstadoSolicitud("");
    setNombreContacto("");
    setTelefono("");
    setNuevoRadicado(false);
    setRechazoFamilia(false);
    setBusy(false);
    refrescar();
  };

  // Guarda únicamente la evolución por especialidad, sin exigir tipo de seguimiento.
  const guardarEvolucion = async () => {
    if (!tabla) return;
    if (especialidadesList.length === 0) {
      toast.error("No hay especialidades tratantes registradas en este caso.");
      return;
    }
    if (requiereMotivo && !motivoEvo.trim()) {
      toast.error("Indica el motivo de la evolución pendiente");
      return;
    }
    setBusyEvo(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from(tabla as "remisiones")
      .update({
        evolucion: evolucionCalc,
        evolucion_detalle: JSON.stringify(evoDetalle),
        evolucion_actualizada_at: new Date().toISOString(),
        evolucion_motivo: requiereMotivo ? motivoEvo.trim() : null,
      })
      .eq("id", casoId);
    if (error) {
      toast.error(error.message);
      setBusyEvo(false);
      return;
    }
    await sincronizarPendiente(u.user?.id);
    toast.success("Evolución guardada");
    setBusyEvo(false);
    refrescar();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="break-words text-base">Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Número de radicado */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Número de radicado
            </Label>
            {radicadoExistente && !nuevoRadicado && !noAplicaRadicado ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">{radicadoExistente}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setNuevoRadicado(true)}
                >
                  Agregar nuevo radicado
                </Button>
              </div>
            ) : (
              <Input
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                placeholder="Ej. 2026-000123"
                disabled={noAplicaRadicado}
              />
            )}
            {/* "No aplica" solo cuando aún no hay radicado generado/guardado. */}
            {!radicadoExistente && (
              <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={noAplicaRadicado}
                  onCheckedChange={(v) => setNoAplicaRadicado(!!v)}
                />
                No aplica (esta EPS no genera radicado)
              </label>
            )}
          </div>

          {/* Estado del caso (solo remisiones y PHD) */}
          {estadoOpciones && estadoOpciones.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estado del caso
              </Label>
              <Select value={estadoCaso} onValueChange={setEstadoCaso}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado…" />
                </SelectTrigger>
                <SelectContent>
                  {estadoOpciones.map((e) => (
                    <SelectItem key={e} value={e} className="whitespace-normal">
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                El estado del caso solo se cambia desde aquí.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de seguimiento
            </Label>
            <Select value={tipoSeg} onValueChange={setTipoSeg}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {TIPOS_SEG.map((t) => (
                  <SelectItem key={t} value={t} className="whitespace-normal">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ====== Campos por tipo (solo salientes) ====== */}

          {/* Radicado de caso: código de radicación */}
          {esRadicado && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Radicado de caso · Trazabilidad Índigo
              </p>
              {generaCodigo ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Código de radicación *
                  </Label>
                  <Input
                    value={radicado}
                    onChange={(e) => {
                      setRadicado(e.target.value);
                      setNuevoRadicado(true);
                    }}
                    placeholder="Ingresa el código de radicación"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Esta EAPB <strong>NO APLICA</strong> código de radicación. No se exige código.
                </p>
              )}
            </div>
          )}

          {/* Evolución diaria: situación + red nacional opcional */}
          {esEvolucion && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evolución diaria · Trazabilidad Índigo
              </p>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Situación de la evolución
                </Label>
                <Select value={evoSituacion} onValueChange={(v) => setEvoSituacion(v as EvolucionSituacion)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {EVO_SITUACIONES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {evoSituacion === "estandar" && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    IPS de red local del caso: {ipsLocalArr.length ? ipsLocalArr.join(", ") : "—"}
                  </p>
                  {!casoLocalNacional && (
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <Checkbox
                        checked={evoAgregarNacional}
                        onCheckedChange={(v) => setEvoAgregarNacional(!!v)}
                      />
                      Agregar red nacional a esta evolución
                    </label>
                  )}
                  {evoConNacional && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Departamentos de red nacional *
                      </Label>
                      <div className="max-h-32 space-y-1 overflow-auto rounded-md border border-border bg-background p-2">
                        {catDeptos.length === 0 ? (
                          <p className="text-[11px] italic text-muted-foreground">Sin departamentos en catálogo.</p>
                        ) : (
                          catDeptos.map((d) => (
                            <label key={d} className="flex items-center gap-2 text-xs">
                              <Checkbox checked={evoDeptos.includes(d)} onCheckedChange={() => toggleDepto(d)} />
                              {d}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Correo electrónico: destinatario */}
          {esSaliente && tipoSeg === T.CORREO && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Destinatario del correo
              </Label>
              <Input
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="Ej. EAPB / CRUE / IPS receptora"
              />
            </div>
          )}

          {/* Respuesta de IPS: IPS receptora + rechazo familia */}
          {esSaliente && tipoSeg === T.RESPUESTA && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  IPS receptora
                </Label>
                <Input
                  value={ipsReceptora}
                  onChange={(e) => setIpsReceptora(e.target.value)}
                  placeholder="Nombre de la IPS receptora"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={rechazoFamilia} onCheckedChange={(v) => setRechazoFamilia(!!v)} />
                Rechazo de la aceptación por el paciente / familia
              </label>
              <p className="text-[10px] text-muted-foreground">
                La plantilla usa el campo "Estado de la solicitud" salvo que marques el rechazo familiar.
              </p>
            </div>
          )}

          {/* Coordinación de ambulancia */}
          {esSaliente && tipoSeg === T.AMBULANCIA && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quién informa
                </Label>
                <Select value={ambVariante} onValueChange={(v) => setAmbVariante(v as AmbulanciaVariante)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {AMBULANCIA_VARIANTES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Empresa de ambulancia / TEP
                </Label>
                <Input value={empresaAmb} onChange={(e) => setEmpresaAmb(e.target.value)} placeholder="Empresa" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Fecha de traslado
                  </Label>
                  <Input value={fechaTraslado} onChange={(e) => setFechaTraslado(e.target.value)} placeholder="DD/MM/AAAA" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Hora de traslado
                  </Label>
                  <Input value={horaTraslado} onChange={(e) => setHoraTraslado(e.target.value)} placeholder="HH:MM" />
                </div>
              </div>
            </div>
          )}

          {/* Cierre de trámite */}
          {esSaliente && tipoSeg === T.CIERRE && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Motivo del cierre
                </Label>
                <Select value={cierreSub} onValueChange={(v) => setCierreSub(v as CierreSubtipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {CIERRE_SUBTIPOS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cierreSub === "rechazo_familia" ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    IPS receptora
                  </Label>
                  <Input value={ipsReceptora} onChange={(e) => setIpsReceptora(e.target.value)} placeholder="IPS receptora" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Funcionario de facturación
                  </Label>
                  <Input
                    value={funcionarioFact}
                    onChange={(e) => setFuncionarioFact(e.target.value)}
                    placeholder="Nombre del funcionario"
                  />
                </div>
              )}
            </div>
          )}

          {/* Cancelación de trámite administrativo */}
          {esSaliente && tipoSeg === T.CANCELACION && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de cancelación
              </Label>
              <Select value={cancelSub} onValueChange={(v) => setCancelSub(v as CancelacionSubtipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {CANCELACION_SUBTIPOS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Validación de pertinencia médica */}
          {esSaliente && tipoSeg === T.PERTINENCIA && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estado de la nota
              </Label>
              <Select value={pertinenciaSub} onValueChange={(v) => setPertinenciaSub(v as PertinenciaSubtipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {PERTINENCIA_SUBTIPOS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Estado de la solicitud */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Estado de la solicitud
            </Label>
            <Select value={estadoSolicitud} onValueChange={setEstadoSolicitud}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_SOLICITUD.map((e) => (
                  <SelectItem key={e} value={e} className="whitespace-normal">
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contacto y teléfono */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nombre de contacto
              </Label>
              <Input
                value={nombreContacto}
                onChange={(e) => setNombreContacto(e.target.value)}
                placeholder="Nombre del contacto"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Teléfono
              </Label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Teléfono"
                inputMode="tel"
                maxLength={30}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones
              </Label>
              <PlantillasEnPaso
                paso="salientes_seguimiento"
                condicion={tipoSeg}
                datos={{
                  PACIENTE: paciente,
                  DOCUMENTO: documento,
                  RADICADO: radicadoEnUso,
                  ESPECIALIDAD: especialidadesList.join(", "),
                  ESTADO: estadoCaso,
                }}
                onUsar={(texto) => setDetalle((d) => (d.trim() ? `${d}\n${texto}` : texto))}
              />
            </div>
            <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
          </div>

          {/* ====== Plantilla Índigo (texto plano editable) ====== */}
          {mostrarIndigo && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Plantilla para Índigo (texto plano editable)
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs"
                    onClick={regenerar}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Regenerar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs"
                    onClick={copiarIndigo}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar para Índigo
                  </Button>
                </div>
              </div>
              <Textarea
                value={indigoTexto}
                onChange={(e) => {
                  setIndigoTexto(e.target.value);
                  setIndigoEditada(true);
                }}
                rows={6}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          )}

          <Button className="w-full rounded-full" disabled={busy} onClick={guardar}>
            {busy ? "Guardando…" : "Registrar seguimiento"}
          </Button>

          {/* Evolución diaria por especialidad (solo cuando aplica) */}
          {mostrarEvolucionDiaria && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Evolución diaria
                </Label>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${metaCalc.chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${metaCalc.dot}`} />
                    {metaCalc.label}
                  </span>
                  {tabla && especialidadesList.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      disabled={busyEvo}
                      onClick={guardarEvolucion}
                    >
                      {busyEvo ? "Guardando…" : "Guardar"}
                    </Button>
                  )}
                </div>
              </div>
              {especialidadesList.length === 0 ? (
                <p className="py-2 text-center text-xs italic text-muted-foreground">
                  No hay especialidades tratantes registradas en este caso.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_4rem_4rem_4rem] items-end gap-x-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_5rem_5rem_5rem]">
                    <span>Especialidad</span>
                    {EVO_CANALES.map((c) => (
                      <span key={c.key} className="text-center leading-tight">
                        {c.label}
                      </span>
                    ))}
                  </div>
                  {especialidadesList.map((esp) => (
                    <div
                      key={esp}
                      className="grid grid-cols-[1fr_4rem_4rem_4rem] items-center gap-x-1 sm:grid-cols-[1fr_5rem_5rem_5rem]"
                    >
                      <span className="truncate text-sm text-foreground">{esp}</span>
                      {EVO_CANALES.map((c) => (
                        <div key={c.key} className="flex justify-center">
                          <Checkbox
                            checked={!!evoDetalle[esp]?.[c.key]}
                            disabled={isLocked(esp, c.key)}
                            onCheckedChange={() => toggleEvo(esp, c.key)}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-muted-foreground">
                    Índigo = sistema · EAPB Correo = enviada por correo · EAPB Plataforma = cargada en plataforma. Lo ya
                    guardado queda bloqueado.
                  </p>

                  {requiereMotivo && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-status-amber">
                        Motivo del pendiente {faltan.length ? `(falta ${faltan.join(", ")})` : ""}
                      </Label>
                      <Textarea
                        value={motivoEvo}
                        onChange={(e) => setMotivoEvo(e.target.value)}
                        rows={2}
                        placeholder="¿Por qué queda pendiente la evolución?"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Historial: solo los 2 últimos seguimientos */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos seguimientos
            </p>
            {(historial?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm italic text-muted-foreground">
                Sin seguimientos registrados.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.slice(0, 2).map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{h.tipo_seguimiento || "Seguimiento"}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtFechaHora(h.created_at)}</span>
                    </div>
                    {h.estado_solicitud && (
                      <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                        {h.estado_solicitud}
                      </span>
                    )}
                    {h.detalle && <p className="mt-1 break-words text-xs text-muted-foreground">{h.detalle}</p>}
                    {(h.nombre_contacto || h.telefono) && (
                      <p className="mt-1 break-words text-[11px] text-muted-foreground">
                        Contacto: {h.nombre_contacto || "—"}
                        {h.telefono ? ` · ${h.telefono}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {h.radicado ? `Radicado ${h.radicado} · ` : ""}
                      {h.nombre_usuario || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
