import { TimeField } from "@/components/ui/time-field";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { dispatchEventNotification } from "@/lib/notifications.functions";
import { maskNombre } from "@/lib/notifications-utils";
import { getFirmaActiva, guardarFirma } from "@/lib/firmas-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { minutosEntreHoras } from "@/lib/cuadro-turno-utils";
import {
  useShiftTypes,
  describeTurno,
  buscarTurnoProgramado,
  minutosAHoras,
  esExento,
  LIMITE_MENSUAL,
  type ReturnFragment,
  type ShiftTypeRow,
} from "@/lib/solicitudes-utils";
import { subirSoporte, eliminarSoporte, type SoporteMetadata } from "@/lib/soportes-utils";
import { Paperclip, Plus, Trash2, X } from "lucide-react";

const SEDE_FIJA = "CLINICA GLORIA PATRICIA PINZON";
const CAMBIO_TURNO = "Cambio de turno";

interface MotivoOpt {
  valor: string;
  recuperable: boolean;
}

interface Funcionario {
  nombre: string;
  cargo: string | null;
  userId: string | null;
}

// ---------------------------------------------------------------------------
// Editor de una fracción de devolución (reutilizable para devolución única
// y para cada fila cuando la devolución es en varias fracciones).
// ---------------------------------------------------------------------------
function FraccionEditor({
  frag,
  index,
  funcionarios,
  shiftTypes,
  onChange,
  onRemove,
}: {
  frag: ReturnFragment;
  index: number;
  funcionarios: Funcionario[];
  shiftTypes: Record<string, ShiftTypeRow> | undefined;
  onChange: (f: ReturnFragment) => void;
  onRemove?: () => void;
}) {
  const info = describeTurno(frag.shift_code, shiftTypes);
  const minutos = minutosEntreHoras(frag.start_time, frag.end_time);

  // Al fijar receptor + fecha, consultar el turno programado del receptor.
  useEffect(() => {
    if (!frag.receiver_id || !frag.return_date) return;
    let cancel = false;
    (async () => {
      const t = await buscarTurnoProgramado({ userId: frag.receiver_id, fecha: frag.return_date! });
      if (cancel) return;
      onChange({ ...frag, shift_code: t?.shift_code ?? frag.shift_code ?? null });
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frag.receiver_id, frag.return_date]);

  const setReceiver = (nombre: string) => {
    const f = funcionarios.find((x) => x.nombre === nombre);
    onChange({
      ...frag,
      receiver_name: nombre,
      receiver_id: f?.userId ?? null,
      receiver_role: f?.cargo ?? null,
    });
  };

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Fracción {index + 1}
        </span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-rose-600"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Funcionario que recibe el retorno</Label>
          <Select value={frag.receiver_name || ""} onValueChange={setReceiver}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona funcionario" />
            </SelectTrigger>
            <SelectContent>
              {funcionarios.length === 0 ? (
                <SelectItem value="__none" disabled>
                  Sin funcionarios
                </SelectItem>
              ) : (
                funcionarios.map((f) => (
                  <SelectItem key={f.nombre} value={f.nombre}>
                    {f.nombre}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Cargo</Label>
          <Input
            value={frag.receiver_role || ""}
            readOnly
            className="bg-muted/40"
            placeholder="Automático"
          />
        </div>
        <div>
          <Label className="text-xs">Fecha de devolución</Label>
          <Input
            type="date"
            value={frag.return_date || ""}
            onChange={(e) => onChange({ ...frag, return_date: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Turno programado</Label>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-2 text-xs">
            {info ? (
              <>
                <span className="font-semibold">{info.name}</span>
                <span className="text-muted-foreground">{info.horario}</span>
                <span className="ml-auto rounded bg-vitalis-blue/15 px-1.5 py-0.5 font-bold text-vitalis-blue">
                  {info.code}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {frag.receiver_name && frag.return_date ? "Sin turno ese día" : "Automático"}
              </span>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs">Hora inicial de devolución</Label>
          <TimeField
            value={frag.start_time || ""}
            onChange={(v) =>
              onChange({ ...frag, start_time: v, minutes: minutosEntreHoras(v, frag.end_time) })
            }
          />
        </div>
        <div>
          <Label className="text-xs">Hora final de devolución</Label>
          <TimeField
            value={frag.end_time || ""}
            onChange={(v) =>
              onChange({ ...frag, end_time: v, minutes: minutosEntreHoras(frag.start_time, v) })
            }
          />
        </div>
        <div className="col-span-2 flex items-center gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-1 font-semibold">
            Total: {minutosAHoras(minutos)}
          </span>
          <span className="text-muted-foreground">
            El horario puede ajustarse cuando la devolución corresponda a una fracción del turno.
          </span>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Observaciones</Label>
          <Input
            value={frag.notes || ""}
            onChange={(e) => onChange({ ...frag, notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

const nuevaFraccion = (n: number, receiver?: Funcionario | null): ReturnFragment => ({
  fragment_no: n,
  return_date: null,
  receiver_id: receiver?.userId ?? null,
  receiver_name: receiver?.nombre ?? null,
  receiver_role: receiver?.cargo ?? null,
  shift_code: null,
  start_time: null,
  end_time: null,
  minutes: 0,
  notes: null,
});

export function SolicitudFormDialog({
  open,
  onOpenChange,
  defaultCambio,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCambio?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const padRef = useRef<SignaturePadHandle>(null);
  const dispatchNotif = useServerFn(dispatchEventNotification);
  const { data: shiftTypes } = useShiftTypes();

  const [perfil, setPerfil] = useState<{ nombre: string; doc: string; cargo: string } | null>(null);
  const [firmaActiva, setFirmaActiva] = useState<{
    id: string;
    hash: string | null;
    signedUrl: string | null;
  } | null>(null);
  const [loadingFirma, setLoadingFirma] = useState(true);

  const [esCambio, setEsCambio] = useState(!!defaultCambio);
  const [motivo, setMotivo] = useState<string>(defaultCambio ? CAMBIO_TURNO : "");
  const [otro, setOtro] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [recupera, setRecupera] = useState(false);
  const [reqReemplazo, setReqReemplazo] = useState(false);
  const [remunerado, setRemunerado] = useState(false);
  const [reempNombre, setReempNombre] = useState("");
  const [reempCargo, setReempCargo] = useState("");
  const [reempUserId, setReempUserId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // Turno programado del solicitante en la fecha inicial
  const [turnoSolicitanteCode, setTurnoSolicitanteCode] = useState<string | null>(null);
  const [buscandoTurno, setBuscandoTurno] = useState(false);
  // Devolución del tiempo (una o varias fracciones)
  const [fraccionado, setFraccionado] = useState(false);
  const [fracciones, setFracciones] = useState<ReturnFragment[]>([]);
  // Cambio de turno
  const [origFecha, setOrigFecha] = useState("");
  const [origTurno, setOrigTurno] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevoTurno, setNuevoTurno] = useState("");
  const [companero, setCompanero] = useState("");
  // Soporte / evidencia
  const [soporte, setSoporte] = useState<SoporteMetadata | null>(null);
  const [subiendoSoporte, setSubiendoSoporte] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmo, setConfirmo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Límite mensual / excepción
  const [limiteOpen, setLimiteOpen] = useState(false);
  const [uso, setUso] = useState<{
    solicitudes: number;
    coberturas: number;
    pendientes: number;
    total: number;
  } | null>(null);
  const [excMode, setExcMode] = useState<"aviso" | "motivo">("aviso");
  const [excMotivo, setExcMotivo] = useState("");
  const [excSaving, setExcSaving] = useState(false);

  // ---- Catálogo de motivos (recuperable / no recuperable) ----
  const { data: motivos = [] } = useQuery({
    queryKey: ["motivos-permiso"],
    queryFn: async (): Promise<MotivoOpt[]> => {
      const { data } = await supabase
        .from("catalogos")
        .select("valor, extra1")
        .eq("tipo", "MOTIVO_PERMISO")
        .eq("activo", true)
        .order("valor");
      return (data ?? []).map((r) => ({
        valor: r.valor,
        recuperable: (r.extra1 || "").toUpperCase() === "RECUPERABLE",
      }));
    },
  });

  // ---- Funcionarios (todo el personal activo) ----
  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios-personal"],
    queryFn: async (): Promise<Funcionario[]> => {
      const [{ data: members }, { data: profs }] = await Promise.all([
        supabase
          .from("shift_schedule_members")
          .select("full_name, role_name, user_id")
          .eq("active", true),
        supabase.from("profiles").select("nombre, cargo, user_id").eq("activo", true),
      ]);
      const map = new Map<string, Funcionario>();
      (profs ?? []).forEach((p) => {
        const nombre = (p.nombre || "").trim();
        if (!nombre) return;
        if (!map.has(nombre)) map.set(nombre, { nombre, cargo: p.cargo, userId: p.user_id });
      });
      (members ?? []).forEach((m) => {
        const nombre = (m.full_name || "").trim();
        if (!nombre) return;
        const prev = map.get(nombre);
        if (!prev) map.set(nombre, { nombre, cargo: m.role_name, userId: m.user_id });
        else if (!prev.cargo && m.role_name) prev.cargo = m.role_name;
      });
      return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
  });

  useEffect(() => {
    if (!open || !user) return;
    setEsCambio(!!defaultCambio);
    setMotivo(defaultCambio ? CAMBIO_TURNO : "");
    setLoadingFirma(true);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nombre, numero_documento, cargo")
        .eq("user_id", user.id)
        .maybeSingle();
      setPerfil({
        nombre: data?.nombre || user.email || "",
        doc: data?.numero_documento || "",
        cargo: data?.cargo || "",
      });
      const fa = await getFirmaActiva(user.id);
      setFirmaActiva(fa);
      setLoadingFirma(false);
    })();
  }, [open, user, defaultCambio]);

  // Turno programado del solicitante al elegir la fecha inicial.
  useEffect(() => {
    if (esCambio || !user || !startDate) {
      setTurnoSolicitanteCode(null);
      return;
    }
    let cancel = false;
    (async () => {
      setBuscandoTurno(true);
      const t = await buscarTurnoProgramado({
        userId: user.id,
        fullName: perfil?.nombre,
        fecha: startDate,
      });
      if (cancel) return;
      setTurnoSolicitanteCode(t?.shift_code ?? null);
      setBuscandoTurno(false);
    })();
    return () => {
      cancel = true;
    };
  }, [esCambio, user, startDate, perfil?.nombre]);

  const handleMotivo = (v: string) => {
    setMotivo(v);
    const cambio = v === CAMBIO_TURNO;
    setEsCambio(cambio);
    if (!cambio) {
      const opt = motivos.find((m) => m.valor === v);
      const rec = !!opt?.recuperable;
      setRecupera(rec);
      if (!rec) {
        setReqReemplazo(false);
        setRemunerado(false);
        setReempNombre("");
        setReempCargo("");
        setReempUserId(null);
        setFracciones([]);
        setFraccionado(false);
      }
    }
  };

  useEffect(() => {
    if (recupera && !esCambio) {
      setReqReemplazo(true);
      setRemunerado(true);
      setFracciones((prev) => (prev.length === 0 ? [nuevaFraccion(1)] : prev));
    }
  }, [recupera, esCambio]);

  const handleReemplazo = (nombre: string) => {
    setReempNombre(nombre);
    const f = funcionarios.find((x) => x.nombre === nombre);
    setReempCargo(f?.cargo || "");
    setReempUserId(f?.userId || null);
    // Sugerir el mismo funcionario como receptor de la devolución (editable).
    setFracciones((prev) =>
      prev.map((fr, i) =>
        i === 0 && !fr.receiver_name
          ? {
              ...fr,
              receiver_name: nombre,
              receiver_id: f?.userId ?? null,
              receiver_role: f?.cargo ?? null,
            }
          : fr,
      ),
    );
  };

  const motivoRecuperable = motivos.find((m) => m.valor === motivo)?.recuperable ?? false;
  const motivoExento = esExento(motivo);

  // ---- Cálculo de horas ----
  const minutosSolicitados = useMemo(
    () => minutosEntreHoras(startTime, endTime),
    [startTime, endTime],
  );
  const minutosProgramados = useMemo(
    () => fracciones.reduce((acc, f) => acc + minutosEntreHoras(f.start_time, f.end_time), 0),
    [fracciones],
  );
  const saldoMin = Math.max(0, minutosSolicitados - minutosProgramados);
  const descuadre =
    recupera &&
    minutosSolicitados > 0 &&
    minutosProgramados > 0 &&
    minutosProgramados !== minutosSolicitados;

  const turnoSolInfo = describeTurno(turnoSolicitanteCode, shiftTypes);

  // ---- Soporte ----
  const seleccionarSoporte = async (file: File | null) => {
    if (!file || !user) return;
    setSubiendoSoporte(true);
    try {
      if (soporte) await eliminarSoporte(soporte.path).catch(() => {});
      const meta = await subirSoporte({ userId: user.id, file });
      setSoporte(meta);
      toast.success("Soporte cargado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el soporte.");
    } finally {
      setSubiendoSoporte(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const quitarSoporte = async () => {
    if (soporte) await eliminarSoporte(soporte.path).catch(() => {});
    setSoporte(null);
  };

  // ---- Validación de límite mensual ----
  const mesAfectado = (): { y: number; m: number } | null => {
    const base = esCambio ? origFecha : startDate;
    if (!base) return null;
    const [y, m] = base.split("-").map(Number);
    return { y, m };
  };

  async function excepcionDisponible(y: number, m: number): Promise<string | null> {
    if (!user) return null;
    const { data } = await supabase
      .from("shift_monthly_exceptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("year", y)
      .eq("month", m)
      .eq("status", "APROBADA")
      .eq("usage_status", "DISPONIBLE")
      .maybeSingle();
    return data?.id ?? null;
  }

  const enviarExcepcion = async () => {
    if (!user) return;
    if (!excMotivo.trim()) return toast.error("El motivo es obligatorio.");
    const mm = mesAfectado();
    if (!mm) return toast.error("Indica primero la fecha del permiso o cambio.");
    setExcSaving(true);
    try {
      const { data: prev } = await supabase
        .from("shift_monthly_exceptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("year", mm.y)
        .eq("month", mm.m)
        .eq("status", "PENDIENTE")
        .maybeSingle();
      if (prev) {
        toast.error("Ya existe una autorización excepcional pendiente para este mes.");
        setExcSaving(false);
        return;
      }
      const { error } = await supabase.from("shift_monthly_exceptions").insert({
        user_id: user.id,
        user_name: perfil?.nombre,
        user_role: perfil?.cargo,
        year: mm.y,
        month: mm.m,
        request_type: esCambio ? "cambio_turno" : "permiso",
        reason: excMotivo,
        counts: uso ?? {},
        status: "PENDIENTE",
        usage_status: "DISPONIBLE",
      });
      if (error) throw error;
      registrarAuditoria({
        data: {
          accion: "EXCEPCION_ENVIADA",
          modulo: "cuadro_turno",
          tabla: "shift_monthly_exceptions",
          resultado: "exito",
        },
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["monthly-exceptions"] });
      toast.success("Solicitud de autorización excepcional enviada a coordinación.");
      setLimiteOpen(false);
      setExcMode("aviso");
      setExcMotivo("");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo enviar la autorización.");
    } finally {
      setExcSaving(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!motivo) return toast.error("Selecciona un motivo.");
    if (motivo === "Otro" && !otro.trim()) return toast.error("Especifica el motivo en '¿Cuál?'.");
    if (reqReemplazo && (!reempNombre.trim() || !reempCargo.trim()))
      return toast.error("El reemplazo requiere nombre y cargo.");
    if (esCambio && (!origFecha || !origTurno || !nuevaFecha || !nuevoTurno))
      return toast.error("Completa los datos del cambio de turno.");
    if (!esCambio && !startDate) return toast.error("Indica la fecha inicial.");
    if (
      !esCambio &&
      recupera &&
      fracciones.some((f) => !f.receiver_name || !f.return_date || !f.start_time || !f.end_time)
    )
      return toast.error("Completa los datos de la devolución del tiempo.");
    if (motivoExento && !soporte)
      return toast.error("Este permiso requiere un soporte obligatorio.");
    if (descuadre && !detalle.trim())
      return toast.error(
        "Las horas programadas no coinciden con las solicitadas. Justifícalo en 'Especifique motivo'.",
      );
    if (!confirmo) return toast.error("Debes confirmar y autorizar el uso de tu firma.");

    // Límite mensual (no aplica a cita médica / calamidad).
    let usarExcepcionId: string | null = null;
    if (!motivoExento) {
      const mm = mesAfectado();
      if (mm) {
        const { data: usoData } = await supabase.rpc("shift_monthly_usage", {
          _user_id: user.id,
          _year: mm.y,
          _month: mm.m,
        });
        const row = Array.isArray(usoData) ? usoData[0] : usoData;
        const total = (row?.solicitudes ?? 0) + (row?.coberturas ?? 0);
        setUso({
          solicitudes: row?.solicitudes ?? 0,
          coberturas: row?.coberturas ?? 0,
          pendientes: row?.pendientes ?? 0,
          total,
        });
        if (total >= LIMITE_MENSUAL) {
          usarExcepcionId = await excepcionDisponible(mm.y, mm.m);
          if (!usarExcepcionId) {
            setExcMode("aviso");
            setLimiteOpen(true);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      let signatureId = firmaActiva?.id ?? null;
      let signatureHash = firmaActiva?.hash ?? null;
      if (!signatureId) {
        if (!padRef.current || padRef.current.isEmpty()) {
          setSaving(false);
          return toast.error("No tienes firma registrada. Dibújala antes de enviar.");
        }
        const saved = await guardarFirma({
          userId: user.id,
          uploadedBy: user.id,
          dataUrl: padRef.current.toDataURL(),
        });
        signatureId = saved.id;
        signatureHash = saved.hash;
      }

      const primera = fracciones[0];
      const { data: req, error } = await supabase
        .from("shift_requests")
        .insert({
          request_type: esCambio ? "cambio_turno" : "permiso",
          requester_id: user.id,
          requester_name: perfil?.nombre || null,
          requester_identification: perfil?.doc || null,
          requester_role: perfil?.cargo || null,
          requester_sede: SEDE_FIJA,
          status: "PENDIENTE",
          reason_type: motivo,
          other_reason: motivo === "Otro" ? otro : null,
          reason_recoverable: !esCambio && motivoRecuperable,
          start_date: !esCambio ? startDate || null : null,
          end_date: !esCambio ? endDate || null : null,
          start_time: !esCambio ? startTime || null : null,
          end_time: !esCambio ? endTime || null : null,
          will_recover_time: recupera,
          requires_replacement: reqReemplazo,
          replacement_name: reqReemplazo ? reempNombre : null,
          replacement_role: reqReemplazo ? reempCargo : null,
          replacement_user_id: reqReemplazo ? reempUserId : null,
          paid: remunerado,
          // Turno original del solicitante (nombre + horario reales)
          original_shift_code: !esCambio ? (turnoSolInfo?.code ?? null) : origTurno || null,
          original_shift_name: !esCambio ? (turnoSolInfo?.name ?? null) : null,
          original_start_time: !esCambio ? (turnoSolInfo?.start ?? null) : null,
          original_end_time: !esCambio ? (turnoSolInfo?.end ?? null) : null,
          original_shift_date: esCambio ? origFecha || null : !esCambio ? startDate || null : null,
          requested_shift_date: esCambio ? nuevaFecha || null : null,
          requested_shift_code: esCambio ? nuevoTurno || null : null,
          swap_partner_name: esCambio ? companero || null : null,
          // Devolución
          return_fractioned: recupera ? fraccionado : false,
          return_receiver_id: recupera ? (primera?.receiver_id ?? null) : null,
          return_person_id: recupera ? (primera?.receiver_id ?? null) : null,
          return_person_name: recupera ? (primera?.receiver_name ?? null) : null,
          return_person_role: recupera ? (primera?.receiver_role ?? null) : null,
          return_date: recupera ? (primera?.return_date ?? null) : null,
          return_shift_code: recupera ? (primera?.shift_code ?? null) : null,
          requested_minutes: minutosSolicitados || null,
          returned_minutes: 0,
          pending_minutes: recupera ? minutosProgramados || minutosSolicitados || 0 : null,
          recovery_status: recupera ? "PENDIENTE_VERIFICACION" : "N_A",
          is_limit_exempt: motivoExento,
          monthly_exception_id: usarExcepcionId,
          support_path: soporte?.path ?? null,
          support_metadata: soporte ? { ...soporte } : null,
          out_of_rule_justification: descuadre ? detalle : null,
          reason_detail: detalle || null,
          observations: observaciones || null,
          requester_signature_id: signatureId,
          requester_signature_hash: signatureHash,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Fracciones de devolución en tabla hija
      if (recupera && fracciones.length > 0) {
        const rows = fracciones.map((f, i) => ({
          request_id: req.id,
          fragment_no: i + 1,
          return_date: f.return_date,
          receiver_id: f.receiver_id,
          receiver_name: f.receiver_name,
          receiver_role: f.receiver_role,
          shift_code: f.shift_code,
          start_time: f.start_time,
          end_time: f.end_time,
          minutes: minutosEntreHoras(f.start_time, f.end_time),
          notes: f.notes,
        }));
        const { error: fErr } = await supabase.from("shift_return_fragments").insert(rows);
        if (fErr) throw fErr;
      }

      // Consumir la excepción de forma atómica (un solo uso, evita doble consumo
      // por doble clic / dos pestañas / concurrencia): solo pasa DISPONIBLE->UTILIZADA
      // sobre una excepción APROBADA. La transición está protegida además por trigger.
      if (usarExcepcionId) {
        await supabase
          .from("shift_monthly_exceptions")
          .update({
            usage_status: "UTILIZADA",
            used_request_id: req.id,
            used_at: new Date().toISOString(),
          })
          .eq("id", usarExcepcionId)
          .eq("status", "APROBADA")
          .eq("usage_status", "DISPONIBLE");
      }


      await supabase.from("shift_request_audit").insert({
        request_id: req.id,
        action: "CREADA",
        new_status: "PENDIENTE",
        user_id: user.id,
        detail: `Solicitud ${esCambio ? "cambio de turno" : motivo}`,
      });
      registrarAuditoria({
        data: {
          accion: "SOLICITUD_CREADA",
          modulo: "cuadro_turno",
          tabla: "shift_requests",
          registroId: req.id,
          resultado: "exito",
        },
      }).catch(() => {});

      dispatchNotif({
        data: {
          alert_type: "SOLICITUD_CAMBIO_TURNO",
          module: "Cuadro de turno",
          reference_id: req.id,
          vars: {
            funcionario: maskNombre(perfil?.nombre),
            estado: "Pendiente de revisión",
            accion: "Revisar en Cuadro de Turno.",
            modulo: "Cuadro de turno",
          },
        },
      }).catch(() => {});

      toast.success("Solicitud enviada a coordinación.");
      qc.invalidateQueries({ queryKey: ["shift-requests"] });
      onOpenChange(false);
      resetForm();
    } catch (e) {
      toast.error("No se pudo enviar la solicitud.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setMotivo("");
    setOtro("");
    setStartDate("");
    setEndDate("");
    setStartTime("");
    setEndTime("");
    setRecupera(false);
    setReqReemplazo(false);
    setRemunerado(false);
    setReempNombre("");
    setReempCargo("");
    setReempUserId(null);
    setDetalle("");
    setObservaciones("");
    setOrigFecha("");
    setOrigTurno("");
    setNuevaFecha("");
    setNuevoTurno("");
    setCompanero("");
    setConfirmo(false);
    setEsCambio(false);
    setFraccionado(false);
    setFracciones([]);
    setTurnoSolicitanteCode(null);
    setSoporte(null);
    setUso(null);
    setExcMotivo("");
    setExcMode("aviso");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Solicitud de permiso / cambio de turno (TH-FR-09)</DialogTitle>
        </DialogHeader>

        <div className="scrollbar-invisible flex-1 space-y-4 overflow-y-auto pr-0.5 text-sm">
          {/* Identificación */}
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
              Datos de identificación
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Colaborador</Label>
                <Input value={perfil?.nombre ?? ""} readOnly />
              </div>
              <div>
                <Label className="text-xs">Identificación</Label>
                <Input value={perfil?.doc ?? ""} readOnly />
              </div>
              <div>
                <Label className="text-xs">Cargo</Label>
                <Input value={perfil?.cargo ?? ""} readOnly />
              </div>
              <div>
                <Label className="text-xs">Sede</Label>
                <Input value={SEDE_FIJA} readOnly className="bg-muted/40" />
              </div>
            </div>
            {(!perfil?.doc || !perfil?.cargo) && (
              <p className="mt-2 text-xs text-amber-600">
                Faltan datos en tu perfil (documento/cargo). Repórtalo a coordinación.
              </p>
            )}
          </fieldset>

          {/* Motivo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={handleMotivo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivos.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.valor}
                    </SelectItem>
                  ))}
                  <SelectItem value={CAMBIO_TURNO}>{CAMBIO_TURNO}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {motivo === "Otro" && (
              <div>
                <Label className="text-xs">¿Cuál?</Label>
                <Input value={otro} onChange={(e) => setOtro(e.target.value)} />
              </div>
            )}
          </div>

          {/* Descripción / cambio de turno */}
          {esCambio ? (
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
                Cambio de turno
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha turno original</Label>
                  <Input
                    type="date"
                    value={origFecha}
                    onChange={(e) => setOrigFecha(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Turno original (código)</Label>
                  <Input
                    value={origTurno}
                    onChange={(e) => setOrigTurno(e.target.value)}
                    placeholder="Ej: N"
                  />
                </div>
                <div>
                  <Label className="text-xs">Fecha nuevo turno</Label>
                  <Input
                    type="date"
                    value={nuevaFecha}
                    onChange={(e) => setNuevaFecha(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Nuevo turno (código)</Label>
                  <Input
                    value={nuevoTurno}
                    onChange={(e) => setNuevoTurno(e.target.value)}
                    placeholder="Ej: M"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Persona con quien realiza el cambio</Label>
                  <Input value={companero} onChange={(e) => setCompanero(e.target.value)} />
                </div>
              </div>
            </fieldset>
          ) : (
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
                Descripción del permiso
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha inicial</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fecha final</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Hora inicial</Label>
                  <TimeField value={startTime} onChange={setStartTime} />
                </div>
                <div>
                  <Label className="text-xs">Hora final</Label>
                  <TimeField value={endTime} onChange={setEndTime} />
                </div>
              </div>

              {/* Turno programado del solicitante */}
              <div className="mt-3 rounded-md border border-vitalis-blue/30 bg-vitalis-blue/5 p-2.5">
                <p className="text-[11px] font-semibold uppercase text-vitalis-blue">
                  Turno programado del solicitante
                </p>
                {buscandoTurno ? (
                  <p className="text-xs text-muted-foreground">Buscando…</p>
                ) : turnoSolInfo ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-sm font-bold">{turnoSolInfo.name}</span>
                    <span className="text-muted-foreground">{turnoSolInfo.horario}</span>
                    {turnoSolInfo.hours ? (
                      <span className="text-muted-foreground">· {turnoSolInfo.hours} h</span>
                    ) : null}
                    <span className="rounded bg-vitalis-blue/15 px-1.5 py-0.5 font-bold text-vitalis-blue">
                      Código {turnoSolInfo.code}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {startDate
                      ? "Sin turno programado en esa fecha."
                      : "Selecciona la fecha inicial."}
                  </p>
                )}
              </div>
            </fieldset>
          )}

          {/* Soporte obligatorio para cita médica / calamidad */}
          {motivoExento && (
            <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/10">
              <p className="text-xs font-semibold text-amber-700">Soporte obligatorio</p>
              <p className="mt-1 text-xs text-amber-700/90">
                {motivo === "Cita médica"
                  ? "Para presentar esta solicitud debes adjuntar el recordatorio, citación, orden o soporte de la cita médica."
                  : "Para presentar esta solicitud debes adjuntar el soporte o evidencia correspondiente a la calamidad reportada."}{" "}
                Este tipo de permiso no se descuenta del límite mensual, pero debe contar con
                evidencia.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  hidden
                  onChange={(e) => seleccionarSoporte(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={subiendoSoporte}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="mr-1.5 h-4 w-4" />{" "}
                  {subiendoSoporte
                    ? "Subiendo…"
                    : soporte
                      ? "Reemplazar soporte"
                      : "Adjuntar evidencia"}
                </Button>
                {soporte && (
                  <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                    {soporte.nombre} · {(soporte.size / 1024).toFixed(0)} KB
                    <button type="button" onClick={quitarSoporte} className="text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            {!esCambio && motivoRecuperable && (
              <label className="flex items-center gap-2">
                <Checkbox checked={recupera} onCheckedChange={(v) => setRecupera(!!v)} /> Será
                recuperado el tiempo
              </label>
            )}
            <label className="flex items-center gap-2">
              <Checkbox checked={reqReemplazo} onCheckedChange={(v) => setReqReemplazo(!!v)} />{" "}
              Requiere reemplazo
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={remunerado} onCheckedChange={(v) => setRemunerado(!!v)} />{" "}
              Remunerado
            </label>
          </div>

          {/* Reemplazo */}
          {reqReemplazo && (
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
                Reemplazo / cobertura
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre del reemplazo</Label>
                  <Select value={reempNombre} onValueChange={handleReemplazo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona funcionario" />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.nombre} value={f.nombre}>
                          {f.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cargo del reemplazo</Label>
                  <Input
                    value={reempCargo}
                    readOnly
                    className="bg-muted/40"
                    placeholder="Automático"
                  />
                </div>
                {!esCambio && (
                  <>
                    <div>
                      <Label className="text-xs">Fecha que va a cubrir</Label>
                      <Input value={startDate} readOnly className="bg-muted/40" />
                    </div>
                    <div>
                      <Label className="text-xs">Turno / horario a cubrir</Label>
                      <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-2 text-xs">
                        {turnoSolInfo ? (
                          <>
                            <span className="font-semibold">{turnoSolInfo.name}</span>
                            <span className="text-muted-foreground">{turnoSolInfo.horario}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Según turno del solicitante</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          )}

          {/* Devolución del tiempo */}
          {!esCambio && recupera && (
            <fieldset className="rounded-md border border-emerald-300 bg-emerald-50/40 p-3 dark:bg-emerald-950/10">
              <legend className="px-1 text-xs font-semibold uppercase text-emerald-700">
                Devolución del tiempo
              </legend>
              <label className="mb-3 flex items-center gap-2 text-xs">
                <Checkbox
                  checked={fraccionado}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setFraccionado(on);
                    setFracciones((prev) => (prev.length === 0 ? [nuevaFraccion(1)] : prev));
                  }}
                />
                El tiempo se devolverá en varias fracciones
              </label>

              <div className="space-y-3">
                {fracciones.map((f, i) => (
                  <FraccionEditor
                    key={i}
                    frag={f}
                    index={i}
                    funcionarios={funcionarios}
                    shiftTypes={shiftTypes}
                    onChange={(nf) =>
                      setFracciones((prev) => prev.map((x, j) => (j === i ? nf : x)))
                    }
                    onRemove={
                      fraccionado && fracciones.length > 1
                        ? () => setFracciones((prev) => prev.filter((_, j) => j !== i))
                        : undefined
                    }
                  />
                ))}
              </div>

              {fraccionado && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setFracciones((prev) => [...prev, nuevaFraccion(prev.length + 1)])}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Agregar fracción
                </Button>
              )}

              <p className="mt-2 text-[11px] text-muted-foreground">
                El turno se toma automáticamente del Cuadro de Turno del funcionario en la fecha
                indicada.
              </p>
            </fieldset>
          )}

          {/* Resumen de horas */}
          {!esCambio && (recupera || minutosSolicitados > 0) && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Horas solicitadas</p>
                <p className="font-bold">{minutosAHoras(minutosSolicitados)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Programadas devolución</p>
                <p className="font-bold">{minutosAHoras(minutosProgramados)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Verificadas</p>
                <p className="font-bold">0 h</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo pendiente</p>
                <p className="font-bold">{minutosAHoras(saldoMin)}</p>
              </div>
              {descuadre && (
                <p className="col-span-2 text-amber-600 sm:col-span-4">
                  Las horas programadas ({minutosAHoras(minutosProgramados)}) no coinciden con las
                  solicitadas ({minutosAHoras(minutosSolicitados)}). Justifica la diferencia para
                  continuar.
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">Especifique motivo del permiso</Label>
            <DictationTextarea dictationKey="cuadro_turno.solicitud.detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Observaciones adicionales</Label>
            <DictationTextarea
              dictationKey="cuadro_turno.solicitud.observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>

          {/* Firma */}
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
              Firma del colaborador
            </legend>
            {loadingFirma ? (
              <p className="text-xs text-muted-foreground">Cargando firma…</p>
            ) : firmaActiva ? (
              <div className="flex items-center gap-3">
                {firmaActiva.signedUrl ? (
                  <img
                    src={firmaActiva.signedUrl}
                    alt="Firma registrada"
                    className="h-16 rounded border bg-white object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Firma registrada</span>
                )}
                <p className="text-xs text-emerald-600">
                  Se usará tu firma registrada en Administración.
                </p>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs text-amber-600">
                  No tienes firma registrada. Dibújala para continuar.
                </p>
                <SignaturePad ref={padRef} />
              </div>
            )}
          </fieldset>

          <label className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs">
            <Checkbox
              checked={confirmo}
              onCheckedChange={(v) => setConfirmo(!!v)}
              className="mt-0.5"
            />
            <span>
              Confirmo que la información registrada es correcta y autorizo el uso de mi firma
              registrada para esta solicitud.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || subiendoSoporte}>
            {saving ? "Enviando…" : "Solicitar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Modal límite mensual / autorización excepcional */}
      <Dialog
        open={limiteOpen}
        onOpenChange={(v) => {
          if (!v) {
            setLimiteOpen(false);
            setExcMode("aviso");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Límite mensual alcanzado</DialogTitle>
          </DialogHeader>
          {excMode === "aviso" ? (
            <div className="space-y-3 text-sm">
              <p>
                Ya has utilizado el límite mensual de {LIMITE_MENSUAL} participaciones en permisos o
                cambios de turno autorizado por la institución.
              </p>
              <p className="text-muted-foreground">
                Para presentar una solicitud adicional debes solicitar autorización previa a
                coordinación.
              </p>
              {uso && (
                <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Solicitudes</p>
                    <p className="font-bold">{uso.solicitudes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Coberturas</p>
                    <p className="font-bold">{uso.coberturas}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-bold">
                      {uso.total} / {LIMITE_MENSUAL}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-sm font-medium">
                ¿Deseas enviar una solicitud a coordinación para que se autorice un permiso o cambio
                adicional?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLimiteOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setExcMode("motivo")}>
                  Solicitar autorización excepcional
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs">
                  Motivo por el cual requiere superar el límite mensual
                </Label>
                <Textarea
                  value={excMotivo}
                  onChange={(e) => setExcMotivo(e.target.value)}
                  rows={3}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Esta solicitud no crea automáticamente el permiso o cambio de turno. Si coordinación
                la aprueba, se habilitará una única solicitud adicional para el mes seleccionado. Si
                coordinación la niega, no podrás registrar otra solicitud no exceptuada durante ese
                mes.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExcMode("aviso")}>
                  Volver
                </Button>
                <Button onClick={enviarExcepcion} disabled={excSaving}>
                  {excSaving ? "Enviando…" : "Enviar a coordinación"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
