// ============================================================================
// Fase A · Q1 — Adaptadores de lectura para los 10 catálogos canónicos.
//
// Los componentes existentes conservan sus constantes hardcoded como fallback
// runtime hasta que se retiren en una fase posterior. Este helper permite leer
// la fuente canónica desde `public.catalogos` sin refactorizar cada formulario.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CatalogoTipo =
  | "TIPO_AMBULANCIA"
  | "TIPO_EAPB"
  | "TIPO_RECURSO_RED"
  | "MOTIVO_EXENTO_CUPO"
  | "TIPO_INDICADOR"
  | "SEDE"
  | "CARGO"
  | "AREA_CRUE"
  | "TIPO_NOVEDAD_SALIENTE"
  | "MOTIVO_CIERRE_ENTRANTE";

export interface CatalogoElemento {
  id: string;
  tipo: string;
  valor: string;
  codigo: string | null;
  orden: number;
  activo: boolean;
  metadata: Record<string, unknown>;
}

const STALE = 5 * 60 * 1000;

/**
 * Lee los elementos activos de un catálogo canónico, ordenados por `orden`.
 * Si el catálogo aún no tiene filas, devuelve `[]` — quien llama debe manejar
 * el fallback a la constante hardcoded conocida por el módulo.
 */
export function useCatalogo(tipo: CatalogoTipo) {
  return useQuery({
    queryKey: ["catalogo-canonico", tipo],
    staleTime: STALE,
    queryFn: async (): Promise<CatalogoElemento[]> => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("id, tipo, valor, codigo, orden, activo, metadata")
        .eq("tipo", tipo)
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogoElemento[];
    },
  });
}

/**
 * Devuelve solo los valores visibles activos, o el fallback si el catálogo
 * aún no cargó / está vacío. Reutilizable dentro de componentes que muestran
 * selects de string simple sin necesidad de acceder al código estable.
 */
export function useValoresCatalogo(
  tipo: CatalogoTipo,
  fallback: readonly string[],
): string[] {
  const { data } = useCatalogo(tipo);
  if (!data || data.length === 0) return [...fallback];
  return data.map((e) => e.valor);
}
