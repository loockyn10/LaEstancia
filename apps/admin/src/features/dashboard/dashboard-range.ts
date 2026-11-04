import { addCalendarDays, todayCalendarDate } from "@pet-shop/domain";

export type RangePreset = "today" | "yesterday" | "last7" | "month" | "custom";

export const rangePresetOptions: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "custom", label: "Rango personalizado" },
];

/** Rango con fin exclusivo (así lo interpreta PostgreSQL en America/Argentina/Buenos_Aires). */
export type DateRange = { start: string; end: string };

function nextMonthStart(date: string): string {
  const next = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  next.setMonth(next.getMonth() + 1);
  return todayCalendarDate(next);
}

export function periodFor(preset: Exclude<RangePreset, "custom">, now = new Date()): DateRange {
  const today = todayCalendarDate(now);
  if (preset === "today") return { start: today, end: addCalendarDays(today, 1) };
  if (preset === "yesterday") return { start: addCalendarDays(today, -1), end: today };
  if (preset === "last7") return { start: addCalendarDays(today, -6), end: addCalendarDays(today, 1) };
  return { start: `${today.slice(0, 7)}-01`, end: nextMonthStart(today) };
}

/** Convierte el rango elegido en pantalla (hasta inclusive) al rango del backend (fin exclusivo). */
export function toBackendRange(startDate: string, endDate: string): DateRange {
  return { start: startDate, end: addCalendarDays(endDate, 1) };
}
