import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Popover } from "./Popover";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** Menú "Acciones" de una fila: agrupa las acciones secundarias en un solo control. */
export function ActionMenu({ items, label = "Acciones" }: { items: readonly ActionMenuItem[]; label?: string }) {
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function run(item: ActionMenuItem) {
    if (item.disabled) return;
    close();
    item.onSelect();
  }

  function move(step: 1 | -1) {
    const position = enabled.indexOf(active);
    setActive(enabled[(position + step + enabled.length) % enabled.length]);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(enabled[0] ?? 0);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActive(enabled[0] ?? 0); }
    else if (event.key === "End") { event.preventDefault(); setActive(enabled[enabled.length - 1] ?? 0); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(items[active]); }
    else if (event.key === "Tab") close(false);
  }

  return (
    <div className="ui-menu">
      <button
        aria-controls={open ? `${uid}-menu` : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="ui-menu-trigger"
        onClick={() => {
          setActive(enabled[0] ?? 0);
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
        ref={trigger}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="4.5" cy="10" r="1.6" fill="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /><circle cx="15.5" cy="10" r="1.6" fill="currentColor" /></svg>
      </button>
      <Popover align="end" anchor={trigger} className="ui-menu-panel" id={`${uid}-menu`} onClose={() => close(false)} open={open} role="menu">
        {items.map((item, index) => (
          <button
            aria-disabled={item.disabled || undefined}
            className={`ui-menu-item ${item.danger ? "is-danger" : ""} ${index === active ? "is-active" : ""}`.trim()}
            disabled={item.disabled}
            key={item.label}
            onClick={() => run(item)}
            onKeyDown={onKeyDown}
            onMouseMove={() => !item.disabled && setActive(index)}
            role="menuitem"
            tabIndex={-1}
            type="button"
            ref={(element) => { if (element && index === active && open) element.focus({ preventScroll: true }); }}
          >
            {item.label}
          </button>
        ))}
      </Popover>
    </div>
  );
}
