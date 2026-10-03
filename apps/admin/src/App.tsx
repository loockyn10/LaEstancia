import { type FormEvent, useEffect, useState } from 'react'
import { getSupabaseClient, getSupabaseConfigurationError } from './lib/supabase'

type Access =
  | { status: 'configuration-error'; message: string }
  | { status: 'resolving-session' }
  | { status: 'signed-out' }
  | { status: 'resolving-access' }
  | { status: 'no-access' }
  | { status: 'authorized'; businessName: string; role: string }
  | { status: 'error'; message: string }

const loginPath = '/login'

function replacePath(path: string) {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="shell">
      <section aria-live="polite" className="welcome-card status-card">
        <p className="eyebrow">Backoffice</p>
        <h1>Preparando tu sesión</h1>
        <p className="message">{message}</p>
      </section>
    </main>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = getSupabaseClient()

    if (!supabase) {
      setError(getSupabaseConfigurationError())
      return
    }

    setSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

  }

  return (
    <main className="shell">
      <section aria-labelledby="page-title" className="welcome-card login-card">
        <p className="eyebrow">Plataforma de gestión para pet shop</p>
        <h1 id="page-title">Iniciar sesión</h1>
        <p className="message">Ingresá con tu cuenta asignada para acceder al backoffice.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="current-password"
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}

function AccessDenied({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <main className="shell">
      <section aria-labelledby="page-title" className="welcome-card status-card">
        <p className="eyebrow">Backoffice</p>
        <h1 id="page-title">Sin acceso asignado</h1>
        <p className="message">Tu cuenta no tiene una membresía activa en ningún negocio. Pedile acceso a la persona administradora.</p>
        <button className="secondary-button" onClick={() => void onLogout()} type="button">Cerrar sesión</button>
      </section>
    </main>
  )
}

function Backoffice({ businessName, role, onLogout }: { businessName: string; role: string; onLogout: () => Promise<void> }) {
  return (
    <main className="shell">
      <section aria-labelledby="page-title" className="welcome-card status-card">
        <div className="shell-header">
          <div>
            <p className="eyebrow">{businessName}</p>
            <h1 id="page-title">Backoffice</h1>
          </div>
          <button className="secondary-button" onClick={() => void onLogout()} type="button">Cerrar sesión</button>
        </div>
        <p className="message">Tu acceso está activo con el rol de <strong>{role}</strong>. Los módulos operativos se incorporarán en próximos sprints.</p>
      </section>
    </main>
  )
}

export function App() {
  const configurationError = getSupabaseConfigurationError()
  const [access, setAccess] = useState<Access>(
    configurationError ? { status: 'configuration-error', message: configurationError } : { status: 'resolving-session' },
  )
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(undefined)
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAccess({ status: 'error', message: error.message })
        return
      }
      setSessionUserId(data.session?.user.id ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSessionUserId(session?.user.id ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || sessionUserId === undefined) return

    if (!sessionUserId) {
      setAccess({ status: 'signed-out' })
      return
    }

    let active = true
    setAccess({ status: 'resolving-access' })

    void (async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from('business_memberships')
        .select('business_id, role')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)

      if (!active) return
      if (membershipError) {
        setAccess({ status: 'error', message: membershipError.message })
        return
      }

      const membership = memberships?.[0]
      if (!membership) {
        setAccess({ status: 'no-access' })
        return
      }

      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', membership.business_id)
        .maybeSingle()

      if (!active) return
      if (businessError) {
        setAccess({ status: 'error', message: businessError.message })
        return
      }

      if (!business) {
        setAccess({ status: 'no-access' })
        return
      }

      setAccess({ status: 'authorized', businessName: business.name, role: membership.role })
    })()

    return () => { active = false }
  }, [sessionUserId])

  useEffect(() => {
    if (access.status === 'signed-out' && pathname !== loginPath) replacePath(loginPath)
    if (access.status === 'authorized' && pathname === loginPath) replacePath('/')
  }, [access.status, pathname])

  async function logout() {
    const supabase = getSupabaseClient()
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAccess({ status: 'error', message: error.message })
  }

  if (access.status === 'configuration-error') {
    return <LoadingScreen message={access.message} />
  }

  if (access.status === 'resolving-session') {
    return <LoadingScreen message="Restaurando tu sesión…" />
  }

  if (access.status === 'signed-out') {
    return <Login />
  }

  if (access.status === 'resolving-access') {
    return <LoadingScreen message="Verificando tu acceso…" />
  }

  if (access.status === 'no-access') {
    return <AccessDenied onLogout={logout} />
  }

  if (access.status === 'authorized') {
    return <Backoffice businessName={access.businessName} onLogout={logout} role={access.role} />
  }

  return <LoadingScreen message={`No se pudo resolver el acceso: ${access.message}`} />
}
