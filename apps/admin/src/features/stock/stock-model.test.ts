import { describe, expect, it } from "vitest";
import type { CatalogVariant } from "../catalog/types";
import { balanceKey, buildInventoryRows, filterInventoryRows, previewMovement, stockStatus } from "./stock-model";

describe("stock status", () => {
  it("zero is out of stock, at or below the minimum is low, no minimum never alerts", () => {
    expect(stockStatus({ quantity: 0, minimumQuantity: 5 })).toBe("out");
    expect(stockStatus({ quantity: 5, minimumQuantity: 5 })).toBe("low");
    expect(stockStatus({ quantity: 5.001, minimumQuantity: 5 })).toBe("ok");
    expect(stockStatus({ quantity: 1, minimumQuantity: null })).toBe("ok");
    expect(stockStatus({ quantity: 0, minimumQuantity: null })).toBe("out");
  });
});

describe("movement preview", () => {
  it("adds inbound, subtracts outbound and treats an adjustment as the final physical quantity", () => {
    expect(previewMovement(10, "inbound", 2_500n)).toEqual({ current: 10_000n, delta: 2_500n, next: 12_500n });
    expect(previewMovement(10, "outbound", 4_000n)).toEqual({ current: 10_000n, delta: -4_000n, next: 6_000n });
    expect(previewMovement(10, "adjustment", 5_000n)).toEqual({ current: 10_000n, delta: -5_000n, next: 5_000n });
  });

  it("detects a negative result without floating point drift", () => {
    expect(previewMovement(0.3, "outbound", 301n).next).toBe(-1n);
  });
});

describe("inventory rows", () => {
  const variants = [
    { id: "v1", productName: "Alimento", variantName: "15 kg", sku: "PREM", primaryBarcode: "7790", barcodes: ["7790"] },
    { id: "v2", productName: "Collar", variantName: "Chico", sku: "", primaryBarcode: null, barcodes: ["7791"] },
  ] as CatalogVariant[];
  const branches = [{ id: "b1", name: "Central" }];

  it("creates one row per branch and presentation, defaulting missing balances to zero", () => {
    const rows = buildInventoryRows(branches, variants, { [balanceKey("b1", "v1")]: { quantity: 3, minimumQuantity: 5 } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ quantity: 3, minimumQuantity: 5, barcode: "7790" });
    expect(rows[1]).toMatchObject({ quantity: 0, minimumQuantity: null, barcode: "7791" });
  });

  it("filters by text and by status", () => {
    const rows = buildInventoryRows(branches, variants, { [balanceKey("b1", "v1")]: { quantity: 3, minimumQuantity: 5 } });
    expect(filterInventoryRows(rows, "collar", "all")).toHaveLength(1);
    expect(filterInventoryRows(rows, "", "low").map((row) => row.variantId)).toEqual(["v1"]);
    expect(filterInventoryRows(rows, "", "out").map((row) => row.variantId)).toEqual(["v2"]);
    expect(filterInventoryRows(rows, "7791", "all").map((row) => row.variantId)).toEqual(["v2"]);
  });
});
