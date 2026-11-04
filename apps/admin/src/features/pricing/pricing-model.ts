import type { CatalogVariant } from "../catalog/types";

export type PriceSource = "manual" | "supplier_pvp";

export type Offer = {
  id: string;
  variant_id: string;
  promotional_price_cents: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
};

export type PricingData = {
  prices: Record<string, number>;
  sources: Record<string, { source: PriceSource; supplierId: string | null }>;
  costs: Record<string, number>;
  effectivePrices: Record<string, number>;
  offers: Offer[];
};

export type PricingRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  price: number | null;
  priceSource: PriceSource | null;
  priceSupplierId: string | null;
  cost: number | null;
  effectivePrice: number | null;
  currentOffer: Offer | null;
};

export type OfferStatus = "Desactivada" | "Próxima" | "Vencida" | "Vigente";

export const toPriceSource = (value: string | null | undefined): PriceSource => (value === "supplier_pvp" ? "supplier_pvp" : "manual");

export const priceSourceLabel = (source: PriceSource | null) => (source === "supplier_pvp" ? "PVP proveedor" : source === "manual" ? "Manual" : "Sin precio");

export function offerStatus(offer: Offer, now = new Date()): OfferStatus {
  if (!offer.active) return "Desactivada";
  if (new Date(offer.starts_at) > now) return "Próxima";
  if (offer.ends_at && new Date(offer.ends_at) <= now) return "Vencida";
  return "Vigente";
}

export const offerStatusTone: Record<OfferStatus, "success" | "info" | "neutral"> = {
  Vigente: "success",
  Próxima: "info",
  Vencida: "neutral",
  Desactivada: "neutral",
};

export function buildPricingRows(variants: readonly CatalogVariant[], data: PricingData, now = new Date()): PricingRow[] {
  return variants.map((variant) => {
    const price = data.prices[variant.id] ?? null;
    const source = data.sources[variant.id];
    return {
      variantId: variant.id,
      productName: variant.productName,
      variantName: variant.variantName,
      sku: variant.sku,
      price,
      priceSource: price === null ? null : source?.source ?? "manual",
      priceSupplierId: source?.supplierId ?? null,
      cost: data.costs[variant.id] ?? null,
      currentOffer: data.offers.find((offer) => offer.variant_id === variant.id && offerStatus(offer, now) === "Vigente") ?? null,
      effectivePrice: data.effectivePrices[variant.id] ?? price,
    };
  });
}

/** Ganancia y margen brutos; el margen no se calcula para un precio igual a cero. */
export function grossMargin(row: Pick<PricingRow, "price" | "cost">): { profit: number; marginPercent: number | null } | null {
  if (row.price === null || row.cost === null) return null;
  const profit = row.price - row.cost;
  return { profit, marginPercent: row.price > 0 ? (profit / row.price) * 100 : null };
}

/** Porcentaje de ajuste masivo (admite coma decimal y negativos hasta -100). */
export function parsePercent(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= -100 ? parsed : null;
}

export function bulkPreview(rows: readonly PricingRow[], percent: number) {
  return rows.flatMap((row) => (row.price === null ? [] : [{ row, nextPrice: Math.round(row.price * (1 + percent / 100)) }]));
}
