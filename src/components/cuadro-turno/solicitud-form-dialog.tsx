import { TimeField } from "@/components/ui/time-field";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { MOTIVOS_SOLICITUD } from "@/lib/cuadro-turno-utils";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

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
  const [motivo, setMotivo] = useState<string>(defaultCambio ? "Cambio de turno" : "");
  const [otro, setOtro] = useState("");
  const [sede, setSede] = useState("");
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
  // Cambio de turno
  const [origFecha, setOrigFecha] = useState("");
  const [origTurno, setOrigTurno] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevoTurno, setNuevoTurno] = useState("");
  const [companero, setCompanero] = useState("");

  const [confirmo, setConfirmo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setEsCambio(!!defaultCambio);
    setMotivo(defaultCambio ? "Cambio de turno" : "");
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

  const handleMotivo = (v: string) => {
    setMotivo(v);
    setEsCambio(v === "Cambio de turno");
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

      const { data: req, error } = await supabase
        .from("shift_requests")
        .insert({
          request_type: esCambio ? "cambio_turno" : "permiso",
          requester_id: user.id,
          requester_name: perfil?.nombre || null,
          requester_identification: perfil?.doc || null,
          requester_role: perfil?.cargo || null,
          requester_sede: sede || null,
          status: "PENDIENTE",
          reason_type: motivo,
          other_reason: motivo === "Otro" ? otro : null,
          start_date: !esCambio ? startDate || null : null,
          end_date: !esCambio ? endDate || null : null,
          start_time: !esCambio ? startTime || null : null,
          end_time: !esCambio ? endTime || null : null,
          will_recover_time: recupera,
          requires_replacement: reqReemplazo,
          replacement_name: reqReemplazo ? reempNombre : null,
          replacement_role: reqReemplazo ? reempCargo : null,
          paid: remunerado,
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
    setMotivo(""); setOtro(""); setSede(""); setStartDate(""); setEndDate("");
    setStartTime(""); setEndTime(""); setRecupera(false); setReqReemplazo(false);
    setRemunerado(false); setReempNombre(""); setReempCargo(""); setDetalle("");
    setObservaciones(""); setOrigFecha(""); setOrigTurno(""); setNuevaFecha("");
    setNuevoTurno(""); setCompanero(""); setConfirmo(false); setEsCambio(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva solicitud de permiso, ausencia, salida o cambio de turno</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Identificación */}
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">Datos de identificación</legend>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Colaborador</Label><Input value={perfil?.nombre ?? ""} readOnly /></div>
              <div><Label className="text-xs">Identificación</Label><Input value={perfil?.doc ?? ""} readOnly /></div>
              <div><Label className="text-xs">Cargo</Label><Input value={perfil?.cargo ?? ""} readOnly /></div>
              <div><Label className="text-xs">Sede</Label><Input value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Sede / dependencia" /></div>
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
                  {MOTIVOS_SOLICITUD.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
                <div className="col-span-2"><Label className="text-xs">Persona con quien realiza el cambio</Label><Input uppercase value={companero} onChange={(e) => setCompanero(e.target.value)} /></div>
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
            <label className="flex items-center gap-2"><Checkbox checked={recupera} onCheckedChange={(v) => setRecupera(!!v)} /> Será recuperado el tiempo</label>
            <label className="flex items-center gap-2"><Checkbox checked={reqReemplazo} onCheckedChange={(v) => setReqReemplazo(!!v)} /> Requiere reemplazo</label>
            <label className="flex items-center gap-2"><Checkbox checked={remunerado} onCheckedChange={(v) => setRemunerado(!!v)} /> Remunerado</label>
          </div>

          {reqReemplazo && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nombre del reemplazo</Label><Input value={reempNombre} onChange={(e) => setReempNombre(e.target.value)} /></div>
              <div><Label className="text-xs">Cargo del reemplazo</Label><Input value={reempCargo} onChange={(e) => setReempCargo(e.target.value)} /></div>
            </div>
          )}

          <div><Label className="text-xs">Motivo detallado</Label><Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} /></div>
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
                <p className="text-xs text-emerald-600">Se usará tu firma registrada.</p>
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
