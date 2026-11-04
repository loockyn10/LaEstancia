import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "link" | "link-danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "secondary",
  danger: "secondary danger",
  link: "link-button",
  "link-danger": "link-button danger",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Botón compacto para barras de herramientas y acciones de fila. */
  compact?: boolean;
  /** Deshabilita el botón y muestra un indicador mientras se ejecuta una acción. */
  loading?: boolean;
};

export function Button({ variant = "primary", compact, loading, className, disabled, children, type = "button", ...rest }: ButtonProps) {
  const classes = [variantClass[variant], compact ? "compact" : "", loading ? "is-loading" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button {...rest} aria-busy={loading || undefined} className={classes || undefined} disabled={disabled || loading} type={type}>
      {loading && <span aria-hidden="true" className="ui-spinner ui-spinner-inline" />}
      {children}
    </button>
  );
}
