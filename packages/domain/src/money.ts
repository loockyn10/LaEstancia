/** Montos en centavos enteros (ARS). Un valor ausente significa "sin definir". */

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const wholePesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatPesos(amountCents: number | null | undefined, empty = "Sin definir"): string {
  if (amountCents === null || amountCents === undefined) return empty;
  return (amountCents % 100 === 0 ? wholePesos : pesos).format(amountCents / 100);
}

/** Acepta "1.250,50", "1250,5", "1250.50" o "$ 1.250". Devuelve centavos o null si es inválido. */
export function parsePesos(value: string): number | null {
  const raw = value.replace(/[\s$]/g, "");
  if (!raw) return null;
  const argentine = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  const decimalDot = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  const match = argentine ?? decimalDot;
  if (!match) return null;
  const [, integer, decimals = ""] = match;
  const cents = Number(integer.split(".").join("")) * 100 + Number(`${decimals}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Valor editable para un input: "1250" o "1250,50". */
export function pesosInput(amountCents: number | null | undefined): string {
  if (amountCents === null || amountCents === undefined) return "";
  const whole = Math.floor(amountCents / 100);
  const decimals = amountCents % 100;
  return decimals ? `${whole},${decimals.toString().padStart(2, "0")}` : `${whole}`;
}

/** Subtotal de una línea redondeado al centavo más cercano (mismo criterio que confirm_sale). */
export function lineTotalCents(quantity: number | null | undefined, unitCents: number | null | undefined): number {
  return Math.round((quantity ?? 0) * (unitCents ?? 0));
}
