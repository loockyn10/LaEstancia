export type MatchingItemState = {
  id: string;
  product_variant_id: string | null;
  create_catalog_product: boolean;
  apply_to_catalog: boolean;
};

export type BarcodeMatchingItem = MatchingItemState & {
  barcode: string | null;
  detected_name: string;
  detected_presentation: string | null;
};

export type CatalogueVariant = { id: string; label: string; barcodes: string[] };

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");

export function barcodeVariant(barcode: string | null, variants: CatalogueVariant[]) {
  if (!barcode) return null;
  const needle = normalized(barcode);
  return variants.find((variant) => variant.barcodes.some((code) => normalized(code) === needle)) ?? null;
}

export function barcodeMatchPatch(variantId: string) {
  return { product_variant_id: variantId, create_catalog_product: false, match_status: "matched", match_reason: "barcode" } as const;
}

export function findBarcodeConflicts(items: BarcodeMatchingItem[]) {
  const groups = new Map<string, BarcodeMatchingItem[]>();
  for (const item of items) {
    if (!item.apply_to_catalog || !item.barcode?.trim()) continue;
    const barcode = normalized(item.barcode);
    groups.set(barcode, [...(groups.get(barcode) ?? []), item]);
  }
  return [...groups.entries()].flatMap(([barcode, group]) => {
    if (group.length < 2) return [];
    const identities = new Set(group.map((item) => item.product_variant_id ?? `${normalized(item.detected_name)}|${normalized(item.detected_presentation ?? "")}`));
    return identities.size > 1 ? [{ barcode, items: group }] : [];
  });
}

export function matchingSelectionPatch(productVariantId: string | null) {
  return {
    product_variant_id: productVariantId,
    create_catalog_product: false,
    match_status: productVariantId ? "matched" : "unmatched",
    match_reason: productVariantId ? "manual" : null,
  };
}

export function createProductUpdates(items: MatchingItemState[]) {
  const eligible = items.filter((item) => !item.product_variant_id);
  const unmark = eligible.length > 0 && eligible.every((item) => item.create_catalog_product);
  return eligible.map((item) => ({
    id: item.id,
    patch: {
      create_catalog_product: !unmark,
      match_status: unmark ? "unmatched" : "review_required",
    },
  }));
}

export function includeUpdates(items: MatchingItemState[], include: boolean) {
  return items.map((item) => ({ id: item.id, patch: { apply_to_catalog: include } }));
}
