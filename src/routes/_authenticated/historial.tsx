import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileSpreadsheet, MessageSquare, Hospital } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historial")({
  component: HistorialPage,
});

type Caso = {
  id: string;
  codigo: string | null;
  tipo: string | null;
  cod_ref: string | null;
  documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  ips: string | null;
  unidad: string | null;
  especialidad: string | null;
  estado: string | null;
  fecha: string | null;
  fecha_vence: string | null;
  created_at: string;
};

type Grupo = {
  key: string;
  base: Caso;
  eventos: Caso[];
  estadoFinal: { label: string; color: StatusColor };
  activa: boolean;
};

type StatusColor = "green" | "red" | "amber";

const TIPO_FILTERS = ["TODOS", "ACEP", "NEG", "AMP", "CAN", "ING"] as const;
type TipoFilter = (typeof TIPO_FILTERS)[number];

const PERIODOS = ["Todos", "Hoy", "Esta semana", "Este mes", "Mes anterior"] as const;
type Periodo = (typeof PERIODOS)[number];

const tipoChip: Record<string, string> = {
  ACEP: "bg-status-teal/15 text-status-teal border-status-teal/40",
  NEG: "bg-status-red/15 text-status-red border-status-red/40",
  CAN: "bg-status-amber/15 text-status-amber border-status-amber/40",
  ING: "bg-status-green/15 text-status-green border-status-green/40",
  AMP: "bg-status-sky/15 text-status-sky border-status-sky/40",
};

const statusBadge: Record<StatusColor, string> = {
  green: "bg-status-green/15 text-status-green",
  red: "bg-status-red/15 text-status-red",
  amber: "bg-status-amber/15 text-status-amber",
};

