import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AutoComplete } from "@/components/rc/autocomplete";
import {
  EVO_CANALES,
  canalesFaltantes,
  evolucionFromDetalle,
  evolucionMeta,
  fmtFechaHora,
  isFechaValida,
  isHoraValida,
  maskFechaInput,
  maskHoraInput,
  parseEvolucionDetalle,
  splitEspecialidades,
  type EvoEspecialidad,
  type EvolucionEstado,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";
import { PlantillasEnPaso } from "@/components/coordinacion/plantillas-en-paso";
import { Copy, RotateCcw, Plus, X, Eye } from "lucide-react";
import {
  ACERCAMIENTO_OPCIONES,
  AMBULANCIA_VARIANTES,
  CANCELACION_GESTION,
  CANCELACION_TIPOS,
  CONTACTO_DESTINOS,
  NEGACION_MOTIVOS,
  REVISION_AUT_LABEL_COMPLETO,
  SERVICIO_CANCELACION,
  SERVICIO_OPCIONES,
  appendNota,
  esTramiteAdministrativo,
  esTramiteSoat,
  generarPlantillaAceptacionIps,
  generarPlantillaAmbulancia,
  generarPlantillaCambioAsegurador,
  generarPlantillaCancelacionRemision,
  generarPlantillaCierreAdmision,
  generarPlantillaCorreoSeg,
  generarPlantillaEvolucionDiaria,
  generarPlantillaEvolucionEspecialidades,
  generarPlantillaFisico,
  generarPlantillaNegaciones,
  generarPlantillaNuevoRadicado,
  generarPlantillaOtroSeg,
  generarPlantillaPendienteCumplimiento,
  generarPlantillaRefInternaCoordinado,
  generarPlantillaRefInternaCulminacion,
  generarPlantillaRefInternaPendiente,
  generarPlantillaPlataformaSeg,
  generarPlantillaRadicado,
  generarPlantillaRevisionAutorizacion,
  generarPlantillaTelefonico,
  type AcercamientoTipo,
  type AmbulanciaVariante,
  type CancelacionTipo,
  type ContactoDestino,
  type NegacionGrupo,
} from "@/lib/indigo-trazabilidad";
import { EntregaDocumentalDialog } from "@/components/remisiones/entrega-documental-dialog";




type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  documento?: string | null;
  evolucionActual?: string | null;
  evolucionDetalle?: string | null;
  especialidades?: string | null;
  radicadoCaso?: string | null;
  tabla?: string;
  estadoOpciones?: string[];
  estadoActual?: string | null;
};

// --- Tipos de seguimiento para REMISIONES SALIENTES (lista nueva) ---
const T = {
  RADICADO: "RADICADO DE CASO",
  EVOLUCION: "EVOLUCIÓN DIARIA",
  CORREO: "CORREO ELECTRÓNICO",
  PLATAFORMA: "PLATAFORMA WEB",
  FISICO: "FÍSICO O PRESENCIAL",
  TELEFONO: "CONTACTO TELEFÓNICO",
  ACEPTACION: "ACEPTACIÓN DE IPS RECEPTORA",
  NEGACIONES: "TRAZABILIDAD DE NEGACIONES",
  AMBULANCIA: "AMBULANCIA COORDINADA",
  ENTREGA_DOC: "ENTREGA DE DOCUMENTACIÓN AMBULANCIA",
  CIERRE: "CIERRE DE CASO POR EGRESO",
  CAMBIO_EAPB: "CAMBIO DE ASEGURADOR A EAPB",
  CANCELACION: "CANCELACIÓN DE TRÁMITE DE REMISIÓN",
  PERTINENCIA: "REVISIÓN AUTORIZACIÓN ESTANCIA (CANCELACIÓN)",
  NOVEDADES: "NOVEDADES",
  OTRO: "OTRO",
} as const;

// Estados secuenciales del caso saliente (sin acentos, compatibles con la BD existente).
const EST = {
  PENDIENTE_ACEPT: "PENDIENTE ACEPTACION",
  ACEPTADO_SIN: "ACEPTADO SIN PROGRAMACION DE AMBULANCIA",
  ACEPTADO_CON: "ACEPTADO CON AMBULANCIA COORDINADA",
  PENDIENTE_EGRESO: "PENDIENTE EGRESO REMISION",
  CERRADO_EXITOSO: "CERRADO POR REMISION EXITOSA",
  DESIST_IPS: "DESISTIMIENTO IPS",
  DESIST_GENERAL: "DESISTIMIENTO GENERAL",
} as const;

// --- Tipos de seguimiento PHD/PAD/O2/Especiales (reutiliza lógica saliente) ---
const TIPOS_PHD_BASE = [
  T.EVOLUCION,
  T.CORREO,
  T.PLATAFORMA,
  T.FISICO,
  T.OTRO,
] as const;

// --- Referencia interna ---
const TI = {
  PENDIENTE: "PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN",
  COORDINADO: "EXAMEN COORDINADO",
  CULMINACION: "CULMINACIÓN DE SOLICITUD",
} as const;
const TIPOS_INTERNA = [TI.PENDIENTE, TI.COORDINADO, TI.CULMINACION];

// --- Pendientes ---
const TP = {
  PARCIAL: "CUMPLIMIENTO PARCIAL",
  COMPLETO: "CUMPLIMIENTO COMPLETO",
} as const;
const TIPOS_PENDIENTE = [TP.PARCIAL, TP.COMPLETO];

const ESTADOS_SOLICITUD = ["Sí acepta", "No acepta", "Pendiente", "No aplica"];

