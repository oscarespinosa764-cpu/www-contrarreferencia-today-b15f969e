import { ordenarTiposSeguimiento } from "@/lib/seguimiento-orden";
// ---------------------------------------------------------------------------
// FASE 5D · Bloque C — Modal de seguimiento PHD / PAD / PAD CRÓNICO / O2 /
// UNIDADES ESPECIALES / AMBULANCIA PARA EGRESO.
//
// Principios:
// - El ESTADO es server-authoritative (private.resolver_estado_phd).
// - Catálogo de tipos normalizado (Bloque C): Aceptación de trámite, Radicado
//   del caso (solo si la EAPB lo exige), Evolución diaria, Novedades, Otro,
//   entrega de oxígeno, coordinación/llegada de ambulancia, confirmación de
//   egreso y una única Cancelación de trámite (terminal).
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
import { AppDateTimeInput } from "@/components/ui/app-time-picker";
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
import { FileSignature, Info, Lock } from "lucide-react";
import { EntregaDocumentalDialog } from "./entrega-documental-dialog";
import { RiLlegadaQRPanel, type FirmaLlegadaInfo } from "./ri-llegada-qr-panel";
import {
  EvolucionDiariaFields,
  EVOLUCION_DIARIA_INICIAL,
  derivarEvolucionDiaria,
  type EvolucionDiariaValue,
} from "./evolucion-diaria-fields";


import {
  CanalGestionField,
  SeguimientoHeaderCard,
  InformacionTramiteFields,
  INFORMACION_TRAMITE_INICIAL,
  erroresInformacionTramite,
  plantillaInformacionTramite,
  type InformacionTramiteValue,
} from "./seguimiento-shell";
import {
  CANAL_GESTION_INICIAL,
  canalGestionPersist,
  dualCanalPermitido,
  erroresCanalGestion,
  plantillaCanalGestion,
  type CanalGestionValue,
} from "@/lib/canal-gestion";
import {
  SeguimientoHistoricos,
  SeguimientoValidationSummary,
  type SeguimientoRow,
} from "./seguimiento-historicos";


