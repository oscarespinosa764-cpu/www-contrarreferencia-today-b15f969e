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

export const supabase = createClient<Database>(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});