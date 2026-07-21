import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Filter, X, Eye, ChevronLeft, ChevronRight } from "lucide-react";

// Actividad restringida a operaciones sobre datos: importar, exportar, respaldar,
// restaurar y borrar. Nunca mezcla la auditoría general.
// Se filtra en servidor mediante patrones OR sobre `accion` y `modulo`.
const PATTERNS = [
  "accion.ilike.%import%",
  "accion.ilike.%export%",
  "accion.ilike.%respald%",
  "accion.ilike.%backup%",
  "accion.ilike.%borrad%",
  "accion.ilike.%purg%",
  "accion.ilike.%restaur%",
  "modulo.ilike.%import%",
  "modulo.ilike.%export%",
  "modulo.ilike.%respald%",
  "modulo.ilike.%backup%",
  "modulo.ilike.%borrad%",
  "modulo.eq.control_mando",
].join(",");

type Row = {
  id: string;
  created_at: string;
  accion: string | null;
  modulo: string | null;
  tabla: string | null;
  actor_email: string | null;
  resultado: string | null;
  detalles: Record<string, unknown> | null;
};

type Tipo = "TODOS" | "IMPORT" | "EXPORT" | "RESPALDO" | "BORRADO" | "RESTAURACION";
const TIPOS: { key: Tipo; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "IMPORT", label: "Importaciones" },
  { key: "EXPORT", label: "Exportaciones" },
  { key: "RESPALDO", label: "Respaldos" },
  { key: "BORRADO", label: "Borrado" },
  { key: "RESTAURACION", label: "Restauración" },
];

function opNombre(accion: string | null | undefined): string {
  const a = (accion || "").toLowerCase();
  if (a.includes("import")) return "Importación";
  if (a.includes("respald") || a.includes("backup")) return "Respaldo";
  if (a.includes("restaur")) return "Restauración";
  if (a.includes("borrad") || a.includes("purg")) return "Borrado";
  if (a.includes("export")) return "Exportación";
  return accion || "—";
}

function fmt(dt: string): string {
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resumenRegistros(det: Record<string, unknown> | null): string {
  if (!det) return "—";
  const posibles = ["registros", "filas", "creados", "actualizados", "total", "tablas", "count"];
  const parts: string[] = [];
  for (const k of posibles) {
    const v = det[k];
    if (typeof v === "number") parts.push(`${k}: ${v}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function ActividadDatosPanel() {
  const [tipo, setTipo] = useState<Tipo>("TODOS");
  const [modulo, setModulo] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [pagina, setPagina] = useState(0);
  const [tamano, setTamano] = useState(20);
  const [detalle, setDetalle] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ["actividad-datos", tipo, modulo, actor, desde, hasta, pagina, tamano],
    queryFn: async () => {
      // Select como string plano para evitar el costo de tipos de PostgREST.
      const sel = (s: string): string => s;
      let base = supabase
        .from("audit_logs")
        .select(
          sel("id, created_at, accion, modulo, tabla, actor_email, resultado, detalles"),
          { count: "exact" },
        )
        .or(PATTERNS)
        .order("created_at", { ascending: false });

      if (tipo !== "TODOS") {
        const pat: Record<Tipo, string> = {
          TODOS: "",
          IMPORT: "%import%",
          EXPORT: "%export%",
          RESPALDO: "%respald%",
          BORRADO: "%borrad%",
          RESTAURACION: "%restaur%",
        };
        base = base.ilike("accion", pat[tipo]);
      }
      if (modulo.trim()) base = base.ilike("modulo", `%${modulo.trim()}%`);
      if (actor.trim()) base = base.ilike("actor_email", `%${actor.trim()}%`);
      if (desde) base = base.gte("created_at", new Date(desde).toISOString());
      if (hasta) {
        const h = new Date(hasta);
        h.setDate(h.getDate() + 1);
        base = base.lt("created_at", h.toISOString());
      }
      const from = pagina * tamano;
      const to = from + tamano - 1;
      const { data, error, count } = await base.range(from, to).returns<Row[]>();
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const total = q.data?.total ?? 0;
  const totalPag = Math.max(1, Math.ceil(total / tamano));

  const limpiar = () => {
    setTipo("TODOS");
    setModulo("");
    setActor("");
    setDesde("");
    setHasta("");
    setPagina(0);
  };

  return (
    <>
      <Panel
        title="Actividad de importaciones, exportaciones y respaldos"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={limpiar}>
              <X className="mr-1 h-4 w-4" /> Limpiar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Operación
            </label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as Tipo); setPagina(0); }}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Módulo
            </label>
            <Input
              value={modulo}
              placeholder="Ej. salientes, control_mando"
              onChange={(e) => { setModulo(e.target.value); setPagina(0); }}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Usuario
            </label>
            <Input
              value={actor}
              placeholder="Correo del usuario"
              onChange={(e) => { setActor(e.target.value); setPagina(0); }}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Desde
            </label>
            <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(0); }} className="h-9" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Hasta
            </label>
            <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(0); }} className="h-9" />
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Fecha</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>Módulo / conjunto</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="w-[80px] text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Cargando actividad…
                  </TableCell>
                </TableRow>
              ) : q.isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-status-red">
                    Error al consultar la actividad.{" "}
                    <button className="underline" onClick={() => q.refetch()}>
                      Reintentar
                    </button>
                  </TableCell>
                </TableRow>
              ) : (q.data?.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin actividad registrada para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                (q.data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {fmt(r.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{opNombre(r.accion)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.modulo ?? "—"}</div>
                      <div className="text-muted-foreground">{r.tabla ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.actor_email ?? "—"}</TableCell>
                    <TableCell className="text-xs">{resumenRegistros(r.detalles)}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          (r.resultado || "").toLowerCase() === "exito"
                            ? "bg-status-green/15 text-status-green"
                            : "bg-status-red/15 text-status-red"
                        }`}
                      >
                        {(r.resultado || "—").toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetalle(r)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3" />
            <span>
              {total.toLocaleString("es-CO")} evento(s) · Página {pagina + 1} de {totalPag}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(tamano)} onValueChange={(v) => { setTamano(Number(v)); setPagina(0); }}>
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 / pág</SelectItem>
                <SelectItem value="50">50 / pág</SelectItem>
                <SelectItem value="100">100 / pág</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={pagina + 1 >= totalPag}
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Panel>

      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de la operación</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-2 text-sm">
              <p><strong>Fecha:</strong> {fmt(detalle.created_at)}</p>
              <p><strong>Operación:</strong> {opNombre(detalle.accion)} ({detalle.accion})</p>
              <p><strong>Módulo:</strong> {detalle.modulo ?? "—"}</p>
              <p><strong>Conjunto de datos:</strong> {detalle.tabla ?? "—"}</p>
              <p><strong>Usuario:</strong> {detalle.actor_email ?? "—"}</p>
              <p><strong>Resultado:</strong> {detalle.resultado ?? "—"}</p>
              {detalle.detalles && (
                <div>
                  <p className="font-semibold">Resumen:</p>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
                    {JSON.stringify(detalle.detalles, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
