import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_authenticated/cuadro-turno";
import { supabase } from "@/lib/backend-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, CheckCircle2, Users, CalendarPlus, Clock, FileCheck2 } from "lucide-react";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { SolicitudesPanel } from "./solicitudes-panel";
import { AusentismoPanel } from "./ausentismo-panel";
import { HistorialCambiosPanel } from "./historial-cambios-panel";
import { MiTurnoPanel } from "./mi-turno-panel";
import { SolicitudFormDialog } from "./solicitud-form-dialog";
import { PendientesVerificacionPanel } from "./pendientes-verificacion-panel";
import { ControlMensualPanel } from "./control-mensual-panel";

interface AuditRow {
  id: string;
  action: string;
  new_status: string | null;
  created_at: string;
  shift_requests: { requester_name: string | null } | null;
}

interface ReqLite {
  status: string | null;
}

function HistorialResumen() {
  const [verTodo, setVerTodo] = useState(false);

  const { data: reqs = [] } = useQuery({
    queryKey: ["shift-requests", "kpi"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_requests").select("status");
      return (data ?? []) as unknown as ReqLite[];
    },
  });

  const total = reqs.length;
  const aprobadas = reqs.filter((r) => r.status === "APROBADA").length;
  const pendientes = reqs.filter((r) => r.status === "PENDIENTE" || r.status === "DEVUELTA PARA AJUSTE").length;

  const { data: aprobados = [] } = useQuery({
    queryKey: ["audit-aprobados"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_request_audit")
        .select("id, action, new_status, created_at, shift_requests(requester_name)")
        .eq("new_status", "APROBADA")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const { data: solicitantes = [] } = useQuery({
    queryKey: ["solicitantes-nombres"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_requests")
        .select("requester_name")
        .order("created_at", { ascending: false })
        .limit(300);
      const set = new Set<string>();
      (data ?? []).forEach(
        (r: { requester_name: string | null }) => r.requester_name && set.add(r.requester_name),
      );
      return Array.from(set);
    },
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <History className="h-4 w-4" /> Historial de cambios
          </h3>
          <p className="text-[11px] text-muted-foreground">Total de cambios y permisos gestionados</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-slate-600" />
            <div>
              <p className="text-lg font-bold leading-none">{total}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Solicitudes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-lg font-bold leading-none">{aprobadas}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Aprobadas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-lg font-bold leading-none">{pendientes}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Pendientes</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setVerTodo(true)}>
            Ver actividad
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Últimos 5 cambios aprobados
          </p>
          {aprobados.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin cambios aprobados aún.</p>
          ) : (
            <ul className="space-y-1.5">
              {aprobados.map((a) => (
                <li key={a.id} className="rounded-md border px-2 py-1.5 text-xs">
                  <span className="font-medium">{a.shift_requests?.requester_name ?? "—"}</span>
                  <span className="text-muted-foreground"> · {a.action}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {fmtFechaHora(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Funcionarios que han solicitado cambios
          </p>
          {solicitantes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no hay solicitantes.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {solicitantes.map((n) => (
                <span
                  key={n}
                  className="rounded-full border bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={verTodo} onOpenChange={setVerTodo}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Actividad completa de cambios</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <HistorialCambiosPanel />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function SolicitudesAusentismoPanel({ isAdmin }: { isAdmin: boolean }) {
  const { sub } = Route.useSearch();
  const navigate = useNavigate();
  const [openSolicitud, setOpenSolicitud] = useState(false);

  const setSub = (v: string) =>
    navigate({ to: "/cuadro-turno", search: (prev: Record<string, unknown>) => ({ ...prev, sub: v }), replace: true });

  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-4">
      <TabsList>
        <TabsTrigger value="solicitudes">Solicitudes y Cambios</TabsTrigger>
        <TabsTrigger value="pendientes">Pendientes de Aprobacion y Verificación</TabsTrigger>
        <TabsTrigger value="ausentismo">Control de Ausentismo</TabsTrigger>
      </TabsList>
      <TabsContent value="solicitudes" className="space-y-4">
        <div>
          <Button size="lg" onClick={() => setOpenSolicitud(true)}>
            <CalendarPlus className="mr-1.5 h-4 w-4" /> Solicitar permiso / cambio de turno
          </Button>
        </div>
        <HistorialResumen />
        <ControlMensualPanel />
        {!isAdmin && <MiTurnoPanel />}
      </TabsContent>
      <TabsContent value="pendientes" className="space-y-6">
        {isAdmin ? (
          <>
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase">Solicitudes pendientes de decisión</h3>
              <SolicitudesPanel soloPendientes />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase">Devoluciones de tiempo por verificar</h3>
              <PendientesVerificacionPanel />
            </section>
          </>
        ) : (
          <MiTurnoPanel />
        )}
      </TabsContent>

      <TabsContent value="ausentismo">
        {isAdmin ? <AusentismoPanel /> : <MiTurnoPanel />}
      </TabsContent>
      <SolicitudFormDialog open={openSolicitud} onOpenChange={setOpenSolicitud} />
    </Tabs>
  );
}
