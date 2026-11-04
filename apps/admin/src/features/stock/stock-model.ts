import { scaledFromNumber } from "@pet-shop/domain";
import type { CatalogVariant } from "../catalog/types";

export type InventoryMovementType = "initial" | "inbound" | "outbound" | "adjustment" | "purchase" | "sale";
export type MovementInput = "inbound" | "outbound" | "adjustment";
export type StockStatus = "ok" | "low" | "out";

export type Balance = { quantity: number; minimumQuantity: number | null };

export type InventoryRow = {
  branchId: string;
  branchName: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string;
  quantity: number;
  minimumQuantity: number | null;
};

export const balanceKey = (branchId: string, variantId: string) => `${branchId}:${variantId}`;

/** Cero = sin stock; positivo menor o igual al mínimo = bajo; sin mínimo no hay alerta de bajo stock. */
export function stockStatus(row: Pick<InventoryRow, "quantity" | "minimumQuantity">): StockStatus {
  const quantity = scaledFromNumber(row.quantity);
  if (quantity === 0n) return "out";
  if (row.minimumQuantity !== null && quantity <= scaledFromNumber(row.minimumQuantity)) return "low";
  return "ok";
}

export const stockStatusLabel: Record<StockStatus, string> = { ok: "OK", low: "Bajo", out: "Sin stock" };

/** Una fila por combinación sucursal × presentación; sin balance equivale a cantidad cero. */
export function buildInventoryRows(
  branches: readonly { id: string; name: string }[],
  variants: readonly CatalogVariant[],
  balances: Record<string, Balance>,
): InventoryRow[] {
  return branches.flatMap((branch) =>
    variants.map((variant) => {
      const balance = balances[balanceKey(branch.id, variant.id)];
      return {
        branchId: branch.id,
        branchName: branch.name,
        variantId: variant.id,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        barcode: variant.primaryBarcode ?? variant.barcodes[0] ?? "",
        quantity: balance?.quantity ?? 0,
        minimumQuantity: balance?.minimumQuantity ?? null,
      };
    }),
  );
}

export function filterInventoryRows(rows: readonly InventoryRow[], query: string, status: string): InventoryRow[] {
  const search = query.trim().toLocaleLowerCase("es-AR");
  return rows.filter(
    (row) =>
      (status === "all" || stockStatus(row) === status) &&
      (!search || [row.productName, row.variantName, row.sku, row.barcode].some((value) => value.toLocaleLowerCase("es-AR").includes(search))),
  );
}

/** Vista previa del movimiento: un ajuste expresa la cantidad física final; el delta lo deriva PostgreSQL. */
export function previewMovement(currentQuantity: number, type: MovementInput, quantity: bigint) {
  const current = scaledFromNumber(currentQuantity);
  const next = type === "adjustment" ? quantity : type === "outbound" ? current - quantity : current + quantity;
  return { current, delta: next - current, next };
}

export function movementLabel(type: InventoryMovementType): string {
  return type === "inbound" || type === "initial" || type === "purchase" ? "Entrada" : type === "outbound" ? "Salida" : "Ajuste";
}