const cardBorder: Record<StatusColor, string> = {
  green: "border-l-status-green",
  red: "border-l-status-red",
  amber: "border-l-status-amber",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtFecha(c: Caso): string {
  const raw = c.created_at || c.fecha;
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return c.fecha ?? "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dentroPeriodo(c: Caso, periodo: Periodo): boolean {
  if (periodo === "Todos") return true;
  const raw = c.fecha || c.created_at;
  if (!raw) return false;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (periodo === "Hoy") return d >= startToday;
  if (periodo === "Esta semana") {
    const ws = new Date(startToday);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
    return d >= ws;
  }
  if (periodo === "Este mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (periodo === "Mes anterior") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
  }
  return true;
}

function tieneTipo(eventos: Caso[], tipo: string): boolean {
  return eventos.some((e) => (e.tipo || "").toUpperCase().includes(tipo));
}

function calcularEstado(base: Caso, eventos: Caso[]): { estadoFinal: Grupo["estadoFinal"]; activa: boolean } {
  const est = (base.estado || "").toUpperCase();
  const baseTipo = (base.tipo || "").toUpperCase();
  const hasIng = tieneTipo(eventos, "ING") || est.includes("INGRESAD");
  const hasCan = tieneTipo(eventos, "CAN") || est.includes("CANCELAD");
  if (baseTipo.includes("NEG")) return { estadoFinal: { label: "CERRADA — NO ACEPTADA", color: "red" }, activa: false };
  if (hasIng) return { estadoFinal: { label: "CERRADA — INGRESÓ", color: "green" }, activa: false };
  if (hasCan) return { estadoFinal: { label: "CERRADA — CANCELADA", color: "red" }, activa: false };
  if (est.includes("CERRAD")) return { estadoFinal: { label: "CERRADA", color: "red" }, activa: false };
  return { estadoFinal: { label: "ACTIVA", color: "green" }, activa: true };
}

function HistorialPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoFilter>("TODOS");
  const [periodo, setPeriodo] = useState<Periodo>("Todos");

  const { data: casos, isLoading } = useQuery({
    queryKey: ["historial-casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select(
          "id, codigo, tipo, cod_ref, documento, nombres, apellidos, ips, unidad, especialidad, estado, fecha, fecha_vence, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Caso[];
    },
  });

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Caso[]>();
    for (const c of casos ?? []) {
      const key = (c.cod_ref || c.codigo || c.id).toUpperCase();
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    const out: Grupo[] = [];
    for (const [key, eventos] of map) {
      eventos.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const base = eventos.find((e) => !e.cod_ref) ?? eventos[0];
      const { estadoFinal, activa } = calcularEstado(base, eventos);
      out.push({ key, base, eventos, estadoFinal, activa });
    }
    out.sort((a, b) => new Date(b.base.created_at).getTime() - new Date(a.base.created_at).getTime());
    return out;
  }, [casos]);

  const term = q.trim().toLowerCase();
  const gruposF = useMemo(
    () =>
      grupos.filter((g) => {
        if (tipo !== "TODOS" && !tieneTipo(g.eventos, tipo)) return false;
        if (!dentroPeriodo(g.base, periodo)) return false;
        if (!term) return true;
        const hay = g.eventos
          .map((e) => `${e.codigo ?? ""} ${e.documento ?? ""} ${e.nombres ?? ""} ${e.apellidos ?? ""} ${e.ips ?? ""}`)
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    [grupos, tipo, periodo, term],
  );

  const handleConfirmarIngreso = async (g: Grupo) => {
    const base = g.base;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("casos_entrantes").insert({
      tipo: "ING",
      estado: "INGRESADO",
      cod_ref: base.codigo,
      documento: base.documento,
      nombres: base.nombres,
      apellidos: base.apellidos,
      ips: base.ips,
      unidad: base.unidad,
      especialidad: base.especialidad,
      fecha: new Date().toISOString().slice(0, 10),
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (base.codigo) {
      await supabase.from("casos_entrantes").update({ estado: "INGRESADO" }).eq("codigo", base.codigo);
    }
    toast.success("Ingreso confirmado");
    qc.invalidateQueries({ queryKey: ["historial-casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const exportarExcel = () => {
    const rows = gruposF.flatMap((g) =>
      g.eventos.map((e) => ({
        Codigo: e.codigo ?? "",
        Tipo: e.tipo ?? "",
        Documento: e.documento ?? "",
        Paciente: [e.nombres, e.apellidos].filter(Boolean).join(" "),
        IPS: e.ips ?? "",
        Unidad: e.unidad ?? "",
        Estado: g.estadoFinal.label,
        Fecha: fmtFecha(e),
      })),
    );
    const headers = Object.keys(rows[0] ?? { Codigo: "" });
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `historial_casos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <AppHeader title="Referencia y Contrarreferencia" subtitle="CEDIM IPS S.A.S — Control de Casos" />

      <Panel>
        {/* Encabezado: título + filtros por tipo + Excel */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">Historial de Casos</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {TIPO_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition ${
                  tipo === t
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
            <Button size="sm" className="ml-1 rounded-full bg-status-green text-white hover:bg-status-green/90" onClick={exportarExcel}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-lg pl-9"
            placeholder="Buscar por número de documento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Período + mensajes recientes */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">📅 Período:</span>
            {PERIODOS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  periodo === p
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-teal/40 bg-status-teal/10 px-3 py-1 text-[11px] font-semibold text-status-teal">
            <MessageSquare className="h-3.5 w-3.5" /> Mensajes recientes
          </span>
        </div>

        {/* Lista de casos */}
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : gruposF.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
            <p className="text-3xl text-muted-foreground">🔍</p>
            <p className="mt-2 text-sm font-semibold text-foreground">Sin coincidencias</p>
            <p className="text-xs text-muted-foreground">Prueba con otros términos o limpia los filtros</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {gruposF.map((g) => (
              <CasoCard key={g.key} grupo={g} canEdit={canEdit} onConfirmar={handleConfirmarIngreso} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CasoCard({
  grupo,
  canEdit,
  onConfirmar,
}: {
  grupo: Grupo;
  canEdit: boolean;
  onConfirmar: (g: Grupo) => void;
}) {
  const { base, eventos, estadoFinal, activa } = grupo;
  const nombre = [base.nombres, base.apellidos].filter(Boolean).join(" ") || "Sin nombre";
  return (
    <div className={`rounded-xl border border-border border-l-4 ${cardBorder[estadoFinal.color]} bg-card p-4 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-status-blue">{base.documento || "—"}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{nombre}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-right">
          {base.ips && <span className="text-[11px] font-bold text-foreground">{base.ips}</span>}
          {base.unidad && <span className="text-[11px] italic text-muted-foreground">{base.unidad}</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadge[estadoFinal.color]}`}>
            ● {estadoFinal.label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {eventos.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="inline-flex items-center gap-2 rounded-md border bg-background/40 px-2 py-1">
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${tipoChip[(e.tipo || "").toUpperCase()] ?? "border-border text-muted-foreground"}`}>
                {(e.tipo || "?").toUpperCase()}
              </span>
              <span className="font-mono text-[11px] font-semibold text-foreground">{e.codigo}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{fmtFecha(e)}</span>
            </span>
          </div>
        ))}
        {activa && canEdit && (
          <Button
            size="sm"
            className="ml-auto rounded-md bg-status-green text-white hover:bg-status-green/90"
            onClick={() => onConfirmar(grupo)}
          >
            <Hospital className="mr-1.5 h-4 w-4" /> Confirmar Ingreso
          </Button>
        )}
      </div>
    </div>
  );
}
