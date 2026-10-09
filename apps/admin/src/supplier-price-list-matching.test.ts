import { describe, expect, it } from "vitest";
import { createProductUpdates, includeUpdates, matchingSelectionPatch, type MatchingItemState } from "./supplier-price-list-matching";

const items: MatchingItemState[] = [
  { id: "unmatched", product_variant_id: null, create_catalog_product: false, apply_to_catalog: false },
  { id: "matched", product_variant_id: "variant-1", create_catalog_product: false, apply_to_catalog: false },
  { id: "new", product_variant_id: null, create_catalog_product: true, apply_to_catalog: false },
];

describe("acciones masivas de matching", () => {
  it("marca como nuevos sólo los productos sin relacionar y no toca los relacionados", () => {
    expect(createProductUpdates(items)).toEqual([
      { id: "unmatched", patch: { create_catalog_product: true, match_status: "review_required" } },
      { id: "new", patch: { create_catalog_product: true, match_status: "review_required" } },
    ]);
  });

  it("desmarca los productos nuevos cuando todos los elegibles ya están marcados", () => {
    expect(createProductUpdates(items.map((item) => item.id === "unmatched" ? { ...item, create_catalog_product: true } : item))).toEqual([
      { id: "unmatched", patch: { create_catalog_product: false, match_status: "unmatched" } },
      { id: "new", patch: { create_catalog_product: false, match_status: "unmatched" } },
    ]);
  });

  it("al relacionar manualmente desactiva crear producto nuevo", () => {
    expect(matchingSelectionPatch("variant-2")).toEqual({ product_variant_id: "variant-2", create_catalog_product: false, match_status: "matched" });
  });

  it("incluye o excluye todos sin tocar matching ni creación", () => {
    expect(includeUpdates(items, true)).toEqual(items.map((item) => ({ id: item.id, patch: { apply_to_catalog: true } })));
    expect(includeUpdates(items, false)).toEqual(items.map((item) => ({ id: item.id, patch: { apply_to_catalog: false } })));
  });
});
