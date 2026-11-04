import { describe, expect, it } from "vitest";
import { findOptionByBarcode, searchOptions } from "./search";
import type { PosOption } from "./types";

const options: PosOption[] = [
  { id: "1", productName: "Alimento Pérro Adulto", variantName: "Bolsa 15 kg", sku: "PER-15", barcodes: ["7790001"], price: 100, offer: false, stock: 3 },
  { id: "2", productName: "Collar", variantName: "Chico", sku: "", barcodes: ["7790002", "7790003"], price: 50, offer: true, stock: 0 },
  ...Array.from({ length: 20 }, (_, index): PosOption => ({ id: `x${index}`, productName: `Juguete ${index}`, variantName: "Único", sku: "", barcodes: [], price: 10, offer: false, stock: 1 })),
];

describe("POS local search", () => {
  it("ignores case and accents across name, SKU and barcode", () => {
    expect(searchOptions(options, "perro").map((option) => option.id)).toEqual(["1"]);
    expect(searchOptions(options, "per-15").map((option) => option.id)).toEqual(["1"]);
    expect(searchOptions(options, "7790003").map((option) => option.id)).toEqual(["2"]);
  });

  it("limits results, skips lines already in the cart and returns nothing for an empty query", () => {
    expect(searchOptions(options, "juguete")).toHaveLength(8);
    expect(searchOptions(options, "collar", new Set(["2"]))).toEqual([]);
    expect(searchOptions(options, "   ")).toEqual([]);
  });

  it("finds a scanned barcode exactly, never by prefix", () => {
    expect(findOptionByBarcode(options, " 7790002 ")?.id).toBe("2");
    expect(findOptionByBarcode(options, "77900")).toBeNull();
    expect(findOptionByBarcode(options, "")).toBeNull();
  });
});
