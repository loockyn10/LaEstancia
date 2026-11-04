import { describe, expect, it } from "vitest";
import type { CatalogVariant } from "../catalog/types";
import { type Offer, type PricingData, bulkPreview, buildPricingRows, grossMargin, offerStatus, parsePercent, toPriceSource } from "./pricing-model";

const now = new Date("2026-11-04T12:00:00.000Z");
const offer = (patch: Partial<Offer> = {}): Offer => ({ id: "o1", variant_id: "v1", promotional_price_cents: 900, starts_at: "2026-11-01T00:00:00.000Z", ends_at: null, active: true, ...patch });

describe("offer status", () => {
  it("classifies active, upcoming, expired and disabled offers", () => {
    expect(offerStatus(offer(), now)).toBe("Vigente");
    expect(offerStatus(offer({ starts_at: "2026-12-01T00:00:00.000Z" }), now)).toBe("Próxima");
    expect(offerStatus(offer({ ends_at: "2026-11-02T00:00:00.000Z" }), now)).toBe("Vencida");
    expect(offerStatus(offer({ active: false }), now)).toBe("Desactivada");
  });
});

describe("pricing rows", () => {
  const variants: CatalogVariant[] = [
    { id: "v1", productId: "p", productName: "Alimento", variantName: "15 kg", label: "", sku: "A", barcodes: [], primaryBarcode: null, brandId: null, isActive: true },
    { id: "v2", productId: "p", productName: "Alimento", variantName: "3 kg", label: "", sku: "B", barcodes: [], primaryBarcode: null, brandId: null, isActive: true },
  ];
  const data: PricingData = {
    prices: { v1: 1_000 },
    sources: { v1: { source: "supplier_pvp", supplierId: "s1" } },
    costs: { v1: 600 },
    effectivePrices: { v1: 900 },
    offers: [offer(), offer({ id: "o2", variant_id: "v2", active: false })],
  };

  it("joins price, source, cost, effective price and only the current offer", () => {
    const [first, second] = buildPricingRows(variants, data, now);
    expect(first).toMatchObject({ price: 1_000, priceSource: "supplier_pvp", priceSupplierId: "s1", cost: 600, effectivePrice: 900 });
    expect(first.currentOffer?.id).toBe("o1");
    expect(second).toMatchObject({ price: null, priceSource: null, cost: null, effectivePrice: null, currentOffer: null });
  });

  it("falls back to manual for unknown sources", () => {
    expect(toPriceSource("anything")).toBe("manual");
    expect(toPriceSource(null)).toBe("manual");
    expect(toPriceSource("supplier_pvp")).toBe("supplier_pvp");
  });
});

describe("margins and bulk adjustment", () => {
  it("computes gross profit and margin only when price and cost exist", () => {
    expect(grossMargin({ price: 1_000, cost: 600 })).toEqual({ profit: 400, marginPercent: 40 });
    expect(grossMargin({ price: 0, cost: 600 })).toEqual({ profit: -600, marginPercent: null });
    expect(grossMargin({ price: null, cost: 600 })).toBeNull();
    expect(grossMargin({ price: 1_000, cost: null })).toBeNull();
  });

  it("parses percentages with comma, negatives and the -100 floor", () => {
    expect(parsePercent("8,5")).toBe(8.5);
    expect(parsePercent("-5")).toBe(-5);
    expect(parsePercent("-100")).toBe(-100);
    expect(parsePercent("-101")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });

  it("previews new prices rounded to the cent and skips rows without a price", () => {
    const rows = [
      { variantId: "a", price: 1_005 }, { variantId: "b", price: null },
    ].map((row) => ({ ...row, productName: "", variantName: "", sku: "", priceSource: null, priceSupplierId: null, cost: null, effectivePrice: null, currentOffer: null }));
    expect(bulkPreview(rows, 10).map((entry) => entry.nextPrice)).toEqual([1_106]);
  });
});
