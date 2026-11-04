/** Lógica pura del selector de fechas. Las fechas son "YYYY-MM-DD" (calendario local, sin zona horaria). */

const pad = (value: number) => String(value).padStart(2, "0");

export const toIsoDate = (year: number, monthIndex: number, day: number) => {
  const date = new Date(year, monthIndex, day, 12);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function parseIsoDate(value: string): { year: number; monthIndex: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(year, month - 1, day, 12);
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day
    ? { year, monthIndex: month - 1, day }
    : null;
}

export function shiftIsoDate(value: string, days: number): string {
  const parsed = parseIsoDate(value);
  return parsed ? toIsoDate(parsed.year, parsed.monthIndex, parsed.day + days) : value;
}

export function shiftIsoMonth(value: string, months: number): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return value;
  const target = new Date(parsed.year, parsed.monthIndex + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  return toIsoDate(target.getFullYear(), target.getMonth(), Math.min(parsed.day, lastDay));
}

/** Seis semanas (42 días) comenzando en lunes, que cubren el mes indicado. */
export function monthGrid(year: number, monthIndex: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, 1 - mondayOffset + index, 12);
    return { date: toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()), inMonth: date.getMonth() === monthIndex };
  });
}

export function isWithin(value: string, min?: string, max?: string): boolean {
  return (!min || value >= min) && (!max || value <= max);
}

/** Normaliza lo que se escribe en un campo de hora: "930" → "09:30", "9:5" se rechaza. */
export function normalizeTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (raw.includes(":")) {
    const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const [hours, minutes] = [Number(match[1]), Number(match[2])];
    return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
  }
  if (digits.length < 3 || digits.length > 4) return null;
  const hours = Number(digits.slice(0, digits.length - 2));
  const minutes = Number(digits.slice(-2));
  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
}
