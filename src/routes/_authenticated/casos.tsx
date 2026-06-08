import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { useCasos, useCatalogos, usePlantillas } from "@/lib/use-rc-data";
import { RegistrarWizard } from "@/components/rc/registrar-wizard";
import { fechaCasoStr, TIPO_LABEL, type Caso } from "@/lib/rc-utils";

export const Route = createFileRoute("/_authenticated/casos")({
  component: CasosPage,
});

const TIPO_BORDER: Record<string, string> = {
  ACEP: "border-l-status-green",
  NEG: "border-l-status-red",
  AMP: "border-l-status-amber",
  CAN: "border-l-status-red",
  ING: "border-l-status-blue",
  CRUE_ACEP: "border-l-status-blue",
  CRUE_NR: "border-l-status-amber",
  CRUE_NEG: "border-l-status-red",
};

function esteMes(c: Caso): boolean {
  const d = c.created_at ? new Date(c.created_at) : null;
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function CasosPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: casos, isLoading } = useCasos();
  const { data: catalogos } = useCatalogos();
  const { data: plantillas } = usePlantillas();

  const stats = useMemo(() => {
    const mes = casos.filter(esteMes);
    const count = (t: string) => mes.filter((c) => c.tipo === t).length;
    return {
      aceptados: count("ACEP") + count("CRUE_ACEP"),
      negados: count("NEG") + count("CRUE_NEG"),
      ampliaciones: count("AMP"),
      cancelaciones: count("CAN"),
      ingresos: count("ING"),
    };
  }, [casos]);

  const term = q.trim().toLowerCase();
  const casosF = useMemo(
    () =>
      casos.filter((c) =>
        term
          ? [c.nombres, c.apellidos, c.documento, c.codigo, c.ips, c.especialidad, c.unidad, c.tipo]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [casos, term],
  );

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["rc-casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <div>
      <AppHeader title="Registrar Caso (R&C)" subtitle="Aceptaciones, negaciones y direccionamientos CRUE del mes" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Aceptados" value={stats.aceptados} caption="Cupos aceptados" color="green" />
        <StatCard title="Negados" value={stats.negados} caption="Cupos negados" color="red" />
        <StatCard title="Ampliaciones" value={stats.ampliaciones} caption="Cupos ampliados" color="amber" />
        <StatCard title="Cancelaciones" value={stats.cancelaciones} caption="Cupos cancelados" color="red" />
        <StatCard title="Ingresos" value={stats.ingresos} caption="Pacientes ingresados" color="blue" />
      </div>

      <Panel
        title="Casos registrados"
        action={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Nuevo caso
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Registrar nuevo caso</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Asistente de 3 pasos: documento → datos del paciente → clasificación y texto.
                  </p>
                </DialogHeader>
                <RegistrarWizard casos={casos} catalogos={catalogos} plantillas={plantillas} onDone={refrescar} />
              </DialogContent>
            </Dialog>
          )
        }
      >
        <div className="relative mb-4 mx-auto max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar por nombre, documento, código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : casosF.length > 0 ? (
          <div className="grid gap-3">
            {casosF.slice(0, 200).map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border border-border border-l-4 ${TIPO_BORDER[c.tipo] || "border-l-border"} bg-card p-4 shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {[c.nombres, c.apellidos].filter(Boolean).join(" ") || c.documento || "Sin nombre"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{TIPO_LABEL[c.tipo]?.split(" ")[1] || c.tipo}</Badge>
                    {c.estado && <Badge variant="secondary">{c.estado}</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Doc: {c.documento || "—"} · {c.especialidad || c.unidad || "—"} · {c.ips || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.codigo} · {fechaCasoStr(c)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay casos registrados todavía.</p>
        )}
      </Panel>
    </div>
  );
}
