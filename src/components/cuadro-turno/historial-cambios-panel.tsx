import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";

interface AuditRow {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  detail: string | null;
  created_at: string;
  shift_requests: { requester_name: string | null } | null;
}

export function HistorialCambiosPanel() {
  const { data: rows = [] } = useQuery({
    queryKey: ["shift-request-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_request_audit")
        .select("id, action, previous_status, new_status, detail, created_at, shift_requests(requester_name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead><TableHead>Acción</TableHead>
            <TableHead>Colaborador</TableHead><TableHead>Estado</TableHead><TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sin movimientos registrados.</TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs">{fmtFechaHora(r.created_at)}</TableCell>
              <TableCell className="font-medium">{r.action}</TableCell>
              <TableCell>{r.shift_requests?.requester_name ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.previous_status ? `${r.previous_status} → ` : ""}{r.new_status ?? ""}</TableCell>
              <TableCell className="max-w-[280px] truncate text-xs">{r.detail ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
