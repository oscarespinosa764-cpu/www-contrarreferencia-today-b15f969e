import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AutoComplete } from "@/components/rc/autocomplete";
import { AppDateTimeInput } from "@/components/ui/app-time-picker";
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
  AUTORIZACION_ESTANCIA_OPCIONES,
  CANCELACION_CIERRA,
  CANCELACION_ESTADO_FINAL,
  CANCELACION_TIPOS,
  CONTACTO_DESTINOS,
  NEGACION_MOTIVOS,
  PARENTESCO_OPCIONES,
  REVISION_AUT_LABEL_COMPLETO,
  SERVICIO_OPCIONES,
  appendNota,
  esTramiteAdministrativo,
  generarPlantillaAceptacionIps,
  generarPlantillaAmbulancia,
  generarPlantillaCambioAsegurador,
  generarPlantillaCambioEspecialidad,
  generarPlantillaCancelacionRemision,
  generarPlantillaCierreAdmision,
  generarPlantillaCierreTraslado,
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
  type AutorizacionEstanciaOpcion,
  type CancelacionTipo,
  type ContactoDestino,
  type NegacionGrupo,
} from "@/lib/indigo-trazabilidad";
import { EntregaDocumentalDialog } from "@/components/remisiones/entrega-documental-dialog";
import { RiLlegadaQRPanel } from "@/components/remisiones/ri-llegada-qr-panel";
import { resolverAceptacionVigente } from "@/lib/salientes-aceptacion.functions";
import { limpiarNombreAcepta, limpiarCargoAcepta, NOMBRE_ACEPTA_MAX, CARGO_ACEPTA_MAX } from "@/lib/salientes-aceptacion";

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
  TRASLADO: "CIERRE DE CASO POR TRASLADO EFECTIVO",
  CAMBIO_EAPB: "CAMBIO DE ASEGURADOR A EAPB",
  CAMBIO_ESPECIALIDAD: "CAMBIO EN ESPECIALIDAD",
  CAMBIO_UNIDAD: "CAMBIO DE UNIDAD",
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
  CERRADO_TRASLADO: "CERRADO POR TRASLADO EFECTIVO",
  DESIST_IPS: "DESISTIMIENTO IPS",
  DESIST_GENERAL: "DESISTIMIENTO GENERAL",
} as const;

// --- Tipos de seguimiento PHD/PAD/O2/Especiales (reutiliza lógica saliente) ---
const TIPOS_PHD_BASE = [T.EVOLUCION, T.CORREO, T.PLATAFORMA, T.FISICO, T.OTRO] as const;

// --- Referencia interna ---
// Nota: los VALORES son códigos técnicos persistidos (compatibilidad histórica).
// TI_LABEL solo cambia la etiqueta visible en el selector y en textos nuevos.
const TI = {
  PENDIENTE: "PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN",
  COORDINADO: "EXAMEN COORDINADO",
  PROG_AMB: "CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA",
  LLEGADA_AMB: "CONFIRMACIÓN DE LLEGADA DE AMBULANCIA",
  TEP_ACTIVACION: "ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP",
  AMB_COORDINADA_ESP: "AMBULANCIA COORDINADA",
  CIERRE_CONCLUSION: "CIERRE POR CULMINACIÓN DE SOLICITUD",
  CANCELACION_RI: "CANCELACIÓN DEL TRÁMITE",
  // B3 · Trazabilidad permanente (no altera la secuencia canónica).
  OTRO: "OTRO",
  NOVEDADES: "NOVEDADES",
} as const;

// Labels visibles (Fase 5C · B1). No modifican el código persistido.
const TI_LABEL: Record<string, string> = {
  [TI.PENDIENTE]: "TRÁMITE COORDINADO",
  [TI.LLEGADA_AMB]: "CONFIRMACIÓN LLEGADA DE AMBULANCIA",
};
function labelTipoSeg(t: string): string {
  return TI_LABEL[t] ?? t;
}

// Estados terminales de referencia_interna que resultan de estas acciones.
const RI_ESTADO_CIERRE = "CERRADO POR CULMINACION DE SOLICITUD";
const RI_ESTADO_CANCELADO = "CANCELADO";

const RI_ESPECIALES = new Set([
  "URGENCIAS VITALES",
  "URGENCIAS_VITALES",
  "REMISIONES ESPECIALES",
  "REMISIONES_ESPECIALES",
  "EVACUACIÓN DE SEDES AMBULATORIAS",
  "EVACUACION DE SEDES AMBULATORIAS",
  "EVACUACION_SEDES_AMBULATORIAS",
]);

/** Determina el próximo paso permitido para un caso de Referencia Interna.
 *
 * B3.1: la novedad EXTERNA "DESCOMPENSACIÓN HEMODINÁMICA" es evento de
 * reinicio del ciclo operativo. Todo paso secuencial anterior a ese evento
 * queda como histórico y el siguiente paso vuelve al inicio.
 */
function siguientePasoRI(
  historial: { tipo_seguimiento: string; detalles?: unknown }[] | undefined,
  tipoSolicitud: string | null | undefined,
): string | null {
  const especial = RI_ESPECIALES.has((tipoSolicitud ?? "").toUpperCase().trim());
  const IGNORAR = new Set(["CAMBIO DE UNIDAD", "OTRO"]);
  // historial viene ordenado por created_at DESC (ver useQuery del hook).
  let ultimo: string | undefined;
  for (const h of historial ?? []) {
    const t = (h.tipo_seguimiento || "").toUpperCase();
    if (!t) continue;
    if (t === "NOVEDADES") {
      const d = parseDetalles(h.detalles);
      if (d && d.externa_codigo === "DESCOMPENSACION_HEMODINAMICA") {
        // Reinicio: no hay pasos secuenciales vigentes posteriores.
        ultimo = undefined;
        break;
      }
      continue;
    }
    if (IGNORAR.has(t)) continue;
    ultimo = t;
    break;
  }
  if (especial) {
    if (!ultimo) return TI.TEP_ACTIVACION;
    if (ultimo === TI.TEP_ACTIVACION.toUpperCase()) return TI.AMB_COORDINADA_ESP;
    if (ultimo === TI.AMB_COORDINADA_ESP.toUpperCase()) return TI.CIERRE_CONCLUSION;
    return null;
  }
  if (!ultimo) return TI.PENDIENTE;
  // B1: tras TRÁMITE COORDINADO se salta directamente a PROGRAMACIÓN
  // (se retira EXAMEN COORDINADO de la creación nueva).
  if (ultimo.startsWith("PENDIENTE COORDINAC")) return TI.PROG_AMB;
  // Ruta histórica: casos que ya tienen EXAMEN COORDINADO registrado continúan.
  if (ultimo === TI.COORDINADO.toUpperCase()) return TI.PROG_AMB;
  if (ultimo === TI.PROG_AMB.toUpperCase()) return TI.LLEGADA_AMB;
  if (ultimo === TI.LLEGADA_AMB.toUpperCase()) return TI.CIERRE_CONCLUSION;
  return null;
}


