import { describe, expect, it } from "vitest";
import { deduplicateDetectedSupplierProducts, detectSupplierHeader, detectSupplierPdfText, detectSupplierRows, interpretSupplierPdfPages, shouldUseVisualPdfFallback, toDetectedSupplierProducts, visualFallbackPages } from "./supplier-price-list-import";
import { openAiErrorDetailsFrom, toOpenAiFileData } from "../../../supabase/functions/interpret-supplier-price-list/protocol";

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

  it("keeps locally understood pages and requests visual interpretation only for insufficient pages", () => {
    const pages = [
      { page: 1, text: "Hypoallergenyc Dog 1.4 KG\nCódigo interno: AF1001\nEAN: 7798320835138\nPrecio de compra: 22695\nPVP: 29504" },
      { page: 2, text: "Catálogo ilustrado sin precios seleccionables" },
      { page: 3, text: "Arena 10 kg\nCódigo: AR10\nPrecio + IVA: $8.000\nUnidades de venta: 2\nPVP: $10.000" },
    ];
    const interpretation = interpretSupplierPdfPages(pages);
    expect(interpretation[0].products[0]).toMatchObject({ name: "Hypoallergenyc Dog", presentation: "1.4 KG", supplier_code: "AF1001", barcode: "7798320835138", suggested_retail_price_cents: 2950400 });
    expect(interpretation[2].products[0].purchase_options[0]).toMatchObject({ purchase_price_cents: 800000, stock_units_per_purchase: 2 });
    expect(visualFallbackPages(pages)).toEqual([2]);
  });

  it("recognizes multiple blocks and value x bulto without a fixed table layout", () => {
    const products = detectSupplierPdfText([{ page: 6, text: [
      "Alimento Adulto 15 kg",
      "Codigo interno: AD15",
      "EAN: 0001234567890",
      "Valor x bulto: $35.500",
      "unidades de venta: 3",
      "PVP: $45.000",
      "Alimento Cachorro 3 kg",
      "Código: CA03",
      "Precio: $12.000",
      "PVP: $15.000",
    ].join("\n") }]);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ name: "Alimento Adulto", presentation: "15 kg", supplier_code: "AD15", barcode: "0001234567890", suggested_retail_price_cents: 4500000 });
    expect(products[0].purchase_options[0]).toMatchObject({ purchase_price_cents: 3550000, purchase_unit: "other", stock_units_per_purchase: 3 });
    expect(products[1]).toMatchObject({ name: "Alimento Cachorro", presentation: "3 kg", supplier_code: "CA03" });
  });

  it("does not duplicate local candidates when a retried visual page repeats one", () => {
    const local = detectSupplierPdfText([{ page: 1, text: "Producto 1 kg\nCódigo: A1\nCosto: $100" }]);
    const visual = toDetectedSupplierProducts([{ name: "Producto", presentation: "1 kg", supplierCode: "A1", source: { page: 1 }, confidence: 0.9, warnings: [], purchaseOptions: [{ purchasePriceCents: 10000 }] }]);
    expect(deduplicateDetectedSupplierProducts([...local, ...visual])).toHaveLength(1);
  });

  it("preserves useful OpenAI error details without exposing request payloads", () => {
    expect(openAiErrorDetailsFrom(400, new Headers({ "x-request-id": "req_test_123" }), { error: { type: "invalid_request_error", code: "unsupported_parameter", message: "file_data is malformed" } })).toEqual({ status: 400, type: "invalid_request_error", code: "unsupported_parameter", message: "file_data is malformed", request_id: "req_test_123" });
  });

  it("encodes private PDF bytes as an input_file data URL", async () => {
    await expect(toOpenAiFileData(new Blob(["PDF bytes"], { type: "application/pdf" }))).resolves.toBe("data:application/pdf;base64,UERGIGJ5dGVz");
  });
});
