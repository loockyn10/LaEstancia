/** Cantidades con hasta tres decimales (numeric(18,3) en PostgreSQL). */

export const QUANTITY_SCALE = 1000n;

/** Cantidad escalada ×1000 (admite cero). Devuelve null si el texto es inválido. */
export function parseScaledQuantity(value: string): bigint | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
}

export function scaledFromNumber(value: number): bigint {
  const raw = String(value);
  const negative = raw.startsWith("-");
  const parsed = parseScaledQuantity(negative ? raw.slice(1) : raw);
  return parsed === null ? 0n : negative ? -parsed : parsed;
}

export function formatQuantity(quantity: bigint | number | null | undefined): string {
  if (quantity === null || quantity === undefined) return "—";
  const scaled = typeof quantity === "bigint" ? quantity : scaledFromNumber(quantity);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / QUANTITY_SCALE;
  const fraction = (absolute % QUANTITY_SCALE).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("es-AR")}${fraction ? `,${fraction}` : ""}`;
}

/** Valor editable para un input (sin separador de miles). */
export function quantityInput(quantity: number | null | undefined): string {
  return quantity === null || quantity === undefined ? "" : formatQuantity(quantity).replace(/\./g, "");
}

/** Cantidad vendible/comprable: estrictamente positiva, hasta tres decimales. */
export function parsePositiveQuantity(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d{1,3})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}
