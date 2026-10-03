import { createClient } from '@supabase/supabase-js'
import type { Database } from '@pet-shop/database'

type SupabaseConfiguration = {
  url: string
  anonKey: string
}

type SupabaseClient = ReturnType<typeof createClient<Database>>

let client: SupabaseClient | undefined

function getConfiguration(): SupabaseConfiguration | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  return url && anonKey ? { url, anonKey } : null
}

export function getSupabaseConfigurationError(): string | null {
  return getConfiguration()
    ? null
    : 'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local y completá los valores públicos del proyecto.'
}

export function getSupabaseClient(): SupabaseClient | null {
  const configuration = getConfiguration()

  if (!configuration) {
    return null
  }

  client ??= createClient<Database>(configuration.url, configuration.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}
