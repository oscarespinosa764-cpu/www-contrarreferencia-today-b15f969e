import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Search } from "lucide-react";
import { CatalogoMaestras } from "./catalogo-maestras";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { useCatalogoConfigDerivada } from "@/lib/catalogo-categorias";

const USO_EN: Record<string, string> = {
  IPS: "Remisiones · Red operativa",
  EAPB: "Remisiones · Referencia interna",
  TIPO_TRAMITE: "Salientes · Trazabilidad Índigo",
  IPS_LOCAL: "Salientes · Trazabilidad Índigo",
  DEPARTAMENTO: "Salientes · Trazabilidad Índigo",
  ESPECIALIDAD: "Remisiones · Médicos",
  MEDICO: "Remisiones",
  REGIMEN: "Remisiones",
  EMPRESA_TEP: "Ambulancias · Traslados",
  PLACA: "Ambulancias · Traslados",
  UNIDAD: "Remisiones · Vencimientos",
  UNIDAD_REQUERIDA: "Remisiones",
  MOTIVO_CANCELACION: "Remisiones",
  MOTIVO_NEG: "Remisiones",
  DOC_ENTREGA: "Salientes · Entrega documental (firma QR)",
  MOTIVO_PERMISO: "Cuadro de turno · TH-FR-09",
};

type Row = {
  id: string;
  tipo: string;
  valor: string;
  activo: boolean;
  updated_at: string | null;
};

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  accion: string;
  registro_id: string | null;
  detalles: Record<string, unknown> | null;
};

