import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pet-shop/database";

type Client = ReturnType<typeof createClient<Database>>;

const technicalEmails: Record<string, string> = {
  "dueño": "dueno@laestancia.local",
  dueno: "dueno@laestancia.local",
  admin: "admin@laestancia.local",
  empleado: "empleado@laestancia.local",
};

let client: Client | undefined;

export function loginEmail(identifier: string) {
  return technicalEmails[identifier.trim().toLocaleLowerCase("es-AR")] ?? identifier.trim();
}

export function configurationError() {
  return import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
    ? null
    : "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.";
}

export function supabase() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  client ??= createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export function adminUrl() {
  return import.meta.env.VITE_ADMIN_URL?.trim() || "http://localhost:5173";
}
