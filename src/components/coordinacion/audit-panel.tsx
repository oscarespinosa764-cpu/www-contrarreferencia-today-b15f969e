import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";

type AuditRow = {
  id: string;
  actor_email: string | null;
  accion: string;
  modulo: string | null;
  tabla: string | null;
  resultado: string;
  detalles: Record<string, unknown> | null;
  created_at: string;
};

const resultadoColor: Record<string, string> = {
  exito: "text-status-green",
  fallido: "text-status-red",
  rechazado: "text-status-amber",
};

export function AuditPanel() {
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, actor_email, accion, modulo, tabla, resultado, detalles, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as AuditRow[];
    },
  });

  if (!isAdmin) {
    return (
      <Panel>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Solo el administrador puede consultar la auditoría.
        </p>
      </Panel>
    );
  }

  const term = q.trim().toLowerCase();
  const filtrados = (logs ?? []).filter((l) =>
    !term
      ? true
      : [l.actor_email, l.accion, l.modulo, l.tabla, l.resultado]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
  );

  const exportarCsv = () => {
    const headers = ["Fecha", "Usuario", "Accion", "Modulo", "Tabla", "Resultado", "Detalles"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtrados.map((l) =>
      [
        new Date(l.created_at).toLocaleString("es-CO"),
        l.actor_email || "",
        l.accion,
        l.modulo || "",
        l.tabla || "",
        l.resultado,
        l.detalles ? JSON.stringify(l.detalles) : "",
      ]
        .map(escape)
        .join(","),
    );
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Registro de auditoría (últimos 500 eventos)">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar acción, usuario, módulo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={exportarCsv}
          disabled={filtrados.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Descargar CSV
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Módulo</th>
              <th className="px-3 py-2">Tabla</th>
              <th className="px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Sin eventos registrados.
                </td>
              </tr>
            ) : (
              filtrados.map((l) => (
                <tr key={l.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("es-CO")}
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{l.actor_email || "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{l.accion}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{l.modulo || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{l.tabla || "—"}</td>
                  <td className={`px-3 py-2.5 font-semibold ${resultadoColor[l.resultado] ?? "text-muted-foreground"}`}>
                    {l.resultado}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
