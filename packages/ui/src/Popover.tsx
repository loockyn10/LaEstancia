import { type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PopoverProps = {
  /** Elemento que dispara el popover; se usa para posicionarlo y para ignorar sus clics. */
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** El panel toma exactamente el ancho del anchor (selects). */
  matchWidth?: boolean;
  align?: "start" | "end";
  id?: string;
  role?: string;
  "aria-label"?: string;
};

const GAP = 4;
const MARGIN = 8;

/**
 * Panel flotante renderizado en <body> con posición fija: no lo recortan los contenedores con overflow
 * (tablas, modales) y siempre queda por encima. Se invierte hacia arriba si no hay espacio debajo.
 */
export function Popover({ anchor, open, onClose, children, className, matchWidth, align = "start", id, role, "aria-label": ariaLabel }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, opacity: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = anchor.current;
      const element = panel.current;
      if (!trigger || !element) return;
      const rect = trigger.getBoundingClientRect();
      const width = matchWidth ? rect.width : element.offsetWidth;
      const naturalHeight = element.scrollHeight;
      const below = window.innerHeight - rect.bottom - MARGIN - GAP;
      const above = rect.top - MARGIN - GAP;
      const openUp = naturalHeight > below && above > below;
      const left = Math.min(Math.max(MARGIN, align === "end" ? rect.right - width : rect.left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
      setStyle({
        position: "fixed",
        left,
        top: openUp ? undefined : rect.bottom + GAP,
        bottom: openUp ? window.innerHeight - rect.top + GAP : undefined,
        width: matchWidth ? rect.width : undefined,
        maxHeight: Math.max(160, openUp ? above : below),
        opacity: 1,
      });
    };
    place();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor, matchWidth, align]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, anchor, onClose]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    // Evita que un Dialog padre (el árbol de React atraviesa el portal) cierre también el modal.
    event.stopPropagation();
    onClose();
    anchor.current?.focus();
  }

  return createPortal(
    <div aria-label={ariaLabel} className={`ui-popover ${className ?? ""}`.trim()} id={id} onKeyDown={onKeyDown} ref={panel} role={role} style={style}>
      {children}
    </div>,
    document.body,
  );
}
