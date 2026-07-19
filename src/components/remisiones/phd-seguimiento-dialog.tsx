// ---------------------------------------------------------------------------
// Modal de seguimiento dedicado para PHD / PAD / O2 / Especiales.
//
// Correcciones aplicadas (Prompt maestro — PHD Seguimiento):
// - ESTADO DEL CASO es automático y de solo lectura.
// - TIPO DE SEGUIMIENTO (evento) y CANAL DE GESTIÓN (medio) están separados.
// - Se filtran los tipos permitidos según el estado real del caso.
// - Los eventos disparan transiciones controladas vía avanzarEstadoCiclo.
// - RADICACIÓN es un evento (usa registrarRadicacion), no un estado.
// - No aparece WhatsApp en el catálogo de canales.
// - Los datos se guardan estructurados en seguimientos.detalles (jsonb).
// - No se toca RLS ni se usa service role. Reutiliza catálogos y funciones
//   existentes; no crea otra máquina de estados.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  avanzarEstadoCiclo,
  registrarRadicacion,
  type PhdEstadoCiclo,
} from "@/lib/phd-ciclo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/remisiones-utils";
import { FileSignature, Info, Lock } from "lucide-react";
import { EntregaDocumentalDialog } from "./entrega-documental-dialog";

// --- Catálogo de EVENTOS (Tipo de seguimiento) ------------------------------
type EventoCodigo =
  | "RADICACION"
  | "EVOLUCION_NOVEDAD"
  | "SEGUIMIENTO_GENERAL"
  | "RESPUESTA_PROVEEDOR"
  | "ACEPTACION_PROVEEDOR"
  | "NO_ACEPTACION_PROVEEDOR"
  | "COORDINACION_AMBULANCIA"
  | "CONFIRMACION_EGRESO"
  | "CANCELACION_PROVEEDOR"
  | "CANCELACION_ESPECIALIDAD";

const EVENTOS: Record<EventoCodigo, string> = {
  RADICACION: "RADICACIÓN",
  EVOLUCION_NOVEDAD: "EVOLUCIÓN / NOVEDAD",
  SEGUIMIENTO_GENERAL: "SEGUIMIENTO GENERAL",
  RESPUESTA_PROVEEDOR: "RESPUESTA DEL PROVEEDOR",
  ACEPTACION_PROVEEDOR: "ACEPTACIÓN DEL PROVEEDOR",
  NO_ACEPTACION_PROVEEDOR: "NO ACEPTACIÓN DEL PROVEEDOR",
  COORDINACION_AMBULANCIA: "COORDINACIÓN DE AMBULANCIA",
  CONFIRMACION_EGRESO: "CONFIRMACIÓN DE EGRESO",
  CANCELACION_PROVEEDOR: "CANCELACIÓN POR EL PROVEEDOR",
  CANCELACION_ESPECIALIDAD: "CANCELACIÓN POR LA ESPECIALIDAD SOLICITANTE",
};

// --- Canales de gestión (sin WhatsApp) --------------------------------------
const CANALES = [
  "TELEFÓNICO",
  "CORREO ELECTRÓNICO",
  "PLATAFORMA WEB",
  "FÍSICO / PRESENCIAL",
  "OTRO",
] as const;

// --- Eventos permitidos por estado ------------------------------------------
function eventosPermitidos(estado: PhdEstadoCiclo | null): EventoCodigo[] {
  const e = estado ?? "PENDIENTE ACEPTACION";
  if (e === "PENDIENTE ACEPTACION") {
    return [
      "RADICACION",
      "EVOLUCION_NOVEDAD",
      "SEGUIMIENTO_GENERAL",
      "RESPUESTA_PROVEEDOR",
      "ACEPTACION_PROVEEDOR",
      "NO_ACEPTACION_PROVEEDOR",
      "CANCELACION_PROVEEDOR",
      "CANCELACION_ESPECIALIDAD",
    ];
  }
  if (e === "ACEPTADO - PENDIENTE EGRESO") {
    return [
      "EVOLUCION_NOVEDAD",
      "SEGUIMIENTO_GENERAL",
      "CONFIRMACION_EGRESO",
      "CANCELACION_PROVEEDOR",
      "CANCELACION_ESPECIALIDAD",
    ];
  }
  if (e === "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA") {
    return [
      "EVOLUCION_NOVEDAD",
      "SEGUIMIENTO_GENERAL",
      "COORDINACION_AMBULANCIA",
      "CANCELACION_PROVEEDOR",
      "CANCELACION_ESPECIALIDAD",
    ];
  }
  if (e === "AMBULANCIA COORDINADA - PENDIENTE EGRESO") {
    return [
      "EVOLUCION_NOVEDAD",
      "SEGUIMIENTO_GENERAL",
      "COORDINACION_AMBULANCIA",
      "CONFIRMACION_EGRESO",
      "CANCELACION_PROVEEDOR",
      "CANCELACION_ESPECIALIDAD",
    ];
  }
  return []; // cerrado
}

