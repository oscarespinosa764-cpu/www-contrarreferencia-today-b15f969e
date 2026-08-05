// ============================================================
// CIE-10 · FUENTE CANÓNICA ESTÁTICA (server-only)
//
// La única fuente de verdad es el archivo estático `public/cie10.json`,
// el mismo que consume `Cie10Field` en la interfaz. NO se crea tabla ni
// catálogo duplicado: el servidor lee ese archivo (servido por la misma
// aplicación) y lo mantiene en memoria mientras vive la instancia.
// ============================================================
import { getRequest } from "@tanstack/react-start/server";

type Cie = { c: string; d: string };

let indice: Map<string, string> | null = null;
let cargando: Promise<Map<string, string>> | null = null;

/** Normaliza el código: sin puntos, sin espacios, en mayúsculas. */
export function normalizarCie10(codigo: string): string {
  return (codigo || "").replace(/[\s.]/g, "").trim().toUpperCase();
}

async function cargarIndice(): Promise<Map<string, string>> {
  if (indice) return indice;
  if (cargando) return cargando;
  cargando = (async () => {
    const base = getRequest().url;
    const res = await fetch(new URL("/cie10.json", base).toString());
    if (!res.ok) throw new Error("No se pudo cargar el catálogo CIE-10");
    const data = (await res.json()) as Cie[];
    const m = new Map<string, string>();
    for (const x of data) m.set(normalizarCie10(x.c), x.d);
    indice = m;
    return m;
  })();
  return cargando;
}

export type Cie10Canonico = { codigo: string; descripcion: string };

/**
 * Devuelve la entrada canónica del catálogo o `null` si el código no existe.
 * La descripción SIEMPRE proviene del catálogo: nunca se confía en la que
 * envíe el cliente.
 */
export async function resolverCie10(codigo: string): Promise<Cie10Canonico | null> {
  const cod = normalizarCie10(codigo);
  if (!cod) return null;
  const idx = await cargarIndice();
  const desc = idx.get(cod);
  if (!desc) return null;
  return { codigo: cod, descripcion: desc };
}
