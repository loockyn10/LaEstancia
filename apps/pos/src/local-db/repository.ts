import { posDatabase, type PosDatabase } from "./database";
import { findOptionByBarcode, searchOptions } from "./search";
import type { LocalAccessContext, PosOption } from "./types";

export async function saveAccessContext(context: LocalAccessContext, db: PosDatabase = posDatabase) {
  await db.contexts.put(context);
}

export async function getCachedAccessContext(userId: string, db: PosDatabase = posDatabase) {
  const contexts = await db.contexts.where("userId").equals(userId).sortBy("updatedAt");
  return contexts[contexts.length - 1] ?? null;
}

export async function saveSelectedBranch(
  userId: string,
  businessId: string,
  branchId: string,
  db: PosDatabase = posDatabase,
) {
  const context = await db.contexts.get([userId, businessId]);
  if (context) await db.contexts.put({ ...context, selectedBranchId: branchId, updatedAt: new Date().toISOString() });
}

export async function getLocalOverview(businessId: string, db: PosDatabase = posDatabase) {
  const [branches, metadata] = await Promise.all([
    db.branches.where("businessId").equals(businessId).sortBy("name"),
    db.syncMetadata.get(businessId),
  ]);
  return { branches, lastSyncAt: metadata?.lastSyncAt ?? null, hasLocalData: Boolean(metadata) };
}

export async function listSellableOptions(
  businessId: string,
  branchId: string,
  db: PosDatabase = posDatabase,
): Promise<PosOption[]> {
  const [products, variants, barcodes, prices, offers, stocks] = await Promise.all([
    db.products.where("businessId").equals(businessId).toArray(),
    db.variants.where("businessId").equals(businessId).toArray(),
    db.barcodes.where("businessId").equals(businessId).toArray(),
    db.prices.where("businessId").equals(businessId).toArray(),
    db.offers.where("businessId").equals(businessId).toArray(),
    db.stocks.where("[businessId+branchId]").equals([businessId, branchId]).toArray(),
  ]);
  const productById = new Map(products.map((item) => [item.id, item]));
  const barcodeByVariant = new Map<string, string[]>();
  for (const barcode of barcodes) {
    const codes = barcodeByVariant.get(barcode.variantId);
    if (codes) codes.push(barcode.code);
    else barcodeByVariant.set(barcode.variantId, [barcode.code]);
  }
  const priceByVariant = new Map(prices.map((item) => [item.variantId, item]));
  const offerIds = new Set(offers.map((item) => item.id));
  const stockByVariant = new Map(stocks.map((item) => [item.variantId, item.quantity]));

  return variants.flatMap((variant) => {
    const product = productById.get(variant.productId);
    const price = priceByVariant.get(variant.id);
    if (!product || !price) return [];
    return [{
      id: variant.id,
      productName: product.name,
      variantName: variant.name,
      sku: variant.sku,
      barcodes: barcodeByVariant.get(variant.id) ?? [],
      price: price.effectivePriceCents,
      offer: price.offerId !== null && offerIds.has(price.offerId),
      stock: stockByVariant.get(variant.id) ?? 0,
    }];
  });
}

export async function searchLocalCatalog(
  businessId: string,
  branchId: string,
  query: string,
  excludedVariantIds: ReadonlySet<string> = new Set(),
  db: PosDatabase = posDatabase,
) {
  if (!query.trim()) return [];
  return searchOptions(await listSellableOptions(businessId, branchId, db), query, excludedVariantIds);
}

export async function findLocalBarcode(
  businessId: string,
  branchId: string,
  code: string,
  db: PosDatabase = posDatabase,
) {
  if (!code.trim()) return null;
  return findOptionByBarcode(await listSellableOptions(businessId, branchId, db), code);
}
