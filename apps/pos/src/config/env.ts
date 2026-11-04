/**
 * Única puerta de entrada a `import.meta.env` del POS. Sólo variables públicas: nunca service_role.
 */
const env = import.meta.env;

export const config = {
  isDev: env.DEV,
  supabaseUrl: env.VITE_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim() ?? "",
  /** En producción debe estar configurada; sin ella la UI oculta el acceso en lugar de apuntar a localhost. */
  adminUrl: env.VITE_ADMIN_URL?.trim() || (env.DEV ? "http://localhost:5173" : null),
} as const;

export function configurationError(): string | null {
  return config.supabaseUrl && config.supabaseAnonKey ? null : "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.";
}
