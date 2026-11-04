import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pet-shop/database";
import { config, configurationError } from "../config/env";

export type AppSupabaseClient = ReturnType<typeof createClient<Database>>;

let client: AppSupabaseClient | undefined;

/** Cliente de Supabase, o null si la configuración pública falta (sólo lo consulta el gate de arranque). */
export function getSupabaseClient(): AppSupabaseClient | null {
  if (configurationError()) return null;
  client ??= createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/**
 * Cliente para la capa de acceso a datos. La app no renderiza ninguna pantalla autenticada sin
 * configuración válida, así que acá una falta es un error de programación y no un caso de UI.
 */
export function db(): AppSupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(configurationError() ?? "Supabase no está configurado.");
  return supabase;
}
