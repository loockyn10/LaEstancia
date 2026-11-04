/**
 * Única puerta de entrada a `import.meta.env` del Admin. El resto de la app consume `config`.
 * Sólo variables públicas: nunca service_role ni credenciales de base de datos.
 */
const env = import.meta.env;

/** URL de otra superficie: en desarrollo cae al puerto local; en producción debe estar configurada. */
function surfaceUrl(configured: string | undefined, developmentFallback: string): string | null {
  const value = configured?.trim();
  if (value) return value;
  return env.DEV ? developmentFallback : null;
}

export const config = {
  isDev: env.DEV,
  supabaseUrl: env.VITE_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim() ?? "",
  /** null cuando no está configurada en producción: la UI oculta el acceso en lugar de apuntar a localhost. */
  posUrl: surfaceUrl(env.VITE_POS_URL, "http://localhost:5174"),
} as const;

export function configurationError(): string | null {
  return config.supabaseUrl && config.supabaseAnonKey
    ? null
    : "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local y completá los valores públicos del proyecto.";
}
