// ============================================================================
// Fase 3 · Fuente canónica administrable de categorías de catálogos.
// Reemplaza el hardcode TIPO_MODULO/MODULO_POR_TIPO.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import {
  Layers,
  Truck,
  Ban,
  Users,
  Package,
  Building2,
  Ambulance,
  FileText,
  Settings,
  List,
  Map as MapIcon,
  Shield,
  type LucideIcon,
} from "lucide-react";

export interface CatalogoCategoria {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  icono: string;
  orden: number;
  activo: boolean;
}

export interface CatalogoTipoMeta {
  tipo: string;
  nombre_visible: string;
  descripcion: string | null;
  categoria_id: string;
  orden: number;
  activo: boolean;
}

export const ICONOS_PERMITIDOS: Record<string, LucideIcon> = {
  layers: Layers,
  truck: Truck,
  ban: Ban,
  users: Users,
  package: Package,
  building: Building2,
  ambulance: Ambulance,
  "file-text": FileText,
  settings: Settings,
  list: List,
  map: MapIcon,
  shield: Shield,
};

export function iconoDe(code: string | null | undefined): LucideIcon {
  if (!code) return Package;
  return ICONOS_PERMITIDOS[code] ?? Package;
}

const STALE = 60_000;

export function useCatalogoCategorias() {
  return useQuery({
    queryKey: ["catalogo-categorias-config"],
    staleTime: STALE,
    queryFn: async (): Promise<CatalogoCategoria[]> => {
      const { data, error } = await supabase
        .from("catalogo_categorias")
        .select("id, codigo, nombre, descripcion, icono, orden, activo")
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogoCategoria[];
    },
  });
}

export function useCatalogoTiposMeta() {
  return useQuery({
    queryKey: ["catalogo-tipos-config"],
    staleTime: STALE,
    queryFn: async (): Promise<CatalogoTipoMeta[]> => {
      const { data, error } = await supabase
        .from("catalogo_tipos")
        .select("tipo, nombre_visible, descripcion, categoria_id, orden, activo")
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogoTipoMeta[];
    },
  });
}

/**
 * Retorna helpers derivados: mapa tipo→nombreCategoría y tipo→nombreVisible.
 * Si la config aún no llegó, retorna maps vacíos (el componente decide fallback).
 */
export function useCatalogoConfigDerivada() {
  const cats = useCatalogoCategorias();
  const tipos = useCatalogoTiposMeta();

  const listo = !cats.isLoading && !tipos.isLoading;
  const catById = new Map<string, CatalogoCategoria>(
    (cats.data ?? []).map((c) => [c.id, c]),
  );
  const tipoModulo: Record<string, string> = {};
  const tipoNombre: Record<string, string> = {};
  for (const t of tipos.data ?? []) {
    const c = catById.get(t.categoria_id);
    tipoModulo[t.tipo] = c?.nombre ?? "Otros";
    tipoNombre[t.tipo] = t.nombre_visible;
  }

  return {
    listo,
    isLoading: cats.isLoading || tipos.isLoading,
    isError: cats.isError || tipos.isError,
    categorias: cats.data ?? [],
    tipos: tipos.data ?? [],
    catById,
    tipoModulo,
    tipoNombre,
    refetch: async () => {
      await Promise.all([cats.refetch(), tipos.refetch()]);
    },
  };
}
