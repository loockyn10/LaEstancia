import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pet-shop/database";
import { config, configurationError } from "../config/env";

export { loginEmail } from "@pet-shop/domain";

export type PosSupabaseClient = ReturnType<typeof createClient<Database>>;

let client: PosSupabaseClient | undefined;

/** Cliente de Supabase, o null si falta la configuración pública. */
export function getSupabaseClient(): PosSupabaseClient | null {
  if (configurationError()) return null;
  client ??= createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** Para operaciones que sólo existen con la pantalla del POS montada (ya con configuración válida). */
export function db(): PosSupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(configurationError() ?? "Supabase no está configurado.");
  return supabase;
}
