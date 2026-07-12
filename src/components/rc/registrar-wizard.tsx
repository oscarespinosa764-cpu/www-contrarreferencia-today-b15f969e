import { useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { siguienteCodigo } from "@/lib/codigo.functions";
import { crearAlertaCoordinacion } from "@/lib/alertas-coordinacion.functions";
import { useAuth } from "@/lib/auth";
import { AutoComplete } from "@/components/rc/autocomplete";
import { ResultadoCard } from "@/components/rc/resultado-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Siren,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  MOTIVOS_NEG,
  MOTIVO_NEG_CATALOGO,
  DOC_SUBTIPOS,
  DOCS_EPS,
  DOCS_SOAT,
  RED_SUBTIPOS,
  plantillaDocEps,
  plantillaDocSoat,
  plantillaArlDirecto,
  plantillaRedConjunto,
  plantillaMayorConEsp,
  plantillaMayorSinEsp,
  plantillaCrueBase,
  type MotivoNeg,
  type EntidadTipo,
  type DocSubtipo,
  type RedSubtipo,
  type ComplejidadSub,
  type DocItem,
} from "@/lib/neg-crue";
import {
  buscarAcepActivo,
  buscarAcepReciente,
  buscarDatosPaciente,
  buildMensaje,
  calcHrsReserva,
  calcularVencimiento,
  fechaCasoStr,
  fmtFechaHora,
  fmtMinutos,
  
  type Caso,
} from "@/lib/rc-utils";
import type { Catalogos } from "@/lib/use-rc-data";
import type { Plantilla } from "@/lib/rc-utils";

type Tipo = "ACEP" | "NEG" | "CRUE_ACEP" | "CRUE_NR" | "CRUE_NEG" | "SIN_GESTION";

const CRUE_TIPOS: { value: Tipo; label: string }[] = [
  { value: "CRUE_ACEP", label: "ACEPTACIÓN DIRECCIONAMIENTO" },
  { value: "CRUE_NR", label: "NO REQUERIMIENTO" },
  { value: "CRUE_NEG", label: "NEGACIÓN DIRECCIONAMIENTO" },
];

// Unidades válidas cuando el CRUE direcciona (solo URGENCIAS / UCI).
const UNIDADES_CRUE = ["URGENCIAS", "UCI"];

const COMPLEJIDADES = ["MAYOR COMPLEJIDAD", "MENOR COMPLEJIDAD"];

// ── Catálogo institucional para "Paciente sin gestión de referencia" ──
// No existe un catálogo dedicado de SEDES ni de TIPO_AMBULANCIA en la tabla
// catalogos; se usa la nomenclatura institucional vigente como respaldo.
const SEDES_SG = [
  "CLÍNICA GLORIA PATRICIA PINZÓN",
  "PRINCIPAL",
  "CONSULTA ESPECIALIZADA",
  "SALA ROSA",
  "SAN VICENTE DEL CAGUÁN",
];
const SEDE_SG_DEFAULT = "CLÍNICA GLORIA PATRICIA PINZÓN";
const TIPOS_AMB_SG = ["TAB", "TAM", "TAM-N"];
const UNIDAD_SG_DEFAULT = "URGENCIAS";

const ENTIDAD_TIPOS: { value: EntidadTipo; label: string }[] = [
  { value: "EPS", label: "EPS" },
  { value: "SOAT-ADRES", label: "SOAT / ADRES" },
  { value: "ARL", label: "ARL" },
];

// Elemento de lista dinámica (especialidades / motivos) con id estable.
interface DynItem {
  id: string;
  val: string;
}
let __dynSeq = 0;
const newDyn = (val = ""): DynItem => ({ id: `d${++__dynSeq}`, val });
const dynValues = (items: DynItem[]) => items.map((i) => i.val.trim()).filter(Boolean);

interface Props {
  casos: Caso[];
  catalogos: Catalogos;
  plantillas: Plantilla[];
  onDone: () => void;
}

