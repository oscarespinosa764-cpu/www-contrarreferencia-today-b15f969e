import { useMemo, useRef, useState } from "react";
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
import { Plus, UserPlus, FileDown, Upload, Loader2, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import {
  MESES, diasDelMes, letraDiaSemana, fechaISO, totalHorasMiembro, tiempoExtra, tiempoTotal,
  diasSegunFrecuencia,
  type ShiftType, type ShiftSchedule, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";
import { exportarPlantillaCuadro, exportarCuadroMensual, importarCuadroExcel } from "@/lib/cuadro-excel";

export function CuadroMensualPanel({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const dependency = "Referencia y Contrarreferencia";
  const ndias = diasDelMes(anio, mes);

  const { data: tipos = [] } = useQuery({
    queryKey: ["shift-types"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_types").select("*").order("code");
      return (data ?? []) as unknown as ShiftType[];
    },
  });

  const { data: schedule } = useQuery({
    queryKey: ["schedule", anio, mes],
    queryFn: async () => {
      const { data } = await supabase.from("shift_schedules")
        .select("*").eq("year", anio).eq("month", mes).eq("dependency", dependency).maybeSingle();
      return (data ?? null) as unknown as ShiftSchedule | null;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["schedule-members", schedule?.id],
    enabled: !!schedule,
    queryFn: async () => {
      const { data } = await supabase.from("shift_schedule_members")
        .select("*").eq("schedule_id", schedule!.id).order("sort_order");
      return (data ?? []) as unknown as ShiftMember[];
    },
  });

  const { data: days = [] } = useQuery({
    queryKey: ["schedule-days", schedule?.id],
    enabled: !!schedule,
    queryFn: async () => {
      const { data } = await supabase.from("shift_schedule_days")
        .select("*").eq("schedule_id", schedule!.id);
      return (data ?? []) as unknown as ShiftDay[];
    },
  });

  const dayMap = useMemo(() => {
    const m = new Map<string, ShiftDay>();
    for (const d of days) m.set(`${d.member_id}:${d.day_number}`, d);
    return m;
  }, [days]);

  const tipoMap = useMemo(() => new Map(tipos.map((t) => [t.code, t])), [tipos]);
  const [cell, setCell] = useState<{ member: ShiftMember; day: number } | null>(null);
  const [plantillaOpen, setPlantillaOpen] = useState(false);
  const [vista, setVista] = useState<"matriz" | "calendario">("matriz");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  const exportarPlantilla = () => {
    exportarPlantillaCuadro({ anio, mes, members, days, tipos, baseHoras: schedule?.base_hours });
    registrarAuditoria({ data: { accion: "PLANTILLA_TH-FR-10_DESCARGADA", modulo: "cuadro_turno", tabla: "shift_schedules", registroId: schedule?.id ?? "", resultado: "exito", detalles: { anio, mes } } }).catch(() => {});
  };

  const exportarCuadro = () => {
    exportarCuadroMensual({ anio, mes, members, days, tipos, baseHoras: schedule?.base_hours });
    registrarAuditoria({ data: { accion: "CUADRO_TH-FR-10_EXPORTADO", modulo: "cuadro_turno", tabla: "shift_schedules", registroId: schedule?.id ?? "", resultado: "exito", detalles: { anio, mes } } }).catch(() => {});
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !schedule) return;
    setImportando(true);
    try {
      const r = await importarCuadroExcel({
        file, scheduleId: schedule.id, anio, mes, members, tipos, userId: user!.id,
      });
      registrarAuditoria({ data: { accion: "CUADRO_IMPORTADO", modulo: "cuadro_turno", tabla: "shift_schedule_days", registroId: schedule.id, resultado: "exito", detalles: { ...r } } }).catch(() => {});
      let msg = `Importado: ${r.miembrosNuevos} nuevo(s), ${r.diasCargados} día(s).`;
      if (r.codigosDesconocidos.length) msg += ` Códigos no reconocidos: ${r.codigosDesconocidos.join(", ")}.`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["schedule-members"] });
      qc.invalidateQueries({ queryKey: ["schedule-days"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo importar el archivo.");
    } finally {
      setImportando(false);
    }
  };


  const crearCuadro = async () => {
    const { error } = await supabase.from("shift_schedules").insert({
      year: anio, month: mes, dependency, base_hours: 176, status: "borrador", created_by: user!.id,
    });
    if (error) return toast.error("No se pudo crear el cuadro.");
    registrarAuditoria({ data: { accion: "CUADRO_CREADO", modulo: "cuadro_turno", tabla: "shift_schedules", resultado: "exito" } }).catch(() => {});
    toast.success("Cuadro creado.");
    qc.invalidateQueries({ queryKey: ["schedule"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Año</Label><Input type="number" className="w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value))} /></div>
        <div><Label className="text-xs">Mes</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setVista("matriz")}
              className={`px-2.5 py-1 font-medium transition-colors ${vista === "matriz" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              Matriz
            </button>
            <button
              type="button"
              onClick={() => setVista("calendario")}
              className={`px-2.5 py-1 font-medium transition-colors ${vista === "calendario" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              Calendario
            </button>
          </div>
          {tipos.filter((t) => t.active).map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
              <span className="inline-block h-3 w-3 rounded" style={{ background: t.color }} /> {t.code}
            </span>
          ))}
        </div>
      </div>

      {!schedule ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay cuadro para {MESES[mes - 1]} {anio}.</p>
          {isAdmin && <Button className="mt-3" onClick={crearCuadro}><Plus className="mr-1.5 h-4 w-4" /> Crear cuadro</Button>}
        </Card>
      ) : (
        <>
          {isAdmin && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportarPlantilla}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Plantilla TH-FR-10
                </Button>
                <Button size="sm" onClick={exportarCuadro}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Exportar cuadro TH-FR-10
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPlantillaOpen(true)}>
                  <CalendarRange className="mr-1.5 h-4 w-4" /> Asignar plantilla de turno
                </Button>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importando}>
                  {importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                  Importar Excel
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImportFile} />
              </div>
              <AddMemberInline scheduleId={schedule.id} sortOrder={members.length} onAdded={() => qc.invalidateQueries({ queryKey: ["schedule-members"] })} />
            </>
          )}
          {vista === "matriz" ? (
            <>
              <Card className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="sticky left-0 z-10 bg-muted/60 px-2 py-1 text-left">Colaborador</th>
                      <th className="px-2 py-1 text-left">Cargo</th>
                      {Array.from({ length: ndias }, (_, i) => i + 1).map((d) => (
                        <th key={d} className="px-1 py-1 text-center">
                          <div>{d}</div>
                          <div className="text-[9px] text-muted-foreground">{letraDiaSemana(anio, mes, d)}</div>
                        </th>
                      ))}
                      <th className="px-2 py-1 text-center">Tot</th>
                      <th className="px-2 py-1 text-center">Extra</th>
                      <th className="px-2 py-1 text-center">Pend</th>
                      <th className="px-2 py-1 text-center">T.Tot</th>
                      <th className="px-2 py-1 text-left">Novedades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length === 0 ? (
                      <tr><td colSpan={ndias + 7} className="py-6 text-center text-muted-foreground">Sin colaboradores en el cuadro.</td></tr>
                    ) : members.map((m) => {
                      const mdays = days.filter((d) => d.member_id === m.id);
                      const total = totalHorasMiembro(mdays);
                      const base = m.base_hours ?? schedule.base_hours;
                      const extra = tiempoExtra(total, base);
                      const ttot = tiempoTotal(extra, m.pending_hours);
                      return (
                        <tr key={m.id} className="border-t">
                          <td className="sticky left-0 z-10 bg-background px-2 py-1 font-medium">{m.full_name}</td>
                          <td className="px-2 py-1">{m.role_name ?? "—"}</td>
                          {Array.from({ length: ndias }, (_, i) => i + 1).map((d) => {
                            const cd = dayMap.get(`${m.id}:${d}`);
                            const tipo = cd?.shift_code ? tipoMap.get(cd.shift_code) : undefined;
                            return (
                              <td
                                key={d}
                                className={`px-1 py-1 text-center ${isAdmin ? "cursor-pointer hover:ring-1 hover:ring-primary" : ""}`}
                                style={tipo ? { background: tipo.color + "33" } : undefined}
                                onClick={() => isAdmin && setCell({ member: m, day: d })}
                              >
                                {cd?.shift_code ?? ""}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1 text-center font-semibold">{total}</td>
                          <td className="px-2 py-1 text-center">{extra}</td>
                          <td className="px-2 py-1 text-center">{m.pending_hours}</td>
                          <td className="px-2 py-1 text-center">{ttot}</td>
                          <td className="px-2 py-1">{m.notes ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              <p className="text-xs text-muted-foreground">Horas base del mes: {schedule.base_hours}. {isAdmin ? "Haz clic en una celda para asignar turno." : "Vista de solo lectura."}</p>
            </>
          ) : (
            <CalendarView
              anio={anio}
              mes={mes}
              ndias={ndias}
              members={members}
              dayMap={dayMap}
              tipoMap={tipoMap}
              isAdmin={isAdmin}
              onCellClick={(m, d) => setCell({ member: m, day: d })}
            />
          )}
        </>
      )}

      {cell && schedule && (
        <EditCellDialog
          scheduleId={schedule.id}
          member={cell.member}
          day={cell.day}
          dateISO={fechaISO(anio, mes, cell.day)}
          current={dayMap.get(`${cell.member.id}:${cell.day}`) ?? null}
          tipos={tipos}
          userId={user!.id}
          onClose={() => setCell(null)}
          onSaved={() => { setCell(null); qc.invalidateQueries({ queryKey: ["schedule-days"] }); }}
        />
      )}

      {plantillaOpen && schedule && (
        <AsignarPlantillaDialog
          scheduleId={schedule.id}
          anio={anio}
          mes={mes}
          ndias={ndias}
          members={members}
          tipos={tipos}
          userId={user!.id}
          onClose={() => setPlantillaOpen(false)}
          onSaved={() => { setPlantillaOpen(false); qc.invalidateQueries({ queryKey: ["schedule-days"] }); }}
        />
      )}
    </div>
  );
}

const DOW_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function CalendarView({
  anio, mes, ndias, members, dayMap, tipoMap, isAdmin, onCellClick,
}: {
  anio: number; mes: number; ndias: number;
  members: ShiftMember[];
  dayMap: Map<string, ShiftDay>;
  tipoMap: Map<string, ShiftType>;
  isAdmin: boolean;
  onCellClick: (m: ShiftMember, d: number) => void;
}) {
  const firstDow = new Date(anio, mes - 1, 1).getDay(); // 0=Dom
  const totalCells = Math.ceil((firstDow + ndias) / 7) * 7;

  return (
    <Card className="p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1">
        {DOW_HEADERS.map((h) => (
          <div key={h} className="py-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {h}
          </div>
        ))}
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - firstDow + 1;
          const valido = dayNum >= 1 && dayNum <= ndias;
          if (!valido) return <div key={i} className="min-h-[92px] rounded-lg bg-muted/20" />;

          const asignados = members
            .map((m) => ({ m, cd: dayMap.get(`${m.id}:${dayNum}`) }))
            .filter((x) => x.cd?.shift_code);

          return (
            <div
              key={i}
              className="min-h-[92px] rounded-lg border bg-background p-1.5 transition-colors hover:border-primary/40"
            >
              <div className="mb-1 text-right text-[11px] font-bold text-muted-foreground">{dayNum}</div>
              <div className="space-y-0.5">
                {asignados.length === 0 ? (
                  <p className="text-[10px] italic text-muted-foreground/50">—</p>
                ) : (
                  asignados.map(({ m, cd }) => {
                    const tipo = cd!.shift_code ? tipoMap.get(cd!.shift_code) : undefined;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => isAdmin && onCellClick(m, dayNum)}
                        className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] ${isAdmin ? "hover:ring-1 hover:ring-primary" : ""}`}
                        style={tipo ? { background: tipo.color + "33" } : undefined}
                        title={`${m.full_name} · ${cd!.shift_code}${cd!.notes ? ` · ${cd!.notes}` : ""}`}
                      >
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: tipo?.color ?? "#999" }} />
                        <span className="truncate font-medium">{m.full_name.split(" ")[0]}</span>
                        <span className="ml-auto shrink-0 font-bold">{cd!.shift_code}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {isAdmin ? "Haz clic en un turno para editarlo." : "Vista de solo lectura."}
      </p>
    </Card>
  );
}

function AddMemberInline({ scheduleId, sortOrder, onAdded }: { scheduleId: string; sortOrder: number; onAdded: () => void }) {
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const add = async () => {
    if (!nombre.trim()) return toast.error("Nombre requerido.");
    const { error } = await supabase.from("shift_schedule_members").insert({
      schedule_id: scheduleId, full_name: nombre.trim(), role_name: cargo || null, sort_order: sortOrder,
    });
    if (error) return toast.error("No se pudo agregar.");
    setNombre(""); setCargo(""); onAdded();
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><Label className="text-xs">Colaborador</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-48" /></div>
      <div><Label className="text-xs">Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} className="w-40" /></div>
      <Button size="sm" variant="outline" onClick={add}><UserPlus className="mr-1.5 h-4 w-4" /> Agregar</Button>
    </div>
  );
}

function EditCellDialog({
  scheduleId, member, day, dateISO, current, tipos, userId, onClose, onSaved,
}: {
  scheduleId: string; member: ShiftMember; day: number; dateISO: string;
  current: ShiftDay | null; tipos: ShiftType[]; userId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(current?.shift_code ?? "");
  const [notas, setNotas] = useState(current?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const tipo = tipos.find((t) => t.code === code);
      const hours = tipo?.hours ?? 0;
      const payload = {
        schedule_id: scheduleId, member_id: member.id, day_number: day,
        shift_date: dateISO, shift_code: code || null, hours, notes: notas || null,
        origin: "edicion_directa", changed_by: userId, changed_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("shift_schedule_days")
        .upsert(payload, { onConflict: "member_id,day_number" });
      if (error) throw error;
      registrarAuditoria({ data: { accion: "TURNO_EDITADO", modulo: "cuadro_turno", tabla: "shift_schedule_days", resultado: "exito", detalles: { colaborador: member.full_name, dia: day, turno: code } } }).catch(() => {});
      onSaved();
    } catch (e) { console.error(e); toast.error("No se pudo guardar."); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{member.full_name} · día {day}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Turno</Label>
            <Select value={code || "__none"} onValueChange={(v) => setCode(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin turno</SelectItem>
                {tipos.filter((t) => t.active).map((t) => (
                  <SelectItem key={t.id} value={t.code}>{t.code} — {t.name} ({t.hours}h)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Novedad / nota</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DOW_OPCIONES = [
  { dow: 1, label: "L" },
  { dow: 2, label: "M" },
  { dow: 3, label: "X" },
  { dow: 4, label: "J" },
  { dow: 5, label: "V" },
  { dow: 6, label: "S" },
  { dow: 0, label: "D" },
];

function AsignarPlantillaDialog({
  scheduleId, anio, mes, ndias, members, tipos, userId, onClose, onSaved,
}: {
  scheduleId: string; anio: number; mes: number; ndias: number;
  members: ShiftMember[]; tipos: ShiftType[]; userId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [memberId, setMemberId] = useState<string>("__all");
  const [code, setCode] = useState<string>("");
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(ndias);
  const [frecuencia, setFrecuencia] = useState<"todos" | "dias">("todos");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [sobrescribir, setSobrescribir] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleDow = (dow: number) =>
    setWeekdays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]));

  const diasObjetivo = useMemo(
    () => diasSegunFrecuencia(anio, mes, { desde, hasta, todos: frecuencia === "todos", weekdays }),
    [anio, mes, desde, hasta, frecuencia, weekdays],
  );

  const targets = memberId === "__all" ? members : members.filter((m) => m.id === memberId);

  const aplicar = async () => {
    if (!code) return toast.error("Selecciona un turno.");
    if (targets.length === 0) return toast.error("No hay colaboradores.");
    if (diasObjetivo.length === 0) return toast.error("No hay días que coincidan con la frecuencia.");
    setSaving(true);
    try {
      const tipo = tipos.find((t) => t.code === code);
      const hours = tipo?.hours ?? 0;
      const now = new Date().toISOString();
      const rows: any[] = [];
      for (const m of targets) {
        for (const d of diasObjetivo) {
          rows.push({
            schedule_id: scheduleId, member_id: m.id, day_number: d,
            shift_date: fechaISO(anio, mes, d), shift_code: code, hours,
            origin: "plantilla", changed_by: userId, changed_at: now,
          });
        }
      }
      // Si no se sobrescribe, no tocar días ya asignados.
      let filas = rows;
      if (!sobrescribir) {
        const { data: existentes } = await supabase.from("shift_schedule_days")
          .select("member_id, day_number, shift_code")
          .eq("schedule_id", scheduleId);
        const ocupados = new Set(
          (existentes ?? [])
            .filter((e: any) => e.shift_code)
            .map((e: any) => `${e.member_id}:${e.day_number}`),
        );
        filas = rows.filter((r) => !ocupados.has(`${r.member_id}:${r.day_number}`));
      }
      if (filas.length === 0) {
        toast.error("Todos los días seleccionados ya tienen turno. Activa «Sobrescribir» para reemplazarlos.");
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("shift_schedule_days")
        .upsert(filas, { onConflict: "member_id,day_number" });
      if (error) throw error;
      registrarAuditoria({ data: { accion: "PLANTILLA_TURNO_APLICADA", modulo: "cuadro_turno", tabla: "shift_schedule_days", registroId: scheduleId, resultado: "exito", detalles: { turno: code, colaboradores: targets.length, dias: diasObjetivo.length, filas: filas.length, frecuencia } } }).catch(() => {});
      toast.success(`Plantilla aplicada: ${filas.length} asignación(es).`);
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudo aplicar la plantilla.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar plantilla de turno</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Colaborador</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los colaboradores</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Turno</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger><SelectValue placeholder="Selecciona un turno" /></SelectTrigger>
              <SelectContent>
                {tipos.filter((t) => t.active).map((t) => (
                  <SelectItem key={t.id} value={t.code}>{t.code} — {t.name} ({t.hours}h)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Desde (día)</Label><Input type="number" min={1} max={ndias} value={desde} onChange={(e) => setDesde(Number(e.target.value))} /></div>
            <div><Label className="text-xs">Hasta (día)</Label><Input type="number" min={1} max={ndias} value={hasta} onChange={(e) => setHasta(Number(e.target.value))} /></div>
          </div>
          <div>
            <Label className="text-xs">Frecuencia</Label>
            <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as "todos" | "dias")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los días del rango</SelectItem>
                <SelectItem value="dias">Días específicos de la semana</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frecuencia === "dias" && (
            <div className="flex flex-wrap gap-1.5">
              {DOW_OPCIONES.map((o) => (
                <button
                  key={o.dow}
                  type="button"
                  onClick={() => toggleDow(o.dow)}
                  className={`h-8 w-8 rounded-md border text-xs font-semibold transition-colors ${
                    weekdays.includes(o.dow)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
            Sobrescribir días que ya tienen turno
          </label>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Se aplicará a <strong>{targets.length}</strong> colaborador(es) en{" "}
            <strong>{diasObjetivo.length}</strong> día(s) del mes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={saving}>{saving ? "Aplicando…" : "Aplicar plantilla"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
