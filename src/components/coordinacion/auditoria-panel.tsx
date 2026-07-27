// ============================================================
// Fase C · Auditoría — visualización consolidada de audit_logs.
// Solo admin (RLS filtra automáticamente). Lectura paginada,
// con filtros por módulo, resultado, actor y texto libre en acción.
// ============================================================
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { FiltersBar, countActiveFilters } from "@/components/filters/filters-bar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;

interface AuditRow {
  id: string;
  created_at: string;
  actor_email: string | null;
  accion: string;
  modulo: string | null;
  tabla: string | null;
  registro_id: string | null;
  resultado: string;
  detalles: Record<string, unknown> | null;
  ip: string | null;
}

export function AuditoriaPanel() {
  const [modulo, setModulo] = useState<string>("__all__");
  const [resultado, setResultado] = useState<string>("__all__");
  const [texto, setTexto] = useState<string>("");
  const [page, setPage] = useState<number>(0);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["auditoria-logs", modulo, resultado, texto, page],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select(
          "id, created_at, actor_email, accion, modulo, tabla, registro_id, resultado, detalles, ip",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (modulo !== "__all__") q = q.eq("modulo", modulo);
      if (resultado !== "__all__") q = q.eq("resultado", resultado);
      if (texto.trim()) {
        const like = `%${texto.trim()}%`;
        q = q.or(`accion.ilike.${like},actor_email.ilike.${like},tabla.ilike.${like}`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
    },
    staleTime: 15_000,
  });

  const modulosDisponibles = useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.rows ?? []) if (r.modulo) s.add(r.modulo);
    return Array.from(s).sort();
  }, [data]);

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPag = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Panel
      title="Auditoría del sistema"
      action={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Recargar
        </Button>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por acción, usuario o tabla…"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={modulo}
          onValueChange={(v) => {
            setModulo(v);
            setPage(0);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los módulos</SelectItem>
            {modulosDisponibles.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resultado}
          onValueChange={(v) => {
            setResultado(v);
            setPage(0);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="exito">Éxito</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="denegado">Denegado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Actor</th>
              <th className="p-2 text-left">Acción</th>
              <th className="p-2 text-left">Módulo</th>
              <th className="p-2 text-left">Tabla / Registro</th>
              <th className="p-2 text-left">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={6} className="p-6 text-center italic text-muted-foreground">
                  Sin registros para los filtros seleccionados.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top hover:bg-muted/30">
                <td className="whitespace-nowrap p-2 font-mono text-[11px]">
                  {new Date(r.created_at).toLocaleString("es-CO")}
                </td>
                <td className="p-2">{r.actor_email ?? "—"}</td>
                <td className="p-2 font-medium">{r.accion}</td>
                <td className="p-2 text-muted-foreground">{r.modulo ?? "—"}</td>
                <td className="p-2 text-muted-foreground">
                  {r.tabla ?? "—"}
                  {r.registro_id && <span className="ml-1 font-mono text-[10px]">#{r.registro_id.slice(0, 8)}</span>}
                </td>
                <td className="p-2">
                  <Badge
                    variant="outline"
                    className={
                      r.resultado === "exito"
                        ? "border-status-green/40 bg-status-green/10 text-status-green"
                        : r.resultado === "denegado"
                          ? "border-status-amber/40 bg-status-amber/10 text-status-amber"
                          : "border-status-red/40 bg-status-red/10 text-status-red"
                    }
                  >
                    {r.resultado}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{total.toLocaleString("es-CO")} registro(s) — página {page + 1} de {totalPag}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || isFetching}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => (p + 1 < totalPag ? p + 1 : p))}
            disabled={page + 1 >= totalPag || isFetching}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </Panel>
  );
}
