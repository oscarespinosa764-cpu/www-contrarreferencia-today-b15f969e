// Vista SOLO LECTURA de Avisos Operativos (automáticos IA + manuales vigentes).
// No incluye configuradores: crear/editar/archivar reglas y avisos manuales se
// gestiona en Control de Mando → Alertas y avisos. Las alertas de coordinación
// (código [ALT-...]) se excluyen aquí; tienen su propia subventana.
import { useMemo, useState } from "react";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FiltersBar, countActiveFilters } from "@/components/filters/filters-bar";
import { Search } from "lucide-react";
import { useAvisosOperativos } from "@/lib/use-avisos-operativos";
import { NIVEL_BADGE } from "@/lib/avisos-reglas";
import { extraerCodigoAlerta } from "@/lib/alertas-coordinacion";

export function AvisosOperativosVista() {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const { avisos, combinados, isLoading } = useAvisosOperativos();

  // Set de sourceId de avisos manuales que son alertas de coordinación ([ALT-]).
  const idsCoordinacion = useMemo(() => {
    const set = new Set<string>();
    for (const a of avisos) {
      if (extraerCodigoAlerta(a.mensaje)) set.add(a.id);
    }
    return set;
  }, [avisos]);

  const term = q.trim().toLowerCase();
  const lista = useMemo(
    () =>
      combinados
        // Excluir alertas de coordinación (van en su propia subventana).
        .filter((a) => !(a.kind === "M" && idsCoordinacion.has(a.sourceId)))
        .filter((a) => {
          if (filtro === "automaticos") return a.kind === "IA";
          if (filtro === "manuales") return a.kind === "M";
          if (filtro === "criticas") return a.severidad === "CRITICO";
          if (filtro === "altas") return a.severidad === "ALTO";
          if (filtro === "medias") return a.severidad === "MEDIO";
          return true;
        })
        .filter((a) => (term ? [a.titulo, a.sub, a.detalle].join(" ").toLowerCase().includes(term) : true)),
    [combinados, idsCoordinacion, filtro, term],
  );

  return (
    <Panel title={`Avisos operativos · ${lista.length}`} bodyMaxHeight={null}>
      <p className="mb-3 text-center text-[11px] text-muted-foreground">
        Consolidado de visualización · avisos automáticos (motor de reglas) y avisos manuales vigentes.
        La configuración se realiza en Control de Mando → Alertas y avisos.
      </p>

      <div className="mb-4">
        <FiltersBar
          activeCount={countActiveFilters(
            { q, filtro },
            { q: "", filtro: "todos" },
          )}
          onClear={() => {
            setQ("");
            setFiltro("todos");
          }}
          panelTitle="Filtros de avisos"
          mode="inmediato"
          primary={
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full rounded-full pl-9"
                placeholder="Buscar aviso, paciente, módulo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar aviso"
              />
            </div>
          }
          secondary={
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-full sm:w-44 rounded-full" aria-label="Filtro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="automaticos">Automáticos</SelectItem>
                <SelectItem value="manuales">Manuales</SelectItem>
                <SelectItem value="criticas">Críticas</SelectItem>
                <SelectItem value="altas">Altas</SelectItem>
                <SelectItem value="medias">Medias</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>


      <div
        className="scrollbar-invisible overflow-y-auto overflow-x-hidden pr-0.5"
        style={{ maxHeight: "calc(100dvh - 22rem)" }}
      >
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : lista.length > 0 ? (
          <div className="grid gap-3">
            {lista.map((a) => (
              <div
                key={a.key}
                className={`flex items-start justify-between gap-3 rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                  a.severidad === "CRITICO"
                    ? "border-l-status-red"
                    : a.severidad === "ALTO"
                      ? "border-l-status-amber"
                      : a.severidad === "MEDIO"
                        ? "border-l-status-sky"
                        : "border-l-border"
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                        a.kind === "M" ? "bg-vitalis-blue/15 text-vitalis-blue" : "bg-status-teal/15 text-status-teal"
                      }`}
                    >
                      {a.kind === "M" ? "MANUAL" : "AUTO"}
                    </span>
                    {a.titulo}
                  </p>
                  {a.detalle && <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{a.sub || "—"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${NIVEL_BADGE[a.severidad]}`}>
                  {a.severidad}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin avisos operativos activos. Los avisos aparecen mientras se cumpla su condición.
          </p>
        )}
      </div>
    </Panel>
  );
}