// --- Pendientes ---
const TP = {
  PARCIAL: "CUMPLIMIENTO PARCIAL",
  COMPLETO: "CUMPLIMIENTO COMPLETO",
} as const;
const TIPOS_PENDIENTE = [TP.PARCIAL, TP.COMPLETO];

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
  // Fase 5C · A.1 — flag para congelar la plantilla Índigo tras transferirla
  // desde el diálogo de entrega documental. Evita que efectos posteriores
  // (invalidaciones, re-init) la vacíen. Solo se limpia al cerrar el modal
  // principal o al cambiar de caso real.
  const [entregaPreparada, setEntregaPreparada] = useState(false);
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

  // Cambio en especialidad: cierres marcados y nuevas especialidades a agregar.
  const [espCierres, setEspCierres] = useState<Record<string, boolean>>({});
  const [espNuevas, setEspNuevas] = useState<string[]>([""]);

  // Cambio de unidad (ubicación institucional del paciente).
  const [nuevaUnidad, setNuevaUnidad] = useState("");
  const [nuevaCama, setNuevaCama] = useState("");

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
  // Fase 5B — Bloque 2A: nombre/cargo de quien acepta (estructurados).
  const [nombreAcepta, setNombreAcepta] = useState("");
  const [cargoAcepta, setCargoAcepta] = useState("");

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
  // Desistimiento de traslado general
  const [cancelNombrePersona, setCancelNombrePersona] = useState("");
  const [cancelParentesco, setCancelParentesco] = useState("");
  // Superación de tope SOAT (cambio de responsable, mantiene el caso activo)
  const [cancelNuevaEapb, setCancelNuevaEapb] = useState("");
  const [cancelPlataformaFunc, setCancelPlataformaFunc] = useState<"" | "SI" | "NO">("");
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
  const [novDesistTipo, setNovDesistTipo] = useState<"" | "NO" | "IPS" | "AMB" | "GENERAL">("");
  const [novDesistIps, setNovDesistIps] = useState(false);
  const [novDesistAmb, setNovDesistAmb] = useState(false);
  // Novedad de la IPS receptora (desistimiento hacia IPS / cancela / posterga).
  const [novIpsTipo, setNovIpsTipo] = useState<"" | "DESIST_IPS" | "CANCELA" | "POSTERGA">("");
  const [novIpsMotivo, setNovIpsMotivo] = useState("");
  const [novIpsFecha, setNovIpsFecha] = useState("");
  const [novIpsHora, setNovIpsHora] = useState("");

  // Referencia interna
  const [riFuncionario, setRiFuncionario] = useState("");
  const [riCargo, setRiCargo] = useState("");
  const [riFecha, setRiFecha] = useState("");
  const [riHora, setRiHora] = useState("");
  const [riInformoAmb, setRiInformoAmb] = useState(false);
  const [riInformoServ, setRiInformoServ] = useState(false);
  // Referencia interna — pasos 3/4 (recogida y llegada de ambulancia).
  const [riRecFecha, setRiRecFecha] = useState("");
  const [riRecHora, setRiRecHora] = useState("");
  const [riRecTipoAmb, setRiRecTipoAmb] = useState("");
  const [riLlegFecha, setRiLlegFecha] = useState("");
  const [riLlegHora, setRiLlegHora] = useState("");
  // Datos de la firma QR de llegada (poblados cuando el firmante confirma).
  const [riFirmaLlegada, setRiFirmaLlegada] = useState<import("./ri-llegada-qr-panel").FirmaLlegadaInfo | null>(null);
  // Referencia interna — flujo especial TEP.
  const [riTepProveedor, setRiTepProveedor] = useState("");
  const [riTepFecha, setRiTepFecha] = useState(""); // "YYYY-MM-DDTHH:mm"

  // Referencia interna — B3 · OTRO (trazabilidad permanente).
  const [riOtroCual, setRiOtroCual] = useState("");
  // Referencia interna — B3 · NOVEDADES (categorías INTERNA/EXTERNA).
  const [riNovInterna, setRiNovInterna] = useState(false);
  const [riNovExterna, setRiNovExterna] = useState(false);
  const [riNovInternaCod, setRiNovInternaCod] = useState("");
  const [riNovReprogMotivos, setRiNovReprogMotivos] = useState<string[]>([]);
  const [riNovReprogFH, setRiNovReprogFH] = useState(""); // ISO
  const [riNovExternaCod, setRiNovExternaCod] = useState("");
  const [riNovPacFam, setRiNovPacFam] = useState("");


  // Revisión autorización estancia hospitalaria (seguimiento de trazabilidad)
  const [revOpcion, setRevOpcion] = useState<AutorizacionEstanciaOpcion>("");
  const [revServicio, setRevServicio] = useState("");

  // Cierre por traslado efectivo
  const [trasFecha, setTrasFecha] = useState("");
  const [trasHora, setTrasHora] = useState("");
  const [trasEmpresa, setTrasEmpresa] = useState("");
  const [trasTipoAmb, setTrasTipoAmb] = useState("");
  const [trasConfirma, setTrasConfirma] = useState(false);

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
          "eapb, asegurador, tipo_tramite, eapb_tiene_plataforma, eapb_genera_codigo, plataforma_funcionando, ips_receptora, codigo_radicacion, tipo_documento, cie10, tipo_ambulancia, servicio, cama, prestador_traslado",
        )
        .eq("id", casoId)
        .maybeSingle();
      return data as {
        eapb: string | null;
        asegurador: string | null;
        tipo_tramite: string | null;
        eapb_tiene_plataforma: boolean | null;
        eapb_genera_codigo: boolean | null;
        plataforma_funcionando: boolean | null;
        ips_receptora: string | null;
        codigo_radicacion: string | null;
        tipo_documento: string | null;
        cie10: string | null;
        tipo_ambulancia: string | null;
        servicio: string | null;
        cama: string | null;
        prestador_traslado: string | null;
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
        .select("valor, extra1, extra2, extra3, seguimientos_en_plataforma")
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .order("valor");
      return (data ?? []) as {
        valor: string;
        extra1: string | null;
        extra2: string | null;
        extra3: string | null;
        seguimientos_en_plataforma: boolean | null;
      }[];
    },
  });

  // Opciones de IPS expandidas por sede para el autocompletado.
  const ipsOptions = useMemo(() => {
    const out: { label: string; ips: string; sede: string }[] = [];
    for (const row of ipsCat) {
      const sedes = [...(row.extra1 ?? "").split(";"), ...(row.extra2 ?? "").split(";")]
        .map((s) => s.trim())
        .filter(Boolean);
      if (sedes.length === 0) {
        out.push({ label: row.valor, ips: row.valor, sede: "" });
      } else {
        for (const sede of sedes)
          out.push({ label: `${row.valor} — ${sede}`, ips: row.valor, sede });
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

  // Fuente canónica de aceptación vigente (server-side) para la precarga de la
  // entrega documental. Solo se consulta al abrir la entrega; se invalida cuando
  // se registra un seguimiento nuevo. Fase 5B — Bloque 2A.
  const {
    data: aceptacionVigente,
    isFetching: aceptacionCargando,
  } = useQuery({
    queryKey: ["saliente-aceptacion-vigente", casoId],
    enabled: open && esSaliente && entregaOpen,
    queryFn: () => resolverAceptacionVigente({ data: { casoId } }),
    staleTime: 30_000,
  });

  // Caso de Referencia Interna: se necesita `tipo_solicitud` para calcular la secuencia.
  const { data: casoInterna } = useQuery({
    queryKey: ["ri-caso", casoId],
    enabled: open && esInterna,
    queryFn: async () => {
      const { data } = await supabase
        .from("referencia_interna")
        .select("tipo_solicitud, tipo_ambulancia, servicio, eapb, archivado")
        .eq("id", casoId)
        .maybeSingle();
      return data;
    },
  });

  // Catálogo empresas TEP (para el selector de proveedor en el flujo especial).
  const { data: empresasTepInterna = [] } = useQuery({
    queryKey: ["cat-empresa-tep-ri"],
    enabled: open && esInterna,
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


  // Catálogo de especialidades (para agregar nuevas en CAMBIO EN ESPECIALIDAD).
  const { data: catEspecialidades = [] } = useQuery({
    queryKey: ["cat-especialidad-seg"],
    enabled: open && esSaliente,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "ESPECIALIDAD")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((r) => r.valor);
    },
  });

  // Catálogo de unidades / servicios activos (para CAMBIO DE UNIDAD).
  const { data: catUnidades = [] } = useQuery({
    queryKey: ["cat-unidad-seg"],
    enabled: open && (esSaliente || esInterna),
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "UNIDAD")
        .eq("activo", true)
        .order("valor");
      // Normaliza (trim + upper) y deduplica ignorando tildes/espacios extra.
      const seen = new Set<string>();
      const out: string[] = [];
      const norm = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
      for (const r of data ?? []) {
        const v = String(r.valor ?? "").trim().toUpperCase();
        const k = norm(v);
        if (!v || seen.has(k)) continue;
        seen.add(k);
        out.push(v);
      }
      return out;
    },
  });

  // Catálogo de tipos de ambulancia activos (para CONFIRMACIÓN DE PROGRAMACIÓN en RI).
  const { data: catTipoAmbulancia = [] } = useQuery({
    queryKey: ["cat-tipo-ambulancia-seg"],
    enabled: open && esInterna,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "TIPO_AMBULANCIA")
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("valor", { ascending: true });
      return (data ?? []).map((r) => String(r.valor ?? "").trim()).filter(Boolean);
    },
  });

  // Historial de especialidades del caso: permite conocer las especialidades
  // que fueron cerradas (para ofrecer reactivación) sin duplicar información.
  const { data: espHistorial = [], refetch: refetchEspHist } = useQuery({
    queryKey: ["esp-historial", casoId],
    enabled: open && esSaliente,
    queryFn: async () => {
      const { data } = await supabase
        .from("especialidades_historial")
        .select("especialidad, action, effective_at")
        .eq("caso_id", casoId)
        .order("effective_at", { ascending: true });
      return data ?? [];
    },
  });

  const generaCodigo = caso?.eapb_genera_codigo === true;
  const tienePlataforma = caso?.eapb_tiene_plataforma === true;
  // Flag independiente (Parte 2): ¿los seguimientos de esta EAPB se hacen en
  // plataforma? Se resuelve desde el catálogo EAPB del caso, no de la radicación.
  const casoEapbNombre = (caso?.asegurador || caso?.eapb || "").trim();
  const segEnPlataforma = useMemo(
    () =>
      eapbCat.find((e) => e.valor === casoEapbNombre)?.seguimientos_en_plataforma === true,
    [eapbCat, casoEapbNombre],
  );
  const esAdminCaso = esTramiteAdministrativo(caso?.tipo_tramite ?? "");

  // --- CAMBIO EN ESPECIALIDAD (manejo por especialidades) ---
  const normEsp = (s: string) => (s || "").trim().toUpperCase();
  // El caso está activo si su estado no corresponde a un cierre/cancelación.
  const casoActivo = useMemo(() => {
    const est = normEsp(estadoActual ?? "");
    return !/CERRAD|CANCELAD|DESIST|TRASLADO EFECTIVO|ARCHIV|CULMINAD/.test(est);
  }, [estadoActual]);
  // Especialidades actualmente cerradas según el historial (última acción CLOSED).
  const especCerradasSet = useMemo(() => {
    const status = new Map<string, boolean>();
    for (const h of espHistorial) status.set(normEsp(h.especialidad), h.action === "CLOSED");
    const activasNorm = new Set(especialidadesList.map(normEsp));
    const out = new Set<string>();
    for (const [esp, cerrada] of status) if (cerrada && !activasNorm.has(esp)) out.add(esp);
    return out;
  }, [espHistorial, especialidadesList]);
  // Nombres reales (con mayúsculas de catálogo) de las cerradas, para mostrarlas.
  const especCerradasNombres = useMemo(() => {
    const last = new Map<string, string>();
    for (const h of espHistorial) last.set(normEsp(h.especialidad), h.especialidad);
    return [...especCerradasSet].map((n) => last.get(n) ?? n);
  }, [especCerradasSet, espHistorial]);
  // Nuevas especialidades escritas (sin vacíos ni duplicados internos).
  const espNuevasLimpias = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of espNuevas) {
      const t = v.trim();
      if (!t) continue;
      const n = normEsp(t);
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(t);
    }
    return out;
  }, [espNuevas]);
  const espCierreList = useMemo(
    () => especialidadesList.filter((e) => espCierres[e]),
    [especialidadesList, espCierres],
  );
  // De las nuevas, cuáles son reactivaciones (estaban cerradas) y cuáles altas.
  const espReactivadas = useMemo(
    () => espNuevasLimpias.filter((e) => especCerradasSet.has(normEsp(e))),
    [espNuevasLimpias, especCerradasSet],
  );
  const espAgregadas = useMemo(
    () => espNuevasLimpias.filter((e) => !especCerradasSet.has(normEsp(e))),
    [espNuevasLimpias, especCerradasSet],
  );
  // Especialidades activas resultantes tras aplicar el cambio.
  const espActivasFinal = useMemo(() => {
    const activasNorm = new Set(especialidadesList.map(normEsp));
    const cierreNorm = new Set(espCierreList.map(normEsp));
    const restantes = especialidadesList.filter((e) => !cierreNorm.has(normEsp(e)));
    const nuevas = espNuevasLimpias.filter((e) => !activasNorm.has(normEsp(e)));
    return [...restantes, ...nuevas];
  }, [especialidadesList, espCierreList, espNuevasLimpias]);
  const espContinuan = useMemo(
    () => especialidadesList.filter((e) => !espCierreList.some((c) => normEsp(c) === normEsp(e))),
    [especialidadesList, espCierreList],
  );
  const espHayCambio = espCierreList.length > 0 || espNuevasLimpias.length > 0;
  const esCambioEsp = esSaliente && tipoSeg === T.CAMBIO_ESPECIALIDAD;
  const esCambioUnidad = (esSaliente || esInterna) && tipoSeg === T.CAMBIO_UNIDAD;
  const esTepActivacion = esInterna && tipoSeg === TI.TEP_ACTIVACION;
  // Proveedor SEM (predeterminado en flujos de ambulancia/TEP).
  const SEM_MATCH = "SERVICIOS DE EMERGENCIAS MEDICAS DEL CAQUETA";
  const proveedorSem = useMemo(
    () => empresasTepInterna.find((p) => p.toUpperCase().includes(SEM_MATCH)) ?? "",
    [empresasTepInterna],
  );
  // Preselección SEM al abrir el bloque TEP.
  useEffect(() => {
    if (esTepActivacion && !riTepProveedor && proveedorSem) {
      setRiTepProveedor(proveedorSem);
    }
  }, [esTepActivacion, proveedorSem, riTepProveedor]);
  // Cama vigente de RI: se deriva del último CAMBIO DE UNIDAD registrado
  // (referencia_interna no tiene columna `cama`; se guarda estructurada en
  // el seguimiento). Si no existe, queda vacía.
  const camaActualRi = useMemo(() => {
    if (!esInterna) return "";
    const rows = (historial ?? []) as { tipo_seguimiento?: string; detalles?: unknown; archivado?: boolean }[];
    const last = rows.find(
      (h) =>
        !h.archivado &&
        (h.tipo_seguimiento ?? "").toUpperCase() === "CAMBIO DE UNIDAD",
    );
    const det = (last?.detalles ?? {}) as Record<string, unknown>;
    return String(det["cama_nueva"] ?? det["nueva_cama"] ?? "").trim().toUpperCase();
  }, [esInterna, historial]);
  // Ubicación institucional actual (unidad = servicio de la remisión, cama del caso).
  const unidadActual = (
    esInterna ? (casoInterna?.servicio ?? "") : (caso?.servicio ?? "")
  ).trim();
  const camaActual = esInterna ? camaActualRi : (caso?.cama ?? "").trim();
  // Sanitiza la cama: mayúsculas, sin espacios extremos, sin HTML, máximo 30 chars.
  const sanitizarCama = (raw: string) =>
    raw
      .replace(/<[^>]*>/g, "")
      .replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ\-\s/.]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .slice(0, 30);
  const nuevaUnidadNorm = nuevaUnidad.trim().toUpperCase();
  const nuevaCamaNorm = sanitizarCama(nuevaCama);
  const hayCambioUnidad =
    !!nuevaUnidadNorm &&
    !!nuevaCamaNorm &&
    (nuevaUnidadNorm !== unidadActual.toUpperCase() ||
      nuevaCamaNorm !== camaActual.toUpperCase());
  const toggleEspCierre = (esp: string) =>
    setEspCierres((prev) => ({ ...prev, [esp]: !prev[esp] }));
  const setEspNuevaAt = (i: number, v: string) =>
    setEspNuevas((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  const addEspNuevaLine = () => setEspNuevas((prev) => [...prev, ""]);
  const removeEspNuevaLine = (i: number) =>
    setEspNuevas((prev) => (prev.length <= 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  // Al elegir una especialidad cerrada, confirmar su reactivación.
  const onPickEspNueva = (i: number, v: string) => {
    if (especCerradasSet.has(normEsp(v))) {
      const ok = window.confirm(
        "LA ESPECIALIDAD YA HABÍA SIDO CERRADA. ¿DESEA REACTIVARLA EN EL MANEJO ACTUAL?",
      );
      if (!ok) {
        setEspNuevaAt(i, "");
        return;
      }
    }
    setEspNuevaAt(i, v);
  };


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
  // ENTREGA DOCUMENTAL: solo mientras el caso esté aceptado con ambulancia y NO haya
  // pasado a PENDIENTE EGRESO (una vez registrada la entrega, el estado transiciona
  // canonicamente a PENDIENTE EGRESO y esta opción debe ocultarse).
  const mostrarEntregaDocOpt = faseAceptadoCon;
  // CIERRE POR EGRESO: disponible ÚNICAMENTE cuando exista entrega documental
  // persistida (el estado canónico PENDIENTE EGRESO es la evidencia de esa
  // transición). Antes de la entrega no debe aparecer, aunque el caso ya tenga
  // ambulancia coordinada. Fase 5B — Parte 1 (secuencia entrega ↔ cierre).
  const mostrarCierreOpt = facePendienteEgreso;
  // CIERRE POR TRASLADO EFECTIVO: solo tras completar la entrega documental
  // (estado PENDIENTE EGRESO). Antes de esa etapa NO debe aparecer (ni en gris).
  const mostrarTrasladoOpt = facePendienteEgreso;

  // ¿El responsable actual es una aseguradora/póliza (SOAT, ARL, póliza
  // estudiantil, etc.) y NO una EPS/EAPB? Se consulta el tipo de trámite y el
  // asegurador real del caso, no solo el texto libre. Solo en ese caso aplica
  // el CAMBIO DE ASEGURADOR A EAPB.
  const responsableTxt = `${caso?.tipo_tramite ?? ""} ${caso?.asegurador ?? ""} ${caso?.eapb ?? ""}`;
  const esAseguradoraNoEapb =
    /soat|arl|p[oó]liza|aseguradora|prepagada|particular|riesgos\s+laborales/i.test(
      responsableTxt,
    ) && !/\beps\b|\beapb\b/i.test(responsableTxt);
  const mostrarCambioEapb = usaIndigo && esAseguradoraNoEapb;

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
      // CIERRE POR TRASLADO EFECTIVO: oculto hasta completar la entrega documental.
      ...(mostrarTrasladoOpt ? [T.TRASLADO] : []),
      ...(mostrarCambioEapb ? [T.CAMBIO_EAPB] : []),
      // CAMBIO EN ESPECIALIDAD: solo disponible mientras el caso siga activo.
      ...(casoActivo ? [T.CAMBIO_ESPECIALIDAD] : []),
      // CAMBIO DE UNIDAD: mientras el caso siga activo, actualiza la ubicación institucional.
      ...(casoActivo ? [T.CAMBIO_UNIDAD] : []),
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
    mostrarTrasladoOpt,
    mostrarCambioEapb,
    casoActivo,
  ]);

  // Tipos para PHD/PAD/O2/Especiales (subconjunto saliente).
  const TIPOS_PHD = useMemo(() => {
    return [...(mostrarOpcionRadicado ? [T.RADICADO] : []), ...TIPOS_PHD_BASE];
  }, [mostrarOpcionRadicado]);

  // Referencia Interna: opciones dinámicas según secuencia + CAMBIO DE UNIDAD (mientras esté activo).
  const TIPOS_INTERNA_DYN = useMemo(() => {
    const proximo = siguientePasoRI(
      historial as { tipo_seguimiento: string; detalles?: unknown }[] | undefined,
      casoInterna?.tipo_solicitud ?? null,
    );
    const activo = !casoInterna?.archivado;
    const arr: string[] = [];
    if (proximo) arr.push(proximo);
    if (activo) arr.push(T.CAMBIO_UNIDAD);
    // Acción terminal de cancelación siempre disponible mientras esté activo.
    if (activo && proximo !== TI.CANCELACION_RI) arr.push(TI.CANCELACION_RI);
    // B3: OTRO y NOVEDADES son trazabilidad permanente mientras el caso esté activo.
    if (activo) arr.push(TI.OTRO, TI.NOVEDADES);
    return arr;
  }, [historial, casoInterna]);

  const TIPOS_SEG: string[] = esSaliente
    ? TIPOS_SALIENTES
    : esPhd
      ? TIPOS_PHD
      : esInterna
        ? TIPOS_INTERNA_DYN
        : esPendiente
          ? TIPOS_PENDIENTE
          : [];


  // Inicializar al abrir. Solo debe correr cuando el diálogo TRANSICIONA
  // a abierto: si depende de props reactivos (evolucionDetalle, listas,
  // estadoActual), las invalidaciones que dispara el diálogo hijo de
  // entrega documental (["remisiones"], ["phd-seguimientos"]) vuelven a
  // disparar este efecto y borran tipoSeg / indigoEditada / entregaPreparada,
  // lo que a su vez vacía la plantilla Índigo recién transferida.
  const initRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    const parsed = parseEvolucionDetalle(evolucionDetalle, especialidadesList);
    setEvoDetalle(parsed);
    setInicial(parseEvolucionDetalle(evolucionDetalle, especialidadesList));
    setMotivoEvo("");
    setEstadoCaso(estadoActual ?? "");
    setIndigoEditada(false);
    setEntregaPreparada(false);
    setTipoSeg("");
    setEvoEsp({});
    setEspCierres({});
    setEspNuevas([""]);
    setNuevaUnidad("");
    setNuevaCama("");
    setRiFirmaLlegada(null);
    setRiLlegFecha("");
    setRiLlegHora("");
    setRiOtroCual("");
    setRiNovInterna(false);
    setRiNovExterna(false);
    setRiNovInternaCod("");
    setRiNovReprogMotivos([]);
    setRiNovReprogFH("");
    setRiNovExternaCod("");
    setRiNovPacFam("");
  }, [open, evolucionDetalle, especialidadesList, estadoActual]);

  // Prefill desde el caso.
  useEffect(() => {
    if (open && caso) {
      setIpsReceptora(caso.ips_receptora ?? "");
      setPlataformaFuncSeg(
        caso.plataforma_funcionando === false
          ? "NO"
          : caso.plataforma_funcionando === true
            ? "SI"
            : "",
      );
    }
  }, [open, caso]);

  // Al cambiar el tipo de seguimiento: defaults de estado de la solicitud y reactivar auto-generación.
  useEffect(() => {
    setIndigoEditada(false);
    // Cambio real de tipo → deja de considerarse "entrega ya preparada".
    setEntregaPreparada(false);
    // Reset de novedades al cambiar de tipo.
    if (tipoSeg !== T.NOVEDADES) {
      setNovPaciente(false);
      setNovIps(false);
      setNovAmbulancia(false);
      setNovDesistTipo("");
      setNovDesistIps(false);
      setNovDesistAmb(false);
      setNovIpsTipo("");
      setNovIpsMotivo("");
      setNovIpsFecha("");
      setNovIpsHora("");
    }
    if (!usaIndigo || !tipoSeg) return;
    // Estado de la solicitud automático según el tipo (interno, ya no visible).
    if (
      tipoSeg === T.RADICADO ||
      tipoSeg === T.CANCELACION ||
      tipoSeg === T.CAMBIO_EAPB ||
      tipoSeg === T.CAMBIO_ESPECIALIDAD ||
      tipoSeg === T.CAMBIO_UNIDAD
    )
      setEstadoSolicitud("No aplica");
    else if (tipoSeg === T.ACEPTACION || tipoSeg === T.AMBULANCIA) setEstadoSolicitud("Sí acepta");
    else if (tipoSeg === T.NEGACIONES) setEstadoSolicitud("No acepta");
    else setEstadoSolicitud("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoSeg]);

  // ¿La cancelación seleccionada cierra el caso? (todas menos superación de tope SOAT)
  const cancelacionCierra = CANCELACION_CIERRA[cancelTipo];
  const esSuperacionTope = tipoSeg === T.CANCELACION && cancelTipo === "superacion_tope_soat";

  // Estado destino automático de la cadena secuencial (salientes).
  const estadoDestino = useMemo(() => {
    if (!esSaliente) return estadoCaso;
    let e = estadoActual ?? EST.PENDIENTE_ACEPT;
    if (tipoSeg === T.ACEPTACION) e = EST.ACEPTADO_SIN;
    else if (tipoSeg === T.AMBULANCIA) e = EST.ACEPTADO_CON;
    else if (tipoSeg === T.ENTREGA_DOC) e = EST.PENDIENTE_EGRESO;
    else if (tipoSeg === T.CIERRE)
      e = cierreEgreso === "si" ? EST.CERRADO_EXITOSO : (estadoActual ?? EST.PENDIENTE_ACEPT);
    else if (tipoSeg === T.TRASLADO) e = EST.CERRADO_TRASLADO;
    else if (tipoSeg === T.CANCELACION) {
      // Superación de tope SOAT: continúa el caso → vuelve a PENDIENTE ACEPTACIÓN.
      // Las demás cancelaciones cierran con su estado final estructurado.
      e =
        cancelTipo === "superacion_tope_soat"
          ? EST.PENDIENTE_ACEPT
          : CANCELACION_ESTADO_FINAL[cancelTipo] || (estadoActual ?? EST.PENDIENTE_ACEPT);
    } else if (tipoSeg === T.NOVEDADES && novPaciente) {
      // Desistimiento del paciente/familiar: NO no cambia el estado.
      if (novDesistTipo === "GENERAL") e = EST.DESIST_GENERAL;
      else if (novDesistTipo === "IPS") e = EST.PENDIENTE_ACEPT;
      else if (novDesistTipo === "AMB") e = EST.ACEPTADO_SIN;
    } else if (tipoSeg === T.NOVEDADES && novIps) {
      // Novedad de la IPS receptora: desistimiento hacia IPS o cancelación
      // regresan el caso a PENDIENTE ACEPTACIÓN; postergar mantiene el estado.
      if (novIpsTipo === "DESIST_IPS" || novIpsTipo === "CANCELA") e = EST.PENDIENTE_ACEPT;
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    esSaliente,
    estadoActual,
    estadoCaso,
    tipoSeg,
    cancelTipo,
    cierreEgreso,
    novPaciente,
    novDesistTipo,
    novIps,
    novIpsTipo,
  ]);

  const esEvolucionSal = usaIndigo && tipoSeg === T.EVOLUCION;
  const esRadicado = usaIndigo && tipoSeg === T.RADICADO;
  const esFisico = usaIndigo && tipoSeg === T.FISICO;
  const esTelefono = usaIndigo && tipoSeg === T.TELEFONO;
  const esEntregaDoc = usaIndigo && tipoSeg === T.ENTREGA_DOC;
  const esCierre = usaIndigo && tipoSeg === T.CIERRE;
  const esTraslado = usaIndigo && tipoSeg === T.TRASLADO;
  const esCambioEapb = usaIndigo && tipoSeg === T.CAMBIO_EAPB;
  const esCancelacion = usaIndigo && tipoSeg === T.CANCELACION;
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

  // --- Superación de tope SOAT: nueva EAPB/ERP responsable y sus flags (reutiliza catálogo EAPB). ---
  const cancelEapbActual = useMemo(
    () => eapbCat.find((e) => e.valor === cancelNuevaEapb) ?? null,
    [eapbCat, cancelNuevaEapb],
  );
  const cancelTienePlataforma = (cancelEapbActual?.extra1 ?? "").toUpperCase() === "SI";
  const cancelGeneraCodigo = (cancelEapbActual?.extra2 ?? "").toUpperCase() === "SI";
  const cancelTipoEntidad = (cancelEapbActual?.extra3 ?? "").toUpperCase();
  // Responsable anterior (para la fotografía histórica del cambio).
  const responsableAnterior = caso?.asegurador || caso?.eapb || "";
  // Radicación resultante para la nueva EAPB: código si genera, si no NO APLICA.
  const cancelRadicacionFinal = cancelGeneraCodigo ? cancelNuevoRadicado.trim() : "NO APLICA";
  // Casilla "Ambulancia" solo disponible tras coordinar ambulancia (o pendiente egreso).
  const novAmbDisponible = faseAceptadoCon || facePendienteEgreso;

  // --- Estado de evolución diaria (salientes v2) ---
  // El canal PLATAFORMA depende de si la EAPB hace seguimientos en plataforma.
  const evoEstadoSal: EvolucionEstado = useMemo(() => {
    if (segEnPlataforma) {
      const n = (evoCorreo ? 1 : 0) + (evoPlataforma ? 1 : 0);
      return n === 0 ? "sin" : n === 1 ? "parcial" : "completo";
    }
    return evoCorreo ? "completo" : "sin";
  }, [segEnPlataforma, evoCorreo, evoPlataforma]);
  const evoMetaSal = evolucionMeta[evoEstadoSal];
  const evoRequiereMotivo = esEvolucionSal && segEnPlataforma && evoEstadoSal === "parcial";

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
  const toggleEvoEsp = (esp: string) => setEvoEsp((prev) => ({ ...prev, [esp]: !prev[esp] }));

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

  // Precarga la fecha actual (zona horaria funcional del aplicativo) al
  // iniciar un seguimiento nuevo de AMBULANCIA COORDINADA. Solo aplica cuando
  // el campo está vacío: nunca sobrescribe una fecha ya elegida por el usuario
  // ni afecta históricos.
  useEffect(() => {
    if (tipoSeg !== T.AMBULANCIA) return;
    if (fechaTraslado.trim()) return;
    const hoyBogota = new Date().toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Bogota",
    });
    setFechaTraslado(hoyBogota);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoSeg]);

  // Motivo de negación resuelto (texto personalizado cuando se elige "OTRO").
  const negMotivoResuelto =
    negMotivo === "OTRO"
      ? negCual.trim()
        ? `OTRO MOTIVO: ${negCual.trim().toUpperCase()}`
        : ""
      : negMotivo;

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
            generarPlantillaRefInternaPendiente({
              funcionario: riFuncionario,
              cargo: riCargo,
              fecha: riFecha,
              hora: riHora,
            }),
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
        case TI.CIERRE_CONCLUSION:
          return appendNota(generarPlantillaRefInternaCulminacion(), detalle);
        case TI.CANCELACION_RI:
          return appendNota(
            `SE CANCELA EL TRÁMITE DE REFERENCIA INTERNA.\nMOTIVO: ${(detalle || "—").toUpperCase()}`,
            "",
          );
        case TI.PROG_AMB:
          return appendNota(
            `SE CONFIRMA PROGRAMACIÓN DE AMBULANCIA.\nFECHA/HORA RECOGIDA: ${(riRecFecha && riRecHora) ? `${riRecFecha}, ${riRecHora}` : "—"}\nTIPO AMBULANCIA: ${riRecTipoAmb || "—"}`,
            detalle,
          );
        case TI.LLEGADA_AMB: {
          const f = riFirmaLlegada;
          const empresa = (f?.empresa || caso?.prestador_traslado || "").toString().trim() || "—";
          const sede = (casoInterna?.servicio || "—").toString();
          const fechaHora = riLlegFecha && riLlegHora ? `${riLlegFecha} ${riLlegHora}` : "—";
          const resp = f?.responsable_nombre?.trim() || "—";
          const cargoResp = f?.responsable_cargo?.trim() || "—";
          const tel = f?.firmante_telefono?.trim() || "—";
          const mismo = f?.firmante_es_responsable === true;
          const firmanteBlock = f
            ? mismo
              ? `FIRMANTE: EL MISMO RESPONSABLE DEL TRASLADO`
              : `FIRMANTE: ${f.firmante_nombre?.trim() || "—"}\nCARGO DEL FIRMANTE: ${f.firmante_cargo?.trim() || "—"}`
            : "";
          const codigoBlock = f?.codigo ? `\nCÓDIGO DE VERIFICACIÓN: ${f.codigo}` : "";
          const cuerpo = [
            `CONFIRMACIÓN LLEGADA DE AMBULANCIA.`,
            `EMPRESA DE TRASLADO: ${empresa}`,
            `SEDE: ${sede}`,
            `FECHA/HORA DE LLEGADA: ${fechaHora}`,
            `RESPONSABLE DEL TRASLADO: ${resp}`,
            `CARGO DEL RESPONSABLE DEL TRASLADO: ${cargoResp}`,
            `NÚMERO TELEFÓNICO: ${tel}`,
            firmanteBlock,
          ]
            .filter(Boolean)
            .join("\n")
            .concat(codigoBlock);
          return appendNota(cuerpo, detalle);
        }
        case TI.TEP_ACTIVACION: {
          const fechaTep = riTepFecha
            ? new Date(riTepFecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
            : "—";
          return appendNota(
            `SE ACTIVA PROVEEDOR CONTRATADO DE TEP.\nFECHA/HORA ACTIVACIÓN: ${fechaTep}\nPROVEEDOR: ${riTepProveedor || "—"}\nPACIENTE: ${paciente}\nDOCUMENTO: ${documento ?? "—"}\nSERVICIO/UBICACIÓN: ${casoInterna?.servicio ?? "—"}\nTIPO SOLICITUD: ${casoInterna?.tipo_solicitud ?? "—"}\nTIPO AMBULANCIA: ${casoInterna?.tipo_ambulancia ?? "—"}\nEAPB/ERP: ${casoInterna?.eapb ?? "—"}`,
            detalle,
          );
        }
        case TI.AMB_COORDINADA_ESP:
          return appendNota(
            `AMBULANCIA COORDINADA CON PROVEEDOR DE TEP.`,
            detalle,
          );
        case T.CAMBIO_UNIDAD:
          return appendNota(
            `CAMBIO DE UNIDAD.\nUNIDAD ANTERIOR: ${unidadActual || "UNIDAD ACTUAL NO REGISTRADA"}\nCAMA ANTERIOR: ${camaActual || "CAMA ACTUAL NO REGISTRADA"}\nNUEVA UNIDAD: ${nuevaUnidadNorm || "—"}\nNUEVA CAMA: ${nuevaCamaNorm || "—"}\nFECHA/HORA: ${new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`,
            detalle,
          );
        case TI.OTRO:
          return appendNota(
            `OTRO — ${riOtroCual.trim() || "—"}`,
            detalle,
          );
        case TI.NOVEDADES: {
          const partes: string[] = [];
          if (riNovInterna) {
            const etiquetas: Record<string, string> = {
              EQUIPO_FALLA: "FALLA DEL EQUIPO",
              REPROGRAMACION: "REPROGRAMACIÓN",
              NO_DISPONIBILIDAD_TECNICO: "NO DISPONIBILIDAD DE PERSONAL TÉCNICO",
            };
            const et = etiquetas[riNovInternaCod] ?? riNovInternaCod;
            let l = `INTERNA: ${et || "—"}`;
            if (riNovInternaCod === "REPROGRAMACION") {
              const motLbl: Record<string, string> = {
                RETRASO_AGENDA: "RETRASO DE LA AGENDA",
                IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO: "IMPOSIBILIDAD DE TOMA DE EXAMEN PREVIO",
              };
              const mots = riNovReprogMotivos.map((m) => motLbl[m] ?? m).join(", ");
              l += ` — MOTIVOS: ${mots || "—"}`;
              if (riNovReprogFH) {
                const d = new Date(riNovReprogFH);
                l += ` — NUEVA FECHA/HORA: ${d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`;
              }
            }
            partes.push(l);
          }
          if (riNovExterna) {
            const etiquetas: Record<string, string> = {
              AMBULANCIA_SIN_DISPONIBILIDAD: "AMBULANCIA SIN DISPONIBILIDAD",
              RED_NO_CONTRATADA: "RED NO CONTRATADA",
              NO_ACEPTACION_PACIENTE_FAMILIAR: "NO ACEPTACIÓN POR PACIENTE/FAMILIAR",
              DESCOMPENSACION_HEMODINAMICA: "DESCOMPENSACIÓN HEMODINÁMICA",
            };
            let l = `EXTERNA: ${etiquetas[riNovExternaCod] ?? riNovExternaCod ?? "—"}`;
            if (riNovExternaCod === "NO_ACEPTACION_PACIENTE_FAMILIAR") {
              const pfLbl: Record<string, string> = {
                ADULTO_MAYOR_SIN_ACOMPANANTE: "ADULTO MAYOR SIN ACOMPAÑANTE",
                FAMILIAR_NO_PERMITE_TRASLADO: "FAMILIAR NO PERMITE EL TRASLADO",
              };
              l += ` — ${pfLbl[riNovPacFam] ?? riNovPacFam ?? "—"}`;
            }
            partes.push(l);
          }
          return appendNota(
            `NOVEDAD EN REFERENCIA INTERNA.\n${partes.join("\n") || "—"}`,
            detalle,
          );
        }
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
            enviadoPlataforma: segEnPlataforma ? evoPlataforma : false,
            observacion: detalle,
          });
        } else {
          base = generarPlantillaEvolucionDiaria({
            estadoCaso,
            esTramiteAdministrativo: esAdminCaso,
            tienePlataforma: segEnPlataforma,
            plataformaFunciona: segEnPlataforma ? plataformaFuncSeg === "SI" : null,
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
          nombrePersona: cancelNombrePersona,
          parentesco: cancelParentesco,
          aseguradoraAnterior: responsableAnterior,
          nuevaEapb: cancelNuevaEapb,
          radicacion: cancelRadicacionFinal,
        });
        break;
      case T.PERTINENCIA:
        base = generarPlantillaRevisionAutorizacion({
          opcion: revOpcion,
          servicio: revServicio || caso?.servicio || "",
        });
        break;
      case T.CIERRE:
        base = generarPlantillaCierreAdmision(caso?.ips_receptora ?? ipsReceptora);
        break;
      case T.TRASLADO:
        base = generarPlantillaCierreTraslado({
          ipsReceptora: caso?.ips_receptora ?? ipsReceptora,
          fecha: trasFecha,
          hora: trasHora,
          empresa: trasEmpresa || caso?.prestador_traslado || "",
          tipoAmbulancia: trasTipoAmb || caso?.tipo_ambulancia || "",
        });
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
      case T.CAMBIO_ESPECIALIDAD:
        base = generarPlantillaCambioEspecialidad({
          cerradas: espCierreList,
          agregadas: espAgregadas,
          reactivadas: espReactivadas,
          continuan: espContinuan,
          observacion: detalle,
        });
        break;
      case T.CAMBIO_UNIDAD: {
        const uAnt = unidadActual || "[UNIDAD ANTERIOR]";
        const uNue = nuevaUnidadNorm || "[NUEVA UNIDAD]";
        const cNue = nuevaCamaNorm || "[NUEVA CAMA]";
        base = camaActual
          ? `SE REALIZA CAMBIO DE UBICACIÓN DEL PACIENTE, QUIEN PASA DE LA UNIDAD DE ${uAnt}, CAMA ${camaActual}, A LA UNIDAD DE ${uNue}, CAMA ${cNue}. SE ACTUALIZA LA INFORMACIÓN DEL CASO Y SE DEJA TRAZABILIDAD PARA LA CONTINUIDAD DEL PROCESO DE REMISIÓN.`
          : `SE REALIZA CAMBIO DE UBICACIÓN DEL PACIENTE, QUIEN PASA DE LA UNIDAD DE ${uAnt}, SIN CAMA PREVIAMENTE REGISTRADA, A LA UNIDAD DE ${uNue}, CAMA ${cNue}. SE ACTUALIZA LA INFORMACIÓN DEL CASO Y SE DEJA TRAZABILIDAD PARA LA CONTINUIDAD DEL PROCESO DE REMISIÓN.`;
        break;
      }
      case T.ENTREGA_DOC:
        base = "";
        break;
      case T.OTRO:
        base = generarPlantillaOtroSeg(otroCual, estadoSolicitud);
        break;
      case T.NOVEDADES: {
        const ipsNov = ipsReceptora.trim() || "[IPS]";
        const fhNov = [novIpsFecha.trim(), novIpsHora.trim()].filter(Boolean).join(" A LAS ");
        if (novPaciente && novDesistTipo === "GENERAL") {
          base =
            "SE REGISTRA DESISTIMIENTO GENERAL DEL PROCESO DE REMISIÓN POR PARTE DEL PACIENTE/FAMILIAR. SE CIERRA EL CASO Y SE DEJA TRAZABILIDAD DE LA GESTIÓN.";
        } else if (novPaciente && novDesistTipo === "IPS") {
          base =
            "SE REGISTRA DESISTIMIENTO DE LA IPS POR PARTE DEL PACIENTE/FAMILIAR. SE DEJA SIN EFECTO LA ACEPTACIÓN ACTUAL PARA LA CONTINUIDAD DEL TRÁMITE Y EL CASO RETORNA A PENDIENTE DE ACEPTACIÓN.";
        } else if (novPaciente && novDesistTipo === "AMB") {
          base =
            "SE REGISTRA DESISTIMIENTO DE LA AMBULANCIA POR PARTE DEL PACIENTE/FAMILIAR. SE CONSERVA LA ACEPTACIÓN DE LA IPS Y EL CASO RETORNA A PENDIENTE DE COORDINACIÓN DE AMBULANCIA.";
        } else if (novIps && novIpsTipo === "DESIST_IPS") {
          base =
            "SE REGISTRA QUE EL PACIENTE/FAMILIAR FIRMA DESISTIMIENTO HACIA LA IPS RECEPTORA. SE MARCA LA ACEPTACIÓN ACTUAL COMO DESISTIDA, SE CONSERVA LA TRAZABILIDAD Y EL CASO RETORNA A PENDIENTE DE ACEPTACIÓN.";
        } else if (novIps && novIpsTipo === "CANCELA") {
          base = `LA IPS RECEPTORA ${ipsNov} CANCELA LA ACEPTACIÓN DEL PACIENTE. EL CASO RETORNA A PENDIENTE DE ACEPTACIÓN PARA CONTINUAR LA GESTIÓN CON LA RED. MOTIVO: ${novIpsMotivo.trim() || "[MOTIVO]"}.`;
        } else if (novIps && novIpsTipo === "POSTERGA") {
          base = `LA IPS RECEPTORA ${ipsNov} POSTERGA LA ACEPTACIÓN HASTA EL ${fhNov || "[FECHA] A LAS [HORA]"}. SE MANTIENE LA TRAZABILIDAD DEL CASO Y SE REALIZARÁ NUEVO SEGUIMIENTO SEGÚN LA FECHA INDICADA.`;
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
    segEnPlataforma,
    plataformaFuncSeg,
    evoCorreo,
    evoPlataforma,
    evoMotivoPend,
    especialidadesList,
    evoEspEvolucionadas,
    evoEspPendientes,
    espCierreList,
    espAgregadas,
    espReactivadas,
    espContinuan,
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
    cancelNombrePersona,
    cancelParentesco,
    cancelNuevaEapb,
    cancelRadicacionFinal,
    responsableAnterior,
    cancelNuevoRadicado,
    cambioEapb,
    cambioTienePlataforma,
    cambioGeneraCodigo,
    cambioPlataformaFunc,
    cambioRadicado,
    revOpcion,
    revServicio,
    trasFecha,
    trasHora,
    trasEmpresa,
    trasTipoAmb,
    otroCual,
    novPaciente,
    novIps,
    novAmbulancia,
    novDesistTipo,
    novDesistIps,
    novDesistAmb,
    detalle,
    unidadActual,
    camaActual,
    nuevaUnidadNorm,
    nuevaCamaNorm,
  ]);

  useEffect(() => {
    // Nunca sobrescribir cuando la plantilla proviene de la entrega documental
    // ya transferida (Fase 5C · A.1): protege contra invalidaciones y
    // reinicializaciones que dispararían `plantillaGenerada = ""`.
    if (entregaPreparada) return;
    if (!indigoEditada) setIndigoTexto(plantillaGenerada);
  }, [plantillaGenerada, indigoEditada, entregaPreparada]);

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
  // El "Estado de la solicitud" ya no se muestra al usuario; se mantiene el valor
  // técnico interno (estadoSolicitud) que se define automáticamente por tipo.
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
    if (negMotivo === "OTRO" && !negCual.trim())
      return toast.error("Indica cuál es el motivo (campo CUÁL)");
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
    qc.invalidateQueries({ queryKey: ["saliente-aceptacion-vigente", casoId] });
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
          return {
            funcionario: riFuncionario.trim() || null,
            cargo: riCargo.trim() || null,
            fecha: riFecha.trim() || null,
            hora: riHora.trim() || null,
          };
        case TI.COORDINADO:
          return {
            fecha: riFecha.trim() || null,
            hora: riHora.trim() || null,
            informo_ambulancia: riInformoAmb,
            informo_servicio: riInformoServ,
          };
        case TI.PROG_AMB:
          return {
            fecha_recogida: riRecFecha.trim() || null,
            hora_recogida: riRecHora.trim() || null,
            tipo_ambulancia: riRecTipoAmb.trim() || null,
          };
        case TI.LLEGADA_AMB:
          return {
            fecha_llegada: riLlegFecha.trim() || null,
            hora_llegada: riLlegHora.trim() || null,
          };
        case TI.TEP_ACTIVACION:
          return {
            proveedor: riTepProveedor.trim() || null,
            fecha_activacion: riTepFecha.trim() || null,
          };
        case TI.AMB_COORDINADA_ESP:
          return { proveedor: riTepProveedor.trim() || null };
        case T.CAMBIO_UNIDAD:
          return {
            unidad_anterior: unidadActual || null,
            cama_anterior: camaActual || null,
            nueva_unidad: nuevaUnidadNorm || null,
            nueva_cama: nuevaCamaNorm || null,
            // Alias compatibles con el detalle guardado por remisiones salientes.
            unidad_nueva: nuevaUnidadNorm || null,
            cama_nueva: nuevaCamaNorm || null,
          };
        case TI.OTRO:
          return {
            ri_evento: "OTRO",
            cual: riOtroCual.trim(),
            observaciones: detalle.trim() || null,
          };
        case TI.NOVEDADES: {
          const categorias: string[] = [];
          if (riNovInterna) categorias.push("INTERNA");
          if (riNovExterna) categorias.push("EXTERNA");
          const out: Record<string, unknown> = {
            ri_evento: "NOVEDADES",
            categorias,
            observaciones: detalle.trim() || null,
          };
          if (riNovInterna) {
            out.interna_codigo = riNovInternaCod;
            if (riNovInternaCod === "REPROGRAMACION") {
              out.reprogramacion_motivos = riNovReprogMotivos;
              if (riNovReprogFH) out.fecha_hora_reprogramada = riNovReprogFH;
            }
          }
          if (riNovExterna) {
            out.externa_codigo = riNovExternaCod;
            if (riNovExternaCod === "NO_ACEPTACION_PACIENTE_FAMILIAR") {
              out.paciente_familiar_motivo = riNovPacFam;
            }
          }
          return out;
        }
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
          plataforma_funcionando: segEnPlataforma ? plataformaFuncSeg : null,
          enviado_correo: evoCorreo,
          enviado_plataforma: segEnPlataforma ? evoPlataforma : null,
          estado_evolucion: evoEstadoSal,
          motivo_pendiente: evoRequiereMotivo ? evoMotivoPend.trim() : null,
          // Trazabilidad por especialidades tratantes (Parte 9).
          especialidades_evolucionadas: especialidadesList.length > 0 ? evoEspEvolucionadas : null,
          especialidades_pendientes: especialidadesList.length > 0 ? evoEspPendientes : null,
          estado_evolucion_especialidades: especialidadesList.length > 0 ? evoEspEstado : null,
          medio_evolucion:
            evoCorreo && evoPlataforma
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
        return {
          ips_receptora: ipsReceptora.trim(),
          sede: ipsReceptoraSede.trim() || null,
          nombre_acepta: limpiarNombreAcepta(nombreAcepta),
          cargo_acepta: limpiarCargoAcepta(cargoAcepta),
        };
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
          cierra: cancelacionCierra,
          estado_final: cancelacionCierra ? CANCELACION_ESTADO_FINAL[cancelTipo] || null : null,
          // Desistimiento de traslado general
          nombre_persona:
            cancelTipo === "desistimiento_general" ? cancelNombrePersona.trim() || null : null,
          parentesco: cancelTipo === "desistimiento_general" ? cancelParentesco || null : null,
          // Superación de tope SOAT (fotografía histórica del cambio de responsable)
          responsable_anterior: esSuperacionTope ? responsableAnterior || null : null,
          nueva_eapb: esSuperacionTope ? cancelNuevaEapb.trim() || null : null,
          radicado_anterior: esSuperacionTope ? radicadoReal || null : null,
          radicacion_nueva: esSuperacionTope ? cancelRadicacionFinal || null : null,
        };
      case T.PERTINENCIA:
        return {
          autorizacion_estancia: revOpcion || null,
          servicio: revServicio || caso?.servicio || null,
        };
      case T.CIERRE:
        return {
          egreso: cierreEgreso || null,
          ips_receptora: caso?.ips_receptora ?? ipsReceptora ?? null,
        };
      case T.TRASLADO:
        return {
          traslado_efectivo: true,
          ips_receptora: caso?.ips_receptora ?? ipsReceptora ?? null,
          fecha: trasFecha.trim() || null,
          hora: trasHora.trim() || null,
          empresa: trasEmpresa.trim() || caso?.prestador_traslado || null,
          tipo_ambulancia: trasTipoAmb.trim() || caso?.tipo_ambulancia || null,
        };
      case T.CAMBIO_EAPB:
        return {
          nueva_eapb: cambioEapb.trim() || null,
          tiene_plataforma: cambioTienePlataforma,
          plataforma_funcionando: cambioTienePlataforma ? cambioPlataformaFunc || null : null,
          genera_codigo: cambioGeneraCodigo,
          nuevo_radicado: cambioRadicado.trim() || null,
        };
      case T.CAMBIO_ESPECIALIDAD:
        return {
          cerradas: espCierreList,
          agregadas: espAgregadas,
          reactivadas: espReactivadas,
          continuan: espContinuan,
          activas_resultantes: espActivasFinal,
        };
      case T.CAMBIO_UNIDAD:
        return {
          unidad_anterior: unidadActual || null,
          cama_anterior: camaActual || null,
          unidad_nueva: nuevaUnidadNorm || null,
          cama_nueva: nuevaCamaNorm || null,
        };
      case T.OTRO:
        return { cual: otroCual.trim() };
      case T.NOVEDADES:
        return {
          origen: [
            novPaciente ? "PACIENTE/FAMILIAR" : "",
            novIps ? "IPS RECEPTORA" : "",
            novAmbulancia ? "AMBULANCIA" : "",
          ]
            .filter(Boolean)
            .join(", "),
          desistimiento_paciente: novPaciente ? novDesistTipo || null : null,
          novedad_ips: novIps ? novIpsTipo || null : null,
          motivo_ips: novIps && novIpsTipo === "CANCELA" ? novIpsMotivo.trim() || null : null,
          postergacion:
            novIps && novIpsTipo === "POSTERGA"
              ? { fecha: novIpsFecha.trim() || null, hora: novIpsHora.trim() || null }
              : null,
          subestado:
            novIps && novIpsTipo === "POSTERGA"
              ? `ACEPTACIÓN POSTERGADA HASTA ${novIpsFecha.trim()} ${novIpsHora.trim()}`.trim()
              : null,
          ips_receptora: ipsReceptora.trim() || null,
        };
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
    setEspCierres({});
    setEspNuevas([""]);
    setNuevaUnidad("");
    setNuevaCama("");
    setCierreEgreso("");
    setEvoMotivoPend("");
    setFisNombre("");
    setFisParentesco("");
    setFisServicio("");
    setFisFuncionario("");
    setFisCargo("");
    setFisConQuien("");
    setIpsReceptoraSede("");
    setNombreAcepta("");
    setCargoAcepta("");
    setNegMotivo("");
    setNegCual("");
    setNegIpsInput("");
    setNegIpsCurrent([]);
    setNegGrupos([]);
    setEmpresaAmb("");
    setFechaTraslado("");
    setHoraTraslado("");
    setCancelTipo("desistimiento_general");
    setCancelNombrePersona("");
    setCancelParentesco("");
    setCancelNuevaEapb("");
    setCancelPlataformaFunc("");
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
    setNovIpsTipo("");
    setNovIpsMotivo("");
    setNovIpsFecha("");
    setNovIpsHora("");
    setAsunto("");
    setContactoDestino("");
    setContactoIps("");
    setRevOpcion("");
    setRevServicio("");
    setTrasFecha("");
    setTrasHora("");
    setTrasEmpresa("");
    setTrasTipoAmb("");
    setTrasConfirma(false);
    setNuevoRadicadoMode(false);
    setNuevoRadicado("");
    setRiFuncionario("");
    setRiCargo("");
    setRiFecha("");
    setRiHora("");
    setRiInformoAmb(false);
    setRiInformoServ(false);
    setRiRecFecha("");
    setRiRecHora("");
    setRiRecTipoAmb("");
    setRiLlegFecha("");
    setRiLlegHora("");
    setRiTepProveedor("");
    setRiTepFecha("");

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
        if (!revOpcion) return toast.error("Indica el estado de autorización de estancia");
        if (revOpcion === "CON_AUT_CON_NOTA" && !(revServicio || caso?.servicio || "").trim())
          return toast.error("Indica el servicio actual del paciente");
      }
      // Cancelación de trámite de remisión.
      if (esCancelacion) {
        if (cancelTipo === "desistimiento_general") {
          if (!cancelNombrePersona.trim())
            return toast.error("Indica el nombre de la persona que firma el desistimiento");
          if (!cancelParentesco)
            return toast.error("Indica el parentesco / relación de la persona");
        }
        if (esSuperacionTope) {
          if (!cancelNuevaEapb.trim())
            return toast.error("Selecciona la nueva EAPB/ERP responsable");
          if (cancelGeneraCodigo && !cancelNuevoRadicado.trim())
            return toast.error("Ingresa el código de radicación de la nueva EAPB/ERP");
        }
      }
      // Cierre por traslado efectivo.
      if (esTraslado) {
        if (trasFecha.trim() && !isFechaValida(trasFecha))
          return toast.error("Fecha del traslado inválida (DD/MM/AAAA)");
        if (trasHora.trim() && !isHoraValida(trasHora))
          return toast.error("Hora del traslado inválida (HH:MM)");
        if (!trasConfirma)
          return toast.error("Confirma que el paciente fue trasladado efectivamente");
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
      if (esInterna && tipoSeg === TI.PENDIENTE) {
        if (!riFecha.trim() || !isFechaValida(riFecha))
          return toast.error("Fecha del examen requerida (DD/MM/AAAA)");
        if (!riHora.trim() || !isHoraValida(riHora))
          return toast.error("Hora del examen requerida (HH:MM)");
      }
      if (esInterna && tipoSeg === TI.COORDINADO) {
        if (riFecha.trim() && !isFechaValida(riFecha))
          return toast.error("Fecha del examen inválida (DD/MM/AAAA)");
        if (riHora.trim() && !isHoraValida(riHora))
          return toast.error("Hora del examen inválida (HH:MM)");
      }
      if (esInterna && tipoSeg === TI.PROG_AMB) {
        if (!riRecFecha.trim() || !isFechaValida(riRecFecha))
          return toast.error("Fecha de recogida requerida (DD/MM/AAAA)");
        if (!riRecHora.trim() || !isHoraValida(riRecHora))
          return toast.error("Hora de recogida requerida (HH:MM)");
        if (!riRecTipoAmb.trim()) return toast.error("Selecciona el tipo de ambulancia");
      }
      if (esInterna && tipoSeg === TI.LLEGADA_AMB) {
        if (!riFirmaLlegada)
          return toast.error("La llegada requiere firma por QR completada.");
        if (!riLlegFecha.trim() || !isFechaValida(riLlegFecha))
          return toast.error("Fecha de llegada requerida (DD/MM/AAAA)");
        if (!riLlegHora.trim() || !isHoraValida(riLlegHora))
          return toast.error("Hora de llegada requerida (HH:MM)");
      }
      if (esInterna && tipoSeg === TI.TEP_ACTIVACION) {
        if (!riTepProveedor.trim()) return toast.error("Selecciona el proveedor de TEP");
        if (!riTepFecha.trim()) return toast.error("Indica la fecha y hora de activación del TEP");
      }
      // Acción terminal de cancelación: motivo obligatorio.
      if (esInterna && tipoSeg === TI.CANCELACION_RI) {
        if (detalle.trim().length < 5)
          return toast.error("Describe el motivo de la cancelación (mínimo 5 caracteres).");
      }
      // B3 · OTRO (RI): descripción obligatoria.
      if (esInterna && tipoSeg === TI.OTRO) {
        const c = riOtroCual.trim();
        if (c.length < 3 || c.length > 200)
          return toast.error("¿CUÁL? debe tener entre 3 y 200 caracteres.");
      }
      // B3 · NOVEDADES (RI): validación estructurada.
      if (esInterna && tipoSeg === TI.NOVEDADES) {
        if (!riNovInterna && !riNovExterna)
          return toast.error("Selecciona INTERNA, EXTERNA o ambas.");
        if (riNovInterna && !riNovInternaCod)
          return toast.error("Selecciona el código de la novedad interna.");
        if (riNovInterna && riNovInternaCod === "REPROGRAMACION" && riNovReprogMotivos.length === 0)
          return toast.error("Selecciona al menos un motivo de reprogramación.");
        if (riNovExterna && !riNovExternaCod)
          return toast.error("Selecciona el código de la novedad externa.");
        if (
          riNovExterna &&
          riNovExternaCod === "NO_ACEPTACION_PACIENTE_FAMILIAR" &&
          !riNovPacFam
        )
          return toast.error("Selecciona el motivo de no aceptación paciente/familiar.");
      }

      // Cambio en especialidad: exige cambio real, conservar una activa y motivo.
      if (esCambioEsp) {
        if (!espHayCambio)
          return toast.error(
            "No se ha registrado ningún cambio en las especialidades del caso.",
          );
        const activasNorm = new Set(especialidadesList.map(normEsp));
        const yaActiva = espNuevasLimpias.find((e) => activasNorm.has(normEsp(e)));
        if (yaActiva)
          return toast.error(`La especialidad ${yaActiva.toUpperCase()} ya está activa en el caso.`);
        if (espActivasFinal.length === 0)
          return toast.error(
            "El caso debe conservar al menos una especialidad activa mientras continúe en trámite.",
          );
        if ((espCierreList.length > 0 || espReactivadas.length > 0) && !detalle.trim())
          return toast.error("Registra las observaciones del cambio.");
      }
      if (esCambioUnidad) {
        if (!nuevaUnidadNorm) return toast.error("Selecciona la nueva unidad.");
        if (!nuevaCamaNorm) return toast.error("Indica la nueva cama del paciente.");
        if (!hayCambioUnidad)
          return toast.error("NO SE IDENTIFICARON CAMBIOS EN LA UBICACIÓN DEL PACIENTE.");
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
        if (novPaciente && !novDesistTipo)
          return toast.error("Indica si el paciente/familiar firmó desistimiento");
        if (novIps && !novIpsTipo) return toast.error("Selecciona la novedad de la IPS receptora");
        if (novIps && novIpsTipo === "CANCELA" && !novIpsMotivo.trim())
          return toast.error("Indica el motivo de la cancelación de la IPS");
        if (novIps && novIpsTipo === "POSTERGA" && (!novIpsFecha.trim() || !novIpsHora.trim()))
          return toast.error("Indica la fecha y hora de postergación");
        // Observaciones opcionales cuando la IPS receptora cancela la aceptación
        // (el motivo ya es obligatorio arriba). En el resto de novedades siguen
        // siendo obligatorias.
        const cancelaAceptacion = novIps && novIpsTipo === "CANCELA";
        if (!cancelaAceptacion && !detalle.trim())
          return toast.error("Registra la observación de la novedad");
      }
      if (requiereMotivoLegacy && mostrarEvolucionLegacy && !motivoEvo.trim())
        return toast.error("Indica el motivo de la evolución pendiente");

      // Confirmaciones previas para acciones que cierran el caso.
      if (esTraslado) {
        if (
          !window.confirm(
            "¿CONFIRMA EL CIERRE DEL CASO POR TRASLADO EFECTIVO?\n\nEl caso será retirado de los casos activos y trasladado al historial. Toda la trazabilidad será conservada.",
          )
        )
          return;
      }
      if (esCancelacion && cancelacionCierra) {
        const label = CANCELACION_TIPOS.find((c) => c.value === cancelTipo)?.label ?? "";
        if (
          !window.confirm(
            `¿CONFIRMA LA CANCELACIÓN Y CIERRE DEL CASO?\n\n${label}\n\nEl caso será retirado de los casos activos y trasladado al historial. Toda la trazabilidad será conservada.`,
          )
        )
          return;
      }
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

    const { data: segInsertada, error } = await supabase
      .from("seguimientos")
      .insert({
        caso_id: casoId,
        tipo_caso: tipoCaso,
        radicado: radicadoSeg || null,
        tipo_seguimiento: tipoSegFinal,
        detalle: detalle || null,
        estado_solicitud:
          nuevoRadicadoMode || !mostrarEstadoSolicitud ? null : estadoSolicitud || null,
        nombre_contacto: mostrarContacto ? nombreContacto.trim() || null : null,
        telefono: mostrarContacto ? telefono.trim() || null : null,
        plantilla_indigo: indigoTexto.trim() || null,
        detalles: construirDetalles() as never,
        nombre_usuario: perfil?.nombre || u.user?.email || null,
        created_by: u.user?.id,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    // Cambio en especialidad: registra el historial inmutable de cambios.
    if (esCambioEsp && segInsertada?.id) {
      const nombreUsuario = perfil?.nombre || u.user?.email || null;
      const filas = [
        ...espCierreList.map((esp) => ({
          action: "CLOSED" as const,
          especialidad: esp,
          previous_status: "ACTIVA",
          new_status: "CERRADA POR FINALIZACIÓN DE MANEJO",
        })),
        ...espReactivadas.map((esp) => ({
          action: "REACTIVATED" as const,
          especialidad: esp,
          previous_status: "CERRADA POR FINALIZACIÓN DE MANEJO",
          new_status: "ACTIVA",
        })),
        ...espAgregadas.map((esp) => ({
          action: "ADDED" as const,
          especialidad: esp,
          previous_status: null,
          new_status: "ACTIVA",
        })),
      ].map((f) => ({
        ...f,
        caso_id: casoId,
        tabla: tabla ?? "remisiones",
        tipo_caso: tipoCaso,
        motivo: detalle.trim() || null,
        seguimiento_id: segInsertada.id,
        changed_by: u.user?.id ?? null,
        changed_by_name: nombreUsuario,
      }));
      if (filas.length > 0) {
        await supabase.from("especialidades_historial").insert(filas);
      }
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
        prestador_traslado?: string;
        tipo_ambulancia?: string;
        especialidades_tratantes?: string;
        servicio?: string;
        cama?: string;
      } = {};
      // Cambio en especialidad: actualiza la lista de especialidades activas del
      // caso (sin tocar el estado). El historial completo queda en la tabla aparte.
      if (esCambioEsp) {
        update.especialidades_tratantes = espActivasFinal.join(", ");
      }
      // Cambio de unidad: actualiza servicio (unidad) y cama sin tocar estado / aceptación.
      // En Referencia Interna la tabla no tiene columna `cama`; la nueva cama queda
      // persistida estructurada dentro de `seguimientos.detalles` para trazabilidad.
      if (esCambioUnidad) {
        update.servicio = nuevaUnidadNorm;
        if (esSaliente) update.cama = nuevaCamaNorm;
      }
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
      // Cierre por traslado efectivo: refleja empresa/tipo de ambulancia usados.
      if (esSaliente && esTraslado) {
        if (trasEmpresa.trim()) update.prestador_traslado = trasEmpresa.trim();
        if (trasTipoAmb.trim()) update.tipo_ambulancia = trasTipoAmb.trim();
      }
      // Cancelación por SUPERACIÓN DE TOPE SOAT: NO cierra el caso. Cambia el
      // responsable del aseguramiento a la nueva EAPB/ERP y continúa activo.
      if (esSaliente && esSuperacionTope && cancelNuevaEapb.trim()) {
        update.eapb = cancelNuevaEapb.trim();
        update.asegurador = cancelNuevaEapb.trim();
        update.eapb_tiene_plataforma = cancelTienePlataforma;
        update.eapb_genera_codigo = cancelGeneraCodigo;
        update.plataforma_funcionando = cancelTienePlataforma
          ? cancelPlataformaFunc === "SI"
          : null;
        // Radicación: código nuevo si la EAPB genera, si no NO APLICA.
        update.codigo_radicacion = cancelGeneraCodigo ? cancelNuevoRadicado.trim() : "NO APLICA";
      }
      // Cambio de asegurador a EAPB: actualiza la aseguradora del caso y sus flags.
      if (esSaliente && esCambioEapb && cambioEapb.trim()) {
        update.eapb = cambioEapb.trim();
        update.asegurador = cambioEapb.trim();
        update.eapb_tiene_plataforma = cambioTienePlataforma;
        update.eapb_genera_codigo = cambioGeneraCodigo;
        update.plataforma_funcionando = cambioTienePlataforma
          ? cambioPlataformaFunc === "SI"
          : null;
        if (cambioGeneraCodigo && cambioRadicado.trim())
          update.codigo_radicacion = cambioRadicado.trim();
      }
      // Salientes: estado automático según la cadena secuencial.
      if (esSaliente) {
        if (estadoDestino && estadoDestino !== (estadoActual ?? "")) update.estado = estadoDestino;
        // Cancelaciones que cierran el caso (todas menos superación de tope SOAT).
        if (esCancelacion && cancelacionCierra) {
          update.estado = CANCELACION_ESTADO_FINAL[cancelTipo] || estadoDestino;
          update.archivado = true;
        } else if (esCancelacion && esSuperacionTope) {
          // Superación de tope: continúa activo, vuelve a PENDIENTE ACEPTACIÓN.
          update.estado = EST.PENDIENTE_ACEPT;
          update.archivado = false;
        } else if (
          // Cierre por egresos (remisión exitosa), traslado efectivo o
          // desistimiento general → cierra el caso y lo archiva (pasa a histórico).
          (esCierre && cierreEgreso === "si") ||
          esTraslado ||
          estadoDestino === EST.CERRADO_EXITOSO ||
          estadoDestino === EST.CERRADO_TRASLADO ||
          estadoDestino === EST.DESIST_GENERAL
        ) {
          update.estado =
            estadoDestino === EST.DESIST_GENERAL
              ? EST.DESIST_GENERAL
              : esTraslado || estadoDestino === EST.CERRADO_TRASLADO
                ? EST.CERRADO_TRASLADO
                : EST.CERRADO_EXITOSO;
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
        else if (tipoSeg === TI.PROG_AMB) update.estado = "AMBULANCIA PROGRAMADA";
        else if (tipoSeg === TI.LLEGADA_AMB) update.estado = "AMBULANCIA EN SITIO";
        else if (tipoSeg === TI.TEP_ACTIVACION) update.estado = "TEP ACTIVADO";
        else if (tipoSeg === TI.AMB_COORDINADA_ESP) update.estado = "AMBULANCIA COORDINADA";
        else if (tipoSeg === TI.CIERRE_CONCLUSION) {
          update.estado = RI_ESTADO_CIERRE;
          update.archivado = true;
        }
        else if (tipoSeg === TI.CANCELACION_RI) {
          update.estado = RI_ESTADO_CANCELADO;
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
      // Auditoría: solo metadatos estructurados, sin PHI ni plantilla completa.
      const auditDetalles: Record<string, unknown> = { tipo_seguimiento: tipoSeg };
      if (esCancelacion) {
        auditDetalles.subtipo_cancelacion = cancelTipo;
        auditDetalles.cierra = cancelacionCierra;
        auditDetalles.estado_anterior = estadoActual ?? null;
        auditDetalles.estado_nuevo = esSuperacionTope
          ? EST.PENDIENTE_ACEPT
          : cancelacionCierra
            ? CANCELACION_ESTADO_FINAL[cancelTipo]
            : estadoDestino;
        if (esSuperacionTope) {
          auditDetalles.responsable_anterior = responsableAnterior || null;
          auditDetalles.responsable_nuevo = cancelNuevaEapb.trim() || null;
          auditDetalles.radicado_anterior = radicadoReal || null;
          auditDetalles.radicado_nuevo = cancelGeneraCodigo
            ? cancelNuevoRadicado.trim() || null
            : "NO APLICA";
        }
      }
      if (esTraslado) {
        auditDetalles.estado_anterior = estadoActual ?? null;
        auditDetalles.estado_nuevo = EST.CERRADO_TRASLADO;
        auditDetalles.cierra = true;
      }
      await registrarAuditoria({
        data: {
          accion: esRadicado ? "radicacion_en_plataforma" : "crear_seguimiento",
          modulo: moduloAuditoria,
          tabla: tabla ?? "seguimientos",
          registroId: casoId,
          resultado: "exito",
          detalles: auditDetalles,
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
  const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[56rem]">
        {/* Encabezado fijo */}
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-10 text-left sm:px-6">
          <DialogTitle className="break-words text-base leading-snug">
            Seguimiento · {paciente}
          </DialogTitle>
        </DialogHeader>

        {/* Cuerpo desplazable (único con scroll vertical, barra invisible) */}
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 scrollbar-invisible sm:px-6">
          {/* Aviso de caso cerrado: modo consulta, sin nuevos seguimientos */}
          {casoCerrado && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
              ESTE CASO SE ENCUENTRA CERRADO Y NO ADMITE NUEVOS SEGUIMIENTOS.
              {estadoActual ? (
                <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                  Estado actual: {estadoActual}
                </span>
              ) : null}
            </div>
          )}
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
                estadoOpciones &&
                estadoOpciones.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Estado del caso</Label>
                    <Select
                      value={estadoCaso}
                      onValueChange={setEstadoCaso}
                      disabled={!estadoCasoEditable}
                    >
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
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
                    {TIPOS_SEG.map((t) => (
                      <SelectItem
                        key={t}
                        value={t}
                        className="whitespace-normal [overflow-wrap:anywhere]"
                        title={t === T.PERTINENCIA ? REVISION_AUT_LABEL_COMPLETO : labelTipoSeg(t)}
                      >
                        {labelTipoSeg(t)}
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

                  {segEnPlataforma && (
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
                    {segEnPlataforma && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={evoPlataforma}
                          onCheckedChange={(v) => setEvoPlataforma(!!v)}
                        />
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
                          <span
                            className={`h-2 w-2 rounded-full ${evoEspMeta[evoEspEstado].dot}`}
                          />
                          EVOLUCIÓN {evoEspEstado}
                        </span>
                      )}
                    </div>
                    {especialidadesList.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        No hay especialidades tratantes registradas para este caso. Puedes continuar
                        con la observación manual.
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

              {/* CAMBIO EN ESPECIALIDAD */}
              {esCambioEsp && (
                <div className={sectionCls}>
                  <p className={labelCls}>Cambio en especialidad</p>

                  {/* Especialidades actualmente en manejo */}
                  <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className={labelCls}>Especialidades actualmente en manejo</p>
                    {especialidadesList.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        El caso no tiene especialidades activas registradas.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {especialidadesList.map((esp) => (
                          <label
                            key={esp}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
                          >
                            <span>{esp}</span>
                            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Checkbox
                                checked={!!espCierres[esp]}
                                onCheckedChange={() => toggleEspCierre(esp)}
                              />
                              ELIMINAR POR CIERRE DE MANEJO
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Nuevas especialidades en manejo */}
                  <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className={labelCls}>Nuevas especialidades en manejo</p>
                    <div className="space-y-2">
                      {espNuevas.map((val, i) => (
                        <div key={i} className="flex items-end gap-2">
                          <div className="flex-1">
                            <AutoComplete
                              value={val}
                              onChange={(v) => setEspNuevaAt(i, v)}
                              onPick={(v) => onPickEspNueva(i, v)}
                              options={catEspecialidades}
                              placeholder="Buscar especialidad…"
                            />
                          </div>
                          {espNuevas.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              onClick={() => removeEspNuevaLine(i)}
                              aria-label="Eliminar línea"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addEspNuevaLine}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" /> Agregar especialidad
                    </Button>
                    {especCerradasNombres.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Cerradas previamente (se pueden reactivar):{" "}
                        {especCerradasNombres.join(", ")}.
                      </p>
                    )}
                  </div>

                  {/* Resumen del cambio */}
                  {espHayCambio && (
                    <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      {espCierreList.length > 0 && (
                        <p>Cierres: {espCierreList.join(", ")}.</p>
                      )}
                      {espAgregadas.length > 0 && (
                        <p>Nuevas: {espAgregadas.join(", ")}.</p>
                      )}
                      {espReactivadas.length > 0 && (
                        <p>Reactivadas: {espReactivadas.join(", ")}.</p>
                      )}
                      <p>Activas resultantes: {espActivasFinal.join(", ") || "—"}.</p>
                    </div>
                  )}
                </div>
              )}

              {/* CAMBIO DE UNIDAD */}
              {esCambioUnidad && (
                <div className={sectionCls}>
                  <p className={labelCls}>Cambio de unidad</p>

                  {/* Ubicación actual (solo lectura) */}
                  <div className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className={labelCls}>Ubicación actual del paciente</p>
                    <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">Unidad actual: </span>
                        <span className="font-medium">{unidadActual || "SIN UNIDAD REGISTRADA"}</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">Cama actual: </span>
                        <span className="font-medium">{camaActual || "SIN CAMA REGISTRADA"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Nueva unidad + nueva cama */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Nueva unidad *</Label>
                      <Select value={nuevaUnidad} onValueChange={setNuevaUnidad}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar unidad…" />
                        </SelectTrigger>
                        <SelectContent>
                          {catUnidades.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              No hay unidades activas en el catálogo
                            </SelectItem>
                          ) : (
                            catUnidades.map((u) => (
                              <SelectItem key={u} value={u} className="whitespace-normal">
                                {u}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Nueva cama *</Label>
                      <Input
                        value={nuevaCama}
                        onChange={(e) => setNuevaCama(sanitizarCama(e.target.value))}
                        placeholder="Ej. 203-A, UCI-04, OBS-2"
                        maxLength={30}
                      />
                    </div>
                  </div>

                  {nuevaUnidadNorm && nuevaCamaNorm && !hayCambioUnidad && (
                    <p className="text-[11px] text-status-amber">
                      NO SE IDENTIFICARON CAMBIOS EN LA UBICACIÓN DEL PACIENTE.
                    </p>
                  )}
                </div>
              )}

              {/* CANCELACIÓN DEL TRÁMITE (RI) — motivo obligatorio en Detalle */}
              {esInterna && tipoSeg === TI.CANCELACION_RI && (
                <div className={sectionCls}>
                  <p className={labelCls}>Cancelación del trámite</p>
                  <p className="text-[12px] text-status-amber">
                    Esta acción cierra el caso en estado <b>{RI_ESTADO_CANCELADO}</b> y lo archiva.
                    Escribe el motivo en el campo <b>Detalle</b> (obligatorio, mínimo 5 caracteres).
                  </p>
                </div>
              )}

              {/* CIERRE POR CULMINACIÓN DE SOLICITUD (RI) */}
              {esInterna && tipoSeg === TI.CIERRE_CONCLUSION && (
                <div className={sectionCls}>
                  <p className={labelCls}>Cierre por culminación de solicitud</p>
                  <p className="text-[12px] text-muted-foreground">
                    Esta acción cierra el caso en estado <b>{RI_ESTADO_CIERRE}</b> y lo archiva.
                  </p>
                </div>
              )}

              {/* PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN (RI) */}
              {esInterna && tipoSeg === TI.PENDIENTE && (
                <div className={sectionCls}>
                  <p className={labelCls}>Coordinación de fecha y hora del examen</p>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Fecha y hora programada del examen *</Label>
                    <AppDateTimeInput
                      name="ri_pendiente_fecha_hora"
                      value={(() => {
                        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(riFecha.trim());
                        if (!m || !isHoraValida(riHora)) return "";
                        return `${m[3]}-${m[2]}-${m[1]}T${riHora}`;
                      })()}
                      onChange={(iso) => {
                        if (!iso) {
                          setRiFecha("");
                          setRiHora("");
                          return;
                        }
                        const [d, t] = iso.split("T");
                        if (!d || !t) return;
                        const [y, mo, da] = d.split("-");
                        setRiFecha(`${da}/${mo}/${y}`);
                        setRiHora(t.slice(0, 5));
                      }}
                      required
                    />
                    <p className="text-[11px] italic text-muted-foreground">
                      La fecha y hora quedan incluidas en la plantilla para Índigo.
                    </p>
                  </div>
                </div>
              )}

              {/* ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP */}
              {esTepActivacion && (
                <div className={sectionCls}>
                  <p className={labelCls}>Activación de proveedor contratado de TEP</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Fecha y hora de activación *</Label>
                      <AppDateTimeInput
                        name="ri_tep_fecha"
                        value={riTepFecha}
                        onChange={setRiTepFecha}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Proveedor contratado *</Label>
                      <select
                        value={riTepProveedor}
                        onChange={(e) => setRiTepProveedor(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="" disabled>Seleccione proveedor…</option>
                        {empresasTepInterna.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      {!proveedorSem && empresasTepInterna.length > 0 && (
                        <p className="text-[11px] text-status-amber">
                          NO SE ENCONTRÓ EL PROVEEDOR PREDETERMINADO SEM EN EL CATÁLOGO.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA (RI) */}
              {esInterna && tipoSeg === TI.PROG_AMB && (
                <div className={sectionCls}>
                  <p className={labelCls}>Confirmación de programación de ambulancia</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Fecha y hora de recogida *</Label>
                      <AppDateTimeInput
                        name="ri_rec_fecha_hora"
                        value={(() => {
                          const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(riRecFecha.trim());
                          if (!m || !isHoraValida(riRecHora)) return "";
                          return `${m[3]}-${m[2]}-${m[1]}T${riRecHora}`;
                        })()}
                        onChange={(iso) => {
                          if (!iso) {
                            setRiRecFecha("");
                            setRiRecHora("");
                            return;
                          }
                          const [d, t] = iso.split("T");
                          if (!d || !t) return;
                          const [y, mo, da] = d.split("-");
                          setRiRecFecha(`${da}/${mo}/${y}`);
                          setRiRecHora(t.slice(0, 5));
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Tipo de ambulancia *</Label>
                      <select
                        value={riRecTipoAmb}
                        onChange={(e) => setRiRecTipoAmb(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="" disabled>Seleccione…</option>
                        {catTipoAmbulancia.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* CONFIRMACIÓN DE LLEGADA DE AMBULANCIA (RI) — firma por QR */}
              {esInterna && tipoSeg === TI.LLEGADA_AMB && (
                <div className={sectionCls}>
                  <p className={labelCls}>Confirmación de llegada de ambulancia</p>
                  <p className="text-[12px] text-muted-foreground">
                    Genere el QR para que el personal receptor firme la llegada desde su dispositivo.
                    La fecha y hora oficiales se tomarán del momento de la firma.
                  </p>

                  <RiLlegadaQRPanel
                    casoId={casoId}
                    paciente={paciente}
                    documento={documento}
                    radicadoCaso={radicadoCaso}
                    onFirmada={(info) => {
                      setRiFirmaLlegada(info);
                      const d = new Date(info.firmadoAtISO);
                      const dd = String(d.getDate()).padStart(2, "0");
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const yyyy = d.getFullYear();
                      const hh = String(d.getHours()).padStart(2, "0");
                      const mi = String(d.getMinutes()).padStart(2, "0");
                      setRiLlegFecha(`${dd}/${mm}/${yyyy}`);
                      setRiLlegHora(`${hh}:${mi}`);
                      toast.success("Fecha y hora oficiales asignadas desde la firma");
                    }}
                  />

                  {(riLlegFecha || riLlegHora) && (
                    <div className="rounded-md border bg-muted/30 p-2 text-[12px]">
                      <span className="text-muted-foreground">Fecha/hora registrada:</span>{" "}
                      <b>{riLlegFecha} {riLlegHora}</b>
                    </div>
                  )}
                </div>
              )}

              {/* B3 · OTRO (RI) */}
              {esInterna && tipoSeg === TI.OTRO && (
                <div className={sectionCls}>
                  <p className={labelCls}>Otro (trazabilidad permanente)</p>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>¿Cuál? *</Label>
                    <Input
                      value={riOtroCual}
                      onChange={(e) => setRiOtroCual(e.target.value)}
                      maxLength={200}
                      placeholder="Describe brevemente el evento (3–200 caracteres)"
                    />
                  </div>
                  <p className="text-[11px] italic text-muted-foreground">
                    Este registro no altera la secuencia canónica. Las observaciones van en el campo Detalle.
                  </p>
                </div>
              )}

              {/* B3 · NOVEDADES (RI) */}
              {esInterna && tipoSeg === TI.NOVEDADES && (
                <div className={sectionCls}>
                  <p className={labelCls}>Novedades (INTERNA / EXTERNA)</p>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={riNovInterna}
                        onChange={(e) => {
                          setRiNovInterna(e.target.checked);
                          if (!e.target.checked) {
                            setRiNovInternaCod("");
                            setRiNovReprogMotivos([]);
                            setRiNovReprogFH("");
                          }
                        }}
                      />
                      INTERNA
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={riNovExterna}
                        onChange={(e) => {
                          setRiNovExterna(e.target.checked);
                          if (!e.target.checked) {
                            setRiNovExternaCod("");
                            setRiNovPacFam("");
                          }
                        }}
                      />
                      EXTERNA
                    </label>
                  </div>

                  {riNovInterna && (
                    <div className="space-y-2 rounded-md border border-border/60 p-3">
                      <Label className={labelCls}>Novedad interna *</Label>
                      <select
                        value={riNovInternaCod}
                        onChange={(e) => {
                          setRiNovInternaCod(e.target.value);
                          if (e.target.value !== "REPROGRAMACION") {
                            setRiNovReprogMotivos([]);
                            setRiNovReprogFH("");
                          }
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seleccione…</option>
                        <option value="EQUIPO_FALLA">Falla del equipo</option>
                        <option value="REPROGRAMACION">Reprogramación</option>
                        <option value="DESCOMPENSACION_HEMODINAMICA">Descompensación hemodinámica</option>
                        <option value="NO_DISPONIBILIDAD_TECNICO">No disponibilidad de personal técnico</option>
                      </select>

                      {riNovInternaCod === "REPROGRAMACION" && (
                        <>
                          <Label className={labelCls}>Motivos de reprogramación *</Label>
                          <div className="flex flex-wrap gap-3">
                            {[
                              ["RETRASO_AGENDA", "Retraso de la agenda"],
                              ["IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO", "Imposibilidad de toma de examen previo"],
                            ].map(([v, l]) => (
                              <label key={v} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={riNovReprogMotivos.includes(v)}
                                  onChange={(e) => {
                                    setRiNovReprogMotivos((prev) =>
                                      e.target.checked
                                        ? [...prev, v]
                                        : prev.filter((x) => x !== v),
                                    );
                                  }}
                                />
                                {l}
                              </label>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            <Label className={labelCls}>Nueva fecha/hora (opcional)</Label>
                            <AppDateTimeInput
                              name="ri_nov_reprog_fh"
                              value={riNovReprogFH}
                              onChange={setRiNovReprogFH}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {riNovExterna && (
                    <div className="space-y-2 rounded-md border border-border/60 p-3">
                      <Label className={labelCls}>Novedad externa *</Label>
                      <select
                        value={riNovExternaCod}
                        onChange={(e) => {
                          setRiNovExternaCod(e.target.value);
                          if (e.target.value !== "NO_ACEPTACION_PACIENTE_FAMILIAR") {
                            setRiNovPacFam("");
                          }
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seleccione…</option>
                        <option value="AMBULANCIA_SIN_DISPONIBILIDAD">Ambulancia sin disponibilidad</option>
                        <option value="RED_NO_CONTRATADA">Red no contratada</option>
                        <option value="NO_ACEPTACION_PACIENTE_FAMILIAR">No aceptación por paciente/familiar</option>
                      </select>

                      {riNovExternaCod === "NO_ACEPTACION_PACIENTE_FAMILIAR" && (
                        <>
                          <Label className={labelCls}>Motivo paciente/familiar *</Label>
                          <select
                            value={riNovPacFam}
                            onChange={(e) => setRiNovPacFam(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Seleccione…</option>
                            <option value="ADULTO_MAYOR_SIN_ACOMPANANTE">Adulto mayor sin acompañante</option>
                            <option value="FAMILIAR_NO_PERMITE_TRASLADO">Familiar no permite el traslado</option>
                          </select>
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] italic text-muted-foreground">
                    Las novedades no alteran la secuencia canónica; quedan como trazabilidad permanente.
                    Las observaciones van en el campo Detalle.
                  </p>
                </div>
              )}


              {/* FÍSICO O PRESENCIAL */}
              {esFisico && (
                <div className={sectionCls}>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Acercamiento con</Label>
                    <Select
                      value={acercamiento}
                      onValueChange={(v) => setAcercamiento(v as AcercamientoTipo)}
                    >
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
                        <Input
                          value={fisParentesco}
                          onChange={(e) => setFisParentesco(e.target.value)}
                        />
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
                          <Input
                            value={fisFuncionario}
                            onChange={(e) => setFisFuncionario(e.target.value)}
                          />
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
                        <Input
                          value={fisConQuien}
                          onChange={(e) => setFisConQuien(e.target.value)}
                        />
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
                  {/* Fase 5B — Bloque 2A: nombre y cargo de quien acepta. */}
                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Nombre de quien acepta</Label>
                      <Input
                        value={nombreAcepta}
                        onChange={(e) => setNombreAcepta(e.target.value)}
                        maxLength={NOMBRE_ACEPTA_MAX}
                        placeholder="Nombre completo"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Cargo de quien acepta</Label>
                      <Input
                        value={cargoAcepta}
                        onChange={(e) => setCargoAcepta(e.target.value)}
                        maxLength={CARGO_ACEPTA_MAX}
                        placeholder="Cargo del funcionario"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Estado de solicitud → SÍ ACEPTA. Nombre y cargo se usarán para precargar la
                    entrega documental.
                  </p>

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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0"
                        onClick={agregarIpsNeg}
                      >
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full"
                    onClick={agregarGrupoNeg}
                  >
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
                  <p className="text-[10px] text-muted-foreground">
                    Estado de solicitud → NO ACEPTA.
                  </p>
                </div>
              )}

              {/* AMBULANCIA COORDINADA */}
              {esSaliente && tipoSeg === T.AMBULANCIA && (
                <div className={sectionCls}>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Quién informa</Label>
                    <Select
                      value={ambVariante}
                      onValueChange={(v) => setAmbVariante(v as AmbulanciaVariante)}
                    >
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
                    ipsReceptora={
                      aceptacionVigente?.estado === "vigente"
                        ? (aceptacionVigente.aceptacion.ips_receptora ??
                            caso?.ips_receptora ??
                            ipsReceptora)
                        : (caso?.ips_receptora ?? ipsReceptora)
                    }
                    empresaTraslado={empresaAmb || (() => {
                      const h = (historial ?? []).find(
                        (s) => String(s.tipo_seguimiento ?? "").toUpperCase().includes("AMBULANCIA COORDINADA"),
                      );
                      const det = (h?.detalles ?? {}) as { empresa?: string };
                      return (det.empresa ?? "").toString();
                    })()}
                    especialidad={especialidadesList.join(", ")}
                    entidadPago={caso?.eapb}
                    tipoAmbulancia={caso?.tipo_ambulancia}
                    quienAcepta={
                      aceptacionVigente?.estado === "vigente"
                        ? aceptacionVigente.aceptacion.nombre_acepta
                        : null
                    }
                    cargoAcepta={
                      aceptacionVigente?.estado === "vigente"
                        ? aceptacionVigente.aceptacion.cargo_acepta
                        : null
                    }
                    aceptacionOrigenId={
                      aceptacionVigente?.estado === "vigente"
                        ? aceptacionVigente.aceptacion.aceptacion_id
                        : null
                    }
                    onEntregaCompletada={(res) => {
                      // Fase 5C · A.1: transferir la plantilla Índigo canónica
                      // al textarea principal sin registrar el seguimiento.
                      // Se marca `entregaPreparada` para que ningún efecto
                      // posterior (invalidaciones, reinit, cambios de deps)
                      // pueda vaciar la plantilla recién recibida.
                      if (!res?.plantillaIndigo || !res.plantillaIndigo.trim()) {
                        toast.error(
                          "La firma está registrada, pero no fue posible preparar la plantilla para Índigo.",
                        );
                        return;
                      }
                      setIndigoTexto(res.plantillaIndigo);
                      setIndigoEditada(true);
                      setEntregaPreparada(true);
                    }}
                  />
                  {aceptacionCargando && entregaOpen && (
                    <p className="text-[10.5px] text-muted-foreground">
                      Resolviendo aceptación vigente…
                    </p>
                  )}
                  {!aceptacionCargando &&
                    entregaOpen &&
                    aceptacionVigente?.estado === "sin_aceptacion" && (
                      <p className="text-[10.5px] text-amber-600">
                        No se encontró una aceptación de IPS receptora vigente. Registre la
                        aceptación antes de finalizar la entrega documental.
                      </p>
                    )}
                </div>
              )}

              {/* CIERRE POR EGRESOS (REMISIÓN) */}
              {esSaliente && esCierre && (
                <div className={sectionCls}>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>¿Paciente ya egresó de la institución?</Label>
                    <Select
                      value={cierreEgreso}
                      onValueChange={(v) => setCierreEgreso(v as "si" | "no")}
                    >
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

              {/* CIERRE DE CASO POR TRASLADO EFECTIVO */}
              {esSaliente && esTraslado && (
                <div className={sectionCls}>
                  <p className={labelCls}>Cierre por traslado efectivo</p>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>IPS receptora</Label>
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
                      {caso?.ips_receptora || ipsReceptora || "—"}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Fecha efectiva del traslado</Label>
                      <Input
                        value={trasFecha}
                        inputMode="numeric"
                        onChange={(e) => setTrasFecha(maskFechaInput(e.target.value))}
                        placeholder="DD/MM/AAAA"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Hora efectiva del traslado</Label>
                      <Input
                        value={trasHora}
                        inputMode="numeric"
                        onChange={(e) => setTrasHora(maskHoraInput(e.target.value))}
                        placeholder="HH:MM"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Empresa de traslado</Label>
                      <AutoComplete
                        value={trasEmpresa || caso?.prestador_traslado || ""}
                        options={empresasTep}
                        placeholder="Escribe para buscar empresa…"
                        minChars={2}
                        onChange={setTrasEmpresa}
                        onPick={setTrasEmpresa}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Tipo de ambulancia</Label>
                      <Input
                        value={trasTipoAmb || caso?.tipo_ambulancia || ""}
                        onChange={(e) => setTrasTipoAmb(e.target.value)}
                        placeholder="Ej. TAB / TAM"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-3 text-sm">
                    <Checkbox
                      checked={trasConfirma}
                      onCheckedChange={(v) => setTrasConfirma(!!v)}
                      className="mt-0.5"
                    />
                    <span className="font-semibold">EL PACIENTE FUE TRASLADADO EFECTIVAMENTE.</span>
                  </label>
                  <p className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                    Al guardar se generará la plantilla de cierre, el caso pasará al estado{" "}
                    <strong>CERRADO POR TRASLADO EFECTIVO</strong> y se moverá al historial.
                  </p>
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
                        onValueChange={(v) =>
                          setNovDesistTipo(v as "NO" | "IPS" | "AMB" | "GENERAL")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NO">NO</SelectItem>
                          <SelectItem value="IPS">DESISTIMIENTO IPS</SelectItem>
                          <SelectItem value="AMB">DESISTIMIENTO AMBULANCIA</SelectItem>
                          <SelectItem value="GENERAL">DESISTIMIENTO GENERAL</SelectItem>
                        </SelectContent>
                      </Select>
                      {novDesistTipo === "IPS" && (
                        <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                          Se dejará sin efecto la aceptación actual y el caso retornará a PENDIENTE
                          ACEPTACIÓN.
                        </p>
                      )}
                      {novDesistTipo === "AMB" && (
                        <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                          Se conserva la aceptación de la IPS y el caso retornará a pendiente de
                          coordinación de ambulancia.
                        </p>
                      )}
                      {novDesistTipo === "GENERAL" && (
                        <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                          Al guardar, el caso se cerrará como DESISTIMIENTO GENERAL y pasará al
                          historial.
                        </p>
                      )}
                    </div>
                  )}

                  {novIps && (
                    <div className="space-y-2 rounded-md border border-dashed p-3">
                      <Label className={labelCls}>¿Cuál es la novedad?</Label>
                      <Select
                        value={novIpsTipo}
                        onValueChange={(v) =>
                          setNovIpsTipo(v as "DESIST_IPS" | "CANCELA" | "POSTERGA")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="DESIST_IPS"
                            className="whitespace-normal [overflow-wrap:anywhere]"
                          >
                            PACIENTE/FAMILIAR FIRMA DESISTIMIENTO HACIA IPS
                          </SelectItem>
                          <SelectItem
                            value="CANCELA"
                            className="whitespace-normal [overflow-wrap:anywhere]"
                          >
                            IPS RECEPTORA CANCELA ACEPTACIÓN
                          </SelectItem>
                          <SelectItem
                            value="POSTERGA"
                            className="whitespace-normal [overflow-wrap:anywhere]"
                          >
                            IPS RECEPTORA POSTERGA LA ACEPTACIÓN
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {novIpsTipo === "CANCELA" && (
                        <div className="space-y-1.5 pt-1">
                          <Label className={labelCls}>Motivo de cancelación *</Label>
                          <Input
                            value={novIpsMotivo}
                            onChange={(e) => setNovIpsMotivo(e.target.value)}
                            placeholder="Motivo indicado por la IPS receptora"
                          />
                        </div>
                      )}
                      {novIpsTipo === "POSTERGA" && (
                        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className={labelCls}>Fecha de postergación *</Label>
                            <Input
                              value={novIpsFecha}
                              onChange={(e) => setNovIpsFecha(maskFechaInput(e.target.value))}
                              placeholder="DD/MM/AAAA"
                              inputMode="numeric"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={labelCls}>Hora de postergación *</Label>
                            <Input
                              value={novIpsHora}
                              onChange={(e) => setNovIpsHora(maskHoraInput(e.target.value))}
                              placeholder="HH:MM"
                              inputMode="numeric"
                            />
                          </div>
                        </div>
                      )}
                      {(novIpsTipo === "DESIST_IPS" || novIpsTipo === "CANCELA") && (
                        <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                          Se conserva la trazabilidad de la aceptación y el caso retornará a
                          PENDIENTE ACEPTACIÓN.
                        </p>
                      )}
                      {novIpsTipo === "POSTERGA" && (
                        <p className="rounded-md border border-sky-200 bg-sky-50/60 p-2 text-xs text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-400">
                          El caso se mantiene activo con subestado ACEPTACIÓN POSTERGADA. No se
                          reinicia la cadena.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Registra la novedad en observaciones. El estado del caso solo cambia si se marca
                    un desistimiento.
                  </p>
                </div>
              )}

              {/* CANCELACIÓN DE TRÁMITE DE REMISIÓN */}
              {esSaliente && tipoSeg === T.CANCELACION && (
                <div className={sectionCls}>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Tipo de cancelación</Label>
                    <Select
                      value={cancelTipo}
                      onValueChange={(v) => setCancelTipo(v as CancelacionTipo)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
                        {CANCELACION_TIPOS.map((s) => (
                          <SelectItem
                            key={s.value}
                            value={s.value}
                            className="whitespace-normal [overflow-wrap:anywhere]"
                            title={s.label}
                          >
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desistimiento de traslado general: nombre + parentesco */}
                  {cancelTipo === "desistimiento_general" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className={labelCls}>Nombre de la persona *</Label>
                        <Input
                          value={cancelNombrePersona}
                          onChange={(e) => setCancelNombrePersona(e.target.value)}
                          placeholder="Nombre y apellido"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className={labelCls}>Parentesco / relación *</Label>
                        <Select value={cancelParentesco} onValueChange={setCancelParentesco}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar…" />
                          </SelectTrigger>
                          <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
                            {PARENTESCO_OPCIONES.map((p) => (
                              <SelectItem
                                key={p}
                                value={p}
                                className="whitespace-normal [overflow-wrap:anywhere]"
                              >
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Superación de tope SOAT: cambio de responsable (mantiene el caso activo) */}
                  {esSuperacionTope && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className={labelCls}>Responsable anterior</Label>
                        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
                          {responsableAnterior || "—"}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className={labelCls}>Nueva EAPB/ERP responsable *</Label>
                        <AutoComplete
                          value={cancelNuevaEapb}
                          options={eapbOptions}
                          placeholder="Escribe para buscar la nueva EAPB/ERP…"
                          onChange={(v) => {
                            setCancelNuevaEapb(v);
                            setCancelNuevoRadicado("");
                          }}
                          onPick={(v) => {
                            setCancelNuevaEapb(v);
                            setCancelNuevoRadicado("");
                          }}
                        />
                        {cancelEapbActual && (
                          <p className="text-[10px] text-muted-foreground">
                            {cancelTipoEntidad || "SIN TIPO"} ·{" "}
                            {cancelTienePlataforma ? "Tiene plataforma" : "Sin plataforma"} ·{" "}
                            {cancelGeneraCodigo ? "Genera código" : "No genera código"}
                          </p>
                        )}
                      </div>
                      {cancelTienePlataforma && (
                        <div className="space-y-1.5">
                          <Label className={labelCls}>
                            ¿La plataforma se encuentra funcionando?
                          </Label>
                          <Select
                            value={cancelPlataformaFunc}
                            onValueChange={(v) => setCancelPlataformaFunc(v as "SI" | "NO")}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Seleccionar…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SI">SÍ</SelectItem>
                              <SelectItem value="NO">NO</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {cancelGeneraCodigo ? (
                        <div className="space-y-1.5">
                          <Label className={labelCls}>Código de radicación *</Label>
                          <Input
                            value={cancelNuevoRadicado}
                            onChange={(e) => setCancelNuevoRadicado(e.target.value)}
                            placeholder="Código de radicación de la nueva EAPB/ERP"
                          />
                        </div>
                      ) : cancelNuevaEapb.trim() ? (
                        <div className="space-y-1.5">
                          <Label className={labelCls}>Código de radicación</Label>
                          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                            NO APLICA
                          </div>
                        </div>
                      ) : null}
                      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        El caso NO se cierra: se cambia el responsable a la nueva EAPB/ERP, se
                        conserva la trazabilidad anterior y el caso continúa activo en PENDIENTE
                        ACEPTACIÓN.
                      </p>
                    </div>
                  )}

                  {/* Cancelaciones que cierran el caso */}
                  {esCancelacion && cancelacionCierra && (
                    <p className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                      Al guardar, el caso se cerrará como{" "}
                      <strong>{CANCELACION_ESTADO_FINAL[cancelTipo]}</strong> y pasará al historial.
                    </p>
                  )}
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
                    Al guardar se actualizará la aseguradora del caso con la nueva EAPB y sus datos
                    de plataforma/radicado. Estado de solicitud → NO APLICA.
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

              {/* REVISIÓN AUTORIZACIÓN ESTANCIA (CANCELACIÓN) — seguimiento de trazabilidad */}
              {esSaliente && tipoSeg === T.PERTINENCIA && (
                <div className={sectionCls}>
                  <p className="text-[10px] text-muted-foreground [overflow-wrap:anywhere]">
                    {REVISION_AUT_LABEL_COMPLETO}
                  </p>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Estado de autorización de estancia</Label>
                    <Select
                      value={revOpcion}
                      onValueChange={(v) => setRevOpcion(v as AutorizacionEstanciaOpcion)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
                        {AUTORIZACION_ESTANCIA_OPCIONES.map((o) => (
                          <SelectItem
                            key={o.value}
                            value={o.value}
                            className="whitespace-normal [overflow-wrap:anywhere]"
                            title={o.label}
                          >
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Opción 1: Referencia hace acercamiento al servicio actual del caso */}
                  {revOpcion === "CON_AUT_CON_NOTA" && (
                    <div className="space-y-1.5">
                      <Label className={labelCls}>Servicio actual del paciente *</Label>
                      <Select
                        value={revServicio || caso?.servicio || ""}
                        onValueChange={setRevServicio}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
                          {SERVICIO_OPCIONES.map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="whitespace-normal [overflow-wrap:anywhere]"
                            >
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Este seguimiento deja trazabilidad de la revisión y NO cierra el caso. El cierre
                    se realiza mediante una causal de cancelación (aval / continuidad de manejo
                    integral, etc.).
                  </p>
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

              {/* El campo "Estado de la solicitud" se eliminó del formulario: el estado se
              gestiona automáticamente vía "Estado del caso (automático)". El valor técnico
              interno se sigue guardando según el tipo de seguimiento. */}

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
            <DictationTextarea
              dictationKey={`${dictPrefix}.seguimiento.observaciones`}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={3}
            />
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
                        Motivo del pendiente{" "}
                        {faltanLegacy.length ? `(falta ${faltanLegacy.join(", ")})` : ""}
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
                      <span className="text-[11px] text-muted-foreground">
                        {fmtFechaHora(h.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {h.estado_solicitud && (
                        <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          {h.estado_solicitud}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {h.nombre_usuario || "—"}
                      </span>
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
                            <p className="text-muted-foreground">
                              Evolucionadas: {evol.join(", ")}
                            </p>
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

        {/* Pie fijo */}
        <div className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6">
          <Button
            className="w-full rounded-full"
            disabled={busy || casoCerrado}
            onClick={guardar}
          >
            {casoCerrado
              ? "Caso cerrado · solo consulta"
              : busy
                ? "Guardando…"
                : "Registrar seguimiento"}
          </Button>
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
