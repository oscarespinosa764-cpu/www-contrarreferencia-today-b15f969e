import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import {
  normalizarCasos,
  evaluarReglas,
  combinarAvisos,
  type Regla,
  type Aviso,
  type AlertaIA,
  type AvisoUnificado,
} from "@/lib/avisos-reglas";

type Row = Record<string, unknown>;

async function fetchActivos(tabla: string): Promise<Row[]> {
  const { data } = await supabase.from(tabla as never).select("*").eq("archivado", false).limit(2000);
  return (data ?? []) as Row[];
}

/** Carga reglas + avisos + casos activos y calcula alertas IA en memoria. */
export function useAvisosOperativos() {
  const reglasQ = useQuery({
    queryKey: ["reglas-operativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reglas_operativas")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Regla[];
    },
  });

  const avisosQ = useQuery({
    queryKey: ["avisos-operativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
  });

  const casosQ = useQuery({
    queryKey: ["casos-activos-motor"],
    staleTime: 60_000,
    queryFn: async () => {
      const [rem, dom, ref, pen, seg] = await Promise.all([
        fetchActivos("remisiones"),
        fetchActivos("domiciliarios"),
        fetchActivos("referencia_interna"),
        fetchActivos("pendientes"),
        fetchActivos("seguimientos"),
      ]);
      return { rem, dom, ref, pen, seg };
    },
  });

  const alertasIA: AlertaIA[] = useMemo(() => {
    if (!reglasQ.data || !casosQ.data) return [];
    const casos = normalizarCasos(
      casosQ.data.rem,
      casosQ.data.dom,
      casosQ.data.ref,
      casosQ.data.pen,
    );
    const ultimoSeg: Record<string, Date> = {};
    for (const sg of casosQ.data.seg) {
      const cid = String(sg.caso_id ?? "");
      if (!cid) continue;
      const d = new Date(String(sg.created_at ?? ""));
      if (isNaN(d.getTime())) continue;
      if (!ultimoSeg[cid] || d > ultimoSeg[cid]) ultimoSeg[cid] = d;
    }
    return evaluarReglas(reglasQ.data, casos, ultimoSeg);
  }, [reglasQ.data, casosQ.data]);

  const combinados: AvisoUnificado[] = useMemo(
    () => combinarAvisos(avisosQ.data ?? [], alertasIA),
    [avisosQ.data, alertasIA],
  );

  return {
    reglas: reglasQ.data ?? [],
    avisos: avisosQ.data ?? [],
    alertasIA,
    combinados,
    isLoading: reglasQ.isLoading || avisosQ.isLoading || casosQ.isLoading,
  };
}
