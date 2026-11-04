const dateTimeFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat("es-AR");

export function formatDateTime(value: string | null | undefined, empty = "—"): string {
  return value ? dateTimeFormat.format(new Date(value)) : empty;
}

/** Fecha calendario "YYYY-MM-DD" (sin hora) mostrada sin desfasajes de zona horaria. */
export function formatCalendarDate(value: string): string {
  return dateFormat.format(new Date(`${value}T12:00:00`));
}

export function formatDateRange(startsAt: string, endsAt: string | null): string {
  return `${dateTimeFormat.format(new Date(startsAt))}${endsAt ? ` a ${dateTimeFormat.format(new Date(endsAt))}` : " en adelante"}`;
}

/** "YYYY-MM-DD" según el calendario local del navegador. */
export function toCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayCalendarDate(now = new Date()): string {
  return toCalendarDate(now);
}

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toCalendarDate(date);
}

/** ISO UTC → "YYYY-MM-DDTHH:mm" en hora local, para campos fecha/hora. */
export function localDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
