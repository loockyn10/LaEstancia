import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PosDatabase } from "../local-db/database";
import { supabaseSnapshotDownloader, synchronizeStock } from "./catalog-sync";

const business = "business-a";
const PAGE = 1000;

type Row = Record<string, unknown>;

/** Cliente mínimo que imita PostgREST: aplica `eq` y `range` y corta cada respuesta en 1000 filas. */
function fakeClient(tables: Record<string, Row[]>, requests: string[]) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      let window: [number, number] = [0, PAGE - 1];
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        range: (from: number, to: number) => {
          window = [from, Math.min(to, from + PAGE - 1)];
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => {
          requests.push(`${table}:${window[0]}`);
          return Promise.resolve({ data: rows.slice(window[0], window[1] + 1), error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const catalog = (count: number): Record<string, Row[]> => {
  const ids = Array.from({ length: count }, (_, index) => `v${index}`);
  return {
    branches: [{ id: "b1", name: "Casa central", is_active: true, business_id: business }],
    products: ids.map((id) => ({ id: `p-${id}`, name: `Producto ${id}`, is_active: true, business_id: business })),
    product_variants: ids.map((id) => ({ id, product_id: `p-${id}`, name: "Única", sku: null, is_active: true, business_id: business })),
    product_barcodes: ids.map((id) => ({ id: `bc-${id}`, variant_id: id, code: `779${id}`, business_id: business })),
    variant_effective_prices: ids.map((id) => ({ variant_id: id, base_price_cents: 100, effective_price_cents: 100, promotional_price_cents: null, offer_id: null, business_id: business })),
    inventory_balances: ids.map((id) => ({ branch_id: "b1", variant_id: id, quantity: 2, business_id: business })),
  };
};

describe("POS snapshot download", () => {
  let db: PosDatabase;
  beforeEach(() => { db = new PosDatabase(`pos-sync-${crypto.randomUUID()}`); });
  afterEach(async () => { db.close(); await db.delete(); });

  it("downloads every page of a catalog larger than the 1000-row server limit", async () => {
    const requests: string[] = [];
    const snapshot = await supabaseSnapshotDownloader(fakeClient(catalog(2_300), requests))(business);

    expect(snapshot.variants).toHaveLength(2_300);
    expect(snapshot.products).toHaveLength(2_300);
    expect(snapshot.barcodes).toHaveLength(2_300);
    expect(snapshot.prices).toHaveLength(2_300);
    expect(snapshot.stocks).toHaveLength(2_300);
    expect(requests.filter((request) => request.startsWith("product_variants:"))).toEqual(["product_variants:0", "product_variants:1000", "product_variants:2000"]);
  });

  it("drops prices without an effective price and offers without a promotional price", async () => {
    const tables = catalog(2);
    tables.variant_effective_prices[1] = { ...tables.variant_effective_prices[1], effective_price_cents: null };
    const snapshot = await supabaseSnapshotDownloader(fakeClient(tables, []))(business);
    expect(snapshot.prices.map((price) => price.variantId)).toEqual(["v0"]);
    expect(snapshot.offers).toEqual([]);
  });

  it("refreshes only the stock after a sale, leaving catalog and sync metadata untouched", async () => {
    await db.replaceOperationalSnapshot(await supabaseSnapshotDownloader(fakeClient(catalog(2), []))(business), "2026-10-11T14:30:00.000Z");
    const afterSale = catalog(2);
    afterSale.inventory_balances[0] = { ...afterSale.inventory_balances[0], quantity: 1 };

    await synchronizeStock(business, async () => (await supabaseSnapshotDownloader(fakeClient(afterSale, []))(business)).stocks, db);

    expect((await db.stocks.get([business, "b1", "v0"]))?.quantity).toBe(1);
    expect(await db.products.count()).toBe(2);
    expect(await db.syncMetadata.get(business)).toEqual({ businessId: business, lastSyncAt: "2026-10-11T14:30:00.000Z" });
  });

  it("rejects stock rows that belong to another business", async () => {
    await expect(db.replaceStocks(business, [{ businessId: "business-b", branchId: "b1", variantId: "v0", quantity: 1 }])).rejects.toThrow("another business");
  });
});
