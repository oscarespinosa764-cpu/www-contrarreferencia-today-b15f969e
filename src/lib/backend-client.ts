import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BACKEND_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  "https://fndlfhzeyveuetgiyhsr.supabase.co";

const BACKEND_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_MH0elAbaveyDNhlJTQSmUQ_T6ksRMxI";

export const supabase = createClient<Database>(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});