import { describe, expect, it } from "vitest";
import { detectSupplierHeader, detectSupplierPdfText, detectSupplierRows, shouldUseVisualPdfFallback, toDetectedSupplierProducts } from "./supplier-price-list-import";

describe("supplier PDF text interpretation", () => {
  it("detects multiple products, Argentine money, packaging, promo and source page", () => {
    const products = detectSupplierPdfText([{ page: 3, text: [
      "SNACKS",
      "Churrasquito 75g",
      "Código interno: 0102B",
      "EAN: 007798320835138",
      "Costo: $39.500,50",
      "PVP: $52.000",
      "Caja x20",
      "6+1",
      "Galletitas Adulto",
      "Costo: $10.000",
      "Bulto x12",
      "10+2",
    ].join("\n") }]);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ supplier_code: "0102B", barcode: "007798320835138", category: "SNACKS", suggested_retail_price_cents: 5200000, source_reference: { page: 3 } });
    expect(products[0].purchase_options[0]).toMatchObject({ purchase_unit: "box", stock_units_per_purchase: 20, purchase_price_cents: 3950050, units_paid: 6, units_bonus: 1 });
    expect(products[1].purchase_options[0]).toMatchObject({ purchase_unit: "bundle", stock_units_per_purchase: 12, units_paid: 10, units_bonus: 2 });
  });
});

describe("visual candidate normalization", () => {
  it("keeps barcodes and supplier codes as strings and maps multiple candidates", () => {
    const products = toDetectedSupplierProducts([
      { name: "Producto A", supplierCode: "0102B", barcode: "0001234567890", confidence: 0.95, warnings: [], source: { page: 1, regionOrReference: "fila 1" }, purchaseOptions: [{ purchasePriceCents: 3950000, purchaseUnit: "box", stockUnitsPerPurchase: 12, paidUnits: 1, bonusUnits: 0 }] },
      { name: "Producto B", confidence: 0.6, warnings: ["Presentación inferida."], source: { page: 1 }, purchaseOptions: [{ purchasePriceCents: 100000, purchaseUnit: "unit" }] },
    ]);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ supplier_code: "0102B", barcode: "0001234567890", source_reference: { page: 1 } });
    expect(products[0].purchase_options[0].stock_units_per_purchase).toBe(12);
  });
});

describe("supplier spreadsheets with non-tabular preambles", () => {
  const grid = [
    ["CANCAT", "", "", "", ""],
    ["Lista de precios julio", "", "", "", ""],
    ["IMAGEN", "CODIGO", "DESCRIPCION", "CODIGO BARRAS", "NUEVA LISTA PRECIOS"],
    ["", "", "PAÑOS EDUCATIVOS", "", ""],
    ["", "0102B", "Pañito educativo", "0001234567890", "8014.177500000001"],
    ["IMAGEN", "CODIGO", "DESCRIPCION", "CODIGO BARRAS", "NUEVA LISTA PRECIOS"],
    ["", "00101", "Comedero", "007798320835138", "1.234,50"],
  ];

  it("detects the header below title rows and automaps provider columns", () => {
    const header = detectSupplierHeader(grid);
    expect(header).toMatchObject({ rowIndex: 2, mapping: { name: 2, supplier_code: 1, barcode: 3, cost: 4 } });
  });

  it("keeps alphanumeric and zero-prefixed codes, ignores repeated headers and sections, and rounds float tails", () => {
    const products = detectSupplierRows(grid, "Lista Precios");
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ name: "Pañito educativo", supplier_code: "0102B", barcode: "0001234567890", category: "PAÑOS EDUCATIVOS" });
    expect(products[0].purchase_options[0].purchase_price_cents).toBe(801418);
    expect(products[1]).toMatchObject({ supplier_code: "00101", barcode: "007798320835138" });
  });
});

describe("PDF fallback decision", () => {
  it("keeps usable text candidates local and sends text without usable candidates to visual interpretation", () => {
    const productPages = [{ page: 1, text: "Producto\nCosto: $100" }];
    const products = detectSupplierPdfText(productPages);
    expect(products).toHaveLength(1);
    expect(shouldUseVisualPdfFallback(productPages, products)).toBe(false);
    expect(shouldUseVisualPdfFallback([{ page: 1, text: "Lista escaneada" }], [])).toBe(true);
    expect(shouldUseVisualPdfFallback([{ page: 1, text: "Costo: $100\nCosto: $200" }], products)).toBe(true);
  });

  it("does not treat an empty visual response as candidates", () => {
    expect(toDetectedSupplierProducts([])).toEqual([]);
  });
});
