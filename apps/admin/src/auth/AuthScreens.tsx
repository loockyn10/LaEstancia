import { type FormEvent, type ReactNode, useState } from "react";
import { loginEmail } from "@pet-shop/domain";
import { Button, Field } from "@pet-shop/ui";
import { configurationError } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";

/** Pantalla centrada de estado (cargando sesión, sin acceso, errores de configuración). */
export function StatusScreen({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <main className="shell">
      <section aria-live="polite" className="welcome-card">
        <p className="eyebrow">La Estancia</p>
        <h1>{title}</h1>
        <p className="message">{message}</p>
        {children && <div className="form-actions status-actions">{children}</div>}
      </section>
    </main>
  );
}

export function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return setError(configurationError());
    setSubmitting(true);
    setError(null);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: loginEmail(identifier), password });
    setSubmitting(false);
    if (loginError) setError("No pudimos iniciar sesión. Revisá tu usuario y contraseña.");
  }

  return (
    <main className="shell">
      <section className="welcome-card login-card">
        <p className="eyebrow">La Estancia · Administración</p>
        <h1>Iniciar sesión</h1>
        <p className="message">Ingresá con tu usuario asignado o tu email. Los accesos iniciales usan dueño o admin.</p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <Field label="Usuario o email">
            <input autoComplete="username" disabled={submitting} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} />
          </Field>
          <Field label="Contraseña">
            <input autoComplete="current-password" disabled={submitting} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button loading={submitting} type="submit">{submitting ? "Ingresando…" : "Ingresar"}</Button>
        </form>
      </section>
    </main>
  );
}
