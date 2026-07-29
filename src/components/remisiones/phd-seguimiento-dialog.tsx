// ---------------------------------------------------------------------------
// FASE 5D · Bloque B — Modal de seguimiento PHD / PAD / PAD CRÓNICO / O2 /
// UNIDADES ESPECIALES / AMBULANCIA PARA EGRESO.
//
// Principios:
// - El ESTADO es server-authoritative: se muestra en solo lectura y lo recalcula
//   el trigger tras cada evento (private.resolver_estado_phd).
// - Los EVENTOS disponibles se derivan de los REQUISITOS PENDIENTES del ciclo
//   vigente (no del estado plano). El servidor revalida la misma matriz en
//   public.registrar_evento_phd.
// - Cada servicio solicitado tiene aceptación independiente.
// - La CONFIRMACIÓN DE LLEGADA DE AMBULANCIA exige firma QR verificada.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { registrarEventoPhd } from "@/lib/phd-eventos.functions";
import {
  derivarRequisitos,
  eventosDisponibles as calcularEventos,
  EVENTO_LABEL,
  SERVICIO_LABEL,
  SERVICIOS_CON_ACEPTACION,
  TIPO_AMBULANCIA_LABEL,
  TIPOS_AMBULANCIA_CODIGOS,
  normalizarEstadoPhd,
  esEstadoTerminalPhd,
  type ServicioCodigo,
} from "@/lib/phd-requisitos";
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
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/remisiones-utils";
import { CheckCircle2, Circle, FileSignature, Info, Lock } from "lucide-react";
import { EntregaDocumentalDialog } from "./entrega-documental-dialog";
import { RiLlegadaQRPanel, type FirmaLlegadaInfo } from "./ri-llegada-qr-panel";

