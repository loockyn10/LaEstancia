import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover } from "./Popover";
import {
  type SelectOption,
  filterOptions,
  firstEnabledIndex,
  initialActiveIndex,
  lastEnabledIndex,
  nextEnabledIndex,
  typeAheadIndex,
} from "./select-model";

export type { SelectOption } from "./select-model";

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  /** Agrega un campo de búsqueda (combobox). Por defecto se activa con más de 8 opciones. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Marca el campo como obligatorio para la validación nativa del formulario. */
  required?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

const SEARCH_THRESHOLD = 8;

/** Desplaza sólo el panel del Select (nunca el documento) para mostrar la opción activa. */
function keepVisible(option: HTMLElement | null) {
  const panel = option?.closest<HTMLElement>(".ui-popover");
  if (!option || !panel) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < panel.scrollTop) panel.scrollTop = Math.max(0, top - 4);
  else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight + 4;
}

/**
 * Select accesible y consistente entre navegadores y sistemas operativos: reemplaza al <select> nativo.
 * Teclado: flechas, Home/End, Enter/Espacio, Escape, type-ahead (o búsqueda cuando hay muchas opciones).
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  searchable,
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  required,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const typeAhead = useRef({ text: "", timer: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const hasSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const visible = useMemo(() => (hasSearch ? filterOptions(options, query) : [...options]), [hasSearch, options, query]);
  const selected = options.find((option) => option.value === value);
  const optionId = (index: number) => `${uid}-option-${index}`;

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) trigger.current?.focus();
  }, []);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(initialActiveIndex(options, value));
    setOpen(true);
  }

  function choose(option: SelectOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  }

  useEffect(() => {
    if (open && hasSearch) searchInput.current?.focus();
  }, [open, hasSearch]);

  useEffect(() => {
    if (open && active >= 0) keepVisible(document.getElementById(optionId(active)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function onKeyDown(event: KeyboardEvent) {
    const { key } = event;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current < 0 ? firstEnabledIndex(visible) : nextEnabledIndex(visible, current, 1)));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current < 0 ? lastEnabledIndex(visible) : nextEnabledIndex(visible, current, -1)));
    } else if (key === "Home") {
      event.preventDefault();
      setActive(firstEnabledIndex(visible));
    } else if (key === "End") {
      event.preventDefault();
      setActive(lastEnabledIndex(visible));
    } else if (key === "Enter" || (key === " " && !hasSearch)) {
      event.preventDefault();
      choose(visible[active]);
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (key === "Tab") {
      close(false);
    } else if (!hasSearch && key.length === 1 && !event.ctrlKey && !event.metaKey) {
      window.clearTimeout(typeAhead.current.timer);
      typeAhead.current.text += key;
      typeAhead.current.timer = window.setTimeout(() => { typeAhead.current.text = ""; }, 600);
      const index = typeAheadIndex(visible, typeAhead.current.text, Math.max(active, -1));
      if (index >= 0) setActive(index);
    }
  }

  const activeDescendant = open && active >= 0 && visible[active] ? optionId(active) : undefined;

  return (
    <div className={`ui-select ${className ?? ""}`.trim()}>
      <button
        aria-activedescendant={hasSearch ? undefined : activeDescendant}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        className={`ui-select-trigger ${selected ? "" : "is-placeholder"}`.trim()}
        disabled={disabled}
        id={id}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        ref={trigger}
        role="combobox"
        type="button"
      >
        <span className="ui-select-value">{selected?.label ?? placeholder}</span>
        <svg aria-hidden="true" className="ui-select-chevron" viewBox="0 0 20 20"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
      </button>
      {required && <input aria-hidden="true" className="ui-select-required" onChange={() => undefined} required tabIndex={-1} value={value} />}
      <Popover anchor={trigger} className="ui-select-panel" matchWidth onClose={() => close(false)} open={open}>
        {hasSearch && (
          <input
            aria-activedescendant={activeDescendant}
            aria-controls={listId}
            aria-label={searchPlaceholder}
            autoComplete="off"
            className="ui-select-search"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(firstEnabledIndex(filterOptions(options, event.target.value)));
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            ref={searchInput}
            role="searchbox"
            value={query}
          />
        )}
        <ul aria-label={ariaLabel} className="ui-select-list" id={listId} role="listbox">
          {visible.map((option, index) => (
            <li
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === value}
              className={`ui-select-option ${index === active ? "is-active" : ""} ${option.value === value ? "is-selected" : ""} ${option.disabled ? "is-disabled" : ""}`.trim()}
              id={optionId(index)}
              key={option.value}
              onClick={() => choose(option)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => !option.disabled && setActive(index)}
              role="option"
            >
              <span>
                {option.label}
                {option.hint && <small>{option.hint}</small>}
              </span>
              {option.value === value && (
                <svg aria-hidden="true" className="ui-select-check" viewBox="0 0 20 20"><path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
              )}
            </li>
          ))}
          {!visible.length && <li aria-live="polite" className="ui-select-empty" role="presentation">{emptyText}</li>}
        </ul>
      </Popover>
    </div>
  );
}
