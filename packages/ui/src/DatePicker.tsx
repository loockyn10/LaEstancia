import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Popover } from "./Popover";
import { isWithin, monthGrid, normalizeTime, parseIsoDate, shiftIsoDate, shiftIsoMonth } from "./calendar-model";

const weekdays = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const monthFormat = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const displayFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const longFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "full" });

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

type DateFieldProps = {
  /** "YYYY-MM-DD" o "" cuando no hay fecha. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Permite borrar la fecha (campos opcionales). */
  clearable?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
};

/** Selector de fecha con calendario propio: se ve igual en todos los navegadores. */
export function DateField({ value, onChange, min, max, disabled, clearable, required, placeholder = "dd/mm/aaaa", id, "aria-label": ariaLabel }: DateFieldProps) {
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(value || localToday());
  const parsed = parseIsoDate(value);
  const cursor = parseIsoDate(focused) ?? parseIsoDate(localToday())!;
  const grid = monthGrid(cursor.year, cursor.monthIndex);
  const today = localToday();

  useEffect(() => {
    if (open) document.getElementById(`${uid}-${focused}`)?.focus({ preventScroll: true });
  }, [open, focused, uid]);

  function openCalendar() {
    if (disabled) return;
    setFocused(value || (isWithin(today, min, max) ? today : (min ?? max ?? today)));
    setOpen(true);
  }

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function pick(date: string) {
    if (!isWithin(date, min, max)) return;
    onChange(date);
    close();
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftIsoDate(focused, -1),
      ArrowRight: () => shiftIsoDate(focused, 1),
      ArrowUp: () => shiftIsoDate(focused, -7),
      ArrowDown: () => shiftIsoDate(focused, 7),
      PageUp: () => shiftIsoMonth(focused, -1),
      PageDown: () => shiftIsoMonth(focused, 1),
      Home: () => shiftIsoDate(focused, -((new Date(`${focused}T12:00:00`).getDay() + 6) % 7)),
      End: () => shiftIsoDate(focused, 6 - ((new Date(`${focused}T12:00:00`).getDay() + 6) % 7)),
    };
    if (moves[event.key]) {
      event.preventDefault();
      setFocused(moves[event.key]());
    } else if (event.key === "Tab") close(false);
  }

  return (
    <div className="ui-select ui-date">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={`ui-select-trigger ${parsed ? "" : "is-placeholder"}`.trim()}
        disabled={disabled}
        id={id}
        onClick={() => (open ? close() : openCalendar())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openCalendar();
          }
        }}
        ref={trigger}
        type="button"
      >
        <span className="ui-select-value">{parsed ? displayFormat.format(new Date(parsed.year, parsed.monthIndex, parsed.day)) : placeholder}</span>
        <svg aria-hidden="true" className="ui-select-chevron" viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 8.5h13M7 3v3M13 3v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>
      </button>
      {required && <input aria-hidden="true" className="ui-select-required" onChange={() => undefined} required tabIndex={-1} value={value} />}
      <Popover anchor={trigger} aria-label="Elegir fecha" className="ui-calendar" onClose={() => close(false)} open={open} role="dialog">
        <div className="ui-calendar-head">
          <button aria-label="Mes anterior" onClick={() => setFocused(shiftIsoMonth(focused, -1))} type="button">‹</button>
          <strong aria-live="polite">{monthFormat.format(new Date(cursor.year, cursor.monthIndex, 1))}</strong>
          <button aria-label="Mes siguiente" onClick={() => setFocused(shiftIsoMonth(focused, 1))} type="button">›</button>
        </div>
        <div aria-label="Días del mes" className="ui-calendar-grid" onKeyDown={onGridKeyDown} role="group">
          {weekdays.map((day) => <span aria-hidden="true" className="ui-calendar-weekday" key={day}>{day}</span>)}
          {grid.map(({ date, inMonth }) => {
            const allowed = isWithin(date, min, max);
            return (
              <button
                aria-label={longFormat.format(new Date(`${date}T12:00:00`))}
                aria-pressed={date === value}
                className={`ui-calendar-day ${inMonth ? "" : "is-outside"} ${date === value ? "is-selected" : ""} ${date === today ? "is-today" : ""}`.trim()}
                disabled={!allowed}
                id={`${uid}-${date}`}
                key={date}
                onClick={() => pick(date)}
                tabIndex={date === focused ? 0 : -1}
                type="button"
              >
                {Number(date.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="ui-calendar-foot">
          {clearable && value && <button onClick={() => { onChange(""); close(); }} type="button">Borrar</button>}
          <button disabled={!isWithin(today, min, max)} onClick={() => pick(today)} type="button">Hoy</button>
        </div>
      </Popover>
    </div>
  );
}

type TimeFieldProps = { value: string; onChange: (value: string) => void; disabled?: boolean; "aria-label"?: string };

/** Hora "HH:mm" como texto con máscara: evita el control nativo, que cambia según el sistema. */
export function TimeField({ value, onChange, disabled, "aria-label": ariaLabel = "Hora" }: TimeFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  function commit() {
    const normalized = normalizeTime(text);
    if (normalized) onChange(normalized);
    else setText(value);
  }

  return (
    <input
      aria-label={ariaLabel}
      className="ui-time"
      disabled={disabled}
      inputMode="numeric"
      maxLength={5}
      onBlur={commit}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
      placeholder="hh:mm"
      value={text}
    />
  );
}

type DateTimeFieldProps = {
  /** "YYYY-MM-DDTHH:mm" (hora local) o "". */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
  clearable?: boolean;
  required?: boolean;
  "aria-label"?: string;
};

export function DateTimeField({ value, onChange, min, disabled, clearable, required, "aria-label": ariaLabel }: DateTimeFieldProps) {
  const [date, time = "00:00"] = value ? value.split("T") : ["", ""];
  return (
    <div className="ui-datetime">
      <DateField aria-label={ariaLabel ? `${ariaLabel} (fecha)` : undefined} clearable={clearable} disabled={disabled} min={min?.slice(0, 10)} onChange={(next) => onChange(next ? `${next}T${time || "00:00"}` : "")} required={required} value={date} />
      <TimeField aria-label={ariaLabel ? `${ariaLabel} (hora)` : "Hora"} disabled={disabled || !date} onChange={(next) => onChange(`${date}T${next}`)} value={time} />
    </div>
  );
}
