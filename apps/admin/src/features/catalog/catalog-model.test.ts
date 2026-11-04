import { describe, expect, it } from "vitest";
import { blankProduct, flattenVariants, productMatches, validateProductDraft } from "./catalog-model";
import type { Product, ProductDraft } from "./types";

const draft = (patch: Partial<ProductDraft> = {}): ProductDraft => ({
  ...blankProduct(),
  name: "Royal Canin Mini Adult",
  variants: [{ name: "3 kg", sku: "RC-3", is_active: true, barcodes: [{ code: "779001", is_primary: true }] }],
  ...patch,
});

describe("product draft validation", () => {
  it("trims values and drops empty barcodes", () => {
    const result = validateProductDraft(draft({ name: "  Alimento  ", variants: [{ name: " 3 kg ", sku: " RC-3 ", is_active: true, barcodes: [{ code: " 779 ", is_primary: true }, { code: "  ", is_primary: false }] }] }));
    expect(result.clean?.name).toBe("Alimento");
    expect(result.clean?.variants[0]).toMatchObject({ name: "3 kg", sku: "RC-3", barcodes: [{ code: "779", is_primary: true }] });
  });

  it("requires a product name and a name for every presentation", () => {
    expect(validateProductDraft(draft({ name: " " })).error).toMatch(/nombre del producto/);
    expect(validateProductDraft(draft({ variants: [{ name: "", sku: "", is_active: true, barcodes: [] }] })).error).toMatch(/cada presentación/);
  });

  it("rejects repeated SKUs and barcodes (case-insensitive) inside one product", () => {
    const variant = (name: string, sku: string, code: string) => ({ name, sku, is_active: true, barcodes: [{ code, is_primary: true }] });
    expect(validateProductDraft(draft({ variants: [variant("A", "sku-1", "1"), variant("B", "SKU-1", "2")] })).error).toMatch(/SKU/);
    expect(validateProductDraft(draft({ variants: [variant("A", "", "AB1"), variant("B", "", "ab1")] })).error).toMatch(/código de barras/);
  });

  it("allows at most one primary barcode per presentation", () => {
    const result = validateProductDraft(draft({ variants: [{ name: "A", sku: "", is_active: true, barcodes: [{ code: "1", is_primary: true }, { code: "2", is_primary: true }] }] }));
    expect(result.error).toMatch(/un solo código principal/);
  });
});

const products: Product[] = [
  {
    id: "p1", name: "Alimento Premium", description: "", is_active: true, brand_id: "b1", category_id: null,
    variants: [
      { id: "v1", name: "15 kg", sku: "PREM-15", is_active: true, barcodes: [{ id: "c1", code: "779001", is_primary: false }, { id: "c2", code: "779002", is_primary: true }] },
      { name: "Sin guardar", sku: "", is_active: true, barcodes: [] },
    ],
  },
  { id: "p2", name: "Collar", description: "", is_active: false, brand_id: null, category_id: null, variants: [{ id: "v2", name: "Chico", sku: "", is_active: true, barcodes: [] }] },
];

describe("catalog helpers", () => {
  it("matches by product name, SKU or barcode", () => {
    expect(productMatches(products[0], "premium")).toBe(true);
    expect(productMatches(products[0], "prem-15")).toBe(true);
    expect(productMatches(products[0], "779002")).toBe(true);
    expect(productMatches(products[0], "collar")).toBe(false);
    expect(productMatches(products[0], "")).toBe(true);
  });

  it("flattens only saved presentations and prefers the primary barcode", () => {
    const flat = flattenVariants(products);
    expect(flat.map((variant) => variant.id)).toEqual(["v1", "v2"]);
    expect(flat[0]).toMatchObject({ label: "Alimento Premium · 15 kg", primaryBarcode: "779002", barcodes: ["779001", "779002"], brandId: "b1", isActive: true });
    expect(flat[1]).toMatchObject({ primaryBarcode: null, isActive: false });
  });
});
