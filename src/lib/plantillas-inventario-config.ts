// ============================================================
// Carga en runtime del contenido editable de una plantilla del
// inventario (plantillas_inventario.contenido_editable). Se usa
// en los generadores PDF/Excel para que los campos que el admin
// modifica en Control de Mando > Plantillas del sistema tengan
// efecto real sin tocar código.
//
// - Cache en memoria por código de plantilla durante la sesión.
// - Devuelve {} si la plantilla no existe, es SOLO_LECTURA o la
//   consulta falla: los generadores usan sus valores por defecto.
// - No lanza excepciones: la generación del reporte debe seguir
//   funcionando aunque la red o la BD estén caídas.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

type PlantillaConfig = Record<string, unknown>;

const cache = new Map<string, Promise<PlantillaConfig>>();

export function getPlantillaConfig(codigo: string): Promise<PlantillaConfig> {
  const cached = cache.get(codigo);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from("plantillas_inventario")
        .select("contenido_editable, editable_nivel")
        .eq("codigo", codigo)
        .maybeSingle();
      if (error || !data) return {};
      if (data.editable_nivel === "SOLO_LECTURA") return {};
      return (data.contenido_editable ?? {}) as PlantillaConfig;
    } catch {
      return {};
    }
  })();

  cache.set(codigo, promise);
  return promise;
}

/** Devuelve `override` si es un string no vacío; si no, `defaultValue`. */
export function pickText(cfg: PlantillaConfig, key: string, defaultValue: string): string {
  const v = cfg[key];
  return typeof v === "string" && v.trim().length > 0 ? v : defaultValue;
}

/** Devuelve `override` si es booleano; si no, `defaultValue`. */
export function pickBool(cfg: PlantillaConfig, key: string, defaultValue: boolean): boolean {
  const v = cfg[key];
  return typeof v === "boolean" ? v : defaultValue;
}

/** Limpia la caché (útil tras editar en Control de Mando). */
export function invalidatePlantillaConfig(codigo?: string) {
  if (codigo) cache.delete(codigo);
  else cache.clear();
}
