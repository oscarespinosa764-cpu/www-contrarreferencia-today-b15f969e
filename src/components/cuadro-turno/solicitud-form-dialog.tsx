import { TimeField } from "@/components/ui/time-field";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { getFirmaActiva, guardarFirma } from "@/lib/firmas-utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

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

export function SolicitudFormDialog({
  open, onOpenChange, defaultCambio,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCambio?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const padRef = useRef<SignaturePadHandle>(null);

  const [perfil, setPerfil] = useState<{ nombre: string; doc: string; cargo: string } | null>(null);
  const [firmaActiva, setFirmaActiva] = useState<{ id: string; hash: string | null; signedUrl: string | null } | null>(null);
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
  const [detalle, setDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // Retorno de tiempo recuperable
  const [retornoNombre, setRetornoNombre] = useState("");
  const [retornoCargo, setRetornoCargo] = useState("");
  const [retornoFecha, setRetornoFecha] = useState("");
  const [retornoTurno, setRetornoTurno] = useState("");
  const [retornoTurnoBuscando, setRetornoTurnoBuscando] = useState(false);
  // Cambio de turno
  const [origFecha, setOrigFecha] = useState("");
  const [origTurno, setOrigTurno] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevoTurno, setNuevoTurno] = useState("");
  const [companero, setCompanero] = useState("");

  const [confirmo, setConfirmo] = useState(false);
  const [saving, setSaving] = useState(false);

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
      // Se combina el personal del cuadro de turno con todos los perfiles activos
      // para no dejar a nadie por fuera (p. ej. quienes aún no están en el cuadro).
      const [{ data: members }, { data: profs }] = await Promise.all([
        supabase.from("shift_schedule_members").select("full_name, role_name, user_id").eq("active", true),
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
      setPerfil({ nombre: data?.nombre || user.email || "", doc: data?.numero_documento || "", cargo: data?.cargo || "" });
      const fa = await getFirmaActiva(user.id);
      setFirmaActiva(fa);
      setLoadingFirma(false);
    })();
  }, [open, user, defaultCambio]);

  // Buscar el turno asignado del funcionario en la fecha de devolución.
  useEffect(() => {
    if (!recupera || esCambio || !retornoNombre || !retornoFecha) {
      setRetornoTurno("");
      return;
    }
    let cancel = false;
    (async () => {
      setRetornoTurnoBuscando(true);
      const { data } = await supabase
        .from("shift_schedule_days")
        .select("shift_code, shift_schedule_members!inner(full_name)")
        .eq("shift_date", retornoFecha)
        .eq("shift_schedule_members.full_name", retornoNombre)
        .limit(1)
        .maybeSingle();
      if (cancel) return;
      setRetornoTurno((data as { shift_code?: string | null } | null)?.shift_code || "");
      setRetornoTurnoBuscando(false);
    })();
    return () => { cancel = true; };
  }, [recupera, esCambio, retornoNombre, retornoFecha]);

  const handleMotivo = (v: string) => {
    setMotivo(v);
    const cambio = v === CAMBIO_TURNO;
    setEsCambio(cambio);
    if (!cambio) {
      const opt = motivos.find((m) => m.valor === v);
      const rec = !!opt?.recuperable;
      setRecupera(rec);
      // Si el motivo NO es recuperable, no aplica devolución de tiempo.
      if (!rec) {
        setReqReemplazo(false);
        setRemunerado(false);
        setReempNombre("");
        setReempCargo("");
        setRetornoNombre("");
        setRetornoCargo("");
        setRetornoFecha("");
        setRetornoTurno("");
      }
    }
  };

  // Al marcar "Será recuperado el tiempo" se activan automáticamente
  // "Requiere reemplazo" y "Remunerado".
  useEffect(() => {
    if (recupera && !esCambio) {
      setReqReemplazo(true);
      setRemunerado(true);
    }
  }, [recupera, esCambio]);

  const handleRetornoNombre = (nombre: string) => {
    setRetornoNombre(nombre);
    const f = funcionarios.find((x) => x.nombre === nombre);
    const cargo = f?.cargo || "";
    setRetornoCargo(cargo);
    // El reemplazo se llena con la funcionaria que recibe el retorno.
    setReempNombre(nombre);
    setReempCargo(cargo);
  };

  const motivoRecuperable = motivos.find((m) => m.valor === motivo)?.recuperable ?? false;

  const submit = async () => {
    if (!user) return;
    if (!motivo) return toast.error("Selecciona un motivo.");
    if (motivo === "Otro" && !otro.trim()) return toast.error("Especifica el motivo en '¿Cuál?'.");
    if (reqReemplazo && (!reempNombre.trim() || !reempCargo.trim()))
      return toast.error("El reemplazo requiere nombre y cargo.");
    if (esCambio && (!origFecha || !origTurno || !nuevaFecha || !nuevoTurno))
      return toast.error("Completa los datos del cambio de turno.");
    if (!esCambio && !startDate) return toast.error("Indica la fecha inicial.");
    if (!esCambio && recupera && (!retornoNombre || !retornoFecha))
      return toast.error("Indica el funcionario y la fecha de devolución del tiempo.");
    if (!confirmo) return toast.error("Debes confirmar y autorizar el uso de tu firma.");

    setSaving(true);
    try {
      // Resolver firma: usar activa o dibujada en el momento
      let signatureId = firmaActiva?.id ?? null;
      let signatureHash = firmaActiva?.hash ?? null;
      if (!signatureId) {
        if (!padRef.current || padRef.current.isEmpty())
          { setSaving(false); return toast.error("No tienes firma registrada. Dibújala antes de enviar."); }
        const saved = await guardarFirma({ userId: user.id, uploadedBy: user.id, dataUrl: padRef.current.toDataURL() });
        signatureId = saved.id;
        signatureHash = saved.hash;
      }

      const usaRetorno = !esCambio && recupera;

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
          paid: remunerado,
          return_person_id: usaRetorno ? funcionarios.find((f) => f.nombre === retornoNombre)?.userId ?? null : null,
          return_person_name: usaRetorno ? retornoNombre || null : null,
          return_person_role: usaRetorno ? retornoCargo || null : null,
          return_date: usaRetorno ? retornoFecha || null : null,
          return_shift_code: usaRetorno ? retornoTurno || null : null,
          original_shift_date: esCambio ? origFecha || null : null,
          original_shift_code: esCambio ? origTurno || null : null,
          requested_shift_date: esCambio ? nuevaFecha || null : null,
          requested_shift_code: esCambio ? nuevoTurno || null : null,
          swap_partner_name: esCambio ? companero || null : null,
          reason_detail: detalle || null,
          observations: observaciones || null,
          requester_signature_id: signatureId,
          requester_signature_hash: signatureHash,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("shift_request_audit").insert({
        request_id: req.id, action: "CREADA", new_status: "PENDIENTE", user_id: user.id,
        detail: `Solicitud ${esCambio ? "cambio de turno" : motivo}`,
      });
      registrarAuditoria({ data: { accion: "SOLICITUD_CREADA", modulo: "cuadro_turno", tabla: "shift_requests", registroId: req.id, resultado: "exito" } }).catch(() => {});

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
    setMotivo(""); setOtro(""); setStartDate(""); setEndDate("");
    setStartTime(""); setEndTime(""); setRecupera(false); setReqReemplazo(false);
    setRemunerado(false); setReempNombre(""); setReempCargo(""); setDetalle("");
    setObservaciones(""); setOrigFecha(""); setOrigTurno(""); setNuevaFecha("");
    setNuevoTurno(""); setCompanero(""); setConfirmo(false); setEsCambio(false);
    setRetornoNombre(""); setRetornoCargo(""); setRetornoFecha(""); setRetornoTurno("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitud de permiso / cambio de turno (TH-FR-09)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Identificación */}
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">Datos de identificación</legend>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Colaborador</Label><Input value={perfil?.nombre ?? ""} readOnly /></div>
              <div><Label className="text-xs">Identificación</Label><Input value={perfil?.doc ?? ""} readOnly /></div>
              <div><Label className="text-xs">Cargo</Label><Input value={perfil?.cargo ?? ""} readOnly /></div>
              <div><Label className="text-xs">Sede</Label><Input value={SEDE_FIJA} readOnly className="bg-muted/40" /></div>
            </div>
            {(!perfil?.doc || !perfil?.cargo) && (
              <p className="mt-2 text-xs text-amber-600">Faltan datos en tu perfil (documento/cargo). Repórtalo a coordinación.</p>
            )}
          </fieldset>

          {/* Motivo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={handleMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecciona motivo" /></SelectTrigger>
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
              <div><Label className="text-xs">¿Cuál?</Label><Input value={otro} onChange={(e) => setOtro(e.target.value)} /></div>
            )}
          </div>

          {/* Descripción / cambio de turno */}
          {esCambio ? (
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">Cambio de turno</legend>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Fecha turno original</Label><Input type="date" value={origFecha} onChange={(e) => setOrigFecha(e.target.value)} /></div>
                <div><Label className="text-xs">Turno original (código)</Label><Input value={origTurno} onChange={(e) => setOrigTurno(e.target.value)} placeholder="Ej: N" /></div>
                <div><Label className="text-xs">Fecha nuevo turno</Label><Input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} /></div>
                <div><Label className="text-xs">Nuevo turno (código)</Label><Input value={nuevoTurno} onChange={(e) => setNuevoTurno(e.target.value)} placeholder="Ej: M" /></div>
                <div className="col-span-2"><Label className="text-xs">Persona con quien realiza el cambio</Label><Input value={companero} onChange={(e) => setCompanero(e.target.value)} /></div>
              </div>
            </fieldset>
          ) : (
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">Descripción del permiso</legend>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Fecha inicial</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div><Label className="text-xs">Fecha final</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
                <div><Label className="text-xs">Hora inicial</Label><TimeField value={startTime} onChange={setStartTime} /></div>
                <div><Label className="text-xs">Hora final</Label><TimeField value={endTime} onChange={setEndTime} /></div>
              </div>
            </fieldset>
          )}

          <div className="flex flex-wrap gap-4">
            {!esCambio && motivoRecuperable && (
              <label className="flex items-center gap-2">
                <Checkbox checked={recupera} onCheckedChange={(v) => setRecupera(!!v)} /> Será recuperado el tiempo
              </label>
            )}
            <label className="flex items-center gap-2"><Checkbox checked={reqReemplazo} onCheckedChange={(v) => setReqReemplazo(!!v)} /> Requiere reemplazo</label>
            <label className="flex items-center gap-2"><Checkbox checked={remunerado} onCheckedChange={(v) => setRemunerado(!!v)} /> Remunerado</label>
          </div>

          {/* Retorno de tiempo recuperable */}
          {!esCambio && recupera && (
            <fieldset className="rounded-md border border-emerald-300 bg-emerald-50/40 p-3 dark:bg-emerald-950/10">
              <legend className="px-1 text-xs font-semibold uppercase text-emerald-700">Devolución del tiempo</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Funcionario que recibe el retorno</Label>
                  <Select value={retornoNombre} onValueChange={handleRetornoNombre}>
                    <SelectTrigger><SelectValue placeholder="Selecciona funcionario" /></SelectTrigger>
                    <SelectContent>
                      {funcionarios.length === 0 ? (
                        <SelectItem value="__none" disabled>Sin funcionarios en el cuadro</SelectItem>
                      ) : (
                        funcionarios.map((f) => <SelectItem key={f.nombre} value={f.nombre}>{f.nombre}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Cargo</Label><Input value={retornoCargo} readOnly className="bg-muted/40" placeholder="Automático" /></div>
                <div><Label className="text-xs">Fecha de devolución</Label><Input type="date" value={retornoFecha} onChange={(e) => setRetornoFecha(e.target.value)} /></div>
                <div>
                  <Label className="text-xs">Turno</Label>
                  <Input
                    value={retornoTurnoBuscando ? "Buscando…" : (retornoTurno || "")}
                    readOnly
                    className="bg-muted/40"
                    placeholder={retornoNombre && retornoFecha ? "Sin turno ese día" : "Automático"}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">El turno se toma automáticamente del cuadro de turno del funcionario en la fecha indicada.</p>
            </fieldset>
          )}

          {reqReemplazo && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nombre del reemplazo</Label><Input value={reempNombre} onChange={(e) => setReempNombre(e.target.value)} /></div>
              <div><Label className="text-xs">Cargo del reemplazo</Label><Input value={reempCargo} onChange={(e) => setReempCargo(e.target.value)} /></div>
            </div>
          )}

          <div><Label className="text-xs">Especifique motivo del permiso</Label><Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} /></div>
          <div><Label className="text-xs">Observaciones adicionales</Label><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} /></div>

          {/* Firma */}
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">Firma del colaborador</legend>
            {loadingFirma ? (
              <p className="text-xs text-muted-foreground">Cargando firma…</p>
            ) : firmaActiva ? (
              <div className="flex items-center gap-3">
                {firmaActiva.signedUrl
                  ? <img src={firmaActiva.signedUrl} alt="Firma registrada" className="h-16 rounded border bg-white object-contain" />
                  : <span className="text-xs text-muted-foreground">Firma registrada</span>}
                <p className="text-xs text-emerald-600">Se usará tu firma registrada en Administración.</p>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs text-amber-600">No tienes firma registrada. Dibújala para continuar.</p>
                <SignaturePad ref={padRef} />
              </div>
            )}
          </fieldset>

          <label className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs">
            <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(!!v)} className="mt-0.5" />
            <span>Confirmo que la información registrada es correcta y autorizo el uso de mi firma registrada para esta solicitud.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Enviando…" : "Enviar solicitud"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
