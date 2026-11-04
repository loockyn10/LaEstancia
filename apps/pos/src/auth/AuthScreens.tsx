import { type FormEvent, type ReactNode, useState } from "react";
import { loginEmail } from "@pet-shop/domain";
import { Button, Field } from "@pet-shop/ui";
import { getSupabaseClient } from "../lib/supabase";

export function StatusScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="auth">
      <section aria-live="polite">
        <p className="eyebrow">La Estancia POS</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function LoginScreen({ online, expiredOffline }: { online: boolean; expiredOffline: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client || !online) return;
    setSaving(true);
    setError(null);
    const { error: loginError } = await client.auth.signInWithPassword({ email: loginEmail(identifier), password });
    setSaving(false);
    if (loginError) setError("No pudimos iniciar sesión. Revisá tu usuario y contraseña.");
  }

  return (
    <main className="auth">
      <section>
        <p className="eyebrow">La Estancia POS</p>
        <h1>Ingresar al punto de venta</h1>
        {online ? (
          <p className="muted">Usá tu identificador asignado: dueño, admin o empleado.</p>
        ) : (
          <p className="offline-message">{expiredOffline ? "La sesión guardada venció." : "No hay una sesión guardada disponible."} Conectate a internet para iniciar sesión.</p>
        )}
        <form onSubmit={(event) => void submit(event)}>
          <Field label="Usuario o email">
            <input autoComplete="username" disabled={saving || !online} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} />
          </Field>
          <Field label="Contraseña">
            <input autoComplete="current-password" disabled={saving || !online} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <Button disabled={!online} loading={saving} type="submit">{saving ? "Ingresando…" : "Ingresar"}</Button>
        </form>
      </section>
    </main>
  );
}
