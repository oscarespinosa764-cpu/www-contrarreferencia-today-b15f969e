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
  generarPlantillaCancelacionRemision,
  generarPlantillaCorreoSeg,
  generarPlantillaEvolucionDiaria,
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
  CANCELACION: "CANCELACIÓN DE TRÁMITE DE REMISIÓN",
  PERTINENCIA: "REVISIÓN AUTORIZACIÓN ESTANCIA (CANCELACIÓN)",
  OTRO: "OTRO",
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

  // Otro
  const [otroCual, setOtroCual] = useState("");

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
          "eapb, tipo_tramite, eapb_tiene_plataforma, eapb_genera_codigo, plataforma_funcionando, ips_receptora, codigo_radicacion",
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

  const TIPOS_SALIENTES = useMemo(() => {
    const arr = [
      ...(mostrarOpcionRadicado ? [T.RADICADO] : []),
      T.EVOLUCION,
      T.CORREO,
      T.PLATAFORMA,
      T.FISICO,
      T.TELEFONO,
      T.ACEPTACION,
      T.NEGACIONES,
      T.AMBULANCIA,
      T.CANCELACION,
      T.PERTINENCIA,
      T.OTRO,
    ];
    return arr;
  }, [mostrarOpcionRadicado]);

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

  const findEstado = (re: RegExp) => (estadoOpciones ?? []).find((o) => re.test(o)) ?? "";

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

  // Al cambiar el tipo de seguimiento: defaults de estado y reactivar auto-generación.
  useEffect(() => {
    setIndigoEditada(false);
    if (!usaIndigo || !tipoSeg) return;
    // Estado de la solicitud automático según el tipo.
    if (tipoSeg === T.RADICADO || tipoSeg === T.CANCELACION) setEstadoSolicitud("No aplica");
    else if (tipoSeg === T.ACEPTACION || tipoSeg === T.AMBULANCIA) setEstadoSolicitud("Sí acepta");
    else if (tipoSeg === T.NEGACIONES) setEstadoSolicitud("No acepta");
    else setEstadoSolicitud("");
    // Estado del caso automático según el tipo.
    if (tipoSeg === T.RADICADO) {
      const e = findEstado(/PENDIENTE/i);
      if (e) setEstadoCaso(e);
    } else if (tipoSeg === T.AMBULANCIA) {
      const e = findEstado(/ACEPTAD.*CON.*AMBULANC/i);
      if (e) setEstadoCaso(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoSeg]);

  const esEvolucionSal = usaIndigo && tipoSeg === T.EVOLUCION;
  const esRadicado = usaIndigo && tipoSeg === T.RADICADO;
  const esFisico = usaIndigo && tipoSeg === T.FISICO;
  const esTelefono = usaIndigo && tipoSeg === T.TELEFONO;

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
        base = generarPlantillaEvolucionDiaria({
          estadoCaso,
          esTramiteAdministrativo: esAdminCaso,
          tienePlataforma,
          plataformaFunciona: tienePlataforma ? plataformaFuncSeg === "SI" : null,
          enviadoCorreo: evoCorreo,
          enviadoPlataforma: evoPlataforma,
          motivoPendiente: evoMotivoPend,
        });
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
      case T.OTRO:
        base = generarPlantillaOtroSeg(otroCual, estadoSolicitud);
        break;
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
    revAutoriza,
    revNota,
    revFuncionario,
    revCargo,
    otroCual,
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

  // --- Visibilidad de campos ---
  // Contacto y teléfono solo en CONTACTO TELEFÓNICO (módulos con Índigo). Oculto en interna/pendiente.
  const mostrarContacto = usaIndigo ? esTelefono : false;
  // Estado del caso editable salvo en FÍSICO/PRESENCIAL.
  const estadoCasoEditable = !esFisico;
  // Estado de solicitud automático (no editable) en ciertos tipos.
  const estadoSolicAuto =
    usaIndigo &&
    [T.RADICADO, T.CANCELACION, T.ACEPTACION, T.AMBULANCIA, T.NEGACIONES, T.EVOLUCION].includes(
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
    setOtroCual("");
    setAsunto("");
    setContactoDestino("");
    setContactoIps("");
    setRevAutoriza("");
    setRevNota("");
    setRevFuncionario("");
    setRevCargo("");
    setNuevoRadicadoMode(false);
    setNuevoRadicado("");
  };

  const guardar = async () => {
    // Flujo de radicado adicional ("+").
    if (nuevoRadicadoMode) {
      if (!nuevoRadicado.trim()) return toast.error("Ingresa el nuevo número de radicado");
      if (!detalle.trim())
        return toast.error("Indica las observaciones que justifican el nuevo radicado");
    } else {
      if (!tipoSeg) return toast.error("Selecciona el tipo de seguimiento");

      // Validaciones por tipo (salientes).
      if (esRadicado && generaCodigo && !radicado.trim())
        return toast.error("Ingresa el número de radicado");
      if (esSaliente && (tipoSeg === T.CORREO || tipoSeg === T.PLATAFORMA) && !asunto.trim())
        return toast.error("Indica el asunto del seguimiento");
      if (esTelefono && !contactoDestino)
        return toast.error("Selecciona con quién se realizó el contacto");
      if (esTelefono && contactoDestino === "IPS" && !contactoIps.trim())
        return toast.error("Indica el nombre de la IPS");
      if (esSaliente && tipoSeg === T.OTRO && !otroCual.trim())
        return toast.error("Indica en el campo CUÁL");
      if (esSaliente && tipoSeg === T.PERTINENCIA) {
        if (!revAutoriza) return toast.error("Indica el estado de autorización de estancia");
        if (revAutoriza === "SI" && !revNota)
          return toast.error("Indica la trazabilidad de autorizaciones");
        if (revAutoriza === "SI" && revNota === "NO" && !revFuncionario.trim())
          return toast.error("Indica el nombre del funcionario");
      }
      if (esSaliente && tipoSeg === T.NEGACIONES && negGruposPreview.length === 0)
        return toast.error("Agrega al menos un motivo de negación con su IPS");
      if (esSaliente && tipoSeg === T.AMBULANCIA) {
        if (fechaTraslado.trim() && !isFechaValida(fechaTraslado))
          return toast.error("Fecha de traslado inválida (DD/MM/AAAA)");
        if (horaTraslado.trim() && !isHoraValida(horaTraslado))
          return toast.error("Hora de traslado inválida (HH:MM)");
      }
      if (evoRequiereMotivo && !evoMotivoPend.trim())
        return toast.error("Indica el motivo del pendiente");
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

    const radicadoSeg = !esSaliente
      ? radicado.trim() || radicadoReal || null
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
      estado_solicitud: nuevoRadicadoMode ? null : estadoSolicitud || null,
      nombre_contacto: mostrarContacto ? nombreContacto.trim() || null : null,
      telefono: mostrarContacto ? telefono.trim() || null : null,
      plantilla_indigo: esSaliente ? indigoTexto.trim() || null : null,
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
        trazabilidad_indigo?: string;
      } = {};
      // Evolución legacy (otros módulos).
      if (mostrarEvolucionLegacy && especialidadesList.length > 0) {
        update.evolucion = evolucionLegacyCalc;
        update.evolucion_detalle = JSON.stringify(evoDetalle);
        update.evolucion_actualizada_at = new Date().toISOString();
        update.evolucion_motivo = requiereMotivoLegacy ? motivoEvo.trim() : null;
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
      if (esSaliente && tipoSeg === T.CANCELACION && cancelNuevoRadicado.trim())
        update.codigo_radicacion = cancelNuevoRadicado.trim();
      if (estadoOpciones && estadoCaso) update.estado = estadoCaso;
      if (esSaliente && indigoTexto.trim()) update.trazabilidad_indigo = indigoTexto.trim();

      if (Object.keys(update).length > 0) {
        await supabase
          .from(tabla as "remisiones")
          .update(update)
          .eq("id", casoId);
      }
      if (mostrarEvolucionLegacy && especialidadesList.length > 0)
        await sincronizarPendienteLegacy(u.user?.id);
    }

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
          {/* Número de radicado */}
          <div className="space-y-1.5">
            <Label className={labelCls}>Número de radicado</Label>
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

          {!nuevoRadicadoMode && (
          <>
          {/* Estado del caso */}
          {estadoOpciones && estadoOpciones.length > 0 && (
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
                  <Textarea
                    value={evoMotivoPend}
                    onChange={(e) => setEvoMotivoPend(e.target.value)}
                    rows={2}
                    placeholder="¿Por qué queda pendiente el otro canal?"
                  />
                </div>
              )}
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
            <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
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
