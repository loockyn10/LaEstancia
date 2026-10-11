import Dexie, { type Table } from "dexie";
import type {
  LocalAccessContext,
  LocalBarcode,
  LocalBranch,
  LocalOffer,
  LocalPrice,
  LocalProduct,
  LocalStock,
  LocalSyncMetadata,
  LocalVariant,
  OperationalSnapshot,
} from "./types";

export class PosDatabase extends Dexie {
  contexts!: Table<LocalAccessContext, [string, string]>;
  branches!: Table<LocalBranch, [string, string]>;
  products!: Table<LocalProduct, [string, string]>;
  variants!: Table<LocalVariant, [string, string]>;
  barcodes!: Table<LocalBarcode, [string, string]>;
  prices!: Table<LocalPrice, [string, string]>;
  offers!: Table<LocalOffer, [string, string]>;
  stocks!: Table<LocalStock, [string, string, string]>;
  syncMetadata!: Table<LocalSyncMetadata, string>;

  constructor(name = "la-estancia-pos") {
    super(name);
    this.version(1).stores({
      contexts: "[userId+businessId],userId,businessId,updatedAt",
      branches: "[businessId+id],businessId",
      products: "[businessId+id],businessId",
      variants: "[businessId+id],businessId,[businessId+productId],[businessId+sku]",
      barcodes: "[businessId+code],businessId,[businessId+variantId]",
      prices: "[businessId+variantId],businessId",
      offers: "[businessId+id],businessId,[businessId+variantId]",
      stocks: "[businessId+branchId+variantId],businessId,[businessId+branchId]",
      syncMetadata: "businessId,lastSyncAt",
    });
  }

  async replaceOperationalSnapshot(snapshot: OperationalSnapshot, lastSyncAt: string) {
    const scopedRows = [
      ...snapshot.branches,
      ...snapshot.products,
      ...snapshot.variants,
      ...snapshot.barcodes,
      ...snapshot.prices,
      ...snapshot.offers,
      ...snapshot.stocks,
    ];
    if (scopedRows.some((row) => row.businessId !== snapshot.businessId)) {
      throw new Error("The local POS snapshot contains rows from another business.");
    }

    await this.transaction(
      "rw",
      [this.branches, this.products, this.variants, this.barcodes, this.prices, this.offers, this.stocks, this.syncMetadata],
      async () => {
        await Promise.all([
          this.branches.where("businessId").equals(snapshot.businessId).delete(),
          this.products.where("businessId").equals(snapshot.businessId).delete(),
          this.variants.where("businessId").equals(snapshot.businessId).delete(),
          this.barcodes.where("businessId").equals(snapshot.businessId).delete(),
          this.prices.where("businessId").equals(snapshot.businessId).delete(),
          this.offers.where("businessId").equals(snapshot.businessId).delete(),
          this.stocks.where("businessId").equals(snapshot.businessId).delete(),
        ]);
        await this.branches.bulkPut(snapshot.branches);
        await this.products.bulkPut(snapshot.products);
        await this.variants.bulkPut(snapshot.variants);
        await this.barcodes.bulkPut(snapshot.barcodes);
        await this.prices.bulkPut(snapshot.prices);
        await this.offers.bulkPut(snapshot.offers);
        await this.stocks.bulkPut(snapshot.stocks);
        await this.syncMetadata.put({ businessId: snapshot.businessId, lastSyncAt });
      },
    );
  }
}

export const posDatabase = new PosDatabase();
