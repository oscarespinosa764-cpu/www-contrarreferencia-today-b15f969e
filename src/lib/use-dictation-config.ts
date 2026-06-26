import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import {
  DICTATION_REGISTRY,
  DICTATION_REGISTRY_BY_KEY,
  type DictationInsertMode,
  type DictationRole,
} from "@/lib/dictation-registry";

export interface DictationConfigRow {
  id: string;
  key: string;
  modulo: string;
  ventana: string;
  subventana: string;
  nombre_campo: string;
  selector: string | null;
  tipo_campo: string;
  modo_insercion: string;
  idioma: string;
  activo: boolean;
  roles_permitidos: string[];
  texto_ayuda: string | null;
  creado_por: string | null;
  actualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResolvedDictationConfig {
  key: string;
  activo: boolean;
  modo_insercion: DictationInsertMode;
  idioma: string;
  roles_permitidos: string[];
  texto_ayuda: string | null;
}

export const DICTATION_QUERY_KEY = ["voice-dictation-config"] as const;

async function fetchConfigs(): Promise<DictationConfigRow[]> {
  const { data, error } = await (supabase as any)
    .from("voice_dictation_config")
    .select("*")
    .order("modulo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DictationConfigRow[];
}

/** Carga todas las filas de configuración (para Control de Mando). */
export function useDictationConfigRows() {
  return useQuery({
    queryKey: DICTATION_QUERY_KEY,
    queryFn: fetchConfigs,
    staleTime: 60_000,
  });
}

/**
 * Resuelve la configuración aplicable para los campos. Combina las filas de la
 * base de datos (prioritarias) con los valores por defecto del registro, de
 * modo que los puntos iniciales funcionen aunque falte la fila persistida.
 */
export function useDictationResolver() {
  const { data: rows } = useDictationConfigRows();
  const { roles, isAdmin } = useAuth();

  const byKey = new Map<string, ResolvedDictationConfig>();

  // 1) Valores por defecto del registro.
  for (const item of DICTATION_REGISTRY) {
    byKey.set(item.key, {
      key: item.key,
      activo: item.activo,
      modo_insercion: item.modo_insercion,
      idioma: item.idioma,
      roles_permitidos: item.roles_permitidos,
      texto_ayuda: null,
    });
  }

  // 2) Sobrescribe con la base de datos.
  for (const row of rows ?? []) {
    byKey.set(row.key, {
      key: row.key,
      activo: row.activo,
      modo_insercion: (row.modo_insercion as DictationInsertMode) ?? "append",
      idioma: row.idioma || "es-CO",
      roles_permitidos: row.roles_permitidos ?? ["admin", "operativa"],
      texto_ayuda: row.texto_ayuda,
    });
  }

  const isEnabledForUser = (key: string): boolean => {
    const cfg = byKey.get(key);
    if (!cfg || !cfg.activo) return false;
    if (isAdmin) return true;
    const allowed = cfg.roles_permitidos ?? [];
    return (roles as DictationRole[]).some((r) => allowed.includes(r));
  };

  const getConfig = (key: string) => byKey.get(key) ?? null;

  return { getConfig, isEnabledForUser };
}

export { DICTATION_REGISTRY_BY_KEY };