function splitComma(v?: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normaliza el campo `detalles` (JSON o string) a un objeto. */
function parseDetalles(d: unknown): Record<string, unknown> | null {
  if (!d) return null;
  if (typeof d === "string") {
    try {
      return JSON.parse(d) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof d === "object") return d as Record<string, unknown>;
  return null;
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
  const esPhd = tabla === "domiciliarios";
  const esInterna = tabla === "referencia_interna";
  const esPendiente = tabla === "pendientes";
  // Módulo real para la auditoría (refleja el tablero de origen).
  const moduloAuditoria = tabla === "remisiones" ? "remisiones" : (tabla ?? "remisiones");
  // Prefijo de las claves de dictado por voz según el tablero de origen.
  const dictPrefix = esSaliente
    ? "salientes"
    : esPhd
      ? "phd"
      : esInterna
        ? "referencia_interna"
        : esPendiente
          ? "pendientes"
          : "salientes";
  // Módulos que reutilizan toda la lógica de trazabilidad Índigo.
  const usaIndigo = esSaliente || esPhd;

  // --- Estados base ---
  const [tipoSeg, setTipoSeg] = useState("");
  const [detalle, setDetalle] = useState(""); // observaciones
  const [estadoSolicitud, setEstadoSolicitud] = useState("");
  const [estadoCaso, setEstadoCaso] = useState("");
  const [nombreContacto, setNombreContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyEvo, setBusyEvo] = useState(false);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [cierreEgreso, setCierreEgreso] = useState<"si" | "no" | "">("");


  // Radicado
  const [radicado, setRadicado] = useState("");

  // Evolución diaria (legacy por especialidad)
  const [evoDetalle, setEvoDetalle] = useState<Record<string, EvoEspecialidad>>({});
  const [inicial, setInicial] = useState<Record<string, EvoEspecialidad>>({});
  const [motivoEvo, setMotivoEvo] = useState("");

  // Evolución diaria (salientes v2)
  const [evoCorreo, setEvoCorreo] = useState(false);
  const [evoPlataforma, setEvoPlataforma] = useState(false);
  const [plataformaFuncSeg, setPlataformaFuncSeg] = useState<"" | "SI" | "NO">("");
  const [evoMotivoPend, setEvoMotivoPend] = useState("");
  // Evolución diaria por especialidades tratantes (Parte 9): marca cuáles ya evolucionaron.
  const [evoEsp, setEvoEsp] = useState<Record<string, boolean>>({});

  // Físico / presencial
  const [acercamiento, setAcercamiento] = useState<AcercamientoTipo>("FAMILIAR");
  const [fisNombre, setFisNombre] = useState("");
  const [fisParentesco, setFisParentesco] = useState("");
  const [fisServicio, setFisServicio] = useState("");
  const [fisFuncionario, setFisFuncionario] = useState("");
  const [fisCargo, setFisCargo] = useState("");
  const [fisConQuien, setFisConQuien] = useState("");

  // Aceptación IPS
  const [ipsReceptora, setIpsReceptora] = useState("");
  const [ipsReceptoraSede, setIpsReceptoraSede] = useState("");

  // Negaciones
  const [negMotivo, setNegMotivo] = useState("");
  const [negCual, setNegCual] = useState(""); // motivo personalizado cuando es "OTRO"
  const [negIpsInput, setNegIpsInput] = useState("");
  const [negIpsCurrent, setNegIpsCurrent] = useState<string[]>([]);
  const [negGrupos, setNegGrupos] = useState<NegacionGrupo[]>([]);

  // Ambulancia
  const [ambVariante, setAmbVariante] = useState<AmbulanciaVariante>("empresa");
  const [empresaAmb, setEmpresaAmb] = useState("");
  const [fechaTraslado, setFechaTraslado] = useState("");
  const [horaTraslado, setHoraTraslado] = useState("");

  // Cancelación
  const [cancelTipo, setCancelTipo] = useState<CancelacionTipo>("desistimiento_general");
  const [cancelGestion, setCancelGestion] = useState("");
  const [cancelServicio, setCancelServicio] = useState("");
  const [cancelFuncionario, setCancelFuncionario] = useState("");
  const [cancelCargo, setCancelCargo] = useState("");
  const [cancelNuevoRadicado, setCancelNuevoRadicado] = useState("");

  // Cambio de asegurador a EAPB
  const [cambioEapb, setCambioEapb] = useState("");
  const [cambioPlataformaFunc, setCambioPlataformaFunc] = useState<"" | "SI" | "NO">("");
  const [cambioRadicado, setCambioRadicado] = useState("");

  // Otro
  const [otroCual, setOtroCual] = useState("");

  // Novedades (Parte 12)
  const [novPaciente, setNovPaciente] = useState(false);
  const [novIps, setNovIps] = useState(false);
  const [novAmbulancia, setNovAmbulancia] = useState(false);
  const [novDesistTipo, setNovDesistTipo] = useState<"" | "IPS_AMB" | "GENERAL">("");
  const [novDesistIps, setNovDesistIps] = useState(false);
  const [novDesistAmb, setNovDesistAmb] = useState(false);

  // Referencia interna
  const [riFuncionario, setRiFuncionario] = useState("");
  const [riCargo, setRiCargo] = useState("");
  const [riFecha, setRiFecha] = useState("");
  const [riHora, setRiHora] = useState("");
  const [riInformoAmb, setRiInformoAmb] = useState(false);
  const [riInformoServ, setRiInformoServ] = useState(false);

  // Revisión autorización estancia hospitalaria (antes pertinencia médica)
  const [revAutoriza, setRevAutoriza] = useState<"" | "SI" | "NO">("");
  const [revNota, setRevNota] = useState<"" | "SI" | "NO">("");
  const [revFuncionario, setRevFuncionario] = useState("");
  const [revCargo, setRevCargo] = useState("");

  // Asunto (correo / plataforma web)
  const [asunto, setAsunto] = useState("");

  // Contacto telefónico
  const [contactoDestino, setContactoDestino] = useState<ContactoDestino | "">("");
  const [contactoIps, setContactoIps] = useState("");

  // Radicado adicional ("+")
  const [nuevoRadicadoMode, setNuevoRadicadoMode] = useState(false);
  const [nuevoRadicado, setNuevoRadicado] = useState("");

  // Índigo
  const [indigoTexto, setIndigoTexto] = useState("");
  const [indigoEditada, setIndigoEditada] = useState(false);

  // Ver detalle / últimos seguimientos
  const [verDetalle, setVerDetalle] = useState<Record<string, unknown> | null>(null);

  // Datos del caso (remisiones salientes y PHD/PAD/O2/Especiales).
  const { data: caso } = useQuery({
    queryKey: ["indigo-caso", tabla, casoId],
    enabled: open && usaIndigo,
    queryFn: async () => {
      const { data } = await supabase
        .from((tabla ?? "remisiones") as "remisiones")
        .select(
          "eapb, tipo_tramite, eapb_tiene_plataforma, eapb_genera_codigo, plataforma_funcionando, ips_receptora, codigo_radicacion, tipo_documento, cie10, tipo_ambulancia",
        )
        .eq("id", casoId)
        .maybeSingle();
      return data as {
        eapb: string | null;
        tipo_tramite: string | null;
        eapb_tiene_plataforma: boolean | null;
        eapb_genera_codigo: boolean | null;
        plataforma_funcionando: boolean | null;
        ips_receptora: string | null;
        codigo_radicacion: string | null;
        tipo_documento: string | null;
        cie10: string | null;
        tipo_ambulancia: string | null;
      } | null;
    },
  });

  // Catálogo IPS con sede (autocompletado inteligente).
  const { data: ipsCat = [] } = useQuery({
    queryKey: ["cat-ips-sedes"],
    enabled: open && usaIndigo,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor, extra1, extra2")
        .eq("tipo", "IPS")
        .eq("activo", true)
        .order("valor");
      return (data ?? []) as { valor: string; extra1: string | null; extra2: string | null }[];
    },
  });

  // Catálogo empresas de ambulancia / TEP.
  const { data: empresasTep = [] } = useQuery({
    queryKey: ["cat-empresa-tep"],
    enabled: open && usaIndigo,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "EMPRESA_TEP")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => d.valor as string);
    },
  });

  // Catálogo EAPB con sus flags (para el cambio de asegurador).
  const { data: eapbCat = [] } = useQuery({
    queryKey: ["cat-eapb-flags-seg"],
    enabled: open && usaIndigo,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor, extra1, extra2, extra3")
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .order("valor");
      return (data ?? []) as {
        valor: string;
        extra1: string | null;
        extra2: string | null;
        extra3: string | null;
      }[];
    },
  });

  // Opciones de IPS expandidas por sede para el autocompletado.
  const ipsOptions = useMemo(() => {
    const out: { label: string; ips: string; sede: string }[] = [];
    for (const row of ipsCat) {
      const sedes = [
        ...(row.extra1 ?? "").split(";"),
        ...(row.extra2 ?? "").split(";"),
      ]
        .map((s) => s.trim())
        .filter(Boolean);
      if (sedes.length === 0) {
        out.push({ label: row.valor, ips: row.valor, sede: "" });
      } else {
        for (const sede of sedes) out.push({ label: `${row.valor} — ${sede}`, ips: row.valor, sede });
      }
    }
    return out;
  }, [ipsCat]);
  const ipsLabels = useMemo(() => ipsOptions.map((o) => o.label), [ipsOptions]);

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

  // --- Flags derivados del caso ---
  const generaCodigo = caso?.eapb_genera_codigo === true;
  const tienePlataforma = caso?.eapb_tiene_plataforma === true;
  const esSoatCaso = esTramiteSoat(caso?.tipo_tramite ?? "");
  const esAdminCaso = esTramiteAdministrativo(caso?.tipo_tramite ?? "");

  const radicadoReal =
    radicadoCaso && !/PENDIENTE|NO APLICA/i.test(radicadoCaso) ? radicadoCaso.trim() : "";

  // Lista de radicados (pueden registrarse varios separados por " · ").
  const radicadosLista = radicadoReal
    ? radicadoReal
        .split(/\s*·\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const ultimoRadicado = radicadosLista[radicadosLista.length - 1] ?? "";

  // ¿Mostrar la opción "RADICADO DE CASO"? Solo si la EAPB genera código y aún no existe radicado real.
  const mostrarOpcionRadicado = usaIndigo && generaCodigo && !radicadoReal;

  // --- Fase de la cadena secuencial del caso (según el estado guardado) ---
  const estadoUpper = (estadoActual ?? "").toUpperCase();
  const casoCerrado =
    estadoUpper.includes("CERRAD") ||
    estadoUpper.includes("EGRESAD") ||
    estadoUpper.includes("DESISTIMIENTO GENERAL");
  // Antes de aceptación: estado inicial o tras un desistimiento de IPS (se puede volver a buscar IPS).
  const faseAntesAceptacion =
    !casoCerrado &&
    (estadoUpper === "" ||
      estadoUpper.includes("PENDIENTE ACEPTAC") ||
      estadoUpper.includes("DESISTIMIENTO IPS"));
  const faseAceptadoSin = !casoCerrado && estadoUpper.includes("ACEPTADO SIN");
  const faseAceptadoCon = !casoCerrado && estadoUpper.includes("ACEPTADO CON AMBULANCIA");
  const facePendienteEgreso = !casoCerrado && estadoUpper.includes("PENDIENTE EGRESO");

  const mostrarAceptacion = faseAntesAceptacion;
  const mostrarAmbulancia = faseAceptadoSin;
  const mostrarEntregaDocOpt = faseAceptadoCon;
  // Cierre por egreso: disponible una vez el caso está aceptado (con ambulancia) o pendiente de egreso.
  const mostrarCierreOpt = faseAceptadoCon || facePendienteEgreso;

  const TIPOS_SALIENTES = useMemo(() => {
    const arr = [
      ...(mostrarOpcionRadicado ? [T.RADICADO] : []),
      T.EVOLUCION,
      T.CORREO,
      T.PLATAFORMA,
      T.FISICO,
      T.TELEFONO,
      ...(mostrarAceptacion ? [T.ACEPTACION] : []),
      T.NEGACIONES,
      ...(mostrarAmbulancia ? [T.AMBULANCIA] : []),
      ...(mostrarEntregaDocOpt ? [T.ENTREGA_DOC] : []),
      ...(mostrarCierreOpt ? [T.CIERRE] : []),
      T.CAMBIO_EAPB,
      T.CANCELACION,
      T.PERTINENCIA,
      T.NOVEDADES,
      T.OTRO,
    ];
    return arr;
  }, [
    mostrarOpcionRadicado,
    mostrarAceptacion,
    mostrarAmbulancia,
    mostrarEntregaDocOpt,
    mostrarCierreOpt,
  ]);

  // Tipos para PHD/PAD/O2/Especiales (subconjunto saliente).
  const TIPOS_PHD = useMemo(() => {
    return [...(mostrarOpcionRadicado ? [T.RADICADO] : []), ...TIPOS_PHD_BASE];
  }, [mostrarOpcionRadicado]);

  const TIPOS_SEG: string[] = esSaliente
    ? TIPOS_SALIENTES
    : esPhd
      ? TIPOS_PHD
      : esInterna
        ? TIPOS_INTERNA
        : esPendiente
          ? TIPOS_PENDIENTE
          : [];



  // Inicializar al abrir.
  useEffect(() => {
    if (!open) return;
    const parsed = parseEvolucionDetalle(evolucionDetalle, especialidadesList);
    setEvoDetalle(parsed);
    setInicial(parseEvolucionDetalle(evolucionDetalle, especialidadesList));
    setMotivoEvo("");
    setEstadoCaso(estadoActual ?? "");
    setIndigoEditada(false);
    setTipoSeg("");
    setEvoEsp({});
  }, [open, evolucionDetalle, especialidadesList, estadoActual]);

  // Prefill desde el caso.
  useEffect(() => {
    if (open && caso) {
      setIpsReceptora(caso.ips_receptora ?? "");
      setPlataformaFuncSeg(
        caso.plataforma_funcionando === false ? "NO" : caso.plataforma_funcionando === true ? "SI" : "",
      );
    }
  }, [open, caso]);

  // Al cambiar el tipo de seguimiento: defaults de estado de la solicitud y reactivar auto-generación.
  useEffect(() => {
    setIndigoEditada(false);
    // Reset de novedades al cambiar de tipo.
    if (tipoSeg !== T.NOVEDADES) {
      setNovPaciente(false);
      setNovIps(false);
      setNovAmbulancia(false);
      setNovDesistTipo("");
      setNovDesistIps(false);
      setNovDesistAmb(false);
    }
    if (!usaIndigo || !tipoSeg) return;
    // Estado de la solicitud automático según el tipo.
    if (tipoSeg === T.RADICADO || tipoSeg === T.CANCELACION || tipoSeg === T.CAMBIO_EAPB) setEstadoSolicitud("No aplica");
    else if (tipoSeg === T.ACEPTACION || tipoSeg === T.AMBULANCIA) setEstadoSolicitud("Sí acepta");
    else if (tipoSeg === T.NEGACIONES) setEstadoSolicitud("No acepta");
    else setEstadoSolicitud("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoSeg]);

  // Estado destino automático de la cadena secuencial (salientes).
  const estadoDestino = useMemo(() => {
    if (!esSaliente) return estadoCaso;
    let e = estadoActual ?? EST.PENDIENTE_ACEPT;
    if (tipoSeg === T.ACEPTACION) e = EST.ACEPTADO_SIN;
    else if (tipoSeg === T.AMBULANCIA) e = EST.ACEPTADO_CON;
    else if (tipoSeg === T.ENTREGA_DOC) e = EST.PENDIENTE_EGRESO;
    else if (tipoSeg === T.CIERRE) e = cierreEgreso === "si" ? EST.CERRADO_EXITOSO : (estadoActual ?? EST.PENDIENTE_ACEPT);
    else if (tipoSeg === T.NOVEDADES && novPaciente) {
      if (novDesistTipo === "GENERAL") e = EST.DESIST_GENERAL;
      else if (novDesistTipo === "IPS_AMB") {
        if (novDesistIps) e = EST.DESIST_IPS;
        else if (novDesistAmb) e = EST.ACEPTADO_SIN;
      }
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esSaliente, estadoActual, estadoCaso, tipoSeg, cierreEgreso, novPaciente, novDesistTipo, novDesistIps, novDesistAmb]);

  const esEvolucionSal = usaIndigo && tipoSeg === T.EVOLUCION;
  const esRadicado = usaIndigo && tipoSeg === T.RADICADO;
  const esFisico = usaIndigo && tipoSeg === T.FISICO;
  const esTelefono = usaIndigo && tipoSeg === T.TELEFONO;
  const esEntregaDoc = usaIndigo && tipoSeg === T.ENTREGA_DOC;
  const esCierre = usaIndigo && tipoSeg === T.CIERRE;
  const esCambioEapb = usaIndigo && tipoSeg === T.CAMBIO_EAPB;
  const esNovedades = usaIndigo && tipoSeg === T.NOVEDADES;

  // --- Cambio de asegurador: EAPB seleccionada y sus flags (extra1=plataforma, extra2=código, extra3=tipo). ---
  const eapbOptions = useMemo(() => eapbCat.map((e) => e.valor), [eapbCat]);
  const cambioEapbActual = useMemo(
    () => eapbCat.find((e) => e.valor === cambioEapb) ?? null,
    [eapbCat, cambioEapb],
  );
  const cambioTienePlataforma = (cambioEapbActual?.extra1 ?? "").toUpperCase() === "SI";
  const cambioGeneraCodigo = (cambioEapbActual?.extra2 ?? "").toUpperCase() === "SI";
  const cambioTipoEntidad = (cambioEapbActual?.extra3 ?? "").toUpperCase();
  // Casilla "Ambulancia" solo disponible tras coordinar ambulancia (o pendiente egreso).
  const novAmbDisponible = faseAceptadoCon || facePendienteEgreso;

  // --- Estado de evolución diaria (salientes v2) ---
  const evoEstadoSal: EvolucionEstado = useMemo(() => {
    if (tienePlataforma) {
      const n = (evoCorreo ? 1 : 0) + (evoPlataforma ? 1 : 0);
      return n === 0 ? "sin" : n === 1 ? "parcial" : "completo";
    }
    return evoCorreo ? "completo" : "sin";
  }, [tienePlataforma, evoCorreo, evoPlataforma]);
  const evoMetaSal = evolucionMeta[evoEstadoSal];
  const evoRequiereMotivo = esEvolucionSal && tienePlataforma && evoEstadoSal === "parcial";

  // --- Evolución por especialidades tratantes (Parte 9) ---
  const evoEspEvolucionadas = useMemo(
    () => especialidadesList.filter((e) => evoEsp[e]),
    [especialidadesList, evoEsp],
  );
  const evoEspPendientes = useMemo(
    () => especialidadesList.filter((e) => !evoEsp[e]),
    [especialidadesList, evoEsp],
  );
  const evoEspEstado: "COMPLETA" | "PARCIAL" | "PENDIENTE" =
    especialidadesList.length === 0
      ? "PENDIENTE"
      : evoEspEvolucionadas.length === especialidadesList.length
        ? "COMPLETA"
        : evoEspEvolucionadas.length > 0
          ? "PARCIAL"
          : "PENDIENTE";
  const evoEspMeta: Record<string, { chip: string; dot: string }> = {
    COMPLETA: { chip: "bg-status-green/15 text-status-green", dot: "bg-status-green" },
    PARCIAL: { chip: "bg-status-amber/15 text-status-amber", dot: "bg-status-amber" },
    PENDIENTE: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  };
  const toggleEvoEsp = (esp: string) =>
    setEvoEsp((prev) => ({ ...prev, [esp]: !prev[esp] }));

  // Autollenar/limpiar el motivo automático "PLATAFORMA NO FUNCIONAL".
  // Solo aplica al Caso B: se envió por CORREO, falta plataforma y la plataforma NO funciona.
  useEffect(() => {
    if (!esEvolucionSal) return;
    const casoB = evoCorreo && !evoPlataforma && plataformaFuncSeg === "NO";
    if (casoB && !evoMotivoPend.trim()) {
      setEvoMotivoPend("PLATAFORMA NO FUNCIONAL");
    } else if (!casoB && evoMotivoPend === "PLATAFORMA NO FUNCIONAL") {
      // Limpia el autollenado si cambian las condiciones (p.ej. solo plataforma).
      setEvoMotivoPend("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esEvolucionSal, evoCorreo, evoPlataforma, plataformaFuncSeg]);

  // Estado de la solicitud automático para EVOLUCIÓN DIARIA → PENDIENTE (no editable).
  useEffect(() => {
    if (esEvolucionSal) setEstadoSolicitud("Pendiente");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esEvolucionSal]);

  // Motivo de negación resuelto (texto personalizado cuando se elige "OTRO").
  const negMotivoResuelto =
    negMotivo === "OTRO" ? (negCual.trim() ? `OTRO MOTIVO: ${negCual.trim().toUpperCase()}` : "") : negMotivo;

  // Grupo de negación actual (no guardado) para incluirlo en la vista previa.
  const negGruposPreview = useMemo(() => {
    const arr = [...negGrupos];
    if (negMotivoResuelto && negIpsCurrent.length > 0)
      arr.push({ motivo: negMotivoResuelto, ips: negIpsCurrent });
    return arr;
  }, [negGrupos, negMotivoResuelto, negIpsCurrent]);

  // --- Plantilla Índigo generada según el tipo ---
  const plantillaGenerada = useMemo(() => {
    if (esInterna) {
      switch (tipoSeg) {
        case TI.PENDIENTE:
          return appendNota(
            generarPlantillaRefInternaPendiente({ funcionario: riFuncionario, cargo: riCargo }),
            detalle,
          );
        case TI.COORDINADO:
          return appendNota(
            generarPlantillaRefInternaCoordinado({
              fecha: riFecha,
              hora: riHora,
              informoAmbulancia: riInformoAmb,
              informoServicio: riInformoServ,
            }),
            detalle,
          );
        case TI.CULMINACION:
          return appendNota(generarPlantillaRefInternaCulminacion(), detalle);
        default:
          return "";
      }
    }
    if (esPendiente) {
      if (!tipoSeg) return "";
      return generarPlantillaPendienteCumplimiento(tipoSeg === TP.COMPLETO, detalle);
    }
    if (!usaIndigo) return "";
    // Flujo de radicado adicional ("+"): independiente del tipo de seguimiento.
    if (nuevoRadicadoMode) {
      return appendNota(generarPlantillaNuevoRadicado(ultimoRadicado, nuevoRadicado), detalle);
    }
    if (!tipoSeg) return "";
    let base = "";
    switch (tipoSeg) {
      case T.RADICADO:
        base = generarPlantillaRadicado(radicado);
        break;
      case T.EVOLUCION:
        // Con especialidades tratantes registradas, se deja trazabilidad por
        // especialidad (evolucionadas / pendientes). Sin ellas, plantilla clásica.
        if (especialidadesList.length > 0) {
          base = generarPlantillaEvolucionEspecialidades({
            evolucionadas: evoEspEvolucionadas,
            pendientes: evoEspPendientes,
            enviadoCorreo: evoCorreo,
            enviadoPlataforma: tienePlataforma ? evoPlataforma : false,
            observacion: detalle,
          });
        } else {
          base = generarPlantillaEvolucionDiaria({
            estadoCaso,
            esTramiteAdministrativo: esAdminCaso,
            tienePlataforma,
            plataformaFunciona: tienePlataforma ? plataformaFuncSeg === "SI" : null,
            enviadoCorreo: evoCorreo,
            enviadoPlataforma: evoPlataforma,
            motivoPendiente: evoMotivoPend,
          });
        }
        break;
      case T.CORREO:
        base = generarPlantillaCorreoSeg(asunto, estadoSolicitud);
        break;
      case T.PLATAFORMA:
        base = generarPlantillaPlataformaSeg(asunto, estadoSolicitud);
        break;
      case T.FISICO:
        base = generarPlantillaFisico({
          acercamiento,
          nombre: fisNombre,
          parentesco: fisParentesco,
          servicio: fisServicio,
          funcionario: fisFuncionario,
          cargo: fisCargo,
          conQuien: fisConQuien,
        });
        break;
      case T.TELEFONO:
        base = generarPlantillaTelefonico({
          destino: contactoDestino,
          ipsNombre: contactoIps,
          nombre: nombreContacto,
          telefono,
          estadoSolicitud,
        });
        break;
      case T.ACEPTACION:
        base = generarPlantillaAceptacionIps(ipsReceptora, ipsReceptoraSede);
        break;
      case T.NEGACIONES:
        base = generarPlantillaNegaciones(negGruposPreview);
        break;
      case T.AMBULANCIA:
        base = generarPlantillaAmbulancia(ambVariante, empresaAmb, fechaTraslado, horaTraslado);
        break;
      case T.CANCELACION:
        base = generarPlantillaCancelacionRemision({
          tipo: cancelTipo,
          gestion: cancelGestion,
          servicio: cancelServicio,
          funcionario: cancelFuncionario,
          cargo: cancelCargo,
          nuevoRadicado: cancelNuevoRadicado,
        });
        break;
      case T.PERTINENCIA:
        base = generarPlantillaRevisionAutorizacion({
          cuentaAutorizacion: revAutoriza === "SI" ? true : revAutoriza === "NO" ? false : null,
          cuentaNota: revNota === "SI" ? true : revNota === "NO" ? false : null,
          funcionario: revFuncionario,
          cargo: revCargo,
        });
        break;
      case T.CIERRE:
        base = generarPlantillaCierreAdmision(caso?.ips_receptora ?? ipsReceptora);
        break;
      case T.CAMBIO_EAPB:
        base = generarPlantillaCambioAsegurador({
          nuevaEapb: cambioEapb,
          tienePlataforma: cambioTienePlataforma,
          plataformaFunciona: cambioTienePlataforma ? cambioPlataformaFunc === "SI" : null,
          generaCodigo: cambioGeneraCodigo,
          nuevoRadicado: cambioRadicado,
        });
        break;
      case T.ENTREGA_DOC:
        base = "";
        break;
      case T.OTRO:
        base = generarPlantillaOtroSeg(otroCual, estadoSolicitud);
        break;
      case T.NOVEDADES: {
        if (novPaciente && novDesistTipo === "GENERAL") {
          base =
            "SE REGISTRA DESISTIMIENTO GENERAL DE LA REMISIÓN POR PARTE DE PACIENTE/FAMILIAR. SE CIERRA PROCESO SEGÚN TRAZABILIDAD REGISTRADA.";
        } else if (novPaciente && novDesistTipo === "IPS_AMB" && novDesistIps) {
          base =
            "SE REGISTRA DESISTIMIENTO DE IPS POR PARTE DE PACIENTE/FAMILIAR. SE DEJA TRAZABILIDAD Y SE CONTINÚA GESTIÓN PARA NUEVA ACEPTACIÓN SEGÚN CORRESPONDA.";
        } else if (novPaciente && novDesistTipo === "IPS_AMB" && novDesistAmb) {
          base =
            "SE REGISTRA DESISTIMIENTO DE AMBULANCIA POR PARTE DE PACIENTE/FAMILIAR. SE DEJA TRAZABILIDAD Y QUEDA PENDIENTE NUEVA COORDINACIÓN DE TRASLADO.";
        } else {
          const tipos = [
            novPaciente ? "PACIENTE/FAMILIAR" : "",
            novIps ? "IPS RECEPTORA" : "",
            novAmbulancia ? "AMBULANCIA" : "",
          ]
            .filter(Boolean)
            .join(", ");
          base = `SE REGISTRA NOVEDAD EN EL PROCESO DE REMISIÓN RELACIONADA CON ${tipos || "EL PROCESO"}.`;
        }
        break;
      }
      default:
        base = "";
    }
    return appendNota(base, detalle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    esSaliente,
    tipoSeg,
    nuevoRadicadoMode,
    nuevoRadicado,
    ultimoRadicado,
    radicado,
    estadoCaso,
    esAdminCaso,
    tienePlataforma,
    plataformaFuncSeg,
    evoCorreo,
    evoPlataforma,
    evoMotivoPend,
    especialidadesList,
    evoEspEvolucionadas,
    evoEspPendientes,
    estadoSolicitud,
    asunto,
    acercamiento,
    fisNombre,
    fisParentesco,
    fisServicio,
    fisFuncionario,
    fisCargo,
    fisConQuien,
    contactoDestino,
    contactoIps,
    nombreContacto,
    telefono,
    ipsReceptora,
    ipsReceptoraSede,
    negGruposPreview,
    ambVariante,
    empresaAmb,
    fechaTraslado,
    horaTraslado,
    cancelTipo,
    cancelGestion,
    cancelServicio,
    cancelFuncionario,
    cancelCargo,
    cancelNuevoRadicado,
    cambioEapb,
    cambioTienePlataforma,
    cambioGeneraCodigo,
    cambioPlataformaFunc,
    cambioRadicado,
    revAutoriza,
    revNota,
    revFuncionario,
    revCargo,
    otroCual,
    novPaciente,
    novIps,
    novAmbulancia,
    novDesistTipo,
    novDesistIps,
    novDesistAmb,
    detalle,
  ]);

  useEffect(() => {
    if (!indigoEditada) setIndigoTexto(plantillaGenerada);
  }, [plantillaGenerada, indigoEditada]);

  const regenerar = () => {
    setIndigoEditada(false);
    setIndigoTexto(plantillaGenerada);
  };

  const copiarIndigo = async () => {
    try {
      await navigator.clipboard.writeText(indigoTexto);
      toast.success("Texto copiado para Índigo");
      try {
        await registrarAuditoria({
          data: {
            accion: "copiar_plantilla_indigo",
            modulo: moduloAuditoria,
            tabla: tabla ?? "seguimientos",
            registroId: casoId,
            detalles: { tipo_seguimiento: tipoSeg },
          },
        });
      } catch {
        /* la auditoría no debe interrumpir el copiado */
      }
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  };

  // --- Visibilidad de campos ---
  // Contacto y teléfono solo en CONTACTO TELEFÓNICO (módulos con Índigo). Oculto en interna/pendiente.
  const mostrarContacto = usaIndigo ? esTelefono : false;
  // Estado del caso editable salvo en FÍSICO/PRESENCIAL.
  const estadoCasoEditable = !esFisico;
  // Estado de solicitud automático (no editable) en ciertos tipos.
  const estadoSolicAuto =
    usaIndigo &&
    [T.RADICADO, T.CANCELACION, T.CAMBIO_EAPB, T.ACEPTACION, T.AMBULANCIA, T.NEGACIONES, T.EVOLUCION].includes(
      tipoSeg as never,
    );
  const mostrarIndigo = !!tipoSeg || nuevoRadicadoMode;
  // Estado de la solicitud solo aplica a módulos con Índigo.
  const mostrarEstadoSolicitud = usaIndigo;

  // Evolución diaria por especialidad: ya no se usa (los módulos migraron a v2).
  const mostrarEvolucionLegacy = false;

  // --- Negaciones helpers ---
  const agregarIpsNeg = () => {
    const v = negIpsInput.trim();
    if (!v) return;
    if (!negIpsCurrent.includes(v)) setNegIpsCurrent((p) => [...p, v]);
    setNegIpsInput("");
  };
  const quitarIpsNeg = (v: string) => setNegIpsCurrent((p) => p.filter((x) => x !== v));
  const agregarGrupoNeg = () => {
    if (!negMotivo) return toast.error("Selecciona el motivo de negación");
    if (negMotivo === "OTRO" && !negCual.trim()) return toast.error("Indica cuál es el motivo (campo CUÁL)");
    if (negIpsCurrent.length === 0) return toast.error("Agrega al menos una IPS al motivo");
    setNegGrupos((p) => [...p, { motivo: negMotivoResuelto, ips: negIpsCurrent }]);
    setNegMotivo("");
    setNegCual("");
    setNegIpsCurrent([]);
    setNegIpsInput("");
  };
  const quitarGrupoNeg = (i: number) => setNegGrupos((p) => p.filter((_, idx) => idx !== i));

  // --- Evolución legacy (otros módulos) ---
  const isLocked = (esp: string, key: keyof EvoEspecialidad) => !!inicial[esp]?.[key];
  const toggleEvo = (esp: string, key: keyof EvoEspecialidad) => {
    if (isLocked(esp, key)) return;
    setEvoDetalle((prev) => ({ ...prev, [esp]: { ...prev[esp], [key]: !prev[esp]?.[key] } }));
  };
  const evolucionLegacyCalc = evolucionFromDetalle(evoDetalle);
  const metaLegacy = evolucionMeta[evolucionLegacyCalc];
  const faltanLegacy = canalesFaltantes(evoDetalle);
  const requiereMotivoLegacy = evolucionLegacyCalc === "parcial";

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["seguimientos-caso", casoId] });
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["pendientes"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-ult"] });
  };

  // Sincroniza el pendiente automático de evolución (legacy).
  const sincronizarPendienteLegacy = async (uid: string | undefined) => {
    const { data: existentes } = await supabase
      .from("pendientes")
      .select("id")
      .eq("caso_id", casoId)
      .eq("origen", "evolucion")
      .eq("archivado", false);
    const ids = (existentes ?? []).map((e) => e.id);
    if (evolucionLegacyCalc === "parcial") {
      const payload = {
        tipo_pendiente: "Evolución pendiente",
        paciente_asunto: documento ? `${paciente} · ${documento}` : paciente,
        prioridad: "ALTA",
        estado: "ABIERTO",
        observacion_entrega:
          `Falta: ${faltanLegacy.join(", ") || "—"}.` +
          (motivoEvo.trim() ? ` Motivo: ${motivoEvo.trim()}` : ""),
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
      await supabase.from("pendientes").update({ archivado: true }).in("id", ids);
    }
  };

  // Detalle JSON específico por tipo (estructura flexible).
  const construirDetalles = (): Record<string, unknown> | null => {
    if (esInterna) {
      switch (tipoSeg) {
        case TI.PENDIENTE:
          return { funcionario: riFuncionario.trim() || null, cargo: riCargo.trim() || null };
        case TI.COORDINADO:
          return {
            fecha: riFecha.trim() || null,
            hora: riHora.trim() || null,
            informo_ambulancia: riInformoAmb,
            informo_servicio: riInformoServ,
          };
        default:
          return null;
      }
    }
    if (esPendiente) {
      return { cumplimiento: tipoSeg === TP.COMPLETO ? "completo" : "parcial" };
    }
    if (!usaIndigo) return null;
    if (nuevoRadicadoMode) {
      return { radicado_anterior: ultimoRadicado || null, nuevo_radicado: nuevoRadicado.trim() };
    }
    switch (tipoSeg) {
      case T.RADICADO:
        return { radicado: radicado.trim() };
      case T.EVOLUCION:
        return {
          plataforma_funcionando: tienePlataforma ? plataformaFuncSeg : null,
          enviado_correo: evoCorreo,
          enviado_plataforma: tienePlataforma ? evoPlataforma : null,
          estado_evolucion: evoEstadoSal,
          motivo_pendiente: evoRequiereMotivo ? evoMotivoPend.trim() : null,
          // Trazabilidad por especialidades tratantes (Parte 9).
          especialidades_evolucionadas:
            especialidadesList.length > 0 ? evoEspEvolucionadas : null,
          especialidades_pendientes:
            especialidadesList.length > 0 ? evoEspPendientes : null,
          estado_evolucion_especialidades:
            especialidadesList.length > 0 ? evoEspEstado : null,
          medio_evolucion: evoCorreo && evoPlataforma
            ? "CORREO Y PLATAFORMA"
            : evoPlataforma
              ? "PLATAFORMA"
              : evoCorreo
                ? "CORREO"
                : null,
        };
      case T.CORREO:
      case T.PLATAFORMA:
        return { asunto: asunto.trim() || null };
      case T.FISICO:
        return {
          acercamiento,
          nombre: fisNombre.trim() || null,
          parentesco: fisParentesco.trim() || null,
          servicio: fisServicio || null,
          funcionario: fisFuncionario.trim() || null,
          cargo: fisCargo.trim() || null,
          con_quien: fisConQuien.trim() || null,
        };
      case T.TELEFONO:
        return {
          destino: contactoDestino || null,
          ips: contactoDestino === "IPS" ? contactoIps.trim() || null : null,
          nombre: nombreContacto.trim() || null,
          telefono: telefono.trim() || null,
        };
      case T.ACEPTACION:
        return { ips_receptora: ipsReceptora.trim(), sede: ipsReceptoraSede.trim() || null };
      case T.NEGACIONES:
        return { grupos: negGruposPreview };
      case T.AMBULANCIA:
        return {
          variante: ambVariante,
          empresa: empresaAmb.trim() || null,
          fecha: fechaTraslado.trim() || null,
          hora: horaTraslado.trim() || null,
        };
      case T.CANCELACION:
        return {
          tipo: cancelTipo,
          gestion: cancelGestion || null,
          servicio: cancelServicio || null,
          funcionario: cancelFuncionario.trim() || null,
          cargo: cancelCargo.trim() || null,
          nuevo_radicado: cancelNuevoRadicado.trim() || null,
        };
      case T.PERTINENCIA:
        return {
          cuenta_autorizacion: revAutoriza || null,
          cuenta_nota: revAutoriza === "SI" ? revNota || null : null,
          funcionario: revFuncionario.trim() || null,
          cargo: revCargo.trim() || null,
        };
      case T.CIERRE:
        return { egreso: cierreEgreso || null, ips_receptora: caso?.ips_receptora ?? ipsReceptora ?? null };
      case T.CAMBIO_EAPB:
        return {
          nueva_eapb: cambioEapb.trim() || null,
          tiene_plataforma: cambioTienePlataforma,
          plataforma_funcionando: cambioTienePlataforma ? cambioPlataformaFunc || null : null,
          genera_codigo: cambioGeneraCodigo,
          nuevo_radicado: cambioRadicado.trim() || null,
        };
      case T.OTRO:
        return { cual: otroCual.trim() };
      default:
        return null;
    }
  };

  const resetCampos = () => {
    setDetalle("");
    setTipoSeg("");
    setEstadoSolicitud("");
    setNombreContacto("");
    setTelefono("");
    setRadicado("");
    setEvoCorreo(false);
    setEvoPlataforma(false);
    setEvoEsp({});
    setCierreEgreso("");
    setEvoMotivoPend("");
    setFisNombre("");
    setFisParentesco("");
    setFisServicio("");
    setFisFuncionario("");
    setFisCargo("");
    setFisConQuien("");
    setIpsReceptoraSede("");
    setNegMotivo("");
    setNegCual("");
    setNegIpsInput("");
    setNegIpsCurrent([]);
    setNegGrupos([]);
    setEmpresaAmb("");
    setFechaTraslado("");
    setHoraTraslado("");
    setCancelGestion("");
    setCancelServicio("");
    setCancelFuncionario("");
    setCancelCargo("");
    setCancelNuevoRadicado("");
    setCambioEapb("");
    setCambioPlataformaFunc("");
    setCambioRadicado("");
    setOtroCual("");
    setNovPaciente(false);
    setNovIps(false);
    setNovAmbulancia(false);
    setNovDesistTipo("");
    setNovDesistIps(false);
    setNovDesistAmb(false);
    setAsunto("");
    setContactoDestino("");
    setContactoIps("");
    setRevAutoriza("");
    setRevNota("");
    setRevFuncionario("");
    setRevCargo("");
    setNuevoRadicadoMode(false);
    setNuevoRadicado("");
    setRiFuncionario("");
    setRiCargo("");
    setRiFecha("");
    setRiHora("");
    setRiInformoAmb(false);
    setRiInformoServ(false);
  };

  const guardar = async () => {
    // Flujo de radicado adicional ("+").
    if (nuevoRadicadoMode) {
      if (!nuevoRadicado.trim()) return toast.error("Ingresa el nuevo número de radicado");
      if (!detalle.trim())
        return toast.error("Indica las observaciones que justifican el nuevo radicado");
    } else {
      if (!tipoSeg) return toast.error("Selecciona el tipo de seguimiento");

      // Validaciones por tipo (salientes / PHD).
      if (esRadicado && generaCodigo && !radicado.trim())
        return toast.error("Ingresa el número de radicado");
      if (usaIndigo && (tipoSeg === T.CORREO || tipoSeg === T.PLATAFORMA) && !asunto.trim())
        return toast.error("Indica el asunto del seguimiento");
      if (esTelefono && !contactoDestino)
        return toast.error("Selecciona con quién se realizó el contacto");
      if (esTelefono && contactoDestino === "IPS" && !contactoIps.trim())
        return toast.error("Indica el nombre de la IPS");
      if (usaIndigo && tipoSeg === T.OTRO && !otroCual.trim())
        return toast.error("Indica en el campo CUÁL");
      if (usaIndigo && tipoSeg === T.PERTINENCIA) {
        if (!revAutoriza) return toast.error("Indica el estado de autorización de estancia");
        if (revAutoriza === "SI" && !revNota)
          return toast.error("Indica la trazabilidad de autorizaciones");
        if (revAutoriza === "SI" && revNota === "NO" && !revFuncionario.trim())
          return toast.error("Indica el nombre del funcionario");
      }
      if (usaIndigo && tipoSeg === T.NEGACIONES && negGruposPreview.length === 0)
        return toast.error("Agrega al menos un motivo de negación con su IPS");
      if (usaIndigo && tipoSeg === T.AMBULANCIA) {
        if (fechaTraslado.trim() && !isFechaValida(fechaTraslado))
          return toast.error("Fecha de traslado inválida (DD/MM/AAAA)");
        if (horaTraslado.trim() && !isHoraValida(horaTraslado))
          return toast.error("Hora de traslado inválida (HH:MM)");
      }
      // Referencia interna.
      if (esInterna && tipoSeg === TI.COORDINADO) {
        if (riFecha.trim() && !isFechaValida(riFecha))
          return toast.error("Fecha del examen inválida (DD/MM/AAAA)");
        if (riHora.trim() && !isHoraValida(riHora))
          return toast.error("Hora del examen inválida (HH:MM)");
      }
      if (evoRequiereMotivo && !evoMotivoPend.trim())
        return toast.error("Indica el motivo del pendiente");
      // 9.8 · Advertir si no se marcó ninguna especialidad ni se dejó observación.
      if (
        esEvolucionSal &&
        especialidadesList.length > 0 &&
        evoEspEvolucionadas.length === 0 &&
        !detalle.trim() &&
        !window.confirm(
          "No ha marcado especialidades evolucionadas ni ha registrado observación. ¿Desea continuar?",
        )
      )
        return;
      if (esCierre && !cierreEgreso)
        return toast.error("Indica si el paciente ya egresó de la institución");
      if (esCambioEapb) {
        if (!cambioEapb.trim()) return toast.error("Selecciona la nueva EAPB");
        if (cambioTienePlataforma && !cambioPlataformaFunc)
          return toast.error("Indica si la plataforma de la EAPB está funcionando");
        if (cambioGeneraCodigo && !cambioRadicado.trim())
          return toast.error("Ingresa el número de radicado de la nueva EAPB");
      }
      if (esNovedades) {
        if (!novPaciente && !novIps && !novAmbulancia)
          return toast.error("Selecciona al menos un tipo de novedad");
        if (novPaciente && novDesistTipo === "IPS_AMB" && !novDesistIps && !novDesistAmb)
          return toast.error("Marca al menos IPS o AMBULANCIA en el desistimiento");
        if (!detalle.trim()) return toast.error("Registra la observación de la novedad");
      }
      if (requiereMotivoLegacy && mostrarEvolucionLegacy && !motivoEvo.trim())
        return toast.error("Indica el motivo de la evolución pendiente");
    }

    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("user_id", u.user?.id ?? "")
      .maybeSingle();

    const radicadoSeg = !usaIndigo
      ? null
      : nuevoRadicadoMode
        ? nuevoRadicado.trim()
        : esRadicado
          ? radicado.trim()
          : cancelNuevoRadicado.trim() || radicadoReal || null;

    const tipoSegFinal = nuevoRadicadoMode ? "RADICADO ADICIONAL" : tipoSeg;

    const { error } = await supabase.from("seguimientos").insert({
      caso_id: casoId,
      tipo_caso: tipoCaso,
      radicado: radicadoSeg || null,
      tipo_seguimiento: tipoSegFinal,
      detalle: detalle || null,
      estado_solicitud: nuevoRadicadoMode || !mostrarEstadoSolicitud ? null : estadoSolicitud || null,
      nombre_contacto: mostrarContacto ? nombreContacto.trim() || null : null,
      telefono: mostrarContacto ? telefono.trim() || null : null,
      plantilla_indigo: indigoTexto.trim() || null,
      detalles: construirDetalles() as never,
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
        evolucion?: string;
        evolucion_detalle?: string;
        evolucion_actualizada_at?: string;
        evolucion_motivo?: string | null;
        codigo_radicacion?: string;
        estado?: string;
        archivado?: boolean;
        trazabilidad_indigo?: string;
        eapb?: string;
        asegurador?: string;
        eapb_tiene_plataforma?: boolean;
        eapb_genera_codigo?: boolean;
        plataforma_funcionando?: boolean | null;
      } = {};
      // Evolución diaria salientes v2: refleja estado en la tarjeta.
      if (esEvolucionSal) {
        update.evolucion = evoEstadoSal;
        if (especialidadesList.length > 0) {
          const cell: EvoEspecialidad =
            evoEstadoSal === "completo"
              ? { indigo: true, eapb_correo: true, eapb_plataforma: true }
              : evoEstadoSal === "sin"
                ? { indigo: false, eapb_correo: false, eapb_plataforma: false }
                : { indigo: true, eapb_correo: evoCorreo, eapb_plataforma: evoPlataforma };
          update.evolucion_detalle = JSON.stringify(
            Object.fromEntries(especialidadesList.map((e) => [e, cell])),
          );
          update.evolucion_actualizada_at = new Date().toISOString();
          update.evolucion_motivo = evoRequiereMotivo ? evoMotivoPend.trim() : null;
        }
      }
      if (esRadicado && radicado.trim()) update.codigo_radicacion = radicado.trim();
      if (nuevoRadicadoMode && nuevoRadicado.trim())
        update.codigo_radicacion = [...radicadosLista, nuevoRadicado.trim()].join(" · ");
      if (esSaliente && tipoSeg === T.CANCELACION && cancelNuevoRadicado.trim())
        update.codigo_radicacion = cancelNuevoRadicado.trim();
      // Cambio de asegurador a EAPB: actualiza la aseguradora del caso y sus flags.
      if (esSaliente && esCambioEapb && cambioEapb.trim()) {
        update.eapb = cambioEapb.trim();
        update.asegurador = cambioEapb.trim();
        update.eapb_tiene_plataforma = cambioTienePlataforma;
        update.eapb_genera_codigo = cambioGeneraCodigo;
        update.plataforma_funcionando = cambioTienePlataforma ? cambioPlataformaFunc === "SI" : null;
        if (cambioGeneraCodigo && cambioRadicado.trim()) update.codigo_radicacion = cambioRadicado.trim();
      }
      // Salientes: estado automático según la cadena secuencial.
      if (esSaliente) {
        if (estadoDestino && estadoDestino !== (estadoActual ?? "")) update.estado = estadoDestino;
        // Cierre por egresos (remisión exitosa) o desistimiento general → cierra y archiva.
        if (
          (esCierre && cierreEgreso === "si") ||
          estadoDestino === EST.CERRADO_EXITOSO ||
          estadoDestino === EST.DESIST_GENERAL
        ) {
          update.estado =
            estadoDestino === EST.DESIST_GENERAL ? EST.DESIST_GENERAL : EST.CERRADO_EXITOSO;
          update.archivado = true;
        }
      } else if (estadoOpciones && estadoCaso) {
        // PHD y otros módulos con opciones de estado: mantiene selección manual.
        update.estado = estadoCaso;
      }
      if (usaIndigo && indigoTexto.trim()) update.trazabilidad_indigo = indigoTexto.trim();
      // Referencia interna: refleja estado según el seguimiento y cierra al culminar.
      if (esInterna) {
        if (tipoSeg === TI.PENDIENTE) update.estado = "PENDIENTE COORDINACION";
        else if (tipoSeg === TI.COORDINADO) update.estado = "EXAMEN COORDINADO";
        else if (tipoSeg === TI.CULMINACION) {
          update.estado = "CULMINADO";
          update.archivado = true;
        }
      }
      // Pendientes: cumplimiento completo cierra y archiva el caso.
      if (esPendiente) {
        if (tipoSeg === TP.COMPLETO) {
          update.estado = "CUMPLIDO";
          update.archivado = true;
        } else {
          update.estado = "ABIERTO";
        }
      }

      if (Object.keys(update).length > 0) {
        await supabase
          .from(tabla as "remisiones")
          .update(update)
          .eq("id", casoId);
      }
    }


    try {
      await registrarAuditoria({
        data: {
          accion: esRadicado ? "radicacion_en_plataforma" : "crear_seguimiento",
          modulo: moduloAuditoria,
          tabla: tabla ?? "seguimientos",
          registroId: casoId,
          detalles: { tipo_seguimiento: tipoSeg },
        },
      });
    } catch {
      /* la auditoría no debe interrumpir el seguimiento */
    }

    toast.success("Seguimiento registrado");
    resetCampos();
    setBusy(false);
    refrescar();
  };

  // Guarda solo la evolución por especialidad (legacy).
  const guardarEvolucionLegacy = async () => {
    if (!tabla) return;
    if (especialidadesList.length === 0)
      return toast.error("No hay especialidades tratantes registradas en este caso.");
    if (requiereMotivoLegacy && !motivoEvo.trim())
      return toast.error("Indica el motivo de la evolución pendiente");
    setBusyEvo(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from(tabla as "remisiones")
      .update({
        evolucion: evolucionLegacyCalc,
        evolucion_detalle: JSON.stringify(evoDetalle),
        evolucion_actualizada_at: new Date().toISOString(),
        evolucion_motivo: requiereMotivoLegacy ? motivoEvo.trim() : null,
      })
      .eq("id", casoId);
    if (error) {
      toast.error(error.message);
      setBusyEvo(false);
      return;
    }
    await sincronizarPendienteLegacy(u.user?.id);
    toast.success("Evolución guardada");
    setBusyEvo(false);
    refrescar();
  };

  const sectionCls = "space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3";
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="break-words text-base">Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Número de radicado (solo módulos con Índigo) */}
          {usaIndigo && (
          <div className="space-y-1.5">
            <Label className={labelCls}>Número de radicado</Label>
            {radicadoReal && false ? null : null}
            {radicadoReal ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {radicadosLista.map((rad) => (
                    <span
                      key={rad}
                      className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium"
                    >
                      {rad}
                    </span>
                  ))}
                  {esSaliente && generaCodigo && !nuevoRadicadoMode && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-full"
                      aria-label="Agregar nuevo radicado"
                      title="Agregar nuevo número de radicado"
                      onClick={() => setNuevoRadicadoMode(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {nuevoRadicadoMode && (
                  <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className={labelCls}>Agregar nuevo número de radicado *</Label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label="Cancelar"
                        onClick={() => {
                          setNuevoRadicadoMode(false);
                          setNuevoRadicado("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      value={nuevoRadicado}
                      onChange={(e) => setNuevoRadicado(e.target.value)}
                      placeholder="Nuevo número de radicado"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Indica abajo, en observaciones, por qué se agrega un nuevo radicado.
                    </p>
                  </div>
                )}
              </div>
            ) : !esSaliente ? (
              <Input
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                placeholder="Ej. 2026-000123"
              />
            ) : !generaCodigo ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                NO APLICA
              </div>
            ) : esRadicado ? (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
                Ingresa el radicado en el bloque "RADICADO DE CASO" más abajo.
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
                Pendiente de radicación. Selecciona "RADICADO DE CASO" para registrarlo.
              </div>
            )}
          </div>
          )}

          {!nuevoRadicadoMode && (
          <>
          {/* Estado del caso */}
          {esSaliente ? (
            <div className="space-y-1.5">
              <Label className={labelCls}>Estado del caso (automático)</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground">
                {estadoDestino || EST.PENDIENTE_ACEPT}
              </div>
              <p className="text-[10px] text-muted-foreground">
                El estado se actualiza automáticamente según la cadena de seguimiento.
              </p>
            </div>
          ) : (
            estadoOpciones && estadoOpciones.length > 0 && (
              <div className="space-y-1.5">
                <Label className={labelCls}>Estado del caso</Label>
                <Select value={estadoCaso} onValueChange={setEstadoCaso} disabled={!estadoCasoEditable}>
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
                {!estadoCasoEditable && (
                  <p className="text-[10px] text-muted-foreground">
                    Este tipo de seguimiento no modifica el estado del caso.
                  </p>
                )}
              </div>
            )
          )}

          {/* Tipo de seguimiento */}
          <div className="space-y-1.5">
            <Label className={labelCls}>Tipo de seguimiento</Label>
            <Select value={tipoSeg} onValueChange={setTipoSeg}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {TIPOS_SEG.map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="whitespace-normal"
                    title={t === T.PERTINENCIA ? REVISION_AUT_LABEL_COMPLETO : undefined}
                  >
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ======= Campos por tipo (salientes) ======= */}

          {/* RADICADO DE CASO */}
          {esRadicado && (
            <div className={sectionCls}>
              <p className={labelCls}>Radicado de caso · Trazabilidad Índigo</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Número de radicado *</Label>
                <Input
                  value={radicado}
                  onChange={(e) => setRadicado(e.target.value)}
                  placeholder="Ingresa el número de radicado"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Estado del caso → PENDIENTE DE ACEPTACIÓN · Estado de solicitud → NO APLICA.
              </p>
            </div>
          )}

          {/* EVOLUCIÓN DIARIA (salientes v2) */}
          {esEvolucionSal && (
            <div className={sectionCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={labelCls}>Evolución diaria</p>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${evoMetaSal.chip}`}
                >
                  <span className={`h-2 w-2 rounded-full ${evoMetaSal.dot}`} />
                  {evoMetaSal.label.toUpperCase()}
                </span>
              </div>

              {tienePlataforma && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>¿Plataforma EAPB funcionando?</Label>
                  <Select
                    value={plataformaFuncSeg}
                    onValueChange={(v) => setPlataformaFuncSeg(v as "SI" | "NO")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SI">Sí</SelectItem>
                      <SelectItem value="NO">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={evoCorreo} onCheckedChange={(v) => setEvoCorreo(!!v)} />
                  EAPB CORREO
                </label>
                {tienePlataforma && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={evoPlataforma} onCheckedChange={(v) => setEvoPlataforma(!!v)} />
                    EAPB PLATAFORMA
                  </label>
                )}
              </div>

              {evoRequiereMotivo && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>
                    Motivo del pendiente ({evoCorreo ? "falta plataforma" : "falta correo"})
                  </Label>
                  <DictationTextarea
                    dictationKey="salientes.seguimiento.motivo_pendiente"
                    value={evoMotivoPend}
                    onChange={(e) => setEvoMotivoPend(e.target.value)}
                    rows={2}
                    placeholder="¿Por qué queda pendiente el otro canal?"
                  />
                </div>
              )}

              {/* Especialidades tratantes (Parte 9) */}
              <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={labelCls}>Especialidades tratantes</p>
                  {especialidadesList.length > 0 && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${evoEspMeta[evoEspEstado].chip}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${evoEspMeta[evoEspEstado].dot}`} />
                      EVOLUCIÓN {evoEspEstado}
                    </span>
                  )}
                </div>
                {especialidadesList.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    No hay especialidades tratantes registradas para este caso. Puedes continuar con la observación manual.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Marca las especialidades que ya fueron evolucionadas en este seguimiento.
                    </p>
                    <div className="space-y-1.5">
                      {especialidadesList.map((esp) => (
                        <label
                          key={esp}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Checkbox
                              checked={!!evoEsp[esp]}
                              onCheckedChange={() => toggleEvoEsp(esp)}
                            />
                            {esp}
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              evoEsp[esp] ? "text-status-green" : "text-muted-foreground"
                            }`}
                          >
                            {evoEsp[esp] ? "EVOLUCIONADA" : "PENDIENTE"}
                          </span>
                        </label>
                      ))}
                    </div>
                    {evoEspEstado === "PARCIAL" && (
                      <p className="text-[11px] text-status-amber">
                        Pendiente: {evoEspPendientes.join(", ")}.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}


          {/* FÍSICO O PRESENCIAL */}
          {esFisico && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>Acercamiento con</Label>
                <Select value={acercamiento} onValueChange={(v) => setAcercamiento(v as AcercamientoTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACERCAMIENTO_OPCIONES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {acercamiento === "FAMILIAR" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Nombre y apellido</Label>
                    <Input value={fisNombre} onChange={(e) => setFisNombre(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Parentesco</Label>
                    <Input value={fisParentesco} onChange={(e) => setFisParentesco(e.target.value)} />
                  </div>
                </div>
              )}
              {acercamiento === "SERVICIO" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Servicio</Label>
                    <Select value={fisServicio} onValueChange={setFisServicio}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICIO_OPCIONES.map((s) => (
                          <SelectItem key={s} value={s} className="whitespace-normal">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Nombre del funcionario</Label>
                      <Input value={fisFuncionario} onChange={(e) => setFisFuncionario(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Cargo del funcionario</Label>
                      <Input value={fisCargo} onChange={(e) => setFisCargo(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
              {acercamiento === "OTRO" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>¿Con quién se realizó el acercamiento?</Label>
                    <Input value={fisConQuien} onChange={(e) => setFisConQuien(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Nombre y apellido</Label>
                    <Input value={fisNombre} onChange={(e) => setFisNombre(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ACEPTACIÓN DE IPS RECEPTORA */}
          {esSaliente && tipoSeg === T.ACEPTACION && (
            <div className={sectionCls}>
              <Label className={labelCls}>IPS receptora</Label>
              <AutoComplete
                value={ipsReceptora}
                options={ipsLabels}
                placeholder="Escribe para buscar IPS…"
                minChars={2}
                onChange={(v) => {
                  setIpsReceptora(v);
                  setIpsReceptoraSede("");
                }}
                onPick={(label) => {
                  const opt = ipsOptions.find((o) => o.label === label);
                  if (opt) {
                    setIpsReceptora(opt.ips);
                    setIpsReceptoraSede(opt.sede);
                  }
                }}
              />
              {ipsReceptoraSede && (
                <p className="text-[11px] text-muted-foreground">Sede: {ipsReceptoraSede}</p>
              )}
              <p className="text-[10px] text-muted-foreground">Estado de solicitud → SÍ ACEPTA.</p>
            </div>
          )}

          {/* TRAZABILIDAD DE NEGACIONES */}
          {esSaliente && tipoSeg === T.NEGACIONES && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>Motivo de negación</Label>
                <Select value={negMotivo} onValueChange={setNegMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {NEGACION_MOTIVOS.map((m) => (
                      <SelectItem key={m} value={m} className="whitespace-normal">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {negMotivo === "OTRO" && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>¿Cuál? *</Label>
                  <Input
                    value={negCual}
                    onChange={(e) => setNegCual(e.target.value)}
                    placeholder="Escribe el motivo de negación"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className={labelCls}>IPS</Label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <AutoComplete
                      value={negIpsInput}
                      options={ipsLabels}
                      placeholder="Escribe para buscar IPS…"
                      minChars={2}
                      onChange={setNegIpsInput}
                      onPick={setNegIpsInput}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={agregarIpsNeg}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {negIpsCurrent.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {negIpsCurrent.map((ips) => (
                      <span
                        key={ips}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                      >
                        {ips}
                        <button type="button" onClick={() => quitarIpsNeg(ips)}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full rounded-full" onClick={agregarGrupoNeg}>
                Agregar negación
              </Button>
              {negGrupos.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {negGrupos.map((g, i) => (
                    <div
                      key={`${g.motivo}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                    >
                      <span className="break-words">
                        {g.motivo} — {g.ips.length} IPS
                      </span>
                      <button type="button" onClick={() => quitarGrupoNeg(i)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Estado de solicitud → NO ACEPTA.</p>
            </div>
          )}

          {/* AMBULANCIA COORDINADA */}
          {esSaliente && tipoSeg === T.AMBULANCIA && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>Quién informa</Label>
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
                <Label className={labelCls}>Empresa de ambulancia</Label>
                <AutoComplete
                  value={empresaAmb}
                  options={empresasTep}
                  placeholder="Escribe para buscar empresa…"
                  minChars={2}
                  onChange={setEmpresaAmb}
                  onPick={setEmpresaAmb}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Fecha del traslado</Label>
                  <Input
                    value={fechaTraslado}
                    inputMode="numeric"
                    onChange={(e) => setFechaTraslado(maskFechaInput(e.target.value))}
                    placeholder="DD/MM/AAAA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Hora del traslado</Label>
                  <Input
                    value={horaTraslado}
                    inputMode="numeric"
                    onChange={(e) => setHoraTraslado(maskHoraInput(e.target.value))}
                    placeholder="HH:MM"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ENTREGA DE DOCUMENTACIÓN AMBULANCIA (fase final) */}
          {esSaliente && esEntregaDoc && (
            <div className={sectionCls}>
              <div className="rounded-md border border-dashed p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Fase final: la ambulancia llegó por el paciente. Registre origen documental,
                  genere portada y QR de firma para el tripulante y, tras la firma, la plantilla
                  Índigo corta y el checklist firmado.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setEntregaOpen(true)}
                >
                  Abrir · Entrega documental / Firma por QR
                </Button>
              </div>
              <EntregaDocumentalDialog
                open={entregaOpen}
                onOpenChange={setEntregaOpen}
                casoId={casoId}
                tipoCaso={tipoCaso}
                paciente={paciente}
                documento={documento}
                tipoDocumento={caso?.tipo_documento}
                cie10={caso?.cie10}
                ipsReceptora={caso?.ips_receptora ?? ipsReceptora}
                empresaTraslado={empresaAmb}
                especialidad={especialidadesList.join(", ")}
                entidadPago={caso?.eapb}
                tipoAmbulancia={caso?.tipo_ambulancia}
              />

            </div>
          )}

          {/* CIERRE POR EGRESOS (REMISIÓN) */}
          {esSaliente && esCierre && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>¿Paciente ya egresó de la institución?</Label>
                <Select value={cierreEgreso} onValueChange={(v) => setCierreEgreso(v as "si" | "no")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">SÍ</SelectItem>
                    <SelectItem value="no">NO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cierreEgreso === "no" && (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  El caso NO se cerrará. Se guardará la observación registrada como seguimiento.
                </p>
              )}
              {cierreEgreso === "si" && (
                <p className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                  Al guardar se generará la plantilla de cierre, se cerrará el caso y pasará al
                  historial.
                </p>
              )}
            </div>
          )}

          {/* NOVEDADES (Parte 12) */}
          {esSaliente && esNovedades && (
            <div className={sectionCls}>
              <p className={labelCls}>Tipo de novedad</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={novPaciente}
                    onChange={(e) => setNovPaciente(e.target.checked)}
                  />
                  Paciente/Familiar
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={novIps}
                    onChange={(e) => setNovIps(e.target.checked)}
                  />
                  IPS Receptora
                </label>
                {novAmbDisponible && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={novAmbulancia}
                      onChange={(e) => setNovAmbulancia(e.target.checked)}
                    />
                    Ambulancia
                  </label>
                )}
              </div>

              {novPaciente && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <Label className={labelCls}>¿El paciente/familiar firmó desistimiento?</Label>
                  <Select
                    value={novDesistTipo}
                    onValueChange={(v) => setNovDesistTipo(v as "IPS_AMB" | "GENERAL")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IPS_AMB">DESISTIMIENTO IPS / AMBULANCIA</SelectItem>
                      <SelectItem value="GENERAL">DESISTIMIENTO GENERAL</SelectItem>
                    </SelectContent>
                  </Select>
                  {novDesistTipo === "IPS_AMB" && (
                    <div className="flex flex-col gap-2 pt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={novDesistIps}
                          onChange={(e) => setNovDesistIps(e.target.checked)}
                        />
                        IPS
                      </label>
                      {novAmbDisponible && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={novDesistAmb}
                            onChange={(e) => setNovDesistAmb(e.target.checked)}
                          />
                          AMBULANCIA
                        </label>
                      )}
                    </div>
                  )}
                  {novDesistTipo === "GENERAL" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                      Al guardar, el caso se cerrará como DESISTIMIENTO GENERAL y pasará al historial.
                    </p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Registra la novedad en observaciones. El estado del caso solo cambia si se marca un
                desistimiento.
              </p>
            </div>
          )}




          {/* CANCELACIÓN DE TRÁMITE DE REMISIÓN */}
          {esSaliente && tipoSeg === T.CANCELACION && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>Tipo de cancelación</Label>
                <Select value={cancelTipo} onValueChange={(v) => setCancelTipo(v as CancelacionTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {CANCELACION_TIPOS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="whitespace-normal">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cancelTipo === "administrativo" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Motivo / gestión administrativa</Label>
                    <Select value={cancelGestion} onValueChange={setCancelGestion}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent className="max-w-[calc(100vw-2rem)]">
                        {CANCELACION_GESTION.map((g) => (
                          <SelectItem key={g} value={g} className="whitespace-normal">
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {cancelGestion === "SOLICITUD DE CANCELACIÓN AL CHAT DEL ÁREA" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className={labelCls}>Servicio</Label>
                        <Select value={cancelServicio} onValueChange={setCancelServicio}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar…" />
                          </SelectTrigger>
                          <SelectContent className="max-w-[calc(100vw-2rem)]">
                            {SERVICIO_CANCELACION.map((s) => (
                              <SelectItem key={s} value={s} className="whitespace-normal">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className={labelCls}>Nombre del funcionario</Label>
                          <Input value={cancelFuncionario} onChange={(e) => setCancelFuncionario(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={labelCls}>Cargo del funcionario</Label>
                          <Input value={cancelCargo} onChange={(e) => setCancelCargo(e.target.value)} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {cancelTipo === "cambio_erp" && (esSoatCaso || !generaCodigo) && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>Nuevo radicado (si la nueva EAPB genera código)</Label>
                  <Input
                    value={cancelNuevoRadicado}
                    onChange={(e) => setCancelNuevoRadicado(e.target.value)}
                    placeholder="Número de radicado nuevo"
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Estado de solicitud → NO APLICA.</p>
            </div>
          )}

          {/* CAMBIO DE ASEGURADOR A EAPB */}
          {esSaliente && esCambioEapb && (
            <div className={sectionCls}>
              <div className="space-y-1.5">
                <Label className={labelCls}>EAPB *</Label>
                <AutoComplete
                  value={cambioEapb}
                  options={eapbOptions}
                  placeholder="Escribe para buscar la nueva EAPB…"
                  onChange={(v) => {
                    setCambioEapb(v);
                    setCambioPlataformaFunc("");
                    setCambioRadicado("");
                  }}
                  onPick={(v) => {
                    setCambioEapb(v);
                    setCambioPlataformaFunc("");
                    setCambioRadicado("");
                  }}
                />
                {cambioEapbActual && (
                  <p className="text-[10px] text-muted-foreground">
                    {cambioTipoEntidad || "SIN TIPO"} ·{" "}
                    {cambioTienePlataforma ? "Tiene plataforma" : "Sin plataforma"} ·{" "}
                    {cambioGeneraCodigo ? "Genera código" : "No genera código"}
                  </p>
                )}
              </div>

              {cambioTienePlataforma && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>¿La plataforma se encuentra funcionando? *</Label>
                  <Select
                    value={cambioPlataformaFunc}
                    onValueChange={(v) => setCambioPlataformaFunc(v as "SI" | "NO")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SI">SÍ</SelectItem>
                      <SelectItem value="NO">NO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cambioGeneraCodigo && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>Número de radicado de la nueva EAPB *</Label>
                  <Input
                    value={cambioRadicado}
                    onChange={(e) => setCambioRadicado(e.target.value)}
                    placeholder="Número de radicado"
                  />
                </div>
              )}

              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Al guardar se actualizará la aseguradora del caso con la nueva EAPB y sus datos de
                plataforma/radicado. Estado de solicitud → NO APLICA.
              </p>
            </div>
          )}


          {/* OTRO */}
          {esSaliente && tipoSeg === T.OTRO && (
            <div className={sectionCls}>
              <Label className={labelCls}>¿Cuál? *</Label>
              <Input
                value={otroCual}
                onChange={(e) => setOtroCual(e.target.value)}
                placeholder="Indica el tipo de seguimiento realizado"
              />
            </div>
          )}

          {/* REVISIÓN AUTORIZACIÓN ESTANCIA HOSPITALARIA (CANCELACIÓN) */}
          {esSaliente && tipoSeg === T.PERTINENCIA && (
            <div className={sectionCls}>
              <p className="text-[10px] text-muted-foreground">{REVISION_AUT_LABEL_COMPLETO}</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Estado de autorización de estancia</Label>
                <Select value={revAutoriza} onValueChange={(v) => setRevAutoriza(v as "SI" | "NO")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="SI" className="whitespace-normal">
                      CUENTA CON AUTORIZACIÓN
                    </SelectItem>
                    <SelectItem value="NO" className="whitespace-normal">
                      NO CUENTA CON AUTORIZACIÓN
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {revAutoriza === "SI" && (
                <div className="space-y-1.5">
                  <Label className={labelCls}>Trazabilidad de autorizaciones</Label>
                  <Select value={revNota} onValueChange={(v) => setRevNota(v as "SI" | "NO")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      <SelectItem value="SI" className="whitespace-normal">
                        CUENTA CON NOTA DE TRAZABILIDAD DE CANCELACIÓN
                      </SelectItem>
                      <SelectItem value="NO" className="whitespace-normal">
                        NO CUENTA CON NOTA DE TRAZABILIDAD DE CANCELACIÓN
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {revAutoriza === "SI" && revNota === "NO" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Nombre del funcionario</Label>
                    <Input value={revFuncionario} onChange={(e) => setRevFuncionario(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Cargo</Label>
                    <Input value={revCargo} onChange={(e) => setRevCargo(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONTACTO TELEFÓNICO · destinatario */}
          {esTelefono && (
            <div className={sectionCls}>
              <Label className={labelCls}>Contacto realizado con</Label>
              <div className="flex flex-wrap gap-1.5">
                {CONTACTO_DESTINOS.map((d) => {
                  const active = contactoDestino === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setContactoDestino(d.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-foreground hover:border-primary/50"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {contactoDestino === "IPS" && (
                <div className="space-y-1.5 pt-1">
                  <Label className={labelCls}>Nombre de la IPS</Label>
                  <AutoComplete
                    value={contactoIps}
                    options={ipsLabels}
                    placeholder="Escribe para buscar IPS…"
                    minChars={2}
                    onChange={setContactoIps}
                    onPick={(label) => {
                      const opt = ipsOptions.find((o) => o.label === label);
                      setContactoIps(opt ? opt.ips : label);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ASUNTO (correo electrónico / plataforma web) */}
          {esSaliente && (tipoSeg === T.CORREO || tipoSeg === T.PLATAFORMA) && (
            <div className="space-y-1.5">
              <Label className={labelCls}>Asunto</Label>
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto del seguimiento"
                maxLength={200}
              />
            </div>
          )}

          {/* Estado de la solicitud */}
          <div className="space-y-1.5">
            <Label className={labelCls}>Estado de la solicitud</Label>
            <Select value={estadoSolicitud} onValueChange={setEstadoSolicitud} disabled={estadoSolicAuto}>
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

          {/* Contacto y teléfono (solo CONTACTO TELEFÓNICO en salientes) */}
          {mostrarContacto && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className={labelCls}>Nombre de contacto</Label>
                <Input
                  value={nombreContacto}
                  onChange={(e) => setNombreContacto(e.target.value)}
                  placeholder="Nombre del contacto"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Teléfono</Label>
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Teléfono"
                  inputMode="tel"
                  maxLength={30}
                />
              </div>
            </div>
          )}
          </>
          )}

          {/* Observaciones */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className={labelCls}>Observaciones</Label>
              <PlantillasEnPaso
                paso="salientes_seguimiento"
                condicion={tipoSeg}
                datos={{
                  PACIENTE: paciente,
                  DOCUMENTO: documento,
                  RADICADO: radicadoReal,
                  ESPECIALIDAD: especialidadesList.join(", "),
                  ESTADO: estadoCaso,
                }}
                onUsar={(texto) => setDetalle((d) => (d.trim() ? `${d}\n${texto}` : texto))}
              />
            </div>
            <DictationTextarea dictationKey={`${dictPrefix}.seguimiento.observaciones`} value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
          </div>

          {/* Plantilla Índigo */}
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
              <DictationTextarea
                dictationKey={`${dictPrefix}.seguimiento.plantilla_indigo`}
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

          {/* Evolución diaria por especialidad (solo módulos legacy) */}
          {mostrarEvolucionLegacy && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className={labelCls}>Evolución diaria</Label>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${metaLegacy.chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${metaLegacy.dot}`} />
                    {metaLegacy.label}
                  </span>
                  {tabla && especialidadesList.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      disabled={busyEvo}
                      onClick={guardarEvolucionLegacy}
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
                  {requiereMotivoLegacy && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-status-amber">
                        Motivo del pendiente {faltanLegacy.length ? `(falta ${faltanLegacy.join(", ")})` : ""}
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

          {/* Últimos seguimientos (mínimo 5) */}
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
                {historial!.slice(0, 5).map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {h.tipo_seguimiento || "Seguimiento"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{fmtFechaHora(h.created_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {h.estado_solicitud && (
                        <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          {h.estado_solicitud}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{h.nombre_usuario || "—"}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 gap-1 px-2 text-[11px]"
                        onClick={() => setVerDetalle(h as Record<string, unknown>)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Ver detalle
                      </Button>
                    </div>
                    {(() => {
                      const det = parseDetalles(h.detalles);
                      const estado = det?.estado_evolucion_especialidades as string | undefined;
                      if (!estado) return null;
                      const evol = (det?.especialidades_evolucionadas as string[] | null) ?? [];
                      const pend = (det?.especialidades_pendientes as string[] | null) ?? [];
                      const medio = det?.medio_evolucion as string | undefined;
                      return (
                        <div className="mt-1.5 space-y-0.5 rounded-md bg-muted/40 px-2 py-1 text-[11px]">
                          <p className="font-semibold text-foreground">
                            EVOLUCIÓN {estado}
                            {medio ? ` · ${medio}` : ""}
                          </p>
                          {evol.length > 0 && (
                            <p className="text-muted-foreground">Evolucionadas: {evol.join(", ")}</p>
                          )}
                          {pend.length > 0 && (
                            <p className="text-status-amber">Pendientes: {pend.join(", ")}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>


      {/* Detalle de un seguimiento */}
      <Dialog open={!!verDetalle} onOpenChange={(v) => !v && setVerDetalle(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base">
              {(verDetalle?.tipo_seguimiento as string) || "Detalle del seguimiento"}
            </DialogTitle>
          </DialogHeader>
          {verDetalle && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {fmtFechaHora(verDetalle.created_at as string)} ·{" "}
                {(verDetalle.nombre_usuario as string) || "—"}
              </p>
              {(verDetalle.estado_solicitud as string) && (
                <p>
                  <span className={labelCls}>Estado de solicitud:</span>{" "}
                  {verDetalle.estado_solicitud as string}
                </p>
              )}
              {(verDetalle.radicado as string) && (
                <p>
                  <span className={labelCls}>Radicado:</span> {verDetalle.radicado as string}
                </p>
              )}
              {(verDetalle.nombre_contacto as string) && (
                <p>
                  <span className={labelCls}>Contacto:</span> {verDetalle.nombre_contacto as string}
                  {(verDetalle.telefono as string) ? ` · ${verDetalle.telefono as string}` : ""}
                </p>
              )}
              {(() => {
                const det = parseDetalles(verDetalle.detalles);
                const estado = det?.estado_evolucion_especialidades as string | undefined;
                if (!estado) return null;
                const evol = (det?.especialidades_evolucionadas as string[] | null) ?? [];
                const pend = (det?.especialidades_pendientes as string[] | null) ?? [];
                const medio = det?.medio_evolucion as string | undefined;
                return (
                  <div className="space-y-1">
                    <p className={labelCls}>Evolución por especialidades</p>
                    <p className="text-foreground">
                      Estado: <span className="font-semibold">{estado}</span>
                      {medio ? ` · ${medio}` : ""}
                    </p>
                    {evol.length > 0 && <p>Evolucionadas: {evol.join(", ")}</p>}
                    {pend.length > 0 && (
                      <p className="text-status-amber">Pendientes: {pend.join(", ")}</p>
                    )}
                  </div>
                );
              })()}
              {(verDetalle.detalle as string) && (
                <div>
                  <p className={labelCls}>Observaciones</p>
                  <p className="whitespace-pre-wrap break-words text-foreground">
                    {verDetalle.detalle as string}
                  </p>
                </div>
              )}
              {(verDetalle.plantilla_indigo as string) && (
                <div>
                  <p className={labelCls}>Plantilla Índigo</p>
                  <Textarea
                    readOnly
                    value={verDetalle.plantilla_indigo as string}
                    rows={6}
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
