import { useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { siguienteCodigo } from "@/lib/codigo.functions";
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
  MOTIVO_NEG_LABEL,
  MOTIVO_NEG_CATALOGO,
  DOC_SUBTIPOS,
  DOC_SUBTIPO_LABEL,
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

type Tipo = "ACEP" | "NEG" | "CRUE_ACEP" | "CRUE_NR" | "CRUE_NEG";

const CRUE_TIPOS: { value: Tipo; label: string }[] = [
  { value: "CRUE_ACEP", label: "ACEPTACIÓN DIRECCIONAMIENTO" },
  { value: "CRUE_NR", label: "NO REQUERIMIENTO" },
  { value: "CRUE_NEG", label: "NEGACIÓN DIRECCIONAMIENTO" },
];

// Unidades válidas cuando el CRUE direcciona (solo URGENCIAS / UCI).
const UNIDADES_CRUE = ["URGENCIAS", "UCI"];

const COMPLEJIDADES = ["MAYOR COMPLEJIDAD", "MENOR COMPLEJIDAD"];

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
  const [motivoNeg, setMotivoNeg] = useState("");
  const [complejidad, setComplejidad] = useState("");
  const [detalle, setDetalle] = useState("");
  // CRUE
  const [codigoCrue, setCodigoCrue] = useState("");
  const [contactoIps, setContactoIps] = useState("");
  const [unidadReq, setUnidadReq] = useState("");
  const [motivosCrue, setMotivosCrue] = useState<string[]>(["", "", ""]);
  // Negación — recontacto (sobreocupación)
  const [fechaRec, setFechaRec] = useState("");
  const [horaRec, setHoraRec] = useState("");

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

  // ── Lógica de campos según el motivo de negación ──
  const mNeg = motivoNeg.toUpperCase();
  const negEspecialidad = mNeg.includes("RECURSO HUMANO");
  const negUnidad = mNeg.includes("DISPONIBILIDAD DE UNIDAD");
  const negCamas = mNeg.includes("SOBREOCUPAC") || mNeg.includes("CAMAS");
  const negComplejidad = mNeg.includes("COMPLEJIDAD");
  const negDetalleOpcional = mNeg.includes("RED NO CONTRATADA") || mNeg.includes("AFILIACI");

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
    setMotivosCrue(["", "", ""]);
    setFechaRec("");
    setHoraRec("");
    setEsReconsultante(false);
    cerrarAdres();
    setResultado(null);
  };

  const guardar = async () => {
    if (!tipo) return toast.error("Selecciona el tipo de caso");
    if (tipo === "NEG" && !motivoNeg) return toast.error("Selecciona el motivo de negación");
    if (tipo === "NEG" && negComplejidad && !complejidad) return toast.error("Selecciona la complejidad");
    if (tipo === "NEG" && negEspecialidad && !especialidad.trim())
      return toast.error("Indica la especialidad requerida");
    if (tipo === "NEG" && negUnidad && !unidad.trim()) return toast.error("Indica la unidad requerida");
    if (tipo === "NEG" && negComplejidad && complejidad === "MAYOR COMPLEJIDAD" && !especialidad.trim())
      return toast.error("Indica la especialidad requerida");
    if (tipo === "CRUE_ACEP" && !unidadReq) return toast.error("Selecciona la unidad requerida (URGENCIAS o UCI)");

    setBusy(true);
    try {
      const ahora = new Date();
      const { codigo } = await siguienteCodigo({
        data: { tipo, yyyy: ahora.getFullYear(), mm: ahora.getMonth() + 1 },
      });

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

      const motivoNegFull =
        motivoNeg === "POR NIVEL DE COMPLEJIDAD" && complejidad
          ? `POR NIVEL DE COMPLEJIDAD - ${complejidad}`
          : motivoNeg;

      const negCamasSel = tipo === "NEG" && negCamas;

      const mensaje = buildMensaje(
        plantillas,
        catalogos.medicos,
        { codigo, fecha: fmtFechaHora(ahora), fechaVence: fechaVenceStr, hrsReserva: String(hrs || "") },
        {
          tipo,
          documento,
          ips,
          medico,
          especialidad,
          unidad: unidadEff,
          aseguramiento,
          detalle,
          motivoNeg: motivoNegFull,
          codigoCrue,
          contactoIps,
          eapb,
          regimen,
          fechaRecontacto: negCamasSel ? fechaRec : undefined,
          horaRecontacto: negCamasSel ? horaRec : undefined,
          motivosCrue: isCrue ? motivosCrue.filter(Boolean) : null,
        },
      );

      const { error } = await supabase.from("casos_entrantes").insert({
        codigo,
        tipo,
        documento: documento.trim(),
        nombres: nombres.trim() || null,
        apellidos: apellidos.trim() || null,
        eapb: eapb || null,
        regimen: regimen || null,
        ips: ips || null,
        medico: medico || null,
        especialidad: especialidad || null,
        unidad: unidadEff || null,
        aseguramiento: tipo === "ACEP" ? aseguramiento : null,
        detalle: detalle || null,
        estado: esActivo ? "ACTIVO" : "REGISTRADO",
        fecha: ahora.toISOString().slice(0, 10),
        fecha_vence: fechaVenceISO,
        hrs_reserva: hrs ? String(hrs) : null,
        texto_ia: mensaje || null,
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
            <div className="grid gap-3 sm:grid-cols-3">
              <TipoCard
                label="Aceptación"
                icon={<CheckCircle2 className="h-5 w-5" />}
                accent="green"
                active={tipo === "ACEP"}
                onClick={() => {
                  setTipo("ACEP");
                  setCrueOpen(false);
                  // limpia estado de negación y de CRUE
                  setMotivoNeg("");
                  setComplejidad("");
                  setCodigoCrue("");
                  setContactoIps("");
                  setUnidadReq("");
                  setMotivosCrue(["", "", ""]);
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
                  // limpia estado de aceptación y de CRUE
                  setMedico("");
                  setEspecialidad("");
                  setUnidad("");
                  setAseguramiento("EPS");
                  setCodigoCrue("");
                  setContactoIps("");
                  setUnidadReq("");
                  setMotivosCrue(["", "", ""]);
                }}
              />
              <TipoCard
                label="Caso CRUE"
                icon={<Siren className="h-5 w-5" />}
                accent="amber"
                active={isCrue || crueOpen}
                onClick={() => {
                  // CRUE es excluyente: abre panel CRUE y limpia aceptación/negación
                  setCrueOpen(true);
                  setTipo("");
                  setMedico("");
                  setUnidad("");
                  setAseguramiento("EPS");
                  setMotivoNeg("");
                  setComplejidad("");
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
                      // al cambiar de subtipo CRUE, limpia la unidad requerida
                      setUnidadReq("");
                      setMotivosCrue(["", "", ""]);
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
              <Label className="text-xs font-bold uppercase tracking-wide text-status-red">
                Motivo de negación
              </Label>
              <div className="flex flex-wrap gap-2">
                {catalogos.motivosNeg.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMotivoNeg(m);
                      setComplejidad("");
                      setEspecialidad("");
                      setUnidad("");
                      const up = m.toUpperCase();
                      if (up.includes("SOBREOCUPAC") || up.includes("CAMAS")) {
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
                      motivoNeg === m
                        ? "border-status-red bg-status-red/15 text-status-red"
                        : "border-border text-foreground hover:border-status-red/40"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* RED NO CONTRATADA / AFILIACIÓN DE OFICIO → detalle opcional */}
              {negDetalleOpcional && (
                <div className="space-y-1.5">
                  <Label htmlFor="negdet" className="text-[11px] text-muted-foreground">
                    Detalles (opcional)
                  </Label>
                  <Textarea
                    id="negdet"
                    rows={3}
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    placeholder="Nota adicional que se incluirá en el texto…"
                  />
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
                          if (c !== "MAYOR COMPLEJIDAD") setEspecialidad("");
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


          {isCrue && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codcrue">Código CRUE</Label>
                <Input id="codcrue" value={codigoCrue} onChange={(e) => setCodigoCrue(e.target.value)} />
              </div>
              <AutoComplete label="Contacto / IPS" value={contactoIps} onChange={setContactoIps} options={catalogos.ips} minChars={2} />

              {/* ACEPTACIÓN DIRECCIONAMIENTO → unidad obligatoria (solo URGENCIAS/UCI) */}
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

              {/* NEGACIÓN DIRECCIONAMIENTO → unidad opcional (solo URGENCIAS/UCI) */}
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

              {/* Especialidad requerida: aplica para aceptación y negación de direccionamiento */}
              {tipo !== "CRUE_NR" && (
                <AutoComplete label="Especialidad requerida" value={especialidad} onChange={setEspecialidad} options={catalogos.especialidades} />
              )}

              {tipo === "CRUE_NEG" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Motivos de negación del direccionamiento (hasta 3)</Label>
                  {[0, 1, 2].map((i) => (
                    <Input
                      key={i}
                      className="mt-1"
                      placeholder={`Motivo ${i + 1}`}
                      value={motivosCrue[i]}
                      onChange={(e) =>
                        setMotivosCrue((prev) => prev.map((m, idx) => (idx === i ? e.target.value : m)))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {(tipo === "ACEP" || isCrue) && (
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
