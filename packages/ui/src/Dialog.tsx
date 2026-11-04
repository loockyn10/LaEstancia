import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

type DialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Mientras hay una operación en curso no se puede cerrar el diálogo. */
  busy?: boolean;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal accesible: foco atrapado, Escape, bloqueo de scroll y retorno del foco al elemento que lo abrió. */
export function Dialog({ open, title, description, onClose, children, size = "md", busy }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  // El opener se captura en el render: el autoFocus de React mueve el foco antes de que corran los efectos.
  const opener = useRef<HTMLElement | null>(null);
  if (open && opener.current === null) opener.current = document.activeElement as HTMLElement | null;

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      // Respeta el autoFocus de React: si un campo del diálogo ya tiene el foco, no se lo quitamos.
      const active = document.activeElement;
      if (active && active !== panel.current && panel.current?.contains(active)) return;
      const target = panel.current?.querySelector<HTMLElement>("[autofocus], input, textarea, .ui-select-trigger");
      (target ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      const previous = opener.current;
      opener.current = null;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !busy) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="presentation"
    >
      <section aria-labelledby={titleId} aria-modal="true" className={`modal modal-${size}`} onKeyDown={onKeyDown} ref={panel} role="dialog" tabIndex={-1}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <Button compact disabled={busy} onClick={onClose} variant="secondary">Cerrar</Button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

/**
 * Reemplazo de window.confirm: `const { ask, dialog } = useConfirm()`, renderizar `{dialog}` y usar
 * `if (!(await ask({ ... }))) return;`.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const ask = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  function settle(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  const dialog = (
    <Dialog onClose={() => settle(false)} open={state !== null} size="sm" title={state?.title ?? ""}>
      <div className="modal-body">{state?.message}</div>
      <div className="form-actions modal-footer">
        <Button onClick={() => settle(true)} variant={state?.tone === "danger" ? "danger" : "primary"}>{state?.confirmLabel ?? "Confirmar"}</Button>
        <Button onClick={() => settle(false)} variant="secondary">{state?.cancelLabel ?? "Cancelar"}</Button>
      </div>
    </Dialog>
  );

  return { ask, dialog };
}
