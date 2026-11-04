import { describe, expect, it } from "vitest";
import { barcodeMatchPatch, barcodeVariant, createProductUpdates, findBarcodeConflicts, includeUpdates, matchingSelectionPatch, type MatchingItemState } from "./supplier-price-list-matching";

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
    expect(matchingSelectionPatch("variant-2")).toEqual({ product_variant_id: "variant-2", create_catalog_product: false, match_status: "matched", match_reason: "manual" });
  });

  it("incluye o excluye todos sin tocar matching ni creación", () => {
    expect(includeUpdates(items, true)).toEqual(items.map((item) => ({ id: item.id, patch: { apply_to_catalog: true } })));
    expect(includeUpdates(items, false)).toEqual(items.map((item) => ({ id: item.id, patch: { apply_to_catalog: false } })));
  });
});

describe("matching y conflictos de barcode", () => {
  const variants = [
    { id: "business-a-variant", label: "CAT TOY 12X20 CMS", barcodes: ["7798296853594"] },
    { id: "business-b-variant", label: "Otro negocio", barcodes: ["0000000000000"] },
  ];

  it("relaciona un EAN existente y desmarca crear producto nuevo", () => {
    expect(barcodeVariant("7798296853594", variants)?.id).toBe("business-a-variant");
    expect(barcodeMatchPatch("business-a-variant")).toEqual({ product_variant_id: "business-a-variant", create_catalog_product: false, match_status: "matched", match_reason: "barcode" });
  });

  it("permite barcode nuevo y no confunde barcodes de otro business", () => {
    expect(barcodeVariant("1234567890123", variants)).toBeNull();
    expect(barcodeVariant("0000000000000", [variants[0]])).toBeNull();
  });

  it("acepta opciones repetidas del mismo producto y bloquea nombres distintos para el mismo barcode", () => {
    const sameProduct = [
      { id: "a", barcode: "779", detected_name: "Churrasquito 75g", detected_presentation: "Caja", product_variant_id: "variant-1", create_catalog_product: false, apply_to_catalog: true },
      { id: "b", barcode: "779", detected_name: "Churrasquito 75g", detected_presentation: "Caja", product_variant_id: "variant-1", create_catalog_product: false, apply_to_catalog: true },
    ];
    expect(findBarcodeConflicts(sameProduct)).toEqual([]);
    expect(findBarcodeConflicts([{ ...sameProduct[0], product_variant_id: null }, { ...sameProduct[1], id: "c", product_variant_id: null, detected_name: "Producto distinto" }])[0]?.barcode).toBe("779");
  });
});