export function RegistrarWizard({ casos, catalogos, plantillas, onDone }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: string; codigo: string; mensaje: string } | null>(null);

  // Paso 1
  const [documento, setDocumento] = useState("");

  // Paso 2 — datos del paciente
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [eapb, setEapb] = useState("");
  const [regimen, setRegimen] = useState("");
  const [ips, setIps] = useState("");
  const [ciudad, setCiudad] = useState("");

  // Paso 3 — clasificación
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [crueOpen, setCrueOpen] = useState(false);
  const [medico, setMedico] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [aseguramiento, setAseguramiento] = useState("EPS");
  const [motivoNeg, setMotivoNeg] = useState<MotivoNeg | "">("");
  const [complejidad, setComplejidad] = useState("");
  const [detalle, setDetalle] = useState("");
  // CRUE
  const [codigoCrue, setCodigoCrue] = useState("");
  const [contactoIps, setContactoIps] = useState("");
  const [unidadReq, setUnidadReq] = useState("");
  
  // Negación — recontacto (sobreocupación)
  const [fechaRec, setFechaRec] = useState("");
  const [horaRec, setHoraRec] = useState("");

  // ── Negación: entidad responsable + submotivos dinámicos ──
  const [entidadTipo, setEntidadTipo] = useState<EntidadTipo>("EPS");
  const [docSubtipo, setDocSubtipo] = useState<DocSubtipo | "">("");
  const [docChecks, setDocChecks] = useState<Record<string, boolean>>({});
  const [redSubtipo, setRedSubtipo] = useState<RedSubtipo | "">("");
  const [complejidadSub, setComplejidadSub] = useState<ComplejidadSub | "">("");
  // Red no contratada — manejo conjunto
  const [espPrincipal, setEspPrincipal] = useState("");
  const [espsExtra, setEspsExtra] = useState<DynItem[]>([newDyn()]);
  // CRUE — funcionario + listas dinámicas
  const [nombreFuncionario, setNombreFuncionario] = useState("");
  const [cargoFuncionario, setCargoFuncionario] = useState("");
  const [espsCrue, setEspsCrue] = useState<DynItem[]>([newDyn()]);
  const [motivosCrueDyn, setMotivosCrueDyn] = useState<DynItem[]>([newDyn()]);

  // ── PACIENTE SIN GESTIÓN DE REFERENCIA (paciente ya ingresado físicamente) ──
  // Fecha y hora de ingreso: se captura automáticamente del sistema al abrir el
  // registro; es de solo lectura y se guarda completa con zona horaria.
  const [sgIngresoAt] = useState(() => new Date());
  const sgFechaIng = sgIngresoAt.toISOString().slice(0, 10);
  const sgHoraIng = `${String(sgIngresoAt.getHours()).padStart(2, "0")}:${String(sgIngresoAt.getMinutes()).padStart(2, "0")}`;
  const sgFechaHoraLabel = sgIngresoAt.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  const [sgSede, setSgSede] = useState(SEDE_SG_DEFAULT);
  const [sgDiagnostico, setSgDiagnostico] = useState("");
  const [sgEmpresa, setSgEmpresa] = useState("");
  const [sgTipoAmb, setSgTipoAmb] = useState("");
  const [sgPlaca, setSgPlaca] = useState("");
  const [sgTripulante, setSgTripulante] = useState("");
  const [sgCargoTrip, setSgCargoTrip] = useState("");
  const [sgCrueConoce, setSgCrueConoce] = useState<"" | "SI" | "NO" | "NV">("");
  const [sgCrueCodigo, setSgCrueCodigo] = useState("");
  const [sgCrueFuncionario, setSgCrueFuncionario] = useState("");
  const [sgCrueObs, setSgCrueObs] = useState("");
  const [sgPlantilla, setSgPlantilla] = useState("");



  // Paciente reconsultante (autollenado) y ventana ADRES
  const [esReconsultante, setEsReconsultante] = useState(false);
  const adresWinRef = useRef<Window | null>(null);
  const [adresAbierta, setAdresAbierta] = useState(false);

  const reincidente = useMemo(() => {
    const doc = documento.trim();
    if (!doc) return null;
    return buscarAcepReciente(casos, doc);
  }, [documento, casos]);

  // Cupo activo = existe una aceptación vigente (con tiempo restante)
  const cupoActivoCaso = useMemo(() => {
    const doc = documento.trim();
    if (!doc) return null;
    return buscarAcepActivo(casos, doc);
  }, [documento, casos]);
  const cupoActivo = !!cupoActivoCaso;

  const reincVen = reincidente ? calcularVencimiento(reincidente, casos) : null;

  // ── Paciente reconsultante: datos previos del documento ──
  const pacientePrevio = useMemo(
    () => buscarDatosPaciente(casos, documento),
    [casos, documento],
  );

  // Autollena los campos vacíos con los datos previos (no pisa ediciones del usuario).
  const irAPaso2 = () => {
    if (pacientePrevio) {
      setNombres((v) => v || pacientePrevio.nombres);
      setApellidos((v) => v || pacientePrevio.apellidos);
      setEapb((v) => v || pacientePrevio.eapb);
      setRegimen((v) => v || pacientePrevio.regimen);
      setIps((v) => v || pacientePrevio.ips);
      // Ciudad/Departamento: no se almacena en el caso, se deriva de la IPS previa.
      if (pacientePrevio.ips) {
        const e = catalogos.ipsConCiudades.find((x) => x.nombre === pacientePrevio.ips);
        if (e && e.ciudades.length >= 1) setCiudad((v) => v || e.ciudades[0]);
      }
      const hayDatos =
        pacientePrevio.nombres ||
        pacientePrevio.apellidos ||
        pacientePrevio.eapb ||
        pacientePrevio.regimen ||
        pacientePrevio.ips;
      setEsReconsultante(!!hayDatos);
    } else {
      setEsReconsultante(false);
    }
    setStep(2);
  };

  const unidadOptions = catalogos.unidades.map((u) => u.nombre);
  const isCrue = tipo === "CRUE_ACEP" || tipo === "CRUE_NR" || tipo === "CRUE_NEG";
  const isSinGestion = tipo === "SIN_GESTION";

  // Etiqueta legible del conocimiento del CRUE.
  const sgCrueLabel =
    sgCrueConoce === "SI" ? "SÍ" : sgCrueConoce === "NO" ? "NO" : sgCrueConoce === "NV" ? "NO SE PUDO VERIFICAR" : "—";

  // Placa/empresa fuera del catálogo → se marca como "dato no catalogado".
  const placaNoCatalogada = !!sgPlaca.trim() && !catalogos.placas.includes(sgPlaca.trim());
  const empresaNoCatalogada = !!sgEmpresa.trim() && !catalogos.empresasTep.includes(sgEmpresa.trim());

  // Plantilla institucional por defecto (editable antes de guardar) — sección 32.
  const sgPlantillaDefault = useMemo(() => {
    const nombreP = [nombres, apellidos].filter((x) => x.trim()).join(" ").trim() || "PACIENTE";
    const fh = sgFechaIng
      ? new Date(`${sgFechaIng}T${sgHoraIng || "00:00"}`)
      : null;
    const fechaTxt = fh && !isNaN(fh.getTime()) ? fh.toLocaleDateString("es-CO", { dateStyle: "long" }) : "___";
    const horaTxt = sgHoraIng || "___";
    const lineas: string[] = [];
    lineas.push(
      `SE REGISTRA INGRESO DEL PACIENTE ${nombreP.toUpperCase()}, IDENTIFICADO CON DOCUMENTO ${documento.trim() || "___"}` +
        `, PROCEDENTE DE ${(ips || "INSTITUCIÓN NO INDICADA").toUpperCase()}${ciudad ? ` (${ciudad.toUpperCase()})` : ""}` +
        `, SIN GESTIÓN PREVIA DE REFERENCIA, SIN ACEPTACIÓN INSTITUCIONAL PREVIA Y SIN DIRECCIONAMIENTO REGISTRADO.`,
    );
    lineas.push(
      `EL PACIENTE INGRESA EL DÍA ${fechaTxt} A LAS ${horaTxt}, AL SERVICIO DE ${(unidad || "___").toUpperCase()}` +
        `${sgSede ? `, SEDE ${sgSede.toUpperCase()}` : ""}${especialidad ? `. ESPECIALIDAD: ${especialidad.toUpperCase()}` : ""}.`,
    );
    if (sgEmpresa || sgPlaca || sgTripulante) {
      lineas.push(
        `TRASLADO REALIZADO POR ${(sgEmpresa || "___").toUpperCase()}, VEHÍCULO DE PLACA ${(sgPlaca || "___").toUpperCase()}` +
          `${sgTipoAmb ? `, TIPO ${sgTipoAmb.toUpperCase()}` : ""}, A CARGO DE ${(sgTripulante || "___").toUpperCase()}` +
          ` - ${(sgCargoTrip || "___").toUpperCase()}.`,
      );
    }
    lineas.push(`CONOCIMIENTO DEL CRUE: ${sgCrueLabel}${sgCrueConoce === "SI" && sgCrueCodigo ? ` (CÓD. ${sgCrueCodigo.toUpperCase()})` : ""}.`);
    if (detalle.trim()) lineas.push(`OBSERVACIONES: ${detalle.trim()}`);
    lineas.push("SE DEJA TRAZABILIDAD PARA REVISIÓN Y GESTIÓN DE COORDINACIÓN.");
    return lineas.join("\n\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nombres, apellidos, documento, ips, ciudad, sgFechaIng, sgHoraIng, unidad, sgSede,
    especialidad, sgEmpresa, sgPlaca, sgTipoAmb, sgTripulante, sgCargoTrip, sgCrueConoce, sgCrueCodigo, detalle,
  ]);


  // ── Enlace IPS ⇄ Ciudad/Departamento ──
  const ipsEntry = catalogos.ipsConCiudades.find((x) => x.nombre === ips);
  const sedes = ipsEntry?.ciudades ?? [];
  const ciudadKey = ciudad.trim().toLowerCase();
  // Si hay una ciudad escrita, filtra las IPS relacionadas a esa ubicación
  const ipsOptions = ciudadKey
    ? catalogos.ipsConCiudades
        .filter((x) => x.ciudades.some((c) => c.toLowerCase().includes(ciudadKey)))
        .map((x) => x.nombre)
    : catalogos.ips;
  // Si la IPS tiene varias sedes, esas son las ubicaciones sugeridas para Ciudad
  const ciudadOptions = sedes.length > 1 ? sedes : catalogos.ciudades;

  const onPickIps = (v: string) => {
    setIps(v);
    const e = catalogos.ipsConCiudades.find((x) => x.nombre === v);
    if (e && e.ciudades.length === 1) setCiudad(e.ciudades[0]);
  };

  // ── Consultar ADRES: copia el documento y abre ADRES como ventana flotante ──
  const consultarAdres = async () => {
    const doc = documento.trim();
    try {
      await navigator.clipboard.writeText(doc);
      toast.success("Documento copiado para consultar en ADRES");
    } catch {
      toast.message("Copia el documento manualmente: " + doc);
    }
    const w = 1100;
    const h = 750;
    const dualLeft = window.screenLeft ?? window.screenX ?? 0;
    const dualTop = window.screenTop ?? window.screenY ?? 0;
    const winW = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const winH = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = Math.max(0, dualLeft + (winW - w) / 2);
    const top = Math.max(0, dualTop + (winH - h) / 2);
    // No usamos noopener para conservar el handle y poder cerrar la ventana.
    const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    const win = window.open("https://www.adres.gov.co/consulte-su-eps", "adresConsulta", features);
    if (!win) {
      toast.message(
        "El navegador bloqueó la ventana emergente. Permite los popups de este sitio o abre ADRES manualmente.",
      );
      return;
    }
    adresWinRef.current = win;
    setAdresAbierta(true);
    try {
      win.focus();
    } catch {
      /* algunos navegadores abren en pestaña; no se puede forzar el foco */
    }
  };

  const cerrarAdres = () => {
    try {
      adresWinRef.current?.close();
    } catch {
      /* ventana cross-origin: close() funciona en ventanas abiertas por script */
    }
    adresWinRef.current = null;
    setAdresAbierta(false);
  };

  // ── Lógica de campos según el motivo de negación (por valor interno) ──
  const negEspecialidad = motivoNeg === "NO_RECURSO_HUMANO";
  const negUnidad = motivoNeg === "NO_DISPONIBILIDAD_UNIDAD";
  const negCamas = motivoNeg === "SOBREOCUPACION";
  const negComplejidad = motivoNeg === "NIVEL_COMPLEJIDAD";
  const negDoc = motivoNeg === "SOLICITUD_DOCUMENTACION";
  const negRed = motivoNeg === "RED_NO_CONTRATADA";
  const negArl = motivoNeg === "ARL_DIRECTO";
  // Documentos disponibles según el subtipo de solicitud de documentación.
  const docItems: DocItem[] =
    docSubtipo === "DOCUMENTACION_EPS"
      ? DOCS_EPS
      : docSubtipo === "DOCUMENTACION_SOAT_ADRES_POLIZA"
        ? DOCS_SOAT
        : [];
  const docSeleccionados = docItems.filter((d) => docChecks[d.id]).map((d) => d.texto);
  const todasMarcadas = docItems.length > 0 && docItems.every((d) => docChecks[d.id]);
  const toggleTodas = () => {
    if (todasMarcadas) {
      setDocChecks({});
    } else {
      setDocChecks(Object.fromEntries(docItems.map((d) => [d.id, true])));
    }
  };

  // ── Catálogo médico ⇄ especialidad (bidireccional) ──
  // Construye el mapa nombre→especialidad a partir del catálogo de médicos
  // y del histórico de casos (dato más frecuente).
  const medEspMap = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    const add = (nombre?: string | null, esp?: string | null) => {
      const n = (nombre || "").trim();
      const e = (esp || "").trim();
      if (!n || !e) return;
      const key = n.toLowerCase();
      counts[key] = counts[key] || {};
      counts[key][e] = (counts[key][e] || 0) + 1;
    };
    catalogos.medicos.forEach((m) => add(m.nombre, m.especialidad));
    casos.forEach((c) => add(c.medico, c.especialidad));
    const best: Record<string, string> = {};
    for (const key of Object.keys(counts)) {
      best[key] = Object.entries(counts[key]).sort((a, b) => b[1] - a[1])[0][0];
    }
    return best;
  }, [catalogos.medicos, casos]);

  // Lista completa de médicos (catálogo + histórico).
  const medicosAll = useMemo(() => {
    const set = new Set<string>();
    catalogos.medicos.forEach((m) => m.nombre.trim() && set.add(m.nombre.trim()));
    casos.forEach((c) => c.medico?.trim() && set.add(c.medico.trim()));
    return Array.from(set).sort();
  }, [catalogos.medicos, casos]);

  // ── Enlace Médico ⇄ Especialidad ──
  const espNorm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const espKey = espNorm(especialidad);
  // Si hay especialidad escrita, sugiere solo médicos de esa especialidad.
  const medicoOptions = espKey
    ? medicosAll.filter((nombre) => {
        const e = medEspMap[nombre.toLowerCase()];
        return e ? espNorm(e).includes(espKey) : false;
      })
    : medicosAll;

  const onPickMedico = (v: string) => {
    setMedico(v);
    const esp = medEspMap[v.trim().toLowerCase()];
    if (esp) setEspecialidad(esp);
  };


  // Tiempo reservado de la unidad seleccionada
  const hrsUnidad = unidad ? calcHrsReserva(unidad, "ACEP", catalogos.unidades) : 0;

  const reset = () => {
    setStep(1);
    setDocumento("");
    setNombres("");
    setApellidos("");
    setEapb("");
    setRegimen("");
    setIps("");
    setCiudad("");
    setTipo("");
    setCrueOpen(false);
    setMedico("");
    setEspecialidad("");
    setUnidad("");
    setAseguramiento("EPS");
    setMotivoNeg("");
    setComplejidad("");
    setDetalle("");
    setCodigoCrue("");
    setContactoIps("");
    setUnidadReq("");
    
    setFechaRec("");
    setHoraRec("");
    setEsReconsultante(false);
    setEntidadTipo("EPS");
    setDocSubtipo("");
    setDocChecks({});
    setRedSubtipo("");
    setComplejidadSub("");
    setEspPrincipal("");
    setEspsExtra([newDyn()]);
    setNombreFuncionario("");
    setCargoFuncionario("");
    setEspsCrue([newDyn()]);
    setMotivosCrueDyn([newDyn()]);
    setSgSede(SEDE_SG_DEFAULT);
    setSgDiagnostico("");
    setSgEmpresa("");
    setSgTipoAmb("");
    setSgPlaca("");
    setSgTripulante("");
    setSgCargoTrip("");
    setSgCrueConoce("");
    setSgCrueCodigo("");
    setSgCrueFuncionario("");
    setSgCrueObs("");
    setSgPlantilla("");
    cerrarAdres();
    setResultado(null);
  };

  const guardar = async () => {
    if (!tipo) return toast.error("Selecciona el tipo de caso");
    if (tipo === "NEG") {
      if (!motivoNeg) return toast.error("Selecciona el motivo de negación");
      if (negDoc && !docSubtipo) return toast.error("Selecciona el tipo de documentación");
      if (negDoc && (docSubtipo === "DOCUMENTACION_EPS" || docSubtipo === "DOCUMENTACION_SOAT_ADRES_POLIZA") && docSeleccionados.length === 0)
        return toast.error("SELECCIONE AL MENOS UN DOCUMENTO REQUERIDO.");
      if (negRed && !redSubtipo) return toast.error("Selecciona el subtipo de red no contratada");
      if (negRed && redSubtipo === "CONJUNTO" && !espPrincipal.trim())
        return toast.error("Indica la especialidad principal disponible");
      if (negRed && redSubtipo === "CONJUNTO" && dynValues(espsExtra).length === 0)
        return toast.error("Indica al menos una especialidad fuera de la red");
      if (negEspecialidad && !especialidad.trim()) return toast.error("Indica la especialidad requerida");
      if (negUnidad && !unidad.trim()) return toast.error("Indica la unidad requerida");
      if (negComplejidad && !complejidad) return toast.error("Selecciona la complejidad");
      if (negComplejidad && complejidad === "MAYOR COMPLEJIDAD" && !complejidadSub)
        return toast.error("Indica si hay especialidad faltante");
      if (negComplejidad && complejidad === "MAYOR COMPLEJIDAD" && complejidadSub === "CON_ESP" && !especialidad.trim())
        return toast.error("Indica la especialidad requerida");
    }
    if (isCrue) {
      if (!nombreFuncionario.trim()) return toast.error("Indica el nombre del funcionario");
      if (!cargoFuncionario.trim()) return toast.error("Indica el cargo del funcionario");
    }
    if (tipo === "CRUE_ACEP" && !unidadReq) return toast.error("Selecciona la unidad requerida (URGENCIAS o UCI)");
    if (isSinGestion) {
      if (!documento.trim()) return toast.error("Indica el documento del paciente");
      if (!sgFechaIng || !sgHoraIng) return toast.error("No se pudo capturar la fecha y hora de ingreso");
      if (!sgSede.trim()) return toast.error("Selecciona la sede de ingreso");
      if (!unidad.trim()) return toast.error("Indica la unidad o servicio de ingreso");
      if (!especialidad.trim()) return toast.error("Indica la especialidad");
      if (!sgDiagnostico.trim()) return toast.error("Indica el diagnóstico / CIE-10");
      if (!sgEmpresa.trim()) return toast.error("Indica la empresa de ambulancia");
      if (!sgTipoAmb.trim()) return toast.error("Selecciona el tipo de ambulancia");
      if (!sgPlaca.trim()) return toast.error("Indica la placa del vehículo");
      if (!sgTripulante.trim()) return toast.error("Indica el funcionario del TEP");
      if (!sgCargoTrip.trim()) return toast.error("Indica el cargo");
      if (!sgCrueConoce) return toast.error("Indica si el CRUE tenía conocimiento de la llegada");
    }

    setBusy(true);
    try {
      const ahora = new Date();
      const { codigo } = await siguienteCodigo({
        data: { tipo, yyyy: ahora.getFullYear(), mm: ahora.getMonth() + 1 },
      });
      const fecha = fmtFechaHora(ahora);

      const esActivo = tipo === "ACEP" || tipo === "CRUE_ACEP";
      const unidadEff = isCrue ? unidadReq : unidad;
      let fechaVenceISO: string | null = null;
      let fechaVenceStr = "";
      let hrs = 0;
      if (esActivo) {
        hrs = calcHrsReserva(unidadEff, tipo, catalogos.unidades);
        const venceD = new Date(ahora.getTime() + hrs * 3600000);
        fechaVenceISO = venceD.toISOString();
        fechaVenceStr = fmtFechaHora(venceD);
      }

      const obs = detalle.trim();
      const espsExtraVals = dynValues(espsExtra);
      const espsCrueVals = dynValues(espsCrue);
      const motivosCrueVals = dynValues(motivosCrueDyn);
      const rr = { codigo, fecha, fechaVence: fechaVenceStr, hrsReserva: String(hrs || "") };

      let mensaje = "";
      let metadata: Record<string, unknown> | null = null;
      let especialidadCol = especialidad;

      if (tipo === "NEG") {
        metadata = {
          tipo_caso: "NEG",
          entidad_tipo: entidadTipo,
          motivo_negacion: motivoNeg,
          observaciones: obs || null,
        };
        if (negDoc) {
          metadata.tipo_documentacion = docSubtipo;
          if (docSubtipo === "DOCUMENTACION_EPS") {
            metadata.documentos_solicitados = docSeleccionados;
            mensaje = plantillaDocEps(docSeleccionados, obs);
          } else if (docSubtipo === "DOCUMENTACION_SOAT_ADRES_POLIZA") {
            metadata.documentos_solicitados = docSeleccionados;
            mensaje = plantillaDocSoat(docSeleccionados, obs);
          } else {
            // AFILIACIÓN DE OFICIO → reutiliza la plantilla existente del catálogo.
            metadata.subtipo_negacion = "AFILIACION_OFICIO";
            mensaje = buildMensaje(plantillas, catalogos.medicos, rr, {
              tipo: "NEG",
              documento,
              ips,
              motivoNeg: "POR SOLICITUD DE AFILIACIÓN DE OFICIO",
              detalle: obs,
              eapb,
              regimen,
            });
          }
        } else if (negArl) {
          mensaje = plantillaArlDirecto(codigo, obs);
        } else if (negRed) {
          metadata.subtipo_negacion = redSubtipo;
          if (redSubtipo === "CONJUNTO") {
            metadata.especialidades = espsExtraVals;
            metadata.especialidad_principal = espPrincipal.trim() || null;
            especialidadCol = espsExtraVals.join(", ");
            mensaje = plantillaRedConjunto({
              codigo,
              ips,
              profesional: medico,
              espProfesional: especialidad,
              espPrincipal,
              especialidadesExtra: espsExtraVals,
              obs,
            });
          } else {
            // RED NO CONTRATADA — servicio/especialidad → plantilla existente.
            metadata.especialidades = especialidad.trim() ? [especialidad.trim()] : [];
            mensaje = buildMensaje(plantillas, catalogos.medicos, rr, {
              tipo: "NEG",
              documento,
              ips,
              especialidad,
              motivoNeg: "RED NO CONTRATADA",
              detalle: obs,
              eapb,
              regimen,
            });
          }
        } else if (negComplejidad) {
          if (complejidad === "MAYOR COMPLEJIDAD" && complejidadSub === "CON_ESP") {
            metadata.subtipo_negacion = "MAYOR_CON_ESPECIALIDAD";
            metadata.especialidades = especialidad.trim() ? [especialidad.trim()] : [];
            mensaje = plantillaMayorConEsp(codigo, especialidad, obs);
          } else if (complejidad === "MAYOR COMPLEJIDAD" && complejidadSub === "SIN_ESP") {
            metadata.subtipo_negacion = "MAYOR_SIN_ESPECIALIDAD";
            mensaje = plantillaMayorSinEsp(codigo, obs);
          } else {
            metadata.subtipo_negacion = "MENOR_COMPLEJIDAD";
            mensaje = buildMensaje(plantillas, catalogos.medicos, rr, {
              tipo: "NEG",
              documento,
              ips,
              motivoNeg: "POR NIVEL DE COMPLEJIDAD - MENOR COMPLEJIDAD",
              detalle: obs,
              eapb,
              regimen,
            });
          }
        } else {
          // NO RECURSO HUMANO / NO DISPONIBILIDAD DE UNIDAD / SOBREOCUPACIÓN → catálogo.
          const catName = MOTIVO_NEG_CATALOGO[motivoNeg as MotivoNeg] || "";
          metadata.especialidades = especialidad.trim() ? [especialidad.trim()] : [];
          mensaje = buildMensaje(plantillas, catalogos.medicos, rr, {
            tipo: "NEG",
            documento,
            ips,
            especialidad,
            unidad,
            motivoNeg: catName,
            detalle: obs,
            eapb,
            regimen,
            fechaRecontacto: negCamas ? fechaRec : undefined,
            horaRecontacto: negCamas ? horaRec : undefined,
          });
        }
      } else if (isCrue) {
        const subtipoLabel = CRUE_TIPOS.find((t) => t.value === tipo)?.label || "CASO CRUE";
        const cierre =
          tipo === "CRUE_ACEP"
            ? "Se acepta el direccionamiento y se dispone de la unidad requerida para la continuidad del manejo del paciente."
            : tipo === "CRUE_NR"
              ? "Se informa que en el momento el caso no requiere direccionamiento."
              : "Se informa que no es posible aceptar el direccionamiento por los motivos indicados. Sugerimos canalizar la remisión a través de la EAPB y su red prestadora.";
        especialidadCol = espsCrueVals.join(", ");
        mensaje = plantillaCrueBase({
          subtipoLabel,
          codigo,
          codigoCrue,
          ips: contactoIps,
          nombreFuncionario,
          cargoFuncionario,
          unidad: unidadEff,
          especialidades: espsCrueVals,
          motivos: tipo === "CRUE_NEG" ? motivosCrueVals : [],
          obs,
          cierre,
        });
        metadata = {
          crue_subtipo: tipo,
          codigo_crue: codigoCrue.trim() || null,
          ips_nombre: contactoIps.trim() || null,
          nombre_funcionario: nombreFuncionario.trim(),
          cargo_funcionario: cargoFuncionario.trim(),
          unidad_requerida: tipo === "CRUE_ACEP" ? unidadReq || null : null,
          unidad_solicitada: tipo === "CRUE_NEG" ? unidadReq || null : null,
          especialidades_requeridas: espsCrueVals,
          motivos_negacion_direccionamiento: tipo === "CRUE_NEG" ? motivosCrueVals : [],
          observaciones: obs || null,
        };
      } else if (isSinGestion) {
        // Paciente ya ingresado físicamente sin gestión previa de referencia.
        // La plantilla es editable; si el usuario no la tocó, se usa la de por defecto.
        mensaje = (sgPlantilla.trim() || sgPlantillaDefault).trim();
        especialidadCol = especialidad;
        metadata = {
          tipo_caso: "SIN_GESTION",
          sin_gestion_previa: true,
          // Procedencia reutilizada de los datos generales (paso 2). No se
          // vuelve a solicitar en este paso.
          procedencia: {
            ips: ips || null,
            ciudad: ciudad || null,
          },
          ingreso: {
            fecha: sgFechaIng || null,
            hora: sgHoraIng || null,
            // Momento real del registro, completo y con zona horaria (auditoría).
            capturado_en: sgIngresoAt.toISOString(),
            sede: sgSede.trim() || null,
            unidad: unidad || null,
            especialidad: especialidad || null,
            diagnostico: sgDiagnostico.trim() || null,
          },
          traslado: {
            empresa: sgEmpresa.trim() || null,
            tipo_ambulancia: sgTipoAmb.trim() || null,
            placa: sgPlaca.trim() || null,
            tripulante: sgTripulante.trim().toUpperCase() || null,
            cargo: sgCargoTrip.trim().toUpperCase() || null,
            placa_no_catalogada: placaNoCatalogada,
            empresa_no_catalogada: empresaNoCatalogada,
          },
          crue: {
            conocimiento: sgCrueConoce, // SI | NO | NV
            codigo_crue: sgCrueConoce === "SI" ? sgCrueCodigo.trim() || null : null,
            funcionario: sgCrueConoce === "SI" ? sgCrueFuncionario.trim() || null : null,
            observacion: sgCrueConoce === "SI" ? sgCrueObs.trim() || null : null,
          },
          observaciones: obs || null,
        };
      } else {
        // ACEPTACIÓN → plantilla del catálogo (comportamiento actual).
        mensaje = buildMensaje(plantillas, catalogos.medicos, rr, {
          tipo,
          documento,
          ips,
          medico,
          especialidad,
          unidad: unidadEff,
          aseguramiento,
          detalle: obs,
          eapb,
          regimen,
        });
      }

      const { error } = await supabase.from("casos_entrantes").insert({
        codigo,
        tipo,
        documento: documento.trim(),
        nombres: nombres.trim() || null,
        apellidos: apellidos.trim() || null,
        eapb: eapb || null,
        regimen: regimen || null,
        ips: (isCrue ? contactoIps : ips) || null,
        medico: medico || null,
        especialidad: especialidadCol || null,
        unidad: unidadEff || null,
        aseguramiento: tipo === "ACEP" ? aseguramiento : tipo === "NEG" ? entidadTipo : null,
        detalle: obs || null,
        estado: isSinGestion
          ? "INGRESADO SIN GESTIÓN PREVIA DE REFERENCIA"
          : esActivo
            ? "ACTIVO"
            : "REGISTRADO",
        fecha: ahora.toISOString().slice(0, 10),
        fecha_vence: fechaVenceISO,
        hrs_reserva: hrs ? String(hrs) : null,
        texto_ia: mensaje || null,
        metadata: metadata as never,
        created_by: user?.id,
      });
      if (error) throw error;

      // Auditoría de la acción crítica (creación de caso entrante).
      try {
        await registrarAuditoria({
          data: {
            accion: "crear_caso_entrante",
            modulo: "entrantes",
            tabla: "casos_entrantes",
            registroId: codigo,
            detalles: { tipo },
          },
        });
      } catch {
        /* no bloquea el flujo si falla la auditoría */
      }

      // Alerta de coordinación (idempotente) para "Paciente sin gestión previa".
      if (isSinGestion) {
        try {
          await crearAlertaCoordinacion({
            data: {
              codigo: "ALT-ENT-SIN-GESTION-PREVIA",
              modulo: "REMISIONES",
              prioridad: "ALTO",
              mensaje: `Paciente ${[nombres, apellidos].filter(Boolean).join(" ") || "sin nombre"} (doc. ${documento.trim()}) ingresó sin gestión previa de referencia. Cupo/caso ${codigo}.`,
              casoCodigo: codigo,
              casoDocumento: documento.trim(),
              idempotencyKey: `ALT-ENT-SIN-GESTION-PREVIA:${codigo}`,
            },
          });
        } catch {
          /* la alerta no debe bloquear el registro del caso */
        }
      }

      toast.success(`Registrado ${codigo}`);
      setResultado({ tipo, codigo, mensaje });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el caso");
    } finally {
      setBusy(false);
    }
  };

  if (resultado) {
    return <ResultadoCard tipo={resultado.tipo} codigo={resultado.codigo} mensaje={resultado.mensaje} onNuevo={reset} />;
  }

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      {/* ───── PASO 1 ───── */}
      {step === 1 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc">Documento del paciente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="doc"
                className="pl-9"
                inputMode="numeric"
                placeholder="Número de documento…"
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && documento.trim().length >= 4 && !cupoActivo) {
                    e.preventDefault();
                    irAPaso2();
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          {reincidente && (
            <div
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                cupoActivo
                  ? "border-status-red/50 bg-status-red/10"
                  : "border-status-amber/50 bg-status-amber/10"
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 shrink-0 ${cupoActivo ? "text-status-red" : "text-status-amber"}`}
              />
              <div className="text-xs text-foreground">
                <p className={`font-bold ${cupoActivo ? "text-status-red" : "text-status-amber"}`}>
                  {cupoActivo ? "Paciente reincidente — cupo activo" : "Paciente reincidente"}
                </p>
                <p className="mt-0.5">
                  {reincidente.codigo} · {reincidente.unidad || "—"}
                  {cupoActivo && reincVen?.minRest != null ? ` · ${fmtMinutos(reincVen.minRest)}` : ""}
                </p>
                <p className="text-muted-foreground">Registrado el {fechaCasoStr(reincidente)}</p>
                {cupoActivo && (
                  <p className="mt-1 font-semibold text-status-red">
                    No se puede continuar: el cupo sigue vigente.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              className="rounded-full"
              disabled={documento.trim().length < 4 || cupoActivo}
              onClick={irAPaso2}
            >
              Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* ───── PASO 2 ───── */}
      {step === 2 && (
        <section className="space-y-4">
          {esReconsultante ? (
            <div className="flex items-start gap-3 rounded-xl border border-status-green/50 bg-status-green/10 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-green" />
              <div className="flex-1 text-xs text-foreground">
                <p className="font-bold text-status-green">Paciente reconsultante</p>
                <p className="mt-0.5">Datos cargados desde un registro previo. Puede editarlos si necesita corregirlos.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-full"
                  onClick={consultarAdres}
                >
                  <Search className="h-3.5 w-3.5" /> Consultar ADRES
                  <ExternalLink className="h-3 w-3" />
                </Button>
                {adresAbierta && (
                  <Button type="button" size="sm" variant="ghost" className="rounded-full text-xs" onClick={cerrarAdres}>
                    Cerrar ventana ADRES
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-status-amber/50 bg-status-amber/10 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-amber" />
              <div className="flex-1 text-xs text-foreground">
                <p className="font-bold text-status-amber">Paciente nuevo</p>
                <p className="mt-0.5">
                  Consulte ADRES y transcriba los 4 datos. Ingrese la IPS remitente.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-full"
                  onClick={consultarAdres}
                >
                  <Search className="h-3.5 w-3.5" /> Consultar ADRES
                  <ExternalLink className="h-3 w-3" />
                </Button>
                {adresAbierta && (
                  <Button type="button" size="sm" variant="ghost" className="rounded-full text-xs" onClick={cerrarAdres}>
                    Cerrar ventana ADRES
                  </Button>
                )}
              </div>
            </div>
          )}


          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nom">Nombres</Label>
              <Input id="nom" value={nombres} onChange={(e) => setNombres(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ape">Apellidos</Label>
              <Input id="ape" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
            <AutoComplete label="EAPB / Asegurador" value={eapb} onChange={setEapb} options={catalogos.eapb} />
            <div className="space-y-2">
              <Label>Régimen</Label>
              <Select value={regimen} onValueChange={setRegimen}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.regimenes.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <AutoComplete
                label="IPS que remite"
                value={ips}
                onChange={setIps}
                onPick={onPickIps}
                options={ipsOptions}
                openAllOnFocus={false}
                minChars={2}
                placeholder="Escribe para buscar la IPS…"
              />
              {ciudad.trim() && ipsOptions.length > 0 && !ips && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {ipsOptions.length} IPS relacionada{ipsOptions.length === 1 ? "" : "s"} a esta ubicación
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <AutoComplete
                label="Ciudad / Departamento"
                value={ciudad}
                onChange={setCiudad}
                options={ciudadOptions}
                openAllOnFocus={sedes.length > 1}
                placeholder="Ej: FLORENCIA - CAQUETA"
              />
              {sedes.length > 1 && !sedes.some((s) => s.toLowerCase() === ciudad.trim().toLowerCase()) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {sedes.length} ubicaciones relacionadas a esta IPS — selecciónala arriba
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
            </Button>
            <Button type="button" className="rounded-full" onClick={() => setStep(3)}>
              Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* ───── PASO 3 ───── */}
      {step === 3 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de caso</Label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TipoCard
                label="Aceptación"
                icon={<CheckCircle2 className="h-5 w-5" />}
                accent="green"
                active={tipo === "ACEP"}
                onClick={() => {
                  setTipo("ACEP");
                  setCrueOpen(false);
                  setMotivoNeg("");
                  setComplejidad("");
                  setComplejidadSub("");
                  setDocSubtipo("");
                  setDocChecks({});
                  setRedSubtipo("");
                  setCodigoCrue("");
                  setContactoIps("");
                  setUnidadReq("");
                  setNombreFuncionario("");
                  setCargoFuncionario("");
                  setEspsCrue([newDyn()]);
                  setMotivosCrueDyn([newDyn()]);
                  setFechaRec("");
                  setHoraRec("");
                }}
              />
              <TipoCard
                label="Negación"
                icon={<XCircle className="h-5 w-5" />}
                accent="red"
                active={tipo === "NEG"}
                onClick={() => {
                  setTipo("NEG");
                  setCrueOpen(false);
                  setMedico("");
                  setEspecialidad("");
                  setUnidad("");
                  setMotivoNeg("");
                  setComplejidad("");
                  setComplejidadSub("");
                  setDocSubtipo("");
                  setDocChecks({});
                  setRedSubtipo("");
                  setEspPrincipal("");
                  setEspsExtra([newDyn()]);
                  setCodigoCrue("");
                  setContactoIps("");
                  setUnidadReq("");
                  setNombreFuncionario("");
                  setCargoFuncionario("");
                }}
              />
              <TipoCard
                label="Caso CRUE"
                icon={<Siren className="h-5 w-5" />}
                accent="amber"
                active={isCrue || crueOpen}
                onClick={() => {
                  setCrueOpen(true);
                  setTipo("");
                  setMedico("");
                  setUnidad("");
                  setEspecialidad("");
                  setMotivoNeg("");
                  setComplejidad("");
                  setComplejidadSub("");
                  setDocSubtipo("");
                  setDocChecks({});
                  setRedSubtipo("");
                  setFechaRec("");
                  setHoraRec("");
                }}
              />
              <TipoCard
                label="Paciente sin gestión de referencia"
                icon={<AlertTriangle className="h-5 w-5" />}
                accent="blue"
                active={isSinGestion}
                onClick={() => {
                  setTipo("SIN_GESTION");
                  setCrueOpen(false);
                  setMedico("");
                  setMotivoNeg("");
                  setComplejidad("");
                  setComplejidadSub("");
                  setDocSubtipo("");
                  setDocChecks({});
                  setRedSubtipo("");
                  setCodigoCrue("");
                  setContactoIps("");
                  setUnidadReq("");
                  setNombreFuncionario("");
                  setCargoFuncionario("");
                  setEspsCrue([newDyn()]);
                  setMotivosCrueDyn([newDyn()]);
                  setFechaRec("");
                  setHoraRec("");
                }}
              />
            </div>
            {crueOpen && (
              <div className="grid gap-2 pt-1 sm:grid-cols-3">
                {CRUE_TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setTipo(t.value);
                      setUnidadReq("");
                      setEspsCrue([newDyn()]);
                      setMotivosCrueDyn([newDyn()]);
                    }}
                    className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-bold uppercase transition ${
                      tipo === t.value
                        ? "border-status-amber bg-status-amber/10 text-status-amber"
                        : "border-border text-foreground hover:border-status-amber/40"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tipo === "ACEP" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <AutoComplete label="Médico que acepta" value={medico} onChange={setMedico} onPick={onPickMedico} options={medicoOptions} />
              <AutoComplete label="Especialidad" value={especialidad} onChange={setEspecialidad} options={catalogos.especialidades} />
              <div className="space-y-2">
                <Label>Servicio / Unidad</Label>
                <Select value={unidad} onValueChange={setUnidad}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unidad && (
                  <span className="inline-block rounded-full bg-status-blue/10 px-2.5 py-0.5 text-[11px] font-semibold text-status-blue">
                    Tiempo reservado: {hrsUnidad} horas
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Aseguramiento</Label>
                <Select value={aseguramiento} onValueChange={setAseguramiento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["EPS", "SOAT-ADRES", "ARL-POLIZA"].map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {tipo === "NEG" && (
            <div className="rounded-2xl border border-status-red/30 bg-status-red/5 p-3 space-y-3">
              {/* Entidad responsable (clasificación explícita, controla ARL) */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Entidad responsable</Label>
                <div className="flex flex-wrap gap-2">
                  {ENTIDAD_TIPOS.map((e) => (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => {
                        setEntidadTipo(e.value);
                        if (e.value !== "ARL" && motivoNeg === "ARL_DIRECTO") setMotivoNeg("");
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        entidadTipo === e.value
                          ? "border-status-red bg-status-red/15 text-status-red"
                          : "border-border text-foreground hover:border-status-red/40"
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <Label className="text-xs font-bold uppercase tracking-wide text-status-red">
                Motivo de negación
              </Label>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_NEG.filter((m) => !m.soloEntidad || m.soloEntidad === entidadTipo).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setMotivoNeg(m.value);
                      setComplejidad("");
                      setComplejidadSub("");
                      setEspecialidad("");
                      setUnidad("");
                      setDocSubtipo("");
                      setDocChecks({});
                      setRedSubtipo("");
                      setEspPrincipal("");
                      setEspsExtra([newDyn()]);
                      setMedico("");
                      if (m.value === "SOBREOCUPACION") {
                        const now = new Date();
                        const p = (n: number) => String(n).padStart(2, "0");
                        setFechaRec(`${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`);
                        setHoraRec(`${p(now.getHours())}:${p(now.getMinutes())}`);
                      } else {
                        setFechaRec("");
                        setHoraRec("");
                      }
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      motivoNeg === m.value
                        ? "border-status-red bg-status-red/15 text-status-red"
                        : "border-border text-foreground hover:border-status-red/40"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* SOLICITUD DE DOCUMENTACIÓN */}
              {negDoc && (
                <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {DOC_SUBTIPOS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => {
                          setDocSubtipo(d.value);
                          setDocChecks({});
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          docSubtipo === d.value
                            ? "border-status-red bg-status-red/15 text-status-red"
                            : "border-border text-foreground hover:border-status-red/40"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {(docSubtipo === "DOCUMENTACION_EPS" || docSubtipo === "DOCUMENTACION_SOAT_ADRES_POLIZA") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                          Documentos requeridos
                        </Label>
                        <Button type="button" size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={toggleTodas}>
                          {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
                        </Button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {docItems.map((d) => (
                          <label
                            key={d.id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card p-2 text-xs"
                          >
                            <Checkbox
                              checked={!!docChecks[d.id]}
                              onCheckedChange={(v) =>
                                setDocChecks((prev) => ({ ...prev, [d.id]: v === true }))
                              }
                              className="mt-0.5 shrink-0"
                            />
                            <span className="min-w-0 break-words">{d.texto}</span>
                          </label>
                        ))}
                      </div>
                      {docSeleccionados.length === 0 && (
                        <p className="text-[11px] font-semibold text-status-red">
                          SELECCIONE AL MENOS UN DOCUMENTO REQUERIDO.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* RED NO CONTRATADA → dos subtipos */}
              {negRed && (
                <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                  <div className="grid gap-2">
                    {RED_SUBTIPOS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRedSubtipo(r.value)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                          redSubtipo === r.value
                            ? "border-status-red bg-status-red/15 text-status-red"
                            : "border-border text-foreground hover:border-status-red/40"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {redSubtipo === "SERVICIO" && (
                    <AutoComplete
                      label="Servicio o especialidad solicitada"
                      value={especialidad}
                      onChange={setEspecialidad}
                      options={catalogos.especialidades}
                      placeholder="Escribe la especialidad…"
                    />
                  )}

                  {redSubtipo === "CONJUNTO" && (
                    <div className="space-y-3">
                      <AutoComplete
                        label="Médico o profesional que revisa"
                        value={medico}
                        onChange={setMedico}
                        onPick={onPickMedico}
                        options={medicoOptions}
                      />
                      <AutoComplete
                        label="Especialidad del profesional que revisa"
                        value={especialidad}
                        onChange={setEspecialidad}
                        options={catalogos.especialidades}
                      />
                      <AutoComplete
                        label="Especialidad principal disponible o contratada"
                        value={espPrincipal}
                        onChange={setEspPrincipal}
                        options={catalogos.especialidades}
                        required
                      />
                      <DynEspecialidades
                        label="Especialidades adicionales requeridas fuera de la red"
                        items={espsExtra}
                        setItems={setEspsExtra}
                        options={catalogos.especialidades}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* NO RECURSO HUMANO → especialidad requerida */}
              {negEspecialidad && (
                <AutoComplete
                  label="Especialidad requerida"
                  value={especialidad}
                  onChange={setEspecialidad}
                  options={catalogos.especialidades}
                  required
                  placeholder="Escribe la especialidad…"
                />
              )}

              {/* NO DISPONIBILIDAD DE UNIDAD → unidad requerida */}
              {negUnidad && (
                <AutoComplete
                  label="Unidad requerida"
                  value={unidad}
                  onChange={setUnidad}
                  options={
                    catalogos.unidadesRequeridas.length
                      ? catalogos.unidadesRequeridas
                      : catalogos.unidades.map((u) => u.nombre)
                  }
                  required
                  placeholder="Ej: UCI Pediátrica, Hemodinamia…"
                />
              )}

              {/* SOBREOCUPACIÓN → fecha y hora de recontacto */}
              {negCamas && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="frec" className="text-[11px] text-muted-foreground">
                      Fecha de recontacto sugerida
                    </Label>
                    <Input id="frec" type="date" value={fechaRec} onChange={(e) => setFechaRec(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hrec" className="text-[11px] text-muted-foreground">
                      Hora de recontacto
                    </Label>
                    <Input id="hrec" type="time" value={horaRec} onChange={(e) => setHoraRec(e.target.value)} />
                  </div>
                </div>
              )}

              {/* POR NIVEL DE COMPLEJIDAD → mayor / menor */}
              {negComplejidad && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    ¿El caso requiere mayor o menor nivel de complejidad?
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {COMPLEJIDADES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setComplejidad(c);
                          setComplejidadSub("");
                          setEspecialidad("");
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                          complejidad === c
                            ? "border-status-red bg-status-red/10 font-semibold text-status-red"
                            : "border-border text-muted-foreground hover:border-status-red/40"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {complejidad === "MAYOR COMPLEJIDAD" && (
                    <div className="space-y-2 pt-1">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { v: "CON_ESP" as ComplejidadSub, l: "CON ESPECIALIDAD FALTANTE" },
                          { v: "SIN_ESP" as ComplejidadSub, l: "SIN ESPECIALIDAD FALTANTE" },
                        ].map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() => {
                              setComplejidadSub(o.v);
                              if (o.v !== "CON_ESP") setEspecialidad("");
                            }}
                            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                              complejidadSub === o.v
                                ? "border-status-red bg-status-red/10 font-semibold text-status-red"
                                : "border-border text-muted-foreground hover:border-status-red/40"
                            }`}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                      {complejidadSub === "CON_ESP" && (
                        <AutoComplete
                          label="Especialidad requerida"
                          value={especialidad}
                          onChange={setEspecialidad}
                          options={catalogos.especialidades}
                          required
                          placeholder="Escribe la especialidad…"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}



          {isCrue && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Fila 1 — Código CRUE · IPS */}
              <div className="space-y-2">
                <Label htmlFor="codcrue">Código CRUE</Label>
                <Input id="codcrue" value={codigoCrue} onChange={(e) => setCodigoCrue(e.target.value)} />
              </div>
              <AutoComplete label="IPS" value={contactoIps} onChange={setContactoIps} options={catalogos.ips} minChars={2} />

              {/* Fila 2 — Nombre funcionario · Cargo funcionario */}
              <AutoComplete
                label="Nombre funcionario"
                value={nombreFuncionario}
                onChange={setNombreFuncionario}
                onPick={(v) => {
                  setNombreFuncionario(v);
                  const p = catalogos.profesionales.find((x) => x.nombre === v);
                  if (p && p.cargo) setCargoFuncionario(p.cargo);
                }}
                options={catalogos.profesionales.map((p) => p.nombre)}
                required
              />
              <div className="space-y-2">
                <Label htmlFor="cargofun">Cargo funcionario</Label>
                <Input id="cargofun" value={cargoFuncionario} onChange={(e) => setCargoFuncionario(e.target.value)} />
              </div>

              {/* ACEPTACIÓN DIRECCIONAMIENTO → unidad requerida (URGENCIAS/UCI) */}
              {tipo === "CRUE_ACEP" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Unidad requerida</Label>
                  <Select value={unidadReq} onValueChange={setUnidadReq}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES_CRUE.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* NEGACIÓN DIRECCIONAMIENTO → unidad solicitada (opcional) */}
              {tipo === "CRUE_NEG" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Unidad solicitada (opcional)</Label>
                  <Select value={unidadReq} onValueChange={setUnidadReq}>
                    <SelectTrigger>
                      <SelectValue placeholder="No aplica / Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES_CRUE.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Especialidad(es) requerida(s): aceptación y negación de direccionamiento */}
              {tipo !== "CRUE_NR" && (
                <div className="sm:col-span-2">
                  <DynEspecialidades
                    label="Especialidad requerida"
                    items={espsCrue}
                    setItems={setEspsCrue}
                    options={catalogos.especialidades}
                  />
                </div>
              )}

              {/* Motivos de negación del direccionamiento (dinámicos) */}
              {tipo === "CRUE_NEG" && (
                <div className="sm:col-span-2">
                  <DynMotivos
                    label="Motivo de negación del direccionamiento"
                    items={motivosCrueDyn}
                    setItems={setMotivosCrueDyn}
                  />
                </div>
              )}
            </div>
          )}

          {isSinGestion && (
            <div className="space-y-4 rounded-2xl border border-status-blue/30 bg-status-blue/5 p-3">
              <p className="text-center text-[12px] font-bold uppercase tracking-wide text-status-blue">
                Paciente sin gestión previa de referencia
              </p>

              {/* A. INGRESO */}
              <div>
                <Label className="text-[11px] font-bold uppercase text-status-blue">A. Ingreso</Label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="sgfh">Fecha y hora de ingreso</Label>
                    <Input id="sgfh" value={sgFechaHoraLabel} readOnly tabIndex={-1} className="cursor-default bg-muted/40" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sede</Label>
                    <Select value={sgSede} onValueChange={setSgSede}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        {SEDES_SG.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidad / servicio de ingreso</Label>
                    <Select value={unidad} onValueChange={setUnidad}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        {unidadOptions.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <AutoComplete label="Especialidad" value={especialidad} onChange={setEspecialidad} options={catalogos.especialidades} minChars={2} required />
                  <div className="sm:col-span-2">
                    <Cie10Field
                      name="sgcie10"
                      label="Diagnóstico / CIE-10"
                      required
                      defaultValue={sgDiagnostico}
                      onValueChange={setSgDiagnostico}
                    />
                  </div>
                </div>
              </div>

              {/* B. TRASLADO */}
              <div>
                <Label className="text-[11px] font-bold uppercase text-status-blue">B. Traslado</Label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <AutoComplete label="Empresa de ambulancia" value={sgEmpresa} onChange={setSgEmpresa} options={catalogos.empresasTep} minChars={2} required />
                    {empresaNoCatalogada && (
                      <span className="text-[10px] font-semibold text-status-amber">Empresa no catalogada (pendiente de revisión administrativa)</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de ambulancia</Label>
                    <Select value={sgTipoAmb} onValueChange={setSgTipoAmb}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_AMB_SG.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <AutoComplete label="Placa" value={sgPlaca} onChange={setSgPlaca} options={catalogos.placas} required />
                    {placaNoCatalogada && (
                      <span className="text-[10px] font-semibold text-status-amber">Dato no catalogado (pendiente de revisión)</span>
                    )}
                  </div>
                  <AutoComplete
                    label="Funcionario del TEP"
                    value={sgTripulante}
                    onChange={(v) => setSgTripulante(v.toUpperCase())}
                    onPick={(v) => {
                      setSgTripulante(v.toUpperCase());
                      const p = catalogos.profesionales.find((x) => x.nombre === v);
                      if (p && p.cargo) setSgCargoTrip(p.cargo.toUpperCase());
                    }}
                    options={catalogos.profesionales.map((p) => p.nombre)}
                    required
                  />
                  <div className="space-y-2">
                    <Label htmlFor="sgcargo">Cargo</Label>
                    <Input id="sgcargo" value={sgCargoTrip} onChange={(e) => setSgCargoTrip(e.target.value.toUpperCase())} required />
                  </div>
                </div>
              </div>

              {/* C. CRUE */}
              <div>
                <Label className="text-[11px] font-bold uppercase text-status-blue">C. CRUE</Label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>¿El CRUE tenía conocimiento de la llegada?</Label>
                    <Select value={sgCrueConoce} onValueChange={(v) => setSgCrueConoce(v as "SI" | "NO" | "NV")}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SI">Sí</SelectItem>
                        <SelectItem value="NO">No</SelectItem>
                        <SelectItem value="NV">No se pudo verificar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sgCrueConoce === "SI" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="sgcruecod">Código / dato CRUE</Label>
                        <Input id="sgcruecod" value={sgCrueCodigo} onChange={(e) => setSgCrueCodigo(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sgcruefun">Funcionario CRUE (si se conoce)</Label>
                        <Input id="sgcruefun" value={sgCrueFuncionario} onChange={(e) => setSgCrueFuncionario(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sgcrueobs">Observación CRUE</Label>
                        <Input id="sgcrueobs" value={sgCrueObs} onChange={(e) => setSgCrueObs(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* D. INFORMACIÓN ADICIONAL */}
              <div className="space-y-2">
                <Label htmlFor="sgdet" className="text-[11px] font-bold uppercase text-status-blue">
                  E. Observaciones / detalle
                </Label>
                <Textarea id="sgdet" rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Información adicional…" />
              </div>

              {/* Plantilla institucional editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sgtpl">Plantilla institucional (editable)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-[11px]"
                    onClick={() => setSgPlantilla("")}
                  >
                    Regenerar
                  </Button>
                </div>
                <Textarea
                  id="sgtpl"
                  rows={8}
                  value={sgPlantilla || sgPlantillaDefault}
                  onChange={(e) => setSgPlantilla(e.target.value)}
                />
              </div>
            </div>
          )}


          {(tipo === "ACEP" || tipo === "NEG" || isCrue) && (
            <div className="space-y-2">
              <Label htmlFor="det">Observaciones / Detalle</Label>
              <Textarea id="det" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Información adicional…" />
            </div>
          )}


          <div className="flex justify-between">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
            </Button>
            <Button type="button" className="rounded-full" disabled={!tipo || busy} onClick={guardar}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generar y guardar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

// Lista dinámica de especialidades (autocomplete + agregar/eliminar).
function DynEspecialidades({
  label,
  items,
  setItems,
  options,
}: {
  label: string;
  items: DynItem[];
  setItems: Dispatch<SetStateAction<DynItem[]>>;
  options: string[];
}) {
  const setVal = (id: string, val: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, val } : it)));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {items.map((it, idx) => (
        <div key={it.id} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <AutoComplete
              value={it.val}
              onChange={(v) => setVal(it.id, v)}
              options={options}
              placeholder="Escribe la especialidad…"
            />
          </div>
          {idx > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full text-status-red"
              onClick={() => remove(it.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 rounded-full text-[11px]"
        onClick={() => setItems((prev) => [...prev, newDyn()])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Agregar especialidad
      </Button>
    </div>
  );
}

// Lista dinámica de motivos (texto libre + agregar/eliminar).
function DynMotivos({
  label,
  items,
  setItems,
}: {
  label: string;
  items: DynItem[];
  setItems: Dispatch<SetStateAction<DynItem[]>>;
}) {
  const setVal = (id: string, val: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, val } : it)));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {items.map((it, idx) => (
        <div key={it.id} className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            placeholder={`Motivo ${idx + 1}`}
            value={it.val}
            onChange={(e) => setVal(it.id, e.target.value)}
          />
          {idx > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full text-status-red"
              onClick={() => remove(it.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 rounded-full text-[11px]"
        onClick={() => setItems((prev) => [...prev, newDyn()])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Agregar motivo
      </Button>
    </div>
  );
}

function TipoCard({
  label,
  desc,
  icon,
  accent,
  active,
  onClick,
  className,
}: {
  label: string;
  desc?: string;
  icon?: ReactNode;
  accent: "green" | "red" | "blue" | "amber";
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  const activeBorder =
    accent === "green"
      ? "border-status-green bg-status-green/10"
      : accent === "red"
        ? "border-status-red bg-status-red/10"
        : accent === "amber"
          ? "border-status-amber bg-status-amber/10"
          : "border-status-blue bg-status-blue/10";
  const activeText =
    accent === "green"
      ? "text-status-green"
      : accent === "red"
        ? "text-status-red"
        : accent === "amber"
          ? "text-status-amber"
          : "text-status-blue";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-4 py-4 text-center transition ${
        active ? activeBorder : "border-border hover:border-foreground/30"
      } ${className || ""}`}
    >
      {icon && <span className={active ? activeText : "text-muted-foreground"}>{icon}</span>}
      <p className={`text-sm font-bold ${active ? activeText : "text-foreground"}`}>{label}</p>
      {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
    </button>
  );
}



function StepIndicator({ step }: { step: number }) {
  const labels = ["Documento", "Datos", "Clasificación"];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : done
                    ? "border-status-green/50 bg-status-green/10 text-status-green"
                    : "border-border text-muted-foreground"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px]">{n}</span>
              {l}
            </div>
            {i < labels.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        );
      })}
    </div>
  );
}
