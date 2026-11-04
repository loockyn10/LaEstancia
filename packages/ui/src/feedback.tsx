import type { ReactNode } from "react";
import { Button } from "./Button";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge badge-${tone} ${className ?? ""}`.trim()}>{children}</span>;
}

export function ActiveBadge({ active, activeLabel = "Activo", inactiveLabel = "Inactivo" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? activeLabel : inactiveLabel}</Badge>;
}

/** Mensaje inline. Los errores usan role="alert" para que lectores de pantalla los anuncien. */
export function Notice({ tone = "info", children, className }: { tone?: Exclude<Tone, "neutral">; children: ReactNode; className?: string }) {
  return (
    <p className={`notice notice-${tone} ${className ?? ""}`.trim()} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Spinner({ label = "Cargando" }: { label?: string }) {
  return <span aria-label={label} className="ui-spinner" role="status" />;
}

export function LoadingState({ title = "Cargando…", text }: { title?: string; text?: string }) {
  return (
    <section aria-busy="true" aria-live="polite" className="state-box">
      <Spinner label={title} />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </section>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <section className="state-box">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </section>
  );
}

export function ErrorState({ title = "No pudimos cargar la información", text, onRetry }: { title?: string; text?: string; onRetry?: () => void }) {
  return (
    <section className="state-box state-box-error" role="alert">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {onRetry && <Button onClick={onRetry} variant="secondary">Reintentar</Button>}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={`page-header ${className ?? ""}`.trim()}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="subtle">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Superficie con título opcional: reemplaza las "sections" sueltas de cada pantalla. */
export function Card({ title, description, actions, children, className }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`.trim()}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Etiqueta + control. Un único contenedor garantiza espaciado y jerarquía iguales en todos los formularios. */
export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`field ${className ?? ""}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
