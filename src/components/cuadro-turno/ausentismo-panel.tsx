import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, FileDown, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  MESES, EVENTOS_TH48, eventoNombre, fmtFecha, minutosEntreHoras, diasEntreFechas,
} from "@/lib/cuadro-turno-utils";
import { exportarAusentismoTH48, type AbsRecord } from "@/lib/ausentismo-export";

interface AbsRow extends AbsRecord {
  id: string;
  user_id: string | null;
  origin: string;
  annulled_reason: string | null;
}

export function AusentismoPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [evento, setEvento] = useState("TODOS");
  const [nuevo, setNuevo] = useState(false);
  const [annul, setAnnul] = useState<AbsRow | null>(null);
  const [annulReason, setAnnulReason] = useState("");

  const { data: registros = [] } = useQuery({
    queryKey: ["absenteeism", anio, mes],
    queryFn: async () => {
      const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const hasta = `${anio}-${String(mes).padStart(2, "0")}-${new Date(anio, mes, 0).getDate()}`;
      const { data, error } = await supabase
        .from("shift_absenteeism_records")
        .select("*")
        .gte("registration_date", desde)
        .lte("registration_date", hasta)
        .order("registration_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AbsRow[];
    },
  });

  const filtrados = useMemo(
    () => registros.filter((r) => evento === "TODOS" || r.event_code === evento),
    [registros, evento],
  );

  const totalMin = filtrados.reduce((a, r) => a + (r.minutes_number || 0), 0);
  const totalDias = filtrados.reduce((a, r) => a + Number(r.days_number || 0), 0);

  const exportar = () => {
    exportarAusentismoTH48(filtrados, { mes: MESES[mes - 1], anio, incluirCostos: true });
    registrarAuditoria({ data: { accion: "EXPORT_TH48", modulo: "ausentismo", tabla: "shift_absenteeism_records", resultado: "exito" } }).catch(() => {});
  };

  const anular = async () => {
    if (!annul || !annulReason.trim()) return toast.error("El motivo de anulación es obligatorio.");
    const { error } = await supabase.from("shift_absenteeism_records")
      .update({ status: "anulado", annulled_reason: annulReason, updated_by: user!.id })
      .eq("id", annul.id);
    if (error) return toast.error("No se pudo anular.");
    registrarAuditoria({ data: { accion: "AUSENTISMO_ANULADO", modulo: "ausentismo", tabla: "shift_absenteeism_records", registroId: annul.id, resultado: "exito" } }).catch(() => {});
    toast.success("Registro anulado.");
    setAnnul(null); setAnnulReason("");
    qc.invalidateQueries({ queryKey: ["absenteeism"] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold uppercase">Control y seguimiento ausentismos laborales</h2>
        <p className="text-xs text-muted-foreground">Registro administrativo de permisos, ausencias, incapacidades y novedades laborales aprobadas. (TH-FR-48 · solo administración)</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Año</Label>
          <Input type="number" className="w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value))} /></div>
        <div><Label className="text-xs">Mes</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs">Evento</Label>
          <Select value={evento} onValueChange={setEvento}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {EVENTOS_TH48.map((e) => <SelectItem key={e.code} value={e.code}>{e.code} — {e.name}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportar}><FileDown className="mr-1.5 h-4 w-4" /> Exportar TH-FR-48</Button>
          <Button size="sm" onClick={() => setNuevo(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuevo registro</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total eventos</p><p className="text-2xl font-bold">{filtrados.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total días</p><p className="text-2xl font-bold">{totalDias}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total minutos</p><p className="text-2xl font-bold">{totalMin}</p></Card>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Registro</TableHead><TableHead>Trabajador</TableHead><TableHead>C.C.</TableHead>
              <TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead>Min</TableHead><TableHead>Días</TableHead>
              <TableHead>Evento</TableHead><TableHead>Motivo</TableHead><TableHead>Origen</TableHead>
              <TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-sm text-muted-foreground">Sin registros en el periodo.</TableCell></TableRow>
            ) : filtrados.map((r) => (
              <TableRow key={r.id} className={r.status === "anulado" ? "opacity-50" : ""}>
                <TableCell>{fmtFecha(r.registration_date)}</TableCell>
                <TableCell className="font-medium">{r.worker_name}</TableCell>
                <TableCell>{r.identification_number}</TableCell>
                <TableCell>{fmtFecha(r.start_date)}</TableCell>
                <TableCell>{fmtFecha(r.end_date)}</TableCell>
                <TableCell>{r.minutes_number}</TableCell>
                <TableCell>{r.days_number}</TableCell>
                <TableCell>{r.event_code}</TableCell>
                <TableCell className="max-w-[160px] truncate">{r.reason}</TableCell>
                <TableCell className="text-xs">{r.origin}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>
                  {r.status !== "anulado" && (
                    <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setAnnul(r)}><Ban className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {nuevo && <NuevoRegistroDialog adminId={user!.id} onClose={() => setNuevo(false)} onDone={() => { setNuevo(false); qc.invalidateQueries({ queryKey: ["absenteeism"] }); }} />}

      {annul && (
        <Dialog open onOpenChange={(v) => !v && setAnnul(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Anular registro</DialogTitle></DialogHeader>
            <Label className="text-xs">Motivo de anulación (obligatorio)</Label>
            <Textarea value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} rows={3} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnnul(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={anular}>Anular</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function NuevoRegistroDialog({ adminId, onClose, onDone }: { adminId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ event_code: "", registration_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.worker_name?.trim()) return toast.error("Trabajador obligatorio.");
    if (!f.event_code) return toast.error("Evento presentado obligatorio.");
    if (!f.start_date) return toast.error("Fecha inicio obligatoria.");
    if (!f.reason?.trim()) return toast.error("Motivo obligatorio.");
    setSaving(true);
    try {
      const minutos = minutosEntreHoras(f.start_time || null, f.end_time || null);
      const dias = diasEntreFechas(f.start_date || null, f.end_date || null);
      const { error } = await supabase.from("shift_absenteeism_records").insert({
        registration_date: f.registration_date,
        identification_number: f.identification_number || null,
        worker_name: f.worker_name, role_name: f.role_name || null,
        start_date: f.start_date, end_date: f.end_date || null,
        start_time: f.start_time || null, end_time: f.end_time || null,
        minutes_number: f.minutes_number ? Number(f.minutes_number) : minutos,
        days_number: f.days_number ? Number(f.days_number) : dias,
        event_code: f.event_code, event_name: eventoNombre(f.event_code),
        reason: f.reason, eps: f.eps || null, arl: f.arl || null,
        daily_salary: f.daily_salary ? Number(f.daily_salary) : null,
        required_resources: f.required_resources || null,
        additional_details: f.additional_details || null,
        origin: "registro_manual", created_by: adminId,
      });
      if (error) throw error;
      registrarAuditoria({ data: { accion: "AUSENTISMO_CREADO", modulo: "ausentismo", tabla: "shift_absenteeism_records", resultado: "exito" } }).catch(() => {});
      toast.success("Registro creado.");
      onDone();
    } catch (e) { console.error(e); toast.error("No se pudo crear."); } finally { setSaving(false); }
  };

  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo registro de ausentismo</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label className="text-xs">Trabajador *</Label><Input value={f.worker_name || ""} onChange={set("worker_name")} /></div>
          <div><Label className="text-xs">C.C.</Label><Input value={f.identification_number || ""} onChange={set("identification_number")} /></div>
          <div><Label className="text-xs">Cargo</Label><Input value={f.role_name || ""} onChange={set("role_name")} /></div>
          <div><Label className="text-xs">Fecha de registro</Label><Input type="date" value={f.registration_date} onChange={set("registration_date")} /></div>
          <div><Label className="text-xs">Fecha inicio *</Label><Input type="date" value={f.start_date || ""} onChange={set("start_date")} /></div>
          <div><Label className="text-xs">Fecha fin</Label><Input type="date" value={f.end_date || ""} onChange={set("end_date")} /></div>
          <div><Label className="text-xs">Hora inicio</Label><Input type="time" value={f.start_time || ""} onChange={set("start_time")} /></div>
          <div><Label className="text-xs">Hora fin</Label><Input type="time" value={f.end_time || ""} onChange={set("end_time")} /></div>
          <div><Label className="text-xs">No. minutos</Label><Input type="number" value={f.minutes_number || ""} onChange={set("minutes_number")} placeholder="auto" /></div>
          <div><Label className="text-xs">No. días</Label><Input type="number" value={f.days_number || ""} onChange={set("days_number")} placeholder="auto" /></div>
          <div><Label className="text-xs">Evento presentado *</Label>
            <Select value={f.event_code} onValueChange={(v) => setF({ ...f, event_code: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{EVENTOS_TH48.map((e) => <SelectItem key={e.code} value={e.code}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-xs">EPS</Label><Input value={f.eps || ""} onChange={set("eps")} /></div>
          <div><Label className="text-xs">ARL</Label><Input value={f.arl || ""} onChange={set("arl")} /></div>
          <div><Label className="text-xs">Salario día</Label><Input type="number" value={f.daily_salary || ""} onChange={set("daily_salary")} /></div>
          <div className="col-span-2"><Label className="text-xs">Motivo *</Label><Input value={f.reason || ""} onChange={set("reason")} /></div>
          <div className="col-span-2"><Label className="text-xs">Recursos requeridos</Label><Input value={f.required_resources || ""} onChange={set("required_resources")} /></div>
          <div className="col-span-2"><Label className="text-xs">Detalles adicionales</Label><Textarea value={f.additional_details || ""} onChange={set("additional_details")} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