export function CategoriaModal({
  modulo,
  onClose,
}: {
  modulo: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("catalogos");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVO" | "INACTIVO">(
    "TODOS",
  );
  const config = useCatalogoConfigDerivada();
  const TIPO_MODULO = config.tipoModulo;
  const TIPO_LABEL = config.tipoNombre;

  const { data: allRows } = useQuery({
    queryKey: ["catalogo-cat-modal-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("id, tipo, valor, activo, updated_at")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = useMemo(
    () =>
      (allRows ?? []).filter(
        (r) => (TIPO_MODULO[r.tipo] ?? "Otros") === modulo,
      ),
    [allRows, TIPO_MODULO, modulo],
  );

  const catalogos = useMemo(() => {
    const map = new Map<
      string,
      { tipo: string; total: number; activos: number; ultima: string | null }
    >();
    rows.forEach((r) => {
      const m =
        map.get(r.tipo) ??
        { tipo: r.tipo, total: 0, activos: 0, ultima: null as string | null };
      m.total++;
      if (r.activo) m.activos++;
      if (r.updated_at && (!m.ultima || r.updated_at > m.ultima))
        m.ultima = r.updated_at;
      map.set(r.tipo, m);
    });
    const term = q.trim().toLowerCase();
    return Array.from(map.values())
      .filter((m) =>
        estado === "TODOS"
          ? true
          : estado === "ACTIVO"
            ? m.activos > 0
            : m.activos === 0,
      )
      .filter((m) =>
        term ? (TIPO_LABEL[m.tipo] ?? m.tipo).toLowerCase().includes(term) : true,
      )
      .sort((a, b) =>
        (TIPO_LABEL[a.tipo] ?? a.tipo).localeCompare(TIPO_LABEL[b.tipo] ?? b.tipo),
      );
  }, [rows, q, estado, TIPO_LABEL]);

  const totalCat = new Set((rows ?? []).map((r) => r.tipo)).size;
  const totalElem = (rows ?? []).length;
  const activos = (rows ?? []).filter((r) => r.activo).length;

  const { data: historial } = useQuery({
    queryKey: ["catalogo-historial", modulo],
    enabled: tab === "historial",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, actor_email, accion, detalles, registro_id")
        .eq("tabla", "catalogos")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[100dvh] max-h-none w-[100vw] max-w-none rounded-none p-0 sm:h-[82vh] sm:max-h-[82vh] sm:w-[92vw] sm:max-w-[92vw] sm:rounded-lg">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
            <DialogTitle className="text-lg font-black">
              Categoría · {modulo}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {totalCat} catálogos · {totalElem} elementos · {activos} activos
            </p>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-5 mt-3 shrink-0 self-start">
              <TabsTrigger value="catalogos">Catálogos</TabsTrigger>
              <TabsTrigger value="elementos">Elementos</TabsTrigger>
              <TabsTrigger value="configuracion">Configuración</TabsTrigger>
              <TabsTrigger value="historial">Historial de cambios</TabsTrigger>
            </TabsList>

            {/* ---------- CATÁLOGOS ---------- */}
            <TabsContent
              value="catalogos"
              className="mt-0 min-h-0 flex-1 overflow-auto px-5 py-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="rounded-full pl-9"
                    placeholder="Buscar catálogo…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <select
                  value={estado}
                  onChange={(e) =>
                    setEstado(e.target.value as "TODOS" | "ACTIVO" | "INACTIVO")
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="ACTIVO">Con elementos activos</option>
                  <option value="INACTIVO">Sin elementos activos</option>
                </select>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Catálogo</th>
                      <th className="px-3 py-2 text-right">Elementos</th>
                      <th className="px-3 py-2 text-right">Activos</th>
                      <th className="px-3 py-2">Última actualización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogos.map((c) => (
                      <tr
                        key={c.tipo}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="px-3 py-2 font-medium">
                          {TIPO_LABEL[c.tipo] ?? c.tipo}
                        </td>
                        <td className="px-3 py-2 text-right">{c.total}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge
                            variant={c.activos > 0 ? "default" : "secondary"}
                          >
                            {c.activos}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.ultima ? fmtFechaHora(c.ultima) : "—"}
                        </td>
                      </tr>
                    ))}
                    {catalogos.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin catálogos que coincidan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Para crear, editar o desactivar valores, usa la pestaña{" "}
                <strong>Elementos</strong>.
              </p>
            </TabsContent>

            {/* ---------- ELEMENTOS (reutiliza CatalogoMaestras) ---------- */}
            <TabsContent
              value="elementos"
              className="mt-0 min-h-0 flex-1 overflow-auto p-3"
            >
              <CatalogoMaestras moduloFijo={modulo} />
            </TabsContent>

            {/* ---------- CONFIGURACIÓN ---------- */}
            <TabsContent
              value="configuracion"
              className="mt-0 min-h-0 flex-1 overflow-auto px-5 py-4"
            >
              <Card className="mb-4 border-amber-400 bg-amber-50/50 p-4 dark:bg-amber-950/20">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-sm text-foreground">
                    Este catálogo se utiliza en <strong>{totalCat}</strong>{" "}
                    listas del módulo <strong>{modulo}</strong> y afecta hasta{" "}
                    <strong>{totalElem}</strong> registros configurados.
                    Desactivarlo puede afectar formularios y procesos activos.
                    No se permite eliminación física cuando existan
                    dependencias.
                  </p>
                </div>
              </Card>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Catálogo</th>
                      <th className="px-3 py-2">Módulo</th>
                      <th className="px-3 py-2">Uso en el sistema</th>
                      <th className="px-3 py-2 text-right">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set((rows ?? []).map((r) => r.tipo)))
                      .sort()
                      .map((tipo) => {
                        const total = (rows ?? []).filter(
                          (r) => r.tipo === tipo,
                        ).length;
                        return (
                          <tr key={tipo} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">
                              {TIPO_LABEL[tipo] ?? tipo}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {TIPO_MODULO[tipo] ?? "Otros"}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {USO_EN[tipo] ?? "Catálogo operativo"}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              {total}
                            </td>
                          </tr>
                        );
                      })}
                    {(!rows || rows.length === 0) && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin datos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* ---------- HISTORIAL ---------- */}
            <TabsContent
              value="historial"
              className="mt-0 min-h-0 flex-1 overflow-auto px-5 py-4"
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Usuario</th>
                      <th className="px-3 py-2">Acción</th>
                      <th className="px-3 py-2">Valor anterior</th>
                      <th className="px-3 py-2">Valor nuevo</th>
                      <th className="px-3 py-2">Módulo</th>
                      <th className="px-3 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(historial ?? []).map((r) => {
                      const d = (r.detalles ?? {}) as Record<string, unknown>;
                      const anterior =
                        (d.anterior as string | undefined) ??
                        (d.valor_anterior as string | undefined) ??
                        "—";
                      const nuevo =
                        (d.nuevo as string | undefined) ??
                        (d.valor_nuevo as string | undefined) ??
                        "—";
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
                            {fmtFechaHora(r.created_at)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.actor_email ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.accion}</td>
                          <td className="px-3 py-2 text-xs">{String(anterior)}</td>
                          <td className="px-3 py-2 text-xs">{String(nuevo)}</td>
                          <td className="px-3 py-2 text-xs">
                            {(d.modulo as string | undefined) ?? modulo}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {(d.motivo as string | undefined) ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {(!historial || historial.length === 0) && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin cambios registrados para este módulo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
