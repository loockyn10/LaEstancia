import type { Database } from "@pet-shop/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { posDatabase, type PosDatabase } from "../local-db/database";
import type { OperationalSnapshot } from "../local-db/types";

type RemoteBranch = { id: string; name: string; is_active: boolean };
type RemoteProduct = { id: string; name: string };
type RemoteVariant = { id: string; product_id: string; name: string; sku: string | null };
type RemoteBarcode = { variant_id: string; code: string };
type RemotePrice = {
  variant_id: string;
  base_price_cents: number | null;
  effective_price_cents: number | null;
  promotional_price_cents: number | null;
  offer_id: string | null;
};
type RemoteBalance = { branch_id: string; variant_id: string; quantity: number };

export type SnapshotDownloader = (businessId: string) => Promise<OperationalSnapshot>;

export function supabaseSnapshotDownloader(client: SupabaseClient<Database>): SnapshotDownloader {
  return async (businessId) => {
    const [branches, products, variants, barcodes, prices, balances] = await Promise.all([
      client.from("branches").select("id,name,is_active").eq("business_id", businessId).order("name"),
      client.from("products").select("id,name").eq("business_id", businessId).eq("is_active", true),
      client.from("product_variants").select("id,product_id,name,sku").eq("business_id", businessId).eq("is_active", true),
      client.from("product_barcodes").select("variant_id,code").eq("business_id", businessId),
      client.from("variant_effective_prices").select("variant_id,base_price_cents,effective_price_cents,promotional_price_cents,offer_id").eq("business_id", businessId),
      client.from("inventory_balances").select("branch_id,variant_id,quantity").eq("business_id", businessId),
    ]);
    const issue = branches.error ?? products.error ?? variants.error ?? barcodes.error ?? prices.error ?? balances.error;
    if (issue) throw issue;

    const priceRows = prices.data as RemotePrice[];
    return {
      businessId,
      branches: (branches.data as RemoteBranch[]).map((item) => ({ businessId, id: item.id, name: item.name, isActive: item.is_active })),
      products: (products.data as RemoteProduct[]).map((item) => ({ businessId, id: item.id, name: item.name })),
      variants: (variants.data as RemoteVariant[]).map((item) => ({ businessId, id: item.id, productId: item.product_id, name: item.name, sku: item.sku ?? "" })),
      barcodes: (barcodes.data as RemoteBarcode[]).map((item) => ({ businessId, variantId: item.variant_id, code: item.code })),
      prices: priceRows.flatMap((item) => item.effective_price_cents === null ? [] : [{
        businessId,
        variantId: item.variant_id,
        basePriceCents: item.base_price_cents,
        effectivePriceCents: item.effective_price_cents,
        offerId: item.offer_id,
      }]),
      offers: priceRows.flatMap((item) => item.offer_id === null || item.promotional_price_cents === null ? [] : [{
        businessId,
        id: item.offer_id,
        variantId: item.variant_id,
        promotionalPriceCents: item.promotional_price_cents,
      }]),
      stocks: (balances.data as unknown as RemoteBalance[]).map((item) => ({
        businessId,
        branchId: item.branch_id,
        variantId: item.variant_id,
        quantity: Number(item.quantity),
      })),
    };
  };
}

export async function synchronizeCatalog(
  businessId: string,
  download: SnapshotDownloader,
  db: PosDatabase = posDatabase,
  now = new Date(),
) {
  const snapshot = await download(businessId);
  if (snapshot.businessId !== businessId) throw new Error("The downloaded POS snapshot belongs to another business.");
  const lastSyncAt = now.toISOString();
  await db.replaceOperationalSnapshot(snapshot, lastSyncAt);
  return { lastSyncAt, snapshot };
}