const CANALES = [
  "TELEFÓNICO",
  "CORREO ELECTRÓNICO",
  "PLATAFORMA WEB",
  "FÍSICO / PRESENCIAL",
  "OTRO",
] as const;

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
  /** Servicios solicitados (columna canónica `tipos_solicitud`). */
  tiposSolicitud?: unknown;
  unidadEspecialSolicitada?: string | null;
  tipoAmbulanciaCodigo?: string | null;
  /** Inicio del ciclo vigente: acota los eventos considerados. */
  cicloInicioAt?: string | null;
  radicadoCaso?: string | null;
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
  tiposSolicitud,
  unidadEspecialSolicitada,
  tipoAmbulanciaCodigo,
  cicloInicioAt,
  radicadoCaso,
}: Props) {
  const qc = useQueryClient();
  const registrarEvento = useServerFn(registrarEventoPhd);

  const estado = normalizarEstadoPhd(estadoActual);
  const terminal = esEstadoTerminalPhd(estadoActual);

  // --- Historial del caso (con marca de ciclo) --------------------------------
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
        .limit(80);
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

  // Eventos del ciclo vigente (desde ciclo_inicio_at).
  const eventosCiclo = useMemo(() => {
    const desde = cicloInicioAt ? new Date(cicloInicioAt).getTime() : 0;
    return historial
      .filter((h) => new Date(h.created_at).getTime() >= desde)
      .map((h) => {
        const d = (h.detalles ?? {}) as Record<string, unknown>;
        return {
          evento: (d.evento as string) ?? null,
          servicio_codigo: (d.servicio_codigo as string) ?? null,
        };
      });
  }, [historial, cicloInicioAt]);

  const req = useMemo(
    () => derivarRequisitos(tiposSolicitud, eventosCiclo),
    [tiposSolicitud, eventosCiclo],
  );
  const eventosDisponibles = useMemo(
    () => (terminal ? [] : calcularEventos(req)),
    [req, terminal],
  );

  // --- Formulario -------------------------------------------------------------
  const [evento, setEvento] = useState("");
  const [canal, setCanal] = useState("");
  const [canalOtro, setCanalOtro] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fecha, setFecha] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [servicio, setServicio] = useState<ServicioCodigo | "">("");
  const [numRadicado, setNumRadicado] = useState("");
  const [sinRadicado, setSinRadicado] = useState(false);
  const [motivoSinRadicado, setMotivoSinRadicado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [empresaAmb, setEmpresaAmb] = useState("");
  const [tipoAmb, setTipoAmb] = useState("");
  const [horaCoord, setHoraCoord] = useState("");
  const [firma, setFirma] = useState<FirmaLlegadaInfo | null>(null);
  const [entregaOpen, setEntregaOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEvento("");
    setCanal("");
    setCanalOtro("");
    setObservaciones("");
    setFecha("");
    setProveedor("");
    setServicio("");
    setNumRadicado("");
    setSinRadicado(false);
    setMotivoSinRadicado("");
    setMotivo("");
    setResponsable("");
    setEspecialidad("");
    setEmpresaAmb((empresaTraslado ?? "").toUpperCase());
    setTipoAmb((tipoAmbulanciaCodigo ?? "").toUpperCase());
    setHoraCoord("");
    setFirma(null);
  }, [open, empresaTraslado, tipoAmbulanciaCodigo]);

  // Preselecciona el único servicio pendiente de aceptación.
  useEffect(() => {
    if (evento === "ACEPTACION_PROVEEDOR" || evento === "NO_ACEPTACION_PROVEEDOR") {
      if (!servicio && req.aceptacionesPendientes.length === 1) {
        setServicio(req.aceptacionesPendientes[0]);
      }
    }
  }, [evento, servicio, req.aceptacionesPendientes]);

  const { data: empresas = [] } = useQuery({
    queryKey: ["cat-empresa-tep"],
    enabled: open && evento === "AMBULANCIA_COORDINADA",
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

  const canalFinal = canal === "OTRO" ? canalOtro.trim().toUpperCase() : canal;
  const requiereServicio =
    evento === "ACEPTACION_PROVEEDOR" || evento === "NO_ACEPTACION_PROVEEDOR";

  const errores: string[] = [];
  if (!evento) errores.push("Seleccione el tipo de seguimiento.");
  if (evento && !canalFinal) errores.push("Seleccione un canal de gestión.");
  if (requiereServicio && !servicio) errores.push("Seleccione el servicio al que aplica.");
  if (evento === "RADICACION" && !sinRadicado && !numRadicado.trim())
    errores.push("Ingrese el número de radicado o marque 'Sin número'.");
  if (evento === "RADICACION" && sinRadicado && !motivoSinRadicado.trim())
    errores.push("Indique el motivo de no tener radicado.");
  if (evento === "ACEPTACION_PROVEEDOR" && !proveedor.trim())
    errores.push("Indique el proveedor que acepta.");
  if (evento === "NO_ACEPTACION_PROVEEDOR" && (!proveedor.trim() || !motivo.trim()))
    errores.push("Proveedor y motivo son obligatorios.");
  if (evento === "CONFIRMACION_ENTREGA_OXIGENO" && (!proveedor.trim() || !fecha.trim()))
    errores.push("Proveedor y fecha/hora de entrega son obligatorios.");
  if (evento === "AMBULANCIA_COORDINADA" && (!empresaAmb.trim() || !tipoAmb.trim() || !fecha.trim()))
    errores.push("Empresa, tipo de ambulancia y fecha/hora son obligatorios.");
  if (evento === "CONFIRMACION_LLEGADA_AMBULANCIA" && !firma)
    errores.push("Se requiere la firma QR de llegada de la ambulancia.");
  if (evento === "CIERRE_POR_EGRESO" && (!responsable.trim() || !fecha.trim()))
    errores.push("Fecha/hora real de egreso y responsable son obligatorios.");
  if (evento === "CANCELACION_PROVEEDOR" && (!proveedor.trim() || !motivo.trim()))
    errores.push("Proveedor y motivo de cancelación son obligatorios.");
  if (evento === "CANCELACION_ESPECIALIDAD" && (!especialidad.trim() || !motivo.trim()))
    errores.push("Especialidad y motivo de cancelación son obligatorios.");

  const invalid = errores.length > 0 || terminal;

  const detalleLegible = () => {
    const p: string[] = [`TIPO: ${EVENTO_LABEL[evento] ?? evento}`];
    if (canalFinal) p.push(`CANAL: ${canalFinal}`);
    if (servicio) p.push(`SERVICIO: ${SERVICIO_LABEL[servicio]}`);
    if (proveedor.trim()) p.push(`PROVEEDOR: ${proveedor.trim().toUpperCase()}`);
    if (evento === "RADICACION")
      p.push(sinRadicado ? "N° RADICADO: SIN NÚMERO" : `N° RADICADO: ${numRadicado.trim()}`);
    if (evento === "AMBULANCIA_COORDINADA") {
      p.push(`EMPRESA: ${empresaAmb.trim().toUpperCase()}`);
      p.push(`TIPO AMB: ${TIPO_AMBULANCIA_LABEL[tipoAmb as keyof typeof TIPO_AMBULANCIA_LABEL] ?? tipoAmb}`);
    }
    if (fecha) p.push(`FECHA/HORA: ${fecha}`);
    if (responsable.trim()) p.push(`RESPONSABLE: ${responsable.trim().toUpperCase()}`);
    if (especialidad.trim()) p.push(`ESPECIALIDAD: ${especialidad.trim().toUpperCase()}`);
    if (motivo.trim()) p.push(`MOTIVO: ${motivo.trim().toUpperCase()}`);
    if (observaciones.trim()) p.push(`OBSERVACIONES: ${observaciones.trim()}`);
    return p.join(" · ");
  };

  const mGuardar = useMutation({
    mutationFn: async () => {
      const res = await registrarEvento({
        data: {
          casoId,
          evento: evento as never,
          tipoSeguimiento: EVENTO_LABEL[evento] ?? evento,
          detalle: detalleLegible(),
          servicioCodigo: (servicio || undefined) as never,
          proveedor: proveedor.trim().toUpperCase() || undefined,
          canal: canalFinal || undefined,
          motivo: motivo.trim().toUpperCase() || undefined,
          especialidad: especialidad.trim().toUpperCase() || undefined,
          responsable: responsable.trim().toUpperCase() || undefined,
          numeroRadicado: sinRadicado
            ? `SIN NÚMERO — ${motivoSinRadicado.trim().toUpperCase()}`
            : numRadicado.trim() || undefined,
          empresaAmbulanciaLabel: empresaAmb.trim().toUpperCase() || undefined,
          tipoAmbulanciaCodigo: (tipoAmb || undefined) as never,
          fechaCoordinacion: evento === "AMBULANCIA_COORDINADA" ? fecha : undefined,
          horaCoordinacion: horaCoord || undefined,
          fechaEvento: fecha || undefined,
          firmaId: firma?.id,
          observaciones: observaciones.trim() || undefined,
        },
      });
      if (!res.ok) throw new Error(res.error ?? "No fue posible registrar el evento.");
      return res;
    },
    onSuccess: (res) => {
      toast.success(`Evento registrado — estado: ${res.estadoCiclo ?? "actualizado"}`);
      qc.invalidateQueries({ queryKey: ["phd-seguimientos", casoId] });
      qc.invalidateQueries({ queryKey: ["phd-radicaciones", casoId] });
      qc.invalidateQueries({ queryKey: ["domiciliarios"] });
      qc.invalidateQueries({ queryKey: ["indigo-caso", "domiciliarios", casoId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const puedeEntregaDocumental = req.ambulanciaAplica && req.ambulanciaCoordinada;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        {/* Contexto y estado automático */}
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
              <Lock className="mr-1 h-3 w-3" /> {estado}
            </Badge>
          </div>
          <p className="mt-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Estado del caso — automático, calculado por los requisitos pendientes.
          </p>
        </div>

        {/* Tablero de requisitos */}
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Requisitos del ciclo
          </p>
          {req.tipos.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Este caso no tiene tipos de solicitud registrados.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {req.tipos
                .filter((t) => SERVICIOS_CON_ACEPTACION.includes(t))
                .map((t) => (
                  <Requisito
                    key={t}
                    ok={req.aceptacionesCompletas.includes(t)}
                    label={`Aceptación · ${SERVICIO_LABEL[t]}${
                      t === "UNIDADES_ESPECIALES" && unidadEspecialSolicitada
                        ? ` (${unidadEspecialSolicitada})`
                        : ""
                    }`}
                  />
                ))}
              {req.oxigenoAplica && (
                <Requisito ok={req.oxigenoEntregado} label="Entrega de oxígeno confirmada" />
              )}
              {req.ambulanciaAplica && (
                <>
                  <Requisito ok={req.ambulanciaCoordinada} label="Ambulancia coordinada" />
                  <Requisito
                    ok={req.ambulanciaEnSitio}
                    label="Llegada de ambulancia confirmada (firma QR)"
                  />
                </>
              )}
              <Requisito ok={terminal} label="Egreso registrado" />
            </ul>
          )}
        </div>

        {terminal ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mr-1 inline h-3 w-3" />
            El caso está cerrado. No se permiten nuevos seguimientos operativos desde este modal.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase">Tipo de seguimiento *</Label>
                <Select
                  value={evento}
                  onValueChange={(v) => {
                    setEvento(v);
                    setServicio("");
                    setFirma(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar evento…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventosDisponibles.map((code) => (
                      <SelectItem key={code} value={code}>
                        {EVENTO_LABEL[code] ?? code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

            {requiereServicio && (
              <div className="space-y-1.5">
                <Label className="text-xs">Servicio al que aplica *</Label>
                <Select value={servicio} onValueChange={(v) => setServicio(v as ServicioCodigo)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar servicio…" />
                  </SelectTrigger>
                  <SelectContent>
                    {req.aceptacionesPendientes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {SERVICIO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {(evento === "ACEPTACION_PROVEEDOR" ||
              evento === "NO_ACEPTACION_PROVEEDOR" ||
              evento === "RESPUESTA_PROVEEDOR" ||
              evento === "CANCELACION_PROVEEDOR") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Proveedor {evento === "RESPUESTA_PROVEEDOR" ? "" : "*"}
                  </Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
                {evento !== "RESPUESTA_PROVEEDOR" && evento !== "ACEPTACION_PROVEEDOR" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Motivo *</Label>
                    <Input value={motivo} onChange={(e) => setMotivo(e.target.value.toUpperCase())} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora del evento</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
              </div>
            )}

            {evento === "CONFIRMACION_ENTREGA_OXIGENO" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor de oxígeno *</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora de entrega *</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Recibe / responsable</Label>
                  <Input
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            {evento === "AMBULANCIA_COORDINADA" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Empresa de ambulancia *</Label>
                  <Select value={empresaAmb} onValueChange={setEmpresaAmb}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(empresas.length ? empresas : empresaAmb ? [empresaAmb] : []).map((e) => (
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
                      {TIPOS_AMBULANCIA_CODIGOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_AMBULANCIA_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha/hora coordinada *</Label>
                  <Input
                    type="datetime-local"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hora pactada (texto libre)</Label>
                  <Input value={horaCoord} onChange={(e) => setHoraCoord(e.target.value)} />
                </div>
              </div>
            )}

            {evento === "CONFIRMACION_LLEGADA_AMBULANCIA" && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  La llegada se confirma con la firma del responsable de la ambulancia mediante el
                  código QR. Al firmar, el evento queda habilitado para registro.
                </p>
                <RiLlegadaQRPanel
                  casoId={casoId}
                  paciente={paciente}
                  documento={documento ?? null}
                  unidadDestino={ipsReceptora ?? null}
                  radicadoCaso={radicadoCaso ?? null}
                  tipoCaso="domiciliario"
                  empresaTraslado={empresaAmb || empresaTraslado || null}
                  onFirmada={(info) => setFirma(info)}
                />
                {firma && (
                  <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    Firma verificada · {fmtFechaHora(firma.firmadoAtISO)}
                  </p>
                )}
              </div>
            )}

            {evento === "CIERRE_POR_EGRESO" && (
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

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase">Observaciones</Label>
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
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

        {/* Historial */}
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

function Requisito({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-green" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
