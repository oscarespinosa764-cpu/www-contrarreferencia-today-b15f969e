import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type PublicBackendConfig = {
  backendUrl?: string;
  backendPublishableKey?: string;
};

declare global {
  var __CEDIM_BACKEND_CONFIG__: PublicBackendConfig | undefined;
}

function getRuntimeConfig(): PublicBackendConfig {
  return globalThis.__CEDIM_BACKEND_CONFIG__ ?? {};
}

const BACKEND_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  getRuntimeConfig().backendUrl;

const BACKEND_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  getRuntimeConfig().backendPublishableKey;

if (!BACKEND_URL || !BACKEND_PUBLISHABLE_KEY) {
  throw new Error("La configuración pública del backend no está disponible.");
}

const rawClient = createClient<Database>(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Envoltura del cliente para soportar el "modo práctica": cuando está activo,
// TODA operación `.from(tabla)` se desvía a una superposición en memoria y
// nunca escribe en la base real. El resto del cliente (auth, storage, rpc,
// channel, functions) pasa sin cambios.
export const supabase = new Proxy(rawClient, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) => {
        if (isPracticeActive()) {
          return makePracticeFrom(table, target as never) as never;
        }
        return target.from(table as never);
      };
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as typeof rawClient;