function esTerminal(estado?: string | null) {
  return (estado ?? "").startsWith("CERRADO");
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  paciente: string;
  documento?: string | null;
  tipoDocumento?: string | null;
  estadoActual?: string | null;
  ipsReceptora?: string | null;
  empresaTraslado?: string | null;
  entidadPago?: string | null;
};

export function PhdSeguimientoDialog({
  open,
  onOpenChange,
  casoId,
  paciente,
  documento,
  tipoDocumento,
  estadoActual,
  ipsReceptora,
  empresaTraslado,
  entidadPago,
}: Props) {
  const qc = useQueryClient();
  const avanzar = useServerFn(avanzarEstadoCiclo);
  const radicar = useServerFn(registrarRadicacion);

  const estadoNormalizado = (estadoActual ?? "PENDIENTE ACEPTACION") as PhdEstadoCiclo;
  const terminal = esTerminal(estadoActual);
  const eventosDisponibles = useMemo(
    () => eventosPermitidos(terminal ? null : estadoNormalizado).filter(Boolean),
    [estadoNormalizado, terminal],
  );

  // --- Estado del formulario ------------------------------------------------
  const [evento, setEvento] = useState<EventoCodigo | "">("");
  const [canal, setCanal] = useState("");
  const [canalOtro, setCanalOtro] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fecha, setFecha] = useState(""); // ISO fecha/hora sencilla del evento
  const [proveedor, setProveedor] = useState("");
  const [entregaOpen, setEntregaOpen] = useState(false);

  // Radicación
  const [numRadicado, setNumRadicado] = useState("");
  const [sinRadicado, setSinRadicado] = useState(false);
  const [motivoSinRadicado, setMotivoSinRadicado] = useState("");

  // Aceptación
  const [codigoAceptacion, setCodigoAceptacion] = useState("");
  const [requiereAmbulancia, setRequiereAmbulancia] = useState<"SI" | "NO" | "">("");

  // No aceptación / Cancelación / Egreso
  const [motivo, setMotivo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [especialidad, setEspecialidad] = useState("");

  // Coordinación de ambulancia
  const [empresaAmb, setEmpresaAmb] = useState("");
  const [tipoAmb, setTipoAmb] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTel, setContactoTel] = useState("");

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setEvento("");
    setCanal("");
    setCanalOtro("");
    setObservaciones("");
    setFecha("");
    setProveedor("");
    setNumRadicado("");
    setSinRadicado(false);
    setMotivoSinRadicado("");
    setCodigoAceptacion("");
    setRequiereAmbulancia("");
    setMotivo("");
    setResponsable("");
    setEspecialidad("");
    setEmpresaAmb((empresaTraslado ?? "").toUpperCase());
    setTipoAmb("");
    setContactoNombre("");
    setContactoTel("");
  }, [open, empresaTraslado]);

  // Historial de seguimientos del caso ---------------------------------------
  const { data: historial = [] } = useQuery({
    queryKey: ["phd-seguimientos", casoId],
    enabled: open && !!casoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("seguimientos")
        .select("id, created_at, tipo_seguimiento, radicado, detalle, detalles, nombre_usuario")
        .eq("caso_id", casoId)
        .eq("tipo_caso", "domiciliario")
        .eq("archivado", false)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string;
        created_at: string;
        tipo_seguimiento: string | null;
        radicado: string | null;
        detalle: string | null;
        detalles: Record<string, unknown> | null;
        nombre_usuario: string | null;
      }>;
    },
  });

  // Catálogo TIPO_AMBULANCIA (para coordinación)
  const { data: tiposAmb = [] } = useQuery({
    queryKey: ["cat-tipo-ambulancia"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "TIPO_AMBULANCIA")
        .eq("activo", true)
        .order("valor");
      const rows = (data ?? []).map((d) => (d.valor as string).toUpperCase());
      return rows.length ? rows : ["TAB", "TAM", "TAM-N", "TAT", "TAN", "TAN-N"];
    },
  });

  // Catálogo EMPRESA_TEP
  const { data: empresas = [] } = useQuery({
    queryKey: ["cat-empresa-tep"],
    enabled: open && evento === "COORDINACION_AMBULANCIA",
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor")
        .eq("tipo", "EMPRESA_TEP")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((d) => (d.valor as string).toUpperCase());
    },
  });

  // Habilita descarga documental (traslado)
  const puedeEntregaDocumental =
    estadoNormalizado === "AMBULANCIA COORDINADA - PENDIENTE EGRESO" ||
    estadoNormalizado === "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA";

  // Validación por evento ----------------------------------------------------
  const canalRequerido = evento !== "RADICACION"; // radicación captura canal como campo del evento también
  const canalFinal = canal === "OTRO" ? canalOtro.trim().toUpperCase() : canal;

  const errores: string[] = [];
  if (!evento) errores.push("Seleccione el tipo de seguimiento.");
  if (canalRequerido && !canalFinal) errores.push("Seleccione un canal de gestión.");
  if (evento === "RADICACION" && !sinRadicado && !numRadicado.trim())
    errores.push("Ingrese el número de radicado o marque 'Sin número'.");
  if (evento === "RADICACION" && sinRadicado && !motivoSinRadicado.trim())
    errores.push("Indique el motivo de no tener radicado.");
  if (evento === "ACEPTACION_PROVEEDOR" && !proveedor.trim())
    errores.push("Indique el proveedor que acepta.");
  if (evento === "ACEPTACION_PROVEEDOR" && !requiereAmbulancia)
    errores.push("Indique si requiere ambulancia.");
  if (evento === "NO_ACEPTACION_PROVEEDOR" && (!proveedor.trim() || !motivo.trim()))
    errores.push("Proveedor y motivo son obligatorios.");
  if (evento === "COORDINACION_AMBULANCIA" && (!empresaAmb.trim() || !tipoAmb.trim()))
    errores.push("Empresa y tipo de ambulancia son obligatorios.");
  if (evento === "CONFIRMACION_EGRESO" && (!responsable.trim() || !fecha.trim()))
    errores.push("Fecha/hora real de egreso y responsable son obligatorios.");
  if (evento === "CANCELACION_PROVEEDOR" && (!proveedor.trim() || !motivo.trim()))
    errores.push("Proveedor y motivo de cancelación son obligatorios.");
  if (evento === "CANCELACION_ESPECIALIDAD" && (!especialidad.trim() || !motivo.trim()))
    errores.push("Especialidad y motivo de cancelación son obligatorios.");

  const invalid = errores.length > 0 || terminal;

  // Descripción legible generada
  function resumenLegible(): string {
    const partes: string[] = [`TIPO: ${EVENTOS[evento as EventoCodigo]}`];
    if (canalFinal) partes.push(`CANAL: ${canalFinal}`);
    if (proveedor.trim()) partes.push(`PROVEEDOR: ${proveedor.trim().toUpperCase()}`);
    if (evento === "RADICACION")
      partes.push(sinRadicado ? "N° RADICADO: SIN NÚMERO" : `N° RADICADO: ${numRadicado.trim()}`);
    if (evento === "ACEPTACION_PROVEEDOR") {
      if (codigoAceptacion.trim()) partes.push(`CÓDIGO: ${codigoAceptacion.trim()}`);
      partes.push(`REQUIERE AMBULANCIA: ${requiereAmbulancia}`);
    }
    if (evento === "COORDINACION_AMBULANCIA") {
      partes.push(`EMPRESA: ${empresaAmb.trim().toUpperCase()}`);
      partes.push(`TIPO AMB: ${tipoAmb.trim().toUpperCase()}`);
      if (contactoNombre.trim()) partes.push(`CONTACTO: ${contactoNombre.trim().toUpperCase()}`);
      if (contactoTel.trim()) partes.push(`TEL: ${contactoTel.trim()}`);
    }
    if (evento === "CONFIRMACION_EGRESO") {
      partes.push(`FECHA EGRESO: ${fecha}`);
      partes.push(`RESPONSABLE: ${responsable.trim().toUpperCase()}`);
    }
    if (["NO_ACEPTACION_PROVEEDOR", "CANCELACION_PROVEEDOR", "CANCELACION_ESPECIALIDAD"].includes(
      evento,
    )) {
      if (especialidad.trim()) partes.push(`ESPECIALIDAD: ${especialidad.trim().toUpperCase()}`);
      if (motivo.trim()) partes.push(`MOTIVO: ${motivo.trim().toUpperCase()}`);
    }
    if (observaciones.trim()) partes.push(`OBSERVACIONES: ${observaciones.trim()}`);
    return partes.join(" · ");
  }

  const mGuardar = useMutation({
    mutationFn: async () => {
      if (!evento) throw new Error("Seleccione un evento");
      const { data: u } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", u.user?.id ?? "")
        .maybeSingle();
      const nombreUsuario = perfil?.nombre || u.user?.email || "—";

      const detallesEstructurados: Record<string, unknown> = {
        evento,
        canal: canalFinal || null,
        proveedor: proveedor.trim().toUpperCase() || null,
        fecha_evento: fecha || null,
        observaciones: observaciones.trim() || null,
        estado_anterior: estadoNormalizado,
      };

      // 1) Evento RADICACIÓN — persistir en tabla dedicada
      if (evento === "RADICACION") {
        const numero = sinRadicado ? "" : numRadicado.trim();
        await radicar({
          data: {
            casoId,
            eapb: (proveedor || entidadPago || "").trim().toUpperCase() || "SIN EAPB",
            canal: canalFinal || "OTRO",
            numeroRadicado: numero || undefined,
            observaciones: sinRadicado
              ? `SIN RADICADO — ${motivoSinRadicado.trim()}`
              : observaciones.trim() || undefined,
          },
        });
        detallesEstructurados.numero_radicado = numero || "SIN NÚMERO";
        if (sinRadicado) detallesEstructurados.motivo_sin_radicado = motivoSinRadicado.trim();
      }

      // 2) Transiciones
      let nuevoEstado: PhdEstadoCiclo | null = null;
      if (evento === "ACEPTACION_PROVEEDOR") {
        nuevoEstado =
          requiereAmbulancia === "SI"
            ? "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA"
            : "ACEPTADO - PENDIENTE EGRESO";
        detallesEstructurados.codigo_aceptacion = codigoAceptacion.trim() || null;
        detallesEstructurados.requiere_ambulancia = requiereAmbulancia;
      } else if (evento === "COORDINACION_AMBULANCIA") {
        nuevoEstado = "AMBULANCIA COORDINADA - PENDIENTE EGRESO";
        detallesEstructurados.empresa_ambulancia = empresaAmb.trim().toUpperCase();
        detallesEstructurados.tipo_ambulancia = tipoAmb.trim().toUpperCase();
        detallesEstructurados.contacto_nombre = contactoNombre.trim().toUpperCase() || null;
        detallesEstructurados.contacto_telefono = contactoTel.trim() || null;
        // Refleja empresa en el caso para que la Portada / Acta la vean.
        await supabase
          .from("domiciliarios")
          .update({
            empresa_traslado: empresaAmb.trim().toUpperCase(),
            tipo_ambulancia: tipoAmb.trim().toUpperCase(),
          } as never)
          .eq("id", casoId);
      } else if (evento === "CONFIRMACION_EGRESO") {
        nuevoEstado = "CERRADO POR EGRESO";
        detallesEstructurados.fecha_egreso = fecha;
        detallesEstructurados.responsable_egreso = responsable.trim().toUpperCase();
      } else if (evento === "CANCELACION_PROVEEDOR") {
        nuevoEstado = "CERRADO POR CANCELACION DEL PROVEEDOR";
        detallesEstructurados.motivo_cancelacion = motivo.trim().toUpperCase();
      } else if (evento === "CANCELACION_ESPECIALIDAD") {
        nuevoEstado = "CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE";
        detallesEstructurados.especialidad = especialidad.trim().toUpperCase();
        detallesEstructurados.motivo_cancelacion = motivo.trim().toUpperCase();
      }

      if (nuevoEstado) {
        await avanzar({
          data: {
            casoId,
            nuevoEstado,
            observaciones: observaciones.trim() || undefined,
            fechaEvento: fecha || undefined,
          },
        });
        detallesEstructurados.estado_nuevo = nuevoEstado;
      } else {
        detallesEstructurados.estado_nuevo = estadoNormalizado;
      }

      // 3) Insertar seguimiento (auditoría estructurada)
      const { error } = await supabase.from("seguimientos").insert({
        caso_id: casoId,
        tipo_caso: "domiciliario",
        tipo_seguimiento: EVENTOS[evento as EventoCodigo],
        radicado: evento === "RADICACION" ? (sinRadicado ? "SIN NÚMERO" : numRadicado.trim()) : null,
        detalle: resumenLegible(),
        detalles: detallesEstructurados,
        nombre_usuario: nombreUsuario,
        nombre_contacto: contactoNombre.trim().toUpperCase() || null,
        telefono: contactoTel.trim() || null,
        estado_solicitud: nuevoEstado ?? estadoNormalizado,
        created_by: u.user?.id ?? null,
      } as never);
      if (error) throw new Error(error.message);

      // 4) Auditoría global
      await registrarAuditoria({
        data: {
          accion: "PHD_SEGUIMIENTO",
          modulo: "domiciliarios",
          tabla: "seguimientos",
          registroId: casoId,
          resultado: "exito",
          detalles: {
            evento,
            estado_anterior: estadoNormalizado,
            estado_nuevo: nuevoEstado ?? estadoNormalizado,
          },
        },
      }).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Seguimiento registrado");
      qc.invalidateQueries({ queryKey: ["phd-seguimientos", casoId] });
      qc.invalidateQueries({ queryKey: ["phd-radicaciones", casoId] });
      qc.invalidateQueries({ queryKey: ["domiciliarios"] });
      qc.invalidateQueries({ queryKey: ["indigo-caso", "domiciliarios", casoId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        {/* Cabecera de contexto */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold">Documento:</span>{" "}
              {tipoDocumento ? `${tipoDocumento} ` : ""}
              {documento || "—"}
              {ipsReceptora ? (
                <>
                  {" · "}
                  <span className="font-semibold">IPS:</span> {ipsReceptora}
                </>
              ) : null}
            </div>
            <Badge variant={terminal ? "secondary" : "default"} className="font-semibold">
              <Lock className="mr-1 h-3 w-3" /> {estadoNormalizado}
            </Badge>
          </div>
          <p className="mt-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Estado del caso — automático. Se actualiza según el seguimiento registrado.
          </p>
        </div>

        {terminal ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mr-1 inline h-3 w-3" />
            El caso está cerrado. No se permiten nuevos seguimientos operativos desde este modal.
          </div>
        ) : (
          <div className="space-y-4">
            {/* TIPO DE SEGUIMIENTO */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase">Tipo de seguimiento *</Label>
                <Select value={evento} onValueChange={(v) => setEvento(v as EventoCodigo)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar evento…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventosDisponibles.map((code) => (
                      <SelectItem key={code} value={code}>
                        {EVENTOS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* CANAL DE GESTIÓN */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase">Canal de gestión *</Label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar canal…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANALES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canal === "OTRO" && (
                  <Input
                    placeholder="ESPECIFIQUE EL CANAL"
                    value={canalOtro}
                    onChange={(e) => setCanalOtro(e.target.value.toUpperCase())}
                  />
                )}
              </div>
            </div>

            {/* CAMPOS DINÁMICOS POR EVENTO */}
            {evento === "RADICACION" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Proveedor / EAPB</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                    placeholder={entidadPago || "EAPB / PROVEEDOR"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">N° de radicado {sinRadicado ? "" : "*"}</Label>
                  <Input
                    value={numRadicado}
                    onChange={(e) => setNumRadicado(e.target.value)}
                    disabled={sinRadicado}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora de radicación</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <label className="col-span-full flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={sinRadicado}
                    onChange={(e) => setSinRadicado(e.target.checked)}
                  />
                  Sin número de radicado
                </label>
                {sinRadicado && (
                  <div className="col-span-full space-y-1.5">
                    <Label className="text-xs">Motivo de no tener radicado *</Label>
                    <Input
                      value={motivoSinRadicado}
                      onChange={(e) => setMotivoSinRadicado(e.target.value.toUpperCase())}
                    />
                  </div>
                )}
              </div>
            )}

            {evento === "ACEPTACION_PROVEEDOR" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor que acepta *</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Código de aceptación</Label>
                  <Input
                    value={codigoAceptacion}
                    onChange={(e) => setCodigoAceptacion(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Fecha/hora de aceptación</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div className="col-span-full space-y-1.5">
                  <Label className="text-xs">¿Requiere ambulancia? *</Label>
                  <RadioGroup
                    value={requiereAmbulancia}
                    onValueChange={(v) => setRequiereAmbulancia(v as "SI" | "NO")}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-1.5 text-sm">
                      <RadioGroupItem value="SI" /> SÍ
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <RadioGroupItem value="NO" /> NO
                    </label>
                  </RadioGroup>
                </div>
              </div>
            )}

            {evento === "NO_ACEPTACION_PROVEEDOR" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor *</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo *</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value.toUpperCase())} />
                </div>
              </div>
            )}

            {evento === "RESPUESTA_PROVEEDOR" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Proveedor</Label>
                <Input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                />
              </div>
            )}

            {evento === "COORDINACION_AMBULANCIA" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Empresa de ambulancia *</Label>
                  <Select value={empresaAmb} onValueChange={setEmpresaAmb}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(empresas.length ? empresas : (empresaAmb ? [empresaAmb] : [])).map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de ambulancia *</Label>
                  <Select value={tipoAmb} onValueChange={setTipoAmb}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposAmb.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora estimada</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contacto (nombre)</Label>
                  <Input
                    value={contactoNombre}
                    onChange={(e) => setContactoNombre(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Teléfono de contacto</Label>
                  <Input value={contactoTel} onChange={(e) => setContactoTel(e.target.value)} />
                </div>
              </div>
            )}

            {evento === "CONFIRMACION_EGRESO" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora real de egreso *</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Responsable que confirma *</Label>
                  <Input
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Proveedor</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            {evento === "CANCELACION_PROVEEDOR" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor *</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo *</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value.toUpperCase())} />
                </div>
              </div>
            )}

            {evento === "CANCELACION_ESPECIALIDAD" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Especialidad solicitante *</Label>
                  <Input
                    value={especialidad}
                    onChange={(e) => setEspecialidad(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo *</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Responsable</Label>
                  <Input
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            {/* OBSERVACIONES: común a todos */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase">Observaciones</Label>
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
              <p className="text-[10.5px] text-muted-foreground">
                El texto operacional se guarda tal cual. Los datos estructurados van al historial.
              </p>
            </div>

            {puedeEntregaDocumental && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full"
                onClick={() => setEntregaOpen(true)}
              >
                <FileSignature className="mr-2 h-4 w-4" /> Entrega documental / Firma QR
              </Button>
            )}

            {errores.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {errores.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* HISTORIAL COMPACTO */}
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Historial ({historial.length})
          </p>
          {historial.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Sin seguimientos registrados.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-auto pr-1">
              {historial.map((h) => {
                const d = (h.detalles ?? {}) as Record<string, unknown>;
                return (
                  <li
                    key={h.id}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold">{h.tipo_seguimiento}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmtFechaHora(h.created_at)} · {h.nombre_usuario || "—"}
                      </span>
                    </div>
                    {Boolean(d.estado_anterior || d.estado_nuevo) && (
                      <p className="text-[10.5px] text-muted-foreground">
                        {String(d.estado_anterior ?? "")} → {String(d.estado_nuevo ?? "")}
                      </p>
                    )}
                    {h.detalle && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {h.detalle}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={invalid || mGuardar.isPending}
            onClick={() => mGuardar.mutate()}
          >
            Registrar seguimiento
          </Button>
        </DialogFooter>

        {entregaOpen && (
          <EntregaDocumentalDialog
            open={entregaOpen}
            onOpenChange={setEntregaOpen}
            casoId={casoId}
            tipoCaso="phd"
            paciente={paciente}
            documento={documento ?? null}
            tipoDocumento={tipoDocumento ?? null}
            ipsReceptora={ipsReceptora ?? null}
            empresaTraslado={empresaTraslado ?? null}
            entidadPago={entidadPago ?? null}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