const CON_DESCRIPCION = ["NOVEDADES", "OTRO"];

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

  // --- ¿La EAPB del caso exige radicación? (catálogo de EAPB) -----------------
  const { data: exigeRadicacion = false } = useQuery({
    queryKey: ["phd-eapb-radica", casoId],
    enabled: open && !!casoId,
    queryFn: async () => {
      const { data: caso } = await supabase
        .from("domiciliarios")
        .select("eapb")
        .eq("id", casoId)
        .maybeSingle();
      const eapb = String((caso as { eapb?: string } | null)?.eapb ?? "").trim();
      if (!eapb) return false;
      const { data: cat } = await supabase
        .from("catalogos")
        .select("valor, radica_phd, radica_pad, radica_oxigeno, radica_unidad_especial")
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .ilike("valor", eapb)
        .maybeSingle();
      if (!cat) return false;
      const c = cat as Record<string, boolean | string | null>;
      const t = req.tipos;
      if (t.includes("PHD") && c.radica_phd) return true;
      if ((t.includes("PAD") || t.includes("PAD_CRONICO")) && c.radica_pad) return true;
      if (t.includes("OXIGENO_DOMICILIARIO") && c.radica_oxigeno) return true;
      if (t.includes("UNIDADES_ESPECIALES") && c.radica_unidad_especial) return true;
      return false;
    },
  });

  const radicacionRegistrada = eventosCiclo.some(
    (e) => (e.evento ?? "").toUpperCase() === "RADICACION",
  );

  const eventosDisponibles = useMemo(
    () =>
      terminal
        ? []
        : ordenarTiposSeguimiento(
            calcularEventos(req, { exigeRadicacion, radicacionRegistrada }),
          ),
    [req, terminal, exigeRadicacion, radicacionRegistrada],
  );

  // --- Formulario -------------------------------------------------------------
  const [evento, setEvento] = useState("");
  const [canalV, setCanalV] = useState<CanalGestionValue>(CANAL_GESTION_INICIAL);
  const [observaciones, setObservaciones] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [servicio, setServicio] = useState<ServicioCodigo | "">("");
  const [numRadicado, setNumRadicado] = useState("");
  const [sinRadicado, setSinRadicado] = useState(false);
  const [motivoSinRadicado, setMotivoSinRadicado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [empresaAmb, setEmpresaAmb] = useState("");
  const [tipoAmb, setTipoAmb] = useState("");
  const [firma, setFirma] = useState<FirmaLlegadaInfo | null>(null);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [evo, setEvo] = useState<EvolucionDiariaValue>(EVOLUCION_DIARIA_INICIAL);
  const [infoTramite, setInfoTramite] = useState<InformacionTramiteValue>(
    INFORMACION_TRAMITE_INICIAL,
  );


  useEffect(() => {
    if (!open) return;
    setEvento("");
    setCanalV(CANAL_GESTION_INICIAL);
    setObservaciones("");
    setDescripcion("");
    setFecha("");
    setProveedor("");
    setServicio("");
    setNumRadicado("");
    setSinRadicado(false);
    setMotivoSinRadicado("");
    setMotivo("");
    setResponsable("");
    setEmpresaAmb((empresaTraslado ?? "").toUpperCase());
    setTipoAmb((tipoAmbulanciaCodigo ?? "").toUpperCase());
    setFirma(null);
    setEvo(EVOLUCION_DIARIA_INICIAL);
    setInfoTramite(INFORMACION_TRAMITE_INICIAL);

  }, [open, empresaTraslado, tipoAmbulanciaCodigo]);

  // Preselecciona el único servicio pendiente de aceptación.
  useEffect(() => {
    if (evento === "ACEPTACION_PROVEEDOR" && !servicio && req.aceptacionesPendientes.length === 1) {
      setServicio(req.aceptacionesPendientes[0]);
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

  const canalPersist = canalGestionPersist(canalV);
  const canalFinal = canalPersist.canal_gestion ?? "";
  const esInfoTramite = evento === "INFORMACION_TRAMITE";
  const requiereServicio = evento === "ACEPTACION_PROVEEDOR";
  const requiereDescripcion = CON_DESCRIPCION.includes(evento);
  const esEvolucionDiaria = evento === "EVOLUCION_DIARIA";

  // Configuración canónica de la EAPB del caso (catálogo EAPB activo).
  const { data: eapbCfg = { plataforma: false, correo: false, existe: false } } = useQuery({
    queryKey: ["phd-eapb-cfg", casoId],
    enabled: open && !!casoId,
    queryFn: async () => {
      const { data: caso } = await supabase
        .from("domiciliarios")
        .select("eapb")
        .eq("id", casoId)
        .maybeSingle();
      const eapb = String((caso as { eapb?: string } | null)?.eapb ?? "").trim();
      if (!eapb) return { plataforma: false, correo: false, existe: false };
      const { data: cat } = await supabase
        .from("catalogos")
        .select("valor, seguimientos_en_plataforma, eapb_correo_radicacion")
        .eq("tipo", "EAPB")
        .eq("activo", true)
        .ilike("valor", eapb)
        .maybeSingle();
      const row = cat as
        | { seguimientos_en_plataforma?: boolean; eapb_correo_radicacion?: string | null }
        | null;
      return {
        existe: !!row,
        plataforma: row?.seguimientos_en_plataforma === true,
        correo: !!(row?.eapb_correo_radicacion ?? "").trim(),
      };
    },
  });
  const segEnPlataforma = eapbCfg.plataforma;
  // FASE 5E · C.1 — doble canal condicionado por catálogo (fail-closed).
  const dualPermitido = dualCanalPermitido({
    esEvolucionDiaria: evento === "EVOLUCION_DIARIA",
    catalogoActivo: eapbCfg.existe,
    evolucionPorCorreo: eapbCfg.correo,
    evolucionPorPlataforma: eapbCfg.plataforma,
  });

  const evoCtx = useMemo(
    () => ({
      segEnPlataforma,
      correoRequerido: eapbCfg.correo,
      canalesRealizados: canalV.canales,
      especialidades: [] as string[],
      estadoCaso: estado,
      esTramiteAdministrativo: false,
      observacion: observaciones,
    }),
    [segEnPlataforma, eapbCfg.correo, canalV.canales, estado, observaciones],
  );
  const evoDeriv = useMemo(() => derivarEvolucionDiaria(evo, evoCtx), [evo, evoCtx]);

  const errores: string[] = [];
  if (!evento) errores.push("Seleccione el tipo de seguimiento.");
  if (evento) errores.push(...erroresCanalGestion(canalV, { dualPermitido }));
  if (requiereServicio && !servicio) errores.push("Seleccione el servicio al que aplica.");
  if (requiereDescripcion && descripcion.trim().length < 3)
    errores.push("Escriba la descripción del seguimiento.");
  if (esEvolucionDiaria) errores.push(...evoDeriv.errores);
  if (esInfoTramite) errores.push(...erroresInformacionTramite(infoTramite));
  if (evento === "RADICACION" && !sinRadicado && !numRadicado.trim())
    errores.push("Ingrese el número de radicado o marque 'Sin número'.");
  if (evento === "RADICACION" && sinRadicado && !motivoSinRadicado.trim())
    errores.push("Indique el motivo de no tener radicado.");

  if (evento === "ACEPTACION_PROVEEDOR" && !proveedor.trim())
    errores.push("Indique el proveedor que acepta.");
  if (evento === "CONFIRMACION_ENTREGA_OXIGENO" && (!proveedor.trim() || !fecha.trim()))
    errores.push("Proveedor y fecha/hora de entrega son obligatorios.");
  if (evento === "AMBULANCIA_COORDINADA" && (!empresaAmb.trim() || !tipoAmb.trim() || !fecha.trim()))
    errores.push("Empresa, tipo de ambulancia y fecha/hora son obligatorios.");
  if (evento === "CONFIRMACION_LLEGADA_AMBULANCIA" && !firma)
    errores.push("Se requiere la firma QR de llegada de la ambulancia.");
  if (evento === "CIERRE_POR_EGRESO" && !fecha.trim())
    errores.push("Indique la fecha y hora real del egreso.");
  if (evento === "CANCELACION_TRAMITE" && !motivo.trim())
    errores.push("Indique el motivo de la cancelación del trámite.");

  const invalid = errores.length > 0 || terminal;

  // Para EVOLUCIÓN DIARIA la descripción es la plantilla Índigo canónica.
  const descripcionFinal = esEvolucionDiaria
    ? evoDeriv.plantilla
    : esInfoTramite
      ? plantillaInformacionTramite(infoTramite, canalFinal, observaciones)
      : descripcion.trim();

  const detalleLegible = () => {
    const p: string[] = [`TIPO: ${EVENTO_LABEL[evento] ?? evento}`];
    const bloqueCanal = plantillaCanalGestion(canalPersist);
    if (bloqueCanal) p.push(bloqueCanal.replace(/\n/g, " · "));
    if (servicio) p.push(`SERVICIO: ${SERVICIO_LABEL[servicio]}`);
    if (proveedor.trim()) p.push(`PROVEEDOR: ${proveedor.trim().toUpperCase()}`);
    if (evento === "RADICACION")
      p.push(sinRadicado ? "N° RADICADO: SIN NÚMERO" : `N° RADICADO: ${numRadicado.trim()}`);
    if (evento === "AMBULANCIA_COORDINADA") {
      p.push(`EMPRESA: ${empresaAmb.trim().toUpperCase()}`);
      p.push(
        `TIPO AMB: ${TIPO_AMBULANCIA_LABEL[tipoAmb as keyof typeof TIPO_AMBULANCIA_LABEL] ?? tipoAmb}`,
      );
    }
    if (esEvolucionDiaria) {
      const canales = evoDeriv.resolver.canales_realizados.join(" + ");
      if (canales) p.push(`ENVÍO EAPB: ${canales}`);
      if (segEnPlataforma && evo.plataformaFunc)
        p.push(`PLATAFORMA FUNCIONANDO: ${evo.plataformaFunc}`);
      if (evo.motivoPend.trim()) p.push(`MOTIVO PENDIENTE: ${evo.motivoPend.trim().toUpperCase()}`);
    }
    if (fecha) p.push(`FECHA/HORA: ${fecha}`);
    if (descripcionFinal) p.push(`DESCRIPCIÓN: ${descripcionFinal}`);
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
          descripcion: descripcionFinal || undefined,

          servicioCodigo: (servicio || undefined) as never,
          proveedor: proveedor.trim().toUpperCase() || undefined,
          canal: canalFinal || undefined,
          canales: canalPersist.canales_gestion.length ? canalPersist.canales_gestion : undefined,
          motivo: motivo.trim().toUpperCase() || undefined,
          numeroRadicado: sinRadicado
            ? `SIN NÚMERO — ${motivoSinRadicado.trim().toUpperCase()}`
            : numRadicado.trim() || undefined,
          empresaAmbulanciaLabel: empresaAmb.trim().toUpperCase() || undefined,
          tipoAmbulanciaCodigo: (tipoAmb || undefined) as never,
          fechaCoordinacion: evento === "AMBULANCIA_COORDINADA" ? fecha : undefined,
          fechaEvento: fecha || undefined,
          firmaId: firma?.id,
          observaciones: observaciones.trim() || undefined,
          nombreSolicitante: esInfoTramite ? infoTramite.solicitante.trim() : undefined,
          parentescoSolicitante: esInfoTramite ? infoTramite.parentesco.trim() : undefined,
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
          <DialogTitle className="text-base uppercase tracking-wide">
            SEGUIMIENTOS - ATENCIÓN DOMICILIARIA
          </DialogTitle>
        </DialogHeader>

        {/* Tarjeta de contexto del caso (unificada FASE 5E · Bloque A) */}
        <SeguimientoHeaderCard
          paciente={paciente}
          documento={documento}
          tipoDocumento={tipoDocumento}
          estado={estado}
          contexto={[
            ipsReceptora ? `IPS: ${ipsReceptora}` : "",
            unidadEspecialSolicitada || "",
          ]
            .filter(Boolean)
            .join(" · ")}
        />


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
                    <SelectValue placeholder="Seleccionar tipo…" />
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

              <CanalGestionField
                value={canalV}
                onChange={setCanalV}
                dualPermitido={dualPermitido}
              />

            </div>

            {esInfoTramite && (
              <InformacionTramiteFields value={infoTramite} onChange={setInfoTramite} />
            )}

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
                  <Label className="text-xs">Fecha y hora del evento</Label>
                  <AppDateTimeInput name="phd_fecha_evento" value={fecha} onChange={setFecha} />
                </div>
              </div>
            )}

            {evento === "RADICACION" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">EAPB / Entidad ante la que se radica</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value.toUpperCase())}
                    placeholder={entidadPago || "EAPB"}
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
                  <Label className="text-xs">Fecha y hora de radicación</Label>
                  <AppDateTimeInput name="phd_fecha_evento" value={fecha} onChange={setFecha} />
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

            {esEvolucionDiaria && (
              <EvolucionDiariaFields
                value={evo}
                onChange={setEvo}
                ctx={evoCtx}
                derivado={evoDeriv}
              />
            )}

            {requiereDescripcion && (
              <div className="space-y-1.5">
                <Label className="text-xs">Descripción *</Label>
                <Textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder={
                    evento === "NOVEDADES" ? "Novedad presentada…" : "Describa el seguimiento…"
                  }
                />
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
                  <Label className="text-xs">Fecha y hora de entrega *</Label>
                  <AppDateTimeInput name="phd_fecha_evento" value={fecha} onChange={setFecha} />
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
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Fecha y hora coordinada *</Label>
                  <AppDateTimeInput name="phd_fecha_evento" value={fecha} onChange={setFecha} />
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
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha y hora real del egreso *</Label>
                <AppDateTimeInput name="phd_fecha_evento" value={fecha} onChange={setFecha} />
                <p className="text-[11px] text-muted-foreground">
                  El responsable queda registrado automáticamente con el usuario de la sesión.
                </p>
              </div>
            )}

            {evento === "CANCELACION_TRAMITE" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo de la cancelación *</Label>
                <Textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo obligatorio…"
                />
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Esta acción cierra el caso de forma definitiva.
                </p>
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

            <SeguimientoValidationSummary errores={errores} />
          </div>
        )}

        {/* HISTÓRICOS (FASE 5E · Bloque B) */}
        <div className="mt-3">
          <SeguimientoHistoricos
            items={historial as unknown as SeguimientoRow[]}
            metaDe={(h) => {
              const d = (h.detalles ?? {}) as Record<string, unknown>;
              if (!d.estado_anterior && !d.estado_nuevo) return null;
              return `${String(d.estado_anterior ?? "")} → ${String(d.estado_nuevo ?? "")}`;
            }}
          />
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
