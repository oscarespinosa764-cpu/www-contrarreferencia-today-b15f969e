// FASE 6 · BLOQUE B — Modal de eliminación múltiple de turnos programados.
// Solo interfaz: la autorización real (admin activo), la atomicidad y la
// auditoría viven en la Server Function / RPC canónica.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { MESES, type ShiftType, type ShiftSchedule, type ShiftMember, type ShiftDay } from "@/lib/cuadro-turno-utils";
import { eliminarTurnosProgramadosLote } from "@/lib/cuadro-turnos.functions";

export function EliminarTurnosDialog({
  open, onOpenChange, schedule, members, days, tipos, preselectMemberId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schedule: ShiftSchedule;
  members: ShiftMember[];
  days: ShiftDay[];
  tipos: ShiftType[];
  preselectMemberId?: string | null;
}) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>(preselectMemberId ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);

  const member = members.find((m) => m.id === memberId) ?? null;
  const tipoMap = useMemo(() => new Map(tipos.map((t) => [t.code, t])), [tipos]);

  const filas = useMemo(() => {
    if (!memberId) return [];
    return days
      .filter((d) => d.member_id === memberId && d.schedule_id === schedule.id)
      .sort((a, b) =>
        (a.day_number ?? 0) - (b.day_number ?? 0)
        || String(a.shift_date ?? "").localeCompare(String(b.shift_date ?? ""))
        || String(a.shift_code ?? "").localeCompare(String(b.shift_code ?? "")),
      );
  }, [days, memberId, schedule.id]);

  const cambiarMiembro = (v: string) => { setMemberId(v); setSel(new Set()); };

  const toggle = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const ejecutar = async () => {
    if (!member || sel.size === 0) return;
    setBusy(true);
    try {
      const res = await eliminarTurnosProgramadosLote({
        data: { ids: Array.from(sel), scheduleId: schedule.id, memberId: member.id },
      });
      if (!res.ok) {
        toast.error(res.error || "No fue posible eliminar los turnos seleccionados.");
        return;
      }
      toast.success(`Se eliminaron ${res.eliminados} turnos de ${member.full_name}.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["schedule-days"] }),
        qc.invalidateQueries({ queryKey: ["schedule-members"] }),
        qc.invalidateQueries({ queryKey: ["shift-requests"] }),
      ]);
      setSel(new Set());
      setConfirmar(false);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("No fue posible eliminar los turnos seleccionados.");
    } finally {
      setBusy(false);
    }
  };

  const diasResumen = filas.filter((f) => sel.has(f.id)).map((f) => f.day_number).join(", ");

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eliminar turnos programados</DialogTitle>
            <DialogDescription>
              Retira la programación de un funcionario dentro del periodo seleccionado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Año</Label>
              <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-sm">{schedule.year}</div></div>
            <div><Label className="text-xs">Mes</Label>
              <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-sm">{MESES[(schedule.month ?? 1) - 1]}</div></div>
            <div><Label className="text-xs">Dependencia</Label>
              <div className="truncate rounded-md border bg-muted/40 px-2 py-1.5 text-sm">{schedule.dependency ?? "—"}</div></div>
          </div>

          <div>
            <Label className="text-xs">Funcionario</Label>
            <Select value={memberId} onValueChange={cambiarMiembro}>
              <SelectTrigger><SelectValue placeholder="Selecciona un funcionario" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                    {m.role_name ? ` · ${m.role_name}` : ""}
                    {m.sede ? ` · ${m.sede}` : ""}
                    {m.active === false ? " · inactivo" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {member && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button size="sm" variant="outline" onClick={() => setSel(new Set(filas.map((f) => f.id)))} disabled={filas.length === 0}>
                  Seleccionar todos
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSel(new Set())} disabled={sel.size === 0}>
                  Deseleccionar todos
                </Button>
                <span className="ml-auto text-muted-foreground">{sel.size} de {filas.length} seleccionado(s)</span>
              </div>

              <div className="max-h-72 overflow-auto rounded-md border">
                {filas.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Este funcionario no tiene turnos programados en el periodo.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr className="text-left">
                        <th className="w-8 p-2" />
                        <th className="p-2">Día</th>
                        <th className="p-2">Fecha</th>
                        <th className="p-2">Código</th>
                        <th className="p-2">Tipo</th>
                        <th className="p-2">Horario</th>
                        <th className="p-2">Horas</th>
                        <th className="p-2">Origen</th>
                        <th className="p-2">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => {
                        const t = f.shift_code ? tipoMap.get(f.shift_code) : undefined;
                        const horario = t?.start_time && t?.end_time
                          ? `${t.start_time.slice(0, 5)}–${t.end_time.slice(0, 5)}` : "—";
                        return (
                          <tr key={f.id} className={`border-t ${sel.has(f.id) ? "bg-rose-50 dark:bg-rose-950/20" : ""}`}>
                            <td className="p-2">
                              <Checkbox checked={sel.has(f.id)} onCheckedChange={() => toggle(f.id)} aria-label={`Seleccionar día ${f.day_number}`} />
                            </td>
                            <td className="p-2 font-medium">{f.day_number}</td>
                            <td className="p-2">{f.shift_date ?? "—"}</td>
                            <td className="p-2">{f.shift_code ?? "—"}</td>
                            <td className="p-2">{t?.name ?? "—"}</td>
                            <td className="p-2">{horario}</td>
                            <td className="p-2">{f.hours ?? "—"}</td>
                            <td className="p-2">{f.origin ?? "—"}</td>
                            <td className="max-w-[160px] truncate p-2" title={f.notes ?? ""}>{f.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" disabled={busy || sel.size === 0} onClick={() => setConfirmar(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar {sel.size} turnos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmar} onOpenChange={(v) => !busy && setConfirmar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {sel.size} turnos programados de {member?.full_name ?? "—"} para {MESES[(schedule.month ?? 1) - 1]}/{schedule.year}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p>Días: {diasResumen || "—"}</p>
                <p>La programación de estos días será retirada del Cuadro de Turno.</p>
                <p>
                  No se elimina el funcionario, ni el catálogo de turnos, ni las auditorías,
                  ni las sesiones o entregas históricas. Los turnos pueden volver a cargarse
                  manualmente o mediante el flujo de importación existente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void ejecutar(); }}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Eliminar {sel.size} turnos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
