import { lineTotalCents, parsePositiveQuantity } from "@pet-shop/domain";
import type { PosOption } from "../local-db/types";

/** Línea del carrito: una presentación con la cantidad tal como se está tipeando. */
export type CartLine = PosOption & { quantity: string };

export function addLine(cart: readonly CartLine[], option: PosOption): { cart: CartLine[]; error?: string } {
  if (cart.some((line) => line.id === option.id)) return { cart: [...cart], error: "Ese producto ya está en el carrito." };
  return { cart: [...cart, { ...option, quantity: "1" }] };
}

export const changeQuantity = (cart: readonly CartLine[], id: string, quantity: string): CartLine[] =>
  cart.map((line) => (line.id === id ? { ...line, quantity } : line));

export const removeLine = (cart: readonly CartLine[], id: string): CartLine[] => cart.filter((line) => line.id !== id);

export const lineTotal = (line: CartLine) => lineTotalCents(parsePositiveQuantity(line.quantity), line.price);

export const cartTotal = (cart: readonly CartLine[]) => cart.reduce((sum, line) => sum + lineTotal(line), 0);

/**
 * Ítems para `confirm_sale`. No lleva precios: PostgreSQL resuelve el precio efectivo vigente.
 * Devuelve null si alguna cantidad es inválida (hasta tres decimales, mayor a cero).
 */
export function toSaleItems(cart: readonly CartLine[]): { variant_id: string; quantity: number }[] | null {
  const items = cart.map((line) => ({ variant_id: line.id, quantity: parsePositiveQuantity(line.quantity) }));
  return items.every((item): item is { variant_id: string; quantity: number } => item.quantity !== null) ? items : null;
}
