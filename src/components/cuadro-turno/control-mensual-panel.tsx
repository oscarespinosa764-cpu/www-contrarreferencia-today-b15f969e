import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { MESES, fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { calcularUsoMensual, semaforoUso, LIMITE_MENSUAL } from "@/lib/solicitudes-utils";
import {
  ShieldCheck,
  ShieldX,
  LayoutGrid,
  List,
  Search,
  CalendarDays,
  UserCheck,
  Trash2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";

interface Miembro {
  nombre: string;
  cargo: string | null;
  userId: string | null;
  activo: boolean;
}
interface ExcRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_role: string | null;
  year: number;
  month: number;
  request_type: string | null;
  reason: string;
  counts: Record<string, number> | null;
  status: string;
  usage_status: string;
  used_request_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const now = new Date();

type Vista = "tarjetas" | "lista";
type Orden = "az" | "za" | "mayor" | "menor" | "pend" | "cob";

function iniciales(n: string): string {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export function ControlMensualPanel({ soloUsuario }: { soloUsuario?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [fNombre, setFNombre] = useState("");
  const [fCargo, setFCargo] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [vista, setVista] = useState<Vista>("tarjetas");
  const [orden, setOrden] = useState<Orden>("az");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);
  const [excSel, setExcSel] = useState<ExcRow | null>(null);
  const [excAccion, setExcAccion] = useState<"APROBADA" | "NEGADA" | null>(null);
  const [excRazon, setExcRazon] = useState("");

  const { data: requests = [] } = useQuery({
    queryKey: ["shift-requests", "control-mensual"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_requests")
        .select(
          "requester_id, replacement_user_id, status, reason_type, is_limit_exempt, request_type, start_date, original_shift_date, created_at, requester_name, requester_role",
        );
      return data ?? [];
    },
  });

  const { data: excepciones = [] } = useQuery({
    queryKey: ["monthly-exceptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_monthly_exceptions")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as ExcRow[];
    },
  });

  const { data: miembros = [] } = useQuery({
    queryKey: ["control-miembros"],
    queryFn: async (): Promise<Miembro[]> => {
      // Fuente canónica única: profiles activos (tienen user_id estable y
      // nombre oficial completo). shift_schedule_members es un roster
      // importado con nombres abreviados y sin user_id: usarlo aquí duplica
      // tarjetas (p. ej. "EDNA DELGADO" vs "EDNA CECILIA DELGADO MIRANDA").
      // Sus datos de turno siguen intactos; solo cambia la fuente de la lista.
      const { data: profs } = await supabase
        .from("profiles")
        .select("nombre, cargo, user_id, activo")
        .eq("activo", true);
      const map = new Map<string, Miembro>();
      (profs ?? []).forEach((p) => {
        const n = (p.nombre || "").replace(/\s+/g, " ").trim();
        const cargo = (p.cargo || "").trim();
        if (!n || !p.user_id) return;
        // Excluir usuarios técnicos/de prueba de la vista predeterminada.
        if (/PRUEBA/i.test(n) || /PRUEBA/i.test(cargo)) return;
        if (!map.has(p.user_id))
          map.set(p.user_id, { nombre: n, cargo: p.cargo, userId: p.user_id, activo: !!p.activo });
      });
      return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
  });


  const cargosDisponibles = useMemo(() => {
    const set = new Set<string>();
    miembros.forEach((m) => m.cargo && set.add(m.cargo));
    return Array.from(set).sort();
  }, [miembros]);

  const filas = useMemo(() => {
    const base = soloUsuario ? miembros.filter((m) => m.userId === user?.id) : miembros;
    const arr = base
      .filter((m) => (fNombre ? m.nombre.toLowerCase().includes(fNombre.toLowerCase()) : true))
      .filter((m) => (fCargo && fCargo !== "todos" ? (m.cargo || "") === fCargo : true))
      .map((m) => {
        const uso = m.userId
          ? calcularUsoMensual(requests as never[], m.userId, year, month)
          : {
              solicitudes: 0,
              coberturas: 0,
              pendientes: 0,
              aprobadas: 0,
              exentos: 0,
              total: 0,
              disponible: LIMITE_MENSUAL,
            };
        const excAprob = excepciones.filter(
          (e) =>
            e.user_id === m.userId &&
            e.year === year &&
            e.month === month &&
            e.status === "APROBADA",
        );
        const excDisp = excAprob.some((e) => e.usage_status === "DISPONIBLE");
        return { m, uso, excAprob: excAprob.length, excDisp };
      })
      .filter((r) => {
        if (fEstado === "rojo") return r.uso.total >= LIMITE_MENSUAL;
        if (fEstado === "amarillo") return r.uso.total === 2;
        if (fEstado === "verde") return r.uso.total <= 1;
        if (fEstado === "excepcion") return r.excDisp;
        return true;
      });

    arr.sort((a, b) => {
      switch (orden) {
        case "za":
          return b.m.nombre.localeCompare(a.m.nombre);
        case "mayor":
          return b.uso.total - a.uso.total || a.m.nombre.localeCompare(b.m.nombre);
        case "menor":
          return a.uso.total - b.uso.total || a.m.nombre.localeCompare(b.m.nombre);
        case "pend":
          return b.uso.pendientes - a.uso.pendientes || a.m.nombre.localeCompare(b.m.nombre);
        case "cob":
          return b.uso.coberturas - a.uso.coberturas || a.m.nombre.localeCompare(b.m.nombre);
        default:
          return a.m.nombre.localeCompare(b.m.nombre);
      }
    });
    return arr;
  }, [
    miembros,
    requests,
    excepciones,
    year,
    month,
    fNombre,
    fCargo,
    fEstado,
    orden,
    soloUsuario,
    user?.id,
  ]);

  const totalPages = Math.max(1, Math.ceil(filas.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filas.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const excPendientes = useMemo(
    () =>
      excepciones.filter(
        (e) => e.status === "PENDIENTE" && (soloUsuario ? e.user_id === user?.id : true),
      ),
    [excepciones, soloUsuario, user?.id],
  );

  const limpiar = () => {
    setFNombre("");
    setFCargo("todos");
    setFEstado("todos");
    setPage(1);
  };

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const resolverExc = async () => {
    if (!excSel || !excAccion || !user) return;
    if (excAccion === "NEGADA" && !excRazon.trim()) return toast.error("La razón es obligatoria.");
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", user.id)
        .maybeSingle();
      const { error } = await supabase
        .from("shift_monthly_exceptions")
        .update({
          status: excAccion,
          reviewed_by: user.id,
          reviewed_by_name: prof?.nombre || null,
          reviewed_at: new Date().toISOString(),
          review_reason: excRazon || null,
          usage_status: excAccion === "APROBADA" ? "DISPONIBLE" : "VENCIDA",
        })
        .eq("id", excSel.id);
      if (error) throw error;
      registrarAuditoria({
        data: {
          accion: excAccion === "APROBADA" ? "EXCEPCION_APROBADA" : "EXCEPCION_NEGADA",
          modulo: "cuadro_turno",
          tabla: "shift_monthly_exceptions",
          registroId: excSel.id,
          resultado: "exito",
        },
      }).catch(() => {});
      toast.success(excAccion === "APROBADA" ? "Excepción aprobada." : "Excepción negada.");
      setExcSel(null);
      setExcAccion(null);
      setExcRazon("");
      qc.invalidateQueries({ queryKey: ["monthly-exceptions"] });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo procesar la excepción.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label className="text-xs">Año</Label>
          <Select value={String(year)} onValueChange={(v) => resetPage(setYear)(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Mes</Label>
          <Select value={String(month)} onValueChange={(v) => resetPage(setMonth)(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((mm, i) => (
                <SelectItem key={mm} value={String(i + 1)}>{mm}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!soloUsuario && (
          <>
            <div className="min-w-[220px] flex-1">
              <Label className="text-xs">Funcionario</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7"
                  value={fNombre}
                  onChange={(e) => { setFNombre(e.target.value); setPage(1); }}
                  placeholder="Buscar funcionario..."
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Select value={fCargo} onValueChange={resetPage(setFCargo)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {cargosDisponibles.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={fEstado} onValueChange={resetPage(setFEstado)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="verde">Verde (0-1)</SelectItem>
              <SelectItem value="amarillo">Amarillo (2)</SelectItem>
              <SelectItem value="rojo">Rojo (3+)</SelectItem>
              <SelectItem value="excepcion">Con excepción</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={limpiar}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpiar filtros
          </Button>
        </div>
      </Card>

      {/* Excepciones pendientes */}
      {excPendientes.length > 0 && (
        <Card className="p-3">
          <h4 className="mb-2 text-sm font-bold">
            Autorizaciones excepcionales pendientes · {excPendientes.length}
          </h4>
          <div className="space-y-2">
            {excPendientes.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {e.user_name || "—"} <span className="text-muted-foreground">· {e.user_role || ""}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {MESES[e.month - 1]} {e.year} · {e.request_type} · Enviada {fmtFechaHora(e.created_at)}
                  </p>
                  <p className="mt-0.5">Motivo: {e.reason}</p>
                </div>
                {!soloUsuario && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => { setExcSel(e); setExcAccion("APROBADA"); }}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Aprobar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setExcSel(e); setExcAccion("NEGADA"); }}>
                      <ShieldX className="mr-1 h-3.5 w-3.5" /> Negar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cabecera control mensual + selector de vista y orden */}
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-bold">
            Control mensual de cambios y permisos · {MESES[month - 1]} {year}
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setVista("tarjetas")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${vista === "tarjetas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Vista en tarjetas
              </button>
              <button
                type="button"
                onClick={() => setVista("lista")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${vista === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <List className="h-3.5 w-3.5" /> Vista de lista
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Ordenar por:</span>
              <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="az">Nombre A–Z</SelectItem>
                  <SelectItem value="za">Nombre Z–A</SelectItem>
                  <SelectItem value="mayor">Mayor consumo</SelectItem>
                  <SelectItem value="menor">Menor consumo</SelectItem>
                  <SelectItem value="pend">Más pendientes</SelectItem>
                  <SelectItem value="cob">Más coberturas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin funcionarios para los filtros.
          </p>
        ) : vista === "tarjetas" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map(({ m, uso, excDisp }) => {
              const cupo = LIMITE_MENSUAL;
              const pct = cupo > 0 ? Math.min(100, Math.round((uso.total / cupo) * 100)) : 0;
              const estado = excDisp
                ? "EXCEP."
                : uso.total >= cupo
                  ? "ROJO"
                  : uso.total === 2
                    ? "AMBAR"
                    : "VERDE";
              return (
                <div key={m.nombre} className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {iniciales(m.nombre)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{m.nombre}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.cargo || "—"}</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {m.activo ? "ACTIVO" : "INACTIVO"}
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-sky-700">
                        <CalendarDays className="h-3 w-3" /> Permisos solicitados
                      </div>
                      <p className="mt-1 text-2xl font-bold text-sky-900">{uso.solicitudes}</p>
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-emerald-700">
                        <UserCheck className="h-3 w-3" /> Coberturas aceptadas
                      </div>
                      <p className="mt-1 text-2xl font-bold text-emerald-900">{uso.coberturas}</p>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div className="grid flex-1 grid-cols-3 gap-1 text-[10px]">
                      <div>
                        <p className="flex items-center gap-1 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pendientes</p>
                        <p className="text-sm font-bold">{uso.pendientes}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Disponibles</p>
                        <p className="text-sm font-bold">{uso.disponible}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Exentos</p>
                        <p className="text-sm font-bold">{uso.exentos}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div
                        className="grid h-12 w-12 place-items-center rounded-full text-[11px] font-bold"
                        style={{
                          background: `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}% 100%)`,
                        }}
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-card">
                          {pct}%
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] uppercase text-muted-foreground">Total del mes</p>
                      <p className="text-[11px] font-bold">{uso.total} / {cupo}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${semaforoUso(uso.total, excDisp)}`}>
                      {estado}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2">Funcionario</th>
                  <th className="px-2">Cargo</th>
                  <th className="px-2 text-center">Solic.</th>
                  <th className="px-2 text-center">Cobert.</th>
                  <th className="px-2 text-center">Pend.</th>
                  <th className="px-2 text-center">Total</th>
                  <th className="px-2 text-center">Disp.</th>
                  <th className="px-2 text-center">Excep.</th>
                  <th className="px-2 text-center">Exentos</th>
                  <th className="px-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(({ m, uso, excAprob, excDisp }) => (
                  <tr key={m.nombre} className="border-b">
                    <td className="py-1.5 pr-2 font-medium">{m.nombre}</td>
                    <td className="px-2 text-muted-foreground">{m.cargo || "—"}</td>
                    <td className="px-2 text-center">{uso.solicitudes}</td>
                    <td className="px-2 text-center">{uso.coberturas}</td>
                    <td className="px-2 text-center">{uso.pendientes}</td>
                    <td className="px-2 text-center font-semibold">{uso.total} / {LIMITE_MENSUAL}</td>
                    <td className="px-2 text-center">{uso.disponible}</td>
                    <td className="px-2 text-center">{excAprob}</td>
                    <td className="px-2 text-center">{uso.exentos}</td>
                    <td className="px-2 text-center">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${semaforoUso(uso.total, excDisp)}`}>
                        {excDisp ? "EXCEP." : uso.total >= LIMITE_MENSUAL ? "ROJO" : uso.total === 2 ? "AMBAR" : "VERDE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {filas.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <p className="text-muted-foreground">
              Mostrando {(pageSafe - 1) * perPage + 1} a {Math.min(pageSafe * perPage, filas.length)} de {filas.length} registros
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pageSafe === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pageSafe === 1} onClick={() => setPage(pageSafe - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 font-medium">{pageSafe} / {totalPages}</span>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pageSafe === totalPages} onClick={() => setPage(pageSafe + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={pageSafe === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Registros por página</span>
              <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Diálogo aprobar/negar excepción */}
      <Dialog
        open={!!excSel}
        onOpenChange={(v) => { if (!v) { setExcSel(null); setExcAccion(null); setExcRazon(""); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {excAccion === "APROBADA" ? "Aprobar" : "Negar"} autorización excepcional
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {excSel?.user_name} · {excSel && MESES[excSel.month - 1]} {excSel?.year}
            </p>
            <p className="text-xs">Motivo del funcionario: {excSel?.reason}</p>
            {excAccion === "APROBADA" ? (
              <p className="text-xs text-muted-foreground">
                Se habilitará una única solicitud adicional para ese mes. La autorización es de un solo uso y no transferible.
              </p>
            ) : (
              <div>
                <Label className="text-xs">Razón de la negación (obligatoria)</Label>
                <Textarea value={excRazon} onChange={(e) => setExcRazon(e.target.value)} rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setExcSel(null); setExcAccion(null); }}>Cancelar</Button>
            <Button onClick={resolverExc} variant={excAccion === "NEGADA" ? "destructive" : "default"}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
