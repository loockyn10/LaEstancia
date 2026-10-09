export type MatchingItemState = {
  id: string;
  product_variant_id: string | null;
  create_catalog_product: boolean;
  apply_to_catalog: boolean;
};

export function matchingSelectionPatch(productVariantId: string | null) {
  return {
    product_variant_id: productVariantId,
    create_catalog_product: false,
    match_status: productVariantId ? "matched" : "unmatched",
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
