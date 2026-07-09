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
import { ShieldCheck, ShieldX } from "lucide-react";

interface Miembro {
  nombre: string;
  cargo: string | null;
  userId: string | null;
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

export function ControlMensualPanel({ soloUsuario }: { soloUsuario?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [fNombre, setFNombre] = useState("");
  const [fCargo, setFCargo] = useState("");
  const [fEstado, setFEstado] = useState("todos");
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
      const [{ data: members }, { data: profs }] = await Promise.all([
        supabase
          .from("shift_schedule_members")
          .select("full_name, role_name, user_id")
          .eq("active", true),
        supabase.from("profiles").select("nombre, cargo, user_id").eq("activo", true),
      ]);
      const map = new Map<string, Miembro>();
      (profs ?? []).forEach((p) => {
        const n = (p.nombre || "").trim();
        if (n && !map.has(n)) map.set(n, { nombre: n, cargo: p.cargo, userId: p.user_id });
      });
      (members ?? []).forEach((m) => {
        const n = (m.full_name || "").trim();
        if (n && !map.has(n)) map.set(n, { nombre: n, cargo: m.role_name, userId: m.user_id });
      });
      return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
  });

  const filas = useMemo(() => {
    const base = soloUsuario ? miembros.filter((m) => m.userId === user?.id) : miembros;
    return base
      .filter((m) => (fNombre ? m.nombre.toLowerCase().includes(fNombre.toLowerCase()) : true))
      .filter((m) => (fCargo ? (m.cargo || "").toLowerCase().includes(fCargo.toLowerCase()) : true))
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
  }, [
    miembros,
    requests,
    excepciones,
    year,
    month,
    fNombre,
    fCargo,
    fEstado,
    soloUsuario,
    user?.id,
  ]);

  const excPendientes = useMemo(
    () =>
      excepciones.filter(
        (e) => e.status === "PENDIENTE" && (soloUsuario ? e.user_id === user?.id : true),
      ),
    [excepciones, soloUsuario, user?.id],
  );

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
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div>
          <Label className="text-xs">Año</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Mes</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((mm, i) => (
                <SelectItem key={mm} value={String(i + 1)}>
                  {mm}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!soloUsuario && (
          <>
            <div>
              <Label className="text-xs">Funcionario</Label>
              <Input
                className="w-44"
                value={fNombre}
                onChange={(e) => setFNombre(e.target.value)}
                placeholder="Buscar…"
              />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input
                className="w-40"
                value={fCargo}
                onChange={(e) => setFCargo(e.target.value)}
                placeholder="Buscar…"
              />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="verde">Verde (0-1)</SelectItem>
              <SelectItem value="amarillo">Amarillo (2)</SelectItem>
              <SelectItem value="rojo">Rojo (3+)</SelectItem>
              <SelectItem value="excepcion">Con excepción</SelectItem>
            </SelectContent>
          </Select>
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
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {e.user_name || "—"}{" "}
                    <span className="text-muted-foreground">· {e.user_role || ""}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {MESES[e.month - 1]} {e.year} · {e.request_type} · Enviada{" "}
                    {fmtFechaHora(e.created_at)}
                  </p>
                  <p className="mt-0.5">Motivo: {e.reason}</p>
                </div>
                {!soloUsuario && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => {
                        setExcSel(e);
                        setExcAccion("APROBADA");
                      }}
                    >
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setExcSel(e);
                        setExcAccion("NEGADA");
                      }}
                    >
                      <ShieldX className="mr-1 h-3.5 w-3.5" />
                      Negar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabla de control mensual */}
      <Card className="p-3">
        <h4 className="mb-2 text-sm font-bold">
          Control mensual de cambios y permisos · {MESES[month - 1]} {year}
        </h4>
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
              {filas.map(({ m, uso, excAprob, excDisp }) => (
                <tr key={m.nombre} className="border-b">
                  <td className="py-1.5 pr-2 font-medium">{m.nombre}</td>
                  <td className="px-2 text-muted-foreground">{m.cargo || "—"}</td>
                  <td className="px-2 text-center">{uso.solicitudes}</td>
                  <td className="px-2 text-center">{uso.coberturas}</td>
                  <td className="px-2 text-center">{uso.pendientes}</td>
                  <td className="px-2 text-center font-semibold">
                    {uso.total} / {LIMITE_MENSUAL}
                  </td>
                  <td className="px-2 text-center">{uso.disponible}</td>
                  <td className="px-2 text-center">{excAprob}</td>
                  <td className="px-2 text-center">{uso.exentos}</td>
                  <td className="px-2 text-center">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-semibold ${semaforoUso(uso.total, excDisp)}`}
                    >
                      {excDisp
                        ? "EXCEP."
                        : uso.total >= LIMITE_MENSUAL
                          ? "ROJO"
                          : uso.total === 2
                            ? "AMBAR"
                            : "VERDE"}
                    </span>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-center text-muted-foreground">
                    Sin funcionarios para los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Diálogo aprobar/negar excepción */}
      <Dialog
        open={!!excSel}
        onOpenChange={(v) => {
          if (!v) {
            setExcSel(null);
            setExcAccion(null);
            setExcRazon("");
          }
        }}
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
                Se habilitará una única solicitud adicional para ese mes. La autorización es de un
                solo uso y no transferible.
              </p>
            ) : (
              <div>
                <Label className="text-xs">Razón de la negación (obligatoria)</Label>
                <Textarea value={excRazon} onChange={(e) => setExcRazon(e.target.value)} rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setExcSel(null);
                setExcAccion(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={resolverExc}
              variant={excAccion === "NEGADA" ? "destructive" : "default"}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
