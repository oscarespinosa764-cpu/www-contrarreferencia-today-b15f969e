import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
import { Plus, UserPlus, FileDown, Loader2, Trash2, CalendarDays, Grid3X3, List, Users, AlertTriangle, Activity, Search } from "lucide-react";
import { toast } from "sonner";
import {
  MESES, diasDelMes, letraDiaSemana, fechaISO, totalHorasMiembro, tiempoExtra, tiempoTotal,
  type ShiftType, type ShiftSchedule, type ShiftMember, type ShiftDay,
} from "@/lib/cuadro-turno-utils";
import { exportarCuadroMensual } from "@/lib/cuadro-excel";

const CUADRO_ROUTE = "/_authenticated/cuadro-turno" as const;
const VISTAS = ["calendario", "matriz", "lista"] as const;
type VistaCuadro = (typeof VISTAS)[number];

interface ReqSummary {
  status: string | null;
  requires_replacement: boolean | null;
  start_date: string | null;
  original_shift_date: string | null;
  created_at: string | null;
}

const sameMonth = (iso: string | null | undefined, year: number, month: number) => {
  if (!iso) return false;
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return y === year && m === month;
};

export function CuadroMensualPanel({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: CUADRO_ROUTE });
  const search = useSearch({ from: CUADRO_ROUTE });
  const now = new Date();
  const anio = Number.isFinite(search.anio) ? search.anio : now.getFullYear();
  const mes = Math.min(12, Math.max(1, Number.isFinite(search.mes) ? search.mes : now.getMonth() + 1));
  const vista: VistaCuadro = VISTAS.includes(search.vista as VistaCuadro) ? (search.vista as VistaCuadro) : "calendario";
  const busq = search.q ?? "";
  const cargoF = search.cargo ?? "";
  const selectedDay = search.dia && search.dia >= 1 && search.dia <= diasDelMes(anio, mes) ? search.dia : Math.min(now.getDate(), diasDelMes(anio, mes));
  const dependency = "Referencia y Contrarreferencia";
  const ndias = diasDelMes(anio, mes);

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });

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
        .select(
          "id, schedule_id, user_id, full_name, role_name, sede, active, base_hours, pending_hours, notes, sort_order",
        )
        .eq("schedule_id", schedule!.id).order("sort_order");
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

  const { data: requests = [] } = useQuery({
    queryKey: ["shift-requests", "cuadro-resumen", anio, mes],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_requests")
        .select("status, requires_replacement, start_date, original_shift_date, created_at");
      return (data ?? []) as unknown as ReqSummary[];
    },
  });

  const dayMap = useMemo(() => {
    const m = new Map<string, ShiftDay>();
    for (const d of days) m.set(`${d.member_id}:${d.day_number}`, d);
    return m;
  }, [days]);

  const tipoMap = useMemo(() => new Map(tipos.map((t) => [t.code, t])), [tipos]);
  const [cell, setCell] = useState<{ member: ShiftMember; day: number } | null>(null);
  const [asignar, setAsignar] = useState<ShiftMember | null>(null);
  const [asignarOpen, setAsignarOpen] = useState(false);

  const cargos = useMemo(() => {
    const s = new Set<string>();
    members.forEach((m) => m.role_name && s.add(m.role_name));
    return Array.from(s).sort();
  }, [members]);

  const membersFiltrados = useMemo(() => {
    const q = busq.trim().toLowerCase();
    return members.filter((m) => {
      if (cargoF && m.role_name !== cargoF) return false;
      if (q && !m.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, busq, cargoF]);

  const kpis = useMemo(() => {
    const memberIds = new Set(membersFiltrados.map((m) => m.id));
    const daysF = days.filter((d) => memberIds.has(d.member_id) && d.shift_code);
    const turnosProg = daysF.length;
    const ausenciaCodes = new Set(["A", "I", "P", "V"]);
    const reqMes = requests.filter((r) => sameMonth(r.original_shift_date || r.start_date || r.created_at, anio, mes));
    const coberturas = reqMes.filter((r) => r.requires_replacement && r.status === "APROBADA").length;
    const coberturasPendientes = reqMes.filter((r) => r.requires_replacement && ["PENDIENTE", "DEVUELTA PARA AJUSTE"].includes(r.status ?? "")).length;
    const novedades = daysF.filter((d) => d.shift_code && ausenciaCodes.has(d.shift_code)).length
      + reqMes.filter((r) => ["PENDIENTE", "DEVUELTA PARA AJUSTE"].includes(r.status ?? "")).length;
    const asignados = new Set(daysF.map((d) => d.member_id));
    const disp = membersFiltrados.length > 0
      ? Math.round((asignados.size / membersFiltrados.length) * 100)
      : null;
    return { turnosProg, coberturas, coberturasPendientes, novedades, disp, totalMembers: membersFiltrados.length };
  }, [membersFiltrados, days, requests, anio, mes]);


  const exportarCuadro = () => {
    exportarCuadroMensual({ anio, mes, members, days, tipos, baseHoras: schedule?.base_hours });
    registrarAuditoria({ data: { accion: "CUADRO_EXPORTADO", modulo: "cuadro_turno", tabla: "shift_schedules", registroId: schedule?.id ?? "", resultado: "exito", detalles: { anio, mes } } }).catch(() => {});
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

  const abrirAsignacion = (m: ShiftMember | null) => {
    setAsignar(m);
    setAsignarOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div><Label className="text-xs">Año</Label><Input type="number" className="w-24" value={anio} onChange={(e) => setSearch({ anio: Number(e.target.value), dia: undefined })} /></div>
        <div><Label className="text-xs">Mes</Label>
          <Select value={String(mes)} onValueChange={(v) => setSearch({ mes: Number(v), dia: undefined })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select></div>
        <Button size="sm" variant="outline" onClick={exportarCuadro} disabled={!schedule}>
          <FileDown className="mr-1.5 h-4 w-4" /> Exportar Excel
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border">
            <ViewButton active={vista === "calendario"} onClick={() => setSearch({ vista: "calendario" })} icon={CalendarDays} label="Calendario" />
            <ViewButton active={vista === "matriz"} onClick={() => setSearch({ vista: "matriz" })} icon={Grid3X3} label="Matriz" />
            <ViewButton active={vista === "lista"} onClick={() => setSearch({ vista: "lista" })} icon={List} label="Lista" />
          </div>
          {tipos.filter((t) => t.active).map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5" title={`${t.name}${t.start_time && t.end_time ? ` · ${t.start_time.slice(0, 5)}-${t.end_time.slice(0, 5)}` : ""}`}>
              <span className="inline-block h-3 w-3 rounded" style={{ background: t.color }} /> {t.code}
            </span>
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div>
          <Label className="text-xs">Colaborador</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador…"
              value={busq}
              onChange={(e) => setSearch({ q: e.target.value })}
              className="h-9 w-64 pl-8 text-xs"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Cargo</Label>
          <Select value={cargoF || "__all"} onValueChange={(v) => setSearch({ cargo: v === "__all" ? "" : v })}>
            <SelectTrigger className="h-9 w-52 text-xs"><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos los cargos</SelectItem>
              {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(busq || cargoF) && (
          <Button size="sm" variant="ghost" onClick={() => setSearch({ q: "", cargo: "" })}>
            Limpiar filtros
          </Button>
        )}
        {isAdmin && schedule && (
          <Button size="sm" className="ml-auto" onClick={() => abrirAsignacion(null)} disabled={members.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar
          </Button>
        )}
      </Card>

      {schedule && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card className="p-3">
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /><p className="text-[11px] uppercase text-muted-foreground">Turnos programados</p></div>
              <p className="mt-1 text-2xl font-bold">{kpis.turnosProg}</p>
              <p className="text-[10px] text-muted-foreground">{MESES[mes - 1]} {anio}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-600" /><p className="text-[11px] uppercase text-muted-foreground">Coberturas</p></div>
              <p className="mt-1 text-2xl font-bold">{kpis.coberturas}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.coberturasPendientes} pendiente(s)</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><p className="text-[11px] uppercase text-muted-foreground">Novedades</p></div>
              <p className="mt-1 text-2xl font-bold">{kpis.novedades}</p>
              <p className="text-[10px] text-muted-foreground">Ausencias y solicitudes pendientes</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-sky-600" /><p className="text-[11px] uppercase text-muted-foreground">Disponibilidad del equipo</p></div>
              <p className="mt-1 text-2xl font-bold">{kpis.disp == null ? "—" : `${kpis.disp}%`}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.totalMembers} funcionario(s)</p>
            </Card>
          </div>
          <div className="sr-only">
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Turnos programados</p>
              <p className="mt-1 text-2xl font-bold">{kpis.turnosProg}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Cobertura laboral</p>
              <p className="mt-1 text-2xl font-bold">{kpis.coberturas}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Novedades</p>
              <p className="mt-1 text-2xl font-bold">{kpis.novedades}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Disponibilidad</p>
              <p className="mt-1 text-2xl font-bold">{kpis.disp == null ? "—" : `${kpis.disp}%`}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.totalMembers} funcionario(s)</p>
            </Card>
          </div>
          <p className="text-right text-[11px] text-muted-foreground">Mostrando {membersFiltrados.length} de {members.length}</p>
        </>
      )}


      {!schedule ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay cuadro para {MESES[mes - 1]} {anio}.</p>
          {isAdmin && <Button className="mt-3" onClick={crearCuadro}><Plus className="mr-1.5 h-4 w-4" /> Crear cuadro</Button>}
        </Card>
      ) : (
        <>
          {isAdmin && (
            <>
              <AgregarColaborador
                scheduleId={schedule.id}
                sortOrder={members.length}
                members={members}
                onAsignar={abrirAsignacion}
                onMembersChanged={() => qc.invalidateQueries({ queryKey: ["schedule-members"] })}
              />
            </>
          )}
          {vista === "calendario" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <CalendarView
                anio={anio}
                mes={mes}
                ndias={ndias}
                members={membersFiltrados}
                dayMap={dayMap}
                tipoMap={tipoMap}
                selectedDay={selectedDay}
                onCellClick={(m, d) => setCell({ member: m, day: d })}
                onMoreClick={(d) => setSearch({ dia: d })}
              />
              <DaySummaryPanel
                anio={anio}
                mes={mes}
                day={selectedDay}
                members={membersFiltrados}
                dayMap={dayMap}
                tipoMap={tipoMap}
                onEdit={(m) => setCell({ member: m, day: selectedDay })}
              />
            </div>
          ) : vista === "lista" ? (
            <ListView
              anio={anio}
              mes={mes}
              members={membersFiltrados}
              days={days}
              tipoMap={tipoMap}
              onEdit={(m, d) => setCell({ member: m, day: d })}
            />
          ) : (
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
                    {membersFiltrados.length === 0 ? (
                      <tr><td colSpan={ndias + 7} className="py-6 text-center text-muted-foreground">Sin colaboradores en el cuadro.</td></tr>
                    ) : membersFiltrados.map((m) => {
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
                                className="cursor-pointer px-1 py-1 text-center hover:ring-1 hover:ring-primary"
                                style={tipo ? { background: tipo.color + "33" } : undefined}
                                onClick={() => setCell({ member: m, day: d })}
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
              <p className="text-xs text-muted-foreground">Horas base del mes: {schedule.base_hours}. Haz clic en una celda para ver o editar el turno.</p>
            </>
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
          isAdmin={isAdmin}
          onClose={() => setCell(null)}
          onSaved={() => { setCell(null); qc.invalidateQueries({ queryKey: ["schedule-days"] }); }}
        />
      )}

      {asignarOpen && schedule && (
        <AsignarTurnosDialog
          scheduleId={schedule.id}
          anio={anio}
          mes={mes}
          ndias={ndias}
          member={asignar}
          members={members}
          tipos={tipos}
          userId={user!.id}
          onClose={() => { setAsignarOpen(false); setAsignar(null); }}
          onSaved={() => { setAsignarOpen(false); setAsignar(null); qc.invalidateQueries({ queryKey: ["schedule-days"] }); }}
        />
      )}

      {dayDetail != null && schedule && (
        <DayDetailDialog
          anio={anio}
          mes={mes}
          day={dayDetail}
          members={membersFiltrados}
          dayMap={dayMap}
          tipoMap={tipoMap}
          onClose={() => setDayDetail(null)}
          onEdit={(m) => { setCell({ member: m, day: dayDetail }); setDayDetail(null); }}
        />
      )}
    </div>
  );
}

const DOW_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function CalendarView({
  anio, mes, ndias, members, dayMap, tipoMap, onCellClick, onMoreClick,
}: {
  anio: number; mes: number; ndias: number;
  members: ShiftMember[];
  dayMap: Map<string, ShiftDay>;
  tipoMap: Map<string, ShiftType>;
  onCellClick: (m: ShiftMember, d: number) => void;
  onMoreClick: (d: number) => void;
}) {
  const firstDow = new Date(anio, mes - 1, 1).getDay(); // 0=Dom
  const totalCells = Math.ceil((firstDow + ndias) / 7) * 7;
  const MAX = 4;

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
          if (!valido) return <div key={i} className="min-h-[110px] rounded-lg bg-muted/20" />;

          const asignados = members
            .map((m) => ({ m, cd: dayMap.get(`${m.id}:${dayNum}`) }))
            .filter((x) => x.cd?.shift_code);
          const visibles = asignados.slice(0, MAX);
          const extra = asignados.length - visibles.length;

          return (
            <div
              key={i}
              className="flex min-h-[110px] flex-col rounded-lg border bg-background p-1.5 transition-colors hover:border-primary/40"
            >
              <button
                type="button"
                onClick={() => onMoreClick(dayNum)}
                className="mb-1 text-right text-[11px] font-bold text-muted-foreground hover:text-primary"
              >
                {dayNum}
              </button>
              <div className="space-y-0.5">
                {asignados.length === 0 ? (
                  <p className="text-[10px] italic text-muted-foreground/50">—</p>
                ) : (
                  <>
                    {visibles.map(({ m, cd }) => {
                      const tipo = cd!.shift_code ? tipoMap.get(cd!.shift_code) : undefined;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onCellClick(m, dayNum)}
                          className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:ring-1 hover:ring-primary"
                          style={tipo ? { background: tipo.color + "33" } : undefined}
                          title={`${m.full_name} · ${cd!.shift_code}${cd!.notes ? ` · ${cd!.notes}` : ""}`}
                        >
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: tipo?.color ?? "#999" }} />
                          <span className="truncate font-medium">{m.full_name.split(" ")[0]}</span>
                          <span className="ml-auto shrink-0 font-bold">{cd!.shift_code}</span>
                        </button>
                      );
                    })}
                    {extra > 0 && (
                      <button
                        type="button"
                        onClick={() => onMoreClick(dayNum)}
                        className="w-full rounded bg-muted/60 px-1 py-0.5 text-[10px] font-semibold text-primary hover:bg-muted"
                      >
                        +{extra} más
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Haz clic en un turno para ver el detalle · Haz clic en el número del día para ver el resumen completo.
      </p>
    </Card>
  );
}

function DayDetailDialog({
  anio, mes, day, members, dayMap, tipoMap, onClose, onEdit,
}: {
  anio: number; mes: number; day: number;
  members: ShiftMember[];
  dayMap: Map<string, ShiftDay>;
  tipoMap: Map<string, ShiftType>;
  onClose: () => void;
  onEdit: (m: ShiftMember) => void;
}) {
  const asignados = members
    .map((m) => ({ m, cd: dayMap.get(`${m.id}:${day}`) }))
    .filter((x) => x.cd?.shift_code);
  const resumen = new Map<string, number>();
  asignados.forEach(({ cd }) => {
    const c = cd!.shift_code!;
    resumen.set(c, (resumen.get(c) ?? 0) + 1);
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumen del día {day} · {MESES[mes - 1]} {anio}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {Array.from(resumen.entries()).map(([code, n]) => {
              const t = tipoMap.get(code);
              return (
                <span key={code} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ background: (t?.color ?? "#999") + "22" }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: t?.color ?? "#999" }} />
                  <span className="font-bold">{code}</span>
                  <span className="text-muted-foreground">×{n}</span>
                </span>
              );
            })}
            {resumen.size === 0 && <p className="text-xs text-muted-foreground">Sin asignaciones.</p>}
          </div>
          <div className="divide-y rounded-md border">
            {asignados.map(({ m, cd }) => {
              const t = cd!.shift_code ? tipoMap.get(cd!.shift_code) : undefined;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onEdit(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t?.color ?? "#999" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.full_name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{m.role_name ?? "—"}{cd!.notes ? ` · ${cd!.notes}` : ""}</p>
                  </div>
                  <span className="font-bold">{cd!.shift_code}</span>
                </button>
              );
            })}
            {asignados.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sin funcionarios asignados este día.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/** Selecciona un funcionario del sistema, autollena el cargo y abre la asignación de turnos. */
function AgregarColaborador({
  scheduleId, sortOrder, members, onAsignar, onMembersChanged,
}: {
  scheduleId: string;
  sortOrder: number;
  members: ShiftMember[];
  onAsignar: (m: ShiftMember) => void;
  onMembersChanged: () => void;
}) {
  const [perfilId, setPerfilId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: perfiles = [] } = useQuery({
    queryKey: ["perfiles-cuadro"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, nombre, cargo")
        .eq("activo", true)
        .order("nombre");
      return (data ?? []) as unknown as { user_id: string; nombre: string; cargo: string | null }[];
    },
    staleTime: 300_000,
  });

  const perfil = perfiles.find((p) => p.user_id === perfilId);
  const cargo = perfil?.cargo ?? "";

  const agregar = async () => {
    if (!perfil) return toast.error("Selecciona un colaborador.");
    setBusy(true);
    try {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      let member = members.find((m) => norm(m.full_name) === norm(perfil.nombre) || m.user_id === perfil.user_id);
      if (!member) {
        const { data, error } = await supabase
          .from("shift_schedule_members")
          .insert({
            schedule_id: scheduleId,
            user_id: perfil.user_id,
            full_name: perfil.nombre,
            role_name: perfil.cargo || null,
            sort_order: sortOrder,
          })
          .select(
            "id, schedule_id, user_id, full_name, role_name, sede, active, base_hours, pending_hours, notes, sort_order",
          )
          .single();
        if (error) throw error;
        member = data as unknown as ShiftMember;
        onMembersChanged();
      }
      onAsignar(member);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudo agregar el colaborador.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="min-w-[220px]">
        <Label className="text-xs">Colaborador</Label>
        <Select value={perfilId} onValueChange={setPerfilId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Selecciona un funcionario" /></SelectTrigger>
          <SelectContent>
            {perfiles.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Cargo</Label>
        <Input value={cargo} readOnly className="w-44 bg-muted/40" placeholder="—" />
      </div>
      <Button size="sm" onClick={agregar} disabled={busy || !perfil}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
        Agregar
      </Button>
    </div>
  );
}

function EditCellDialog({
  scheduleId, member, day, dateISO, current, tipos, userId, isAdmin, onClose, onSaved,
}: {
  scheduleId: string; member: ShiftMember; day: number; dateISO: string;
  current: ShiftDay | null; tipos: ShiftType[]; userId: string; isAdmin: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(current?.shift_code ?? "");
  const [notas, setNotas] = useState(current?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const tipoSel = tipos.find((t) => t.code === code);
  const horario = tipoSel?.start_time && tipoSel?.end_time
    ? `${tipoSel.start_time.slice(0, 5)} – ${tipoSel.end_time.slice(0, 5)}`
    : "—";

  const save = async () => {
    setSaving(true);
    try {
      const hours = tipoSel?.hours ?? 0;
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

  const borrar = async () => {
    if (!current) return onClose();
    setSaving(true);
    try {
      const { error } = await supabase.from("shift_schedule_days").delete().eq("id", current.id);
      if (error) throw error;
      registrarAuditoria({ data: { accion: "TURNO_BORRADO", modulo: "cuadro_turno", tabla: "shift_schedule_days", registroId: current.id, resultado: "exito", detalles: { colaborador: member.full_name, dia: day } } }).catch(() => {});
      onSaved();
    } catch (e) { console.error(e); toast.error("No se pudo borrar."); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{member.full_name} · día {day}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs">
            <div><span className="text-muted-foreground">Funcionario:</span> <span className="font-medium">{member.full_name}</span></div>
            <div><span className="text-muted-foreground">Cargo:</span> <span className="font-medium">{member.role_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Turno:</span> <span className="font-medium">{code || "Sin turno"}</span></div>
            <div><span className="text-muted-foreground">Horario:</span> <span className="font-medium">{horario}</span></div>
          </div>
          {isAdmin ? (
            <>
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
            </>
          ) : (
            <div><span className="text-muted-foreground text-xs">Novedad / nota:</span> <p className="text-sm">{notas || "—"}</p></div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isAdmin && current ? (
            <Button variant="ghost" className="text-rose-600" onClick={borrar} disabled={saving}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Borrar
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
            {isAdmin && <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Bloque { code: string; dias: number[] }

function AsignarTurnosDialog({
  scheduleId, anio, mes, ndias, member, members, tipos, userId, onClose, onSaved,
}: {
  scheduleId: string; anio: number; mes: number; ndias: number;
  member: ShiftMember | null; members: ShiftMember[]; tipos: ShiftType[]; userId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [memberId, setMemberId] = useState<string>(member?.id ?? members[0]?.id ?? "");
  const [code, setCode] = useState<string>("");
  const [dias, setDias] = useState<number[]>([]);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [saving, setSaving] = useState(false);

  const activeMember = members.find((m) => m.id === memberId);
  const tipoMap = useMemo(() => new Map(tipos.map((t) => [t.code, t])), [tipos]);

  const toggleDia = (d: number) =>
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const agregarBloque = () => {
    if (!code) return toast.error("Selecciona un turno.");
    if (dias.length === 0) return toast.error("Selecciona al menos un día.");
    setBloques((prev) => [...prev, { code, dias: [...dias].sort((a, b) => a - b) }]);
    setCode("");
    setDias([]);
  };

  const quitarBloque = (i: number) => setBloques((prev) => prev.filter((_, idx) => idx !== i));

  const guardar = async () => {
    if (!memberId) return toast.error("Selecciona un colaborador.");
    const todos = [...bloques];
    if (code && dias.length > 0) todos.push({ code, dias: [...dias] });
    if (todos.length === 0) return toast.error("Agrega al menos un bloque de turno.");
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const rows: any[] = [];
      for (const b of todos) {
        const tipo = tipos.find((t) => t.code === b.code);
        const hours = tipo?.hours ?? 0;
        for (const d of b.dias) {
          rows.push({
            schedule_id: scheduleId, member_id: memberId, day_number: d,
            shift_date: fechaISO(anio, mes, d), shift_code: b.code, hours,
            origin: "asignacion", changed_by: userId, changed_at: nowIso,
          });
        }
      }
      const { error } = await supabase.from("shift_schedule_days")
        .upsert(rows, { onConflict: "member_id,day_number" });
      if (error) throw error;
      registrarAuditoria({ data: { accion: "TURNOS_ASIGNADOS", modulo: "cuadro_turno", tabla: "shift_schedule_days", registroId: scheduleId, resultado: "exito", detalles: { member_id: memberId, bloques: todos.length, dias: rows.length } } }).catch(() => {});
      toast.success(`${rows.length} asignación(es) guardadas.`);
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudo guardar la asignación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Asignar turnos por días</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Colaborador</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input value={activeMember?.role_name || ""} readOnly className="bg-muted/40" placeholder="—" />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Nuevo bloque</p>
            <Label className="text-xs">Tipo de turno</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger><SelectValue placeholder="Selecciona un turno" /></SelectTrigger>
              <SelectContent>
                {tipos.filter((t) => t.active).map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.code} — {t.name}{t.start_time && t.end_time ? ` (${t.start_time.slice(0, 5)}-${t.end_time.slice(0, 5)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="mt-3 block text-xs">Días del mes</Label>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: ndias }, (_, i) => i + 1).map((d) => {
                const sel = dias.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDia(d)}
                    className={`flex h-9 flex-col items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
                      sel ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span>{d}</span>
                    <span className="text-[8px] opacity-70">{letraDiaSemana(anio, mes, d)}</span>
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={agregarBloque}>
              <Plus className="mr-1.5 h-4 w-4" /> Agregar bloque
            </Button>
          </div>

          {bloques.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Bloques a guardar</p>
              {bloques.map((b, i) => {
                const tipo = tipoMap.get(b.code);
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                    <span className="inline-block h-3 w-3 rounded" style={{ background: tipo?.color ?? "#999" }} />
                    <span className="font-bold">{b.code}</span>
                    <span className="text-muted-foreground">{tipo?.name}</span>
                    <span className="ml-auto">días: {b.dias.join(", ")}</span>
                    <button type="button" onClick={() => quitarBloque(i)} className="text-rose-600 hover:opacity-70">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar turnos"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
