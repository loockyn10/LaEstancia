import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosDatabase } from "./database";
import {
  findLocalBarcode,
  getCachedAccessContext,
  getLocalOverview,
  listSellableOptions,
  saveAccessContext,
  searchLocalCatalog,
} from "./repository";
import type { OperationalSnapshot } from "./types";
import { synchronizeCatalog } from "../sync/catalog-sync";
import { FIRST_SYNC_MESSAGE, FIRST_SYNC_TITLE } from "./messages";

const businessA = "business-a";
const businessB = "business-b";

function snapshot(businessId: string, price = 125_000): OperationalSnapshot {
  return {
    businessId,
    branches: [{ businessId, id: "branch-1", name: "Casa central", isActive: true }],
    products: [{ businessId, id: "product-1", name: "Alimento Premium" }],
    variants: [{ businessId, id: "variant-1", productId: "product-1", name: "Bolsa 15 kg", sku: "PREM-15" }],
    barcodes: [{ businessId, variantId: "variant-1", code: "779000000001" }],
    prices: [{ businessId, variantId: "variant-1", basePriceCents: 140_000, effectivePriceCents: price, offerId: "offer-1" }],
    offers: [{ businessId, id: "offer-1", variantId: "variant-1", promotionalPriceCents: price }],
    stocks: [{ businessId, branchId: "branch-1", variantId: "variant-1", quantity: 7.5 }],
  };
}

describe("POS local-first catalog", () => {
  let db: PosDatabase;
  let databaseName: string;

  beforeEach(() => {
    databaseName = `pos-test-${crypto.randomUUID()}`;
    db = new PosDatabase(databaseName);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("downloads an online snapshot and persists the operational catalog with sync metadata", async () => {
    const download = vi.fn(async () => snapshot(businessA));
    const result = await synchronizeCatalog(businessA, download, db, new Date("2026-10-11T14:30:00.000Z"));

    expect(download).toHaveBeenCalledWith(businessA);
    expect(await db.products.count()).toBe(1);
    expect(await db.variants.count()).toBe(1);
    expect(await db.syncMetadata.get(businessA)).toEqual({ businessId: businessA, lastSyncAt: result.lastSyncAt });
  });

  it("searches by name and SKU using only IndexedDB", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");

    expect((await searchLocalCatalog(businessA, "branch-1", "premium", new Set(), db))[0]?.id).toBe("variant-1");
    expect((await searchLocalCatalog(businessA, "branch-1", "prem-15", new Set(), db))[0]?.id).toBe("variant-1");
  });

  it("resolves a barcode to the correct local variant", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");
    expect((await findLocalBarcode(businessA, "branch-1", "779000000001", db))?.id).toBe("variant-1");
  });

  it("uses the synchronized effective price, current offer and branch stock snapshot", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");
    const [option] = await listSellableOptions(businessA, "branch-1", db);
    expect(option).toMatchObject({ price: 125_000, offer: true, stock: 7.5 });
  });

  it("survives a database reopen and can be read without another download", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");
    db.close();
    db = new PosDatabase(databaseName);

    expect((await searchLocalCatalog(businessA, "branch-1", "alimento", new Set(), db))).toHaveLength(1);
  });

  it("reports a clear first-run state when no synchronization exists", async () => {
    await expect(getLocalOverview(businessA, db)).resolves.toMatchObject({ hasLocalData: false, lastSyncAt: null, branches: [] });
    expect(`${FIRST_SYNC_TITLE} ${FIRST_SYNC_MESSAGE}`).toBe("Este POS todavía no tiene datos locales. Conectate a internet para realizar la primera sincronización.");
  });

  it("replaces a business snapshot on reload while preserving another business and never mixes searches", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");
    const other = snapshot(businessB);
    other.products[0] = { ...other.products[0], name: "Producto del negocio B" };
    await db.replaceOperationalSnapshot(other, "2026-10-11T14:31:00.000Z");
    await db.replaceOperationalSnapshot(snapshot(businessA, 130_000), "2026-10-11T14:32:00.000Z");

    expect((await listSellableOptions(businessA, "branch-1", db))[0]?.price).toBe(130_000);
    expect(await searchLocalCatalog(businessA, "branch-1", "negocio B", new Set(), db)).toEqual([]);
    expect((await searchLocalCatalog(businessB, "branch-1", "negocio B", new Set(), db))).toHaveLength(1);
  });

  it("keeps cached access scoped by user and business", async () => {
    await saveAccessContext({ userId: "user-a", businessId: businessA, businessName: "A", role: "staff", selectedBranchId: "branch-1", updatedAt: "2026-10-11T10:00:00Z" }, db);
    await saveAccessContext({ userId: "user-b", businessId: businessB, businessName: "B", role: "owner", selectedBranchId: null, updatedAt: "2026-10-11T11:00:00Z" }, db);

    expect((await getCachedAccessContext("user-a", db))?.businessId).toBe(businessA);
    expect((await getCachedAccessContext("user-b", db))?.businessId).toBe(businessB);
  });

  it("does not define local tables or fields for costs, margins, suppliers or purchases", async () => {
    await db.replaceOperationalSnapshot(snapshot(businessA), "2026-10-11T14:30:00.000Z");
    const serialized = JSON.stringify(await Promise.all(db.tables.map((table) => table.toArray()))).toLowerCase();
    const tableNames = db.tables.map((table) => table.name);

    expect(tableNames).not.toEqual(expect.arrayContaining(["costs", "margins", "suppliers", "purchases"]));
    expect(serialized).not.toMatch(/cost|margin|supplier|purchase|proveedor|compra/);
  });

  it("rejects a snapshot containing rows from a different business", async () => {
    const invalid = snapshot(businessA);
    invalid.products[0] = { ...invalid.products[0], businessId: businessB };
    await expect(db.replaceOperationalSnapshot(invalid, "2026-10-11T14:30:00.000Z")).rejects.toThrow("another business");
  });
});
