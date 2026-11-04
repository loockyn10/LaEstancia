import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";

export const importFields = [
  { key: "productName", label: "Nombre de producto", required: true },
  { key: "variantName", label: "Presentación / variante" },
  { key: "brandName", label: "Marca" },
  { key: "categoryName", label: "Categoría" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Código de barras" },
  { key: "price", label: "Precio de venta" },
  { key: "cost", label: "Costo" },
  { key: "stock", label: "Stock inicial" },
  { key: "minimum", label: "Stock mínimo" },
  { key: "active", label: "Activo / inactivo" },
] as const;

export type ImportField = (typeof importFields)[number]["key"];
export type ColumnMapping = Partial<Record<ImportField, number>>;
export type Spreadsheet = {
  sheets: Record<string, unknown[][]>;
  sheetNames: string[];
};
export type SheetPreview = { headers: string[]; rows: string[][] };
export type ExistingVariant = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  barcodes: string[];
};
export type ImportPayloadRow = {
  row_number: number;
  product_name: string;
  variant_name: string;
  brand_name: string | null;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  stock_quantity: string | null;
  minimum_quantity: string | null;
  is_active: boolean | null;
  has_variant: boolean;
  has_brand: boolean;
  has_category: boolean;
  has_price: boolean;
  has_cost: boolean;
  has_stock: boolean;
  has_minimum: boolean;
  has_active: boolean;
};
export type ImportPlanRow = {
  rowNumber: number;
  productName: string;
  variantName: string;
  status: "new" | "existing" | "warning" | "invalid";
  messages: string[];
  payload: ImportPayloadRow | null;
};

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
const cell = (row: string[], index: number | undefined) =>
  index === undefined ? "" : (row[index] ?? "").trim();

export async function readSpreadsheet(file: File): Promise<Spreadsheet> {
  const sheets: Record<string, unknown[][]> = /\.csv$/i.test(file.name)
    ? { CSV: Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" }).data }
    : Object.fromEntries((await readXlsxFile(file)).map(({ sheet, data }) => [sheet, data]));
  const sheetNames = Object.keys(sheets);
  if (!sheetNames.length) throw new Error("El archivo no contiene hojas legibles.");
  return { sheets, sheetNames };
}

export function readSheet(spreadsheet: Spreadsheet, sheetName: string): SheetPreview {
  const grid = spreadsheet.sheets[sheetName];
  if (!grid) throw new Error("No pudimos leer la hoja seleccionada.");
  const rows = grid.map((row) => row.map((value) => String(value ?? "").trim()));
  const headers = rows.shift() ?? [];
  if (!headers.some(Boolean)) throw new Error("La hoja no tiene encabezados.");
  return { headers, rows: rows.filter((row) => row.some(Boolean)) };
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const suggestions: Array<[ImportField, string[]]> = [
    ["productName", ["nombre", "producto", "articulo", "artículo", "descripcion", "descripción"]],
    ["variantName", ["presentacion", "presentación", "variante", "detalle"]],
    ["brandName", ["marca"]], ["categoryName", ["categoria", "categoría", "rubro"]],
    ["sku", ["sku", "codigo interno", "código interno"]], ["barcode", ["barcode", "codigo de barras", "código de barras", "ean"]],
    ["price", ["precio venta", "precio", "pvp"]], ["cost", ["costo", "coste"]],
    ["stock", ["stock inicial", "stock", "existencia"]], ["minimum", ["stock minimo", "stock mínimo", "minimo", "mínimo"]],
    ["active", ["activo", "activa", "estado"]],
  ];
  return Object.fromEntries(suggestions.flatMap(([field, names]) => {
    const index = headers.findIndex((header) => names.includes(normalized(header)));
    return index < 0 ? [] : [[field, index]];
  })) as ColumnMapping;
}

export function parseMoneyCents(input: string): number | null {
  const value = input.replace(/[$\s]/g, "");
  if (!value) return null;
  let whole: string;
  let fraction = "";
  if (value.includes(",")) {
    const pieces = value.split(",");
    if (pieces.length !== 2 || !/^\d{1,2}$/.test(pieces[1])) return null;
    whole = pieces[0].replace(/\./g, "");
    fraction = pieces[1];
  } else if (value.includes(".")) {
    const pieces = value.split(".");
    const thousands = pieces.length > 1 && pieces.slice(1).every((part) => /^\d{3}$/.test(part));
    if (thousands) whole = pieces.join("");
    else {
      if (pieces.length !== 2 || !/^\d{1,2}$/.test(pieces[1])) return null;
      whole = pieces[0];
      fraction = pieces[1];
    }
  } else whole = value;
  if (!/^\d+$/.test(whole)) return null;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function parseQuantity(input: string): string | null {
  const value = input.replace(/\s/g, "");
  if (!value) return null;
  let whole: string;
  let fraction = "";
  if (value.includes(",")) {
    const pieces = value.split(",");
    if (pieces.length !== 2 || !/^\d{1,3}$/.test(pieces[1])) return null;
    whole = pieces[0].replace(/\./g, "");
    fraction = pieces[1];
  } else if (value.includes(".")) {
    const pieces = value.split(".");
    const thousands = pieces.length > 1 && pieces.slice(1).every((part) => /^\d{3}$/.test(part));
    if (thousands) whole = pieces.join("");
    else {
      if (pieces.length !== 2 || !/^\d{1,3}$/.test(pieces[1])) return null;
      whole = pieces[0];
      fraction = pieces[1];
    }
  } else whole = value;
  if (!/^\d+$/.test(whole)) return null;
  const trimmedFraction = fraction.replace(/0+$/, "");
  const canonical = `${BigInt(whole)}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
  return BigInt(whole) < 1000000000000000n ? canonical : null;
}

function parseActive(input: string): boolean | null | undefined {
  if (!input) return null;
  if (["activo", "activa", "si", "sí", "true", "1"].includes(normalized(input))) return true;
  if (["inactivo", "inactiva", "no", "false", "0"].includes(normalized(input))) return false;
  return undefined;
}

export function makeImportPlan(rows: string[][], mapping: ColumnMapping, existing: ExistingVariant[], updateExisting: boolean): ImportPlanRow[] {
  const barcodeRows = new Map<string, number[]>();
  const skuRows = new Map<string, number[]>();
  rows.forEach((row, index) => {
    for (const [field, map] of [["barcode", barcodeRows], ["sku", skuRows]] as const) {
      const value = cell(row, mapping[field]);
      if (value) map.set(normalized(value), [...(map.get(normalized(value)) ?? []), index]);
    }
  });
  return rows.map((row, index) => {
    const messages: string[] = [];
    const productName = cell(row, mapping.productName);
    const variantName = cell(row, mapping.variantName) || "Presentación única";
    const barcode = cell(row, mapping.barcode) || null;
    const sku = cell(row, mapping.sku) || null;
    const priceInput = cell(row, mapping.price);
    const costInput = cell(row, mapping.cost);
    const stockInput = cell(row, mapping.stock);
    const minimumInput = cell(row, mapping.minimum);
    const activeInput = cell(row, mapping.active);
    const price = parseMoneyCents(priceInput);
    const cost = parseMoneyCents(costInput);
    const stock = parseQuantity(stockInput);
    const minimum = parseQuantity(minimumInput);
    const active = parseActive(activeInput);
    if (!productName) messages.push("Falta el nombre de producto.");
    if (barcode && (barcodeRows.get(normalized(barcode))?.length ?? 0) > 1) messages.push("Código de barras duplicado dentro del archivo.");
    if (sku && (skuRows.get(normalized(sku))?.length ?? 0) > 1) messages.push("SKU duplicado dentro del archivo.");
    if (priceInput && price === null) messages.push("Precio de venta inválido.");
    if (costInput && cost === null) messages.push("Costo inválido.");
    if (stockInput && stock === null) messages.push("Stock inicial inválido.");
    if (minimumInput && minimum === null) messages.push("Stock mínimo inválido.");
    if (activeInput && active === undefined) messages.push("Estado inválido: usá activo/inactivo, sí/no o true/false.");
    const barcodeMatch = barcode ? existing.find((item) => item.barcodes.some((code) => normalized(code) === normalized(barcode))) : undefined;
    const skuMatch = sku ? existing.find((item) => item.sku && normalized(item.sku) === normalized(sku)) : undefined;
    if (barcodeMatch && skuMatch && barcodeMatch.id !== skuMatch.id) messages.push("El barcode y el SKU pertenecen a presentaciones diferentes.");
    const matched = barcodeMatch ?? skuMatch;
    const exactNameExists = !barcode && !sku && existing.some((item) => normalized(item.productName) === normalized(productName) && normalized(item.variantName) === normalized(variantName));
    if (!matched && exactNameExists) messages.push("No se puede reimportar con seguridad sin barcode o SKU: esa presentación ya existe.");
    const payload: ImportPayloadRow = {
      row_number: index + 2, product_name: productName, variant_name: variantName,
      brand_name: cell(row, mapping.brandName) || null, category_name: cell(row, mapping.categoryName) || null,
      sku, barcode, price_cents: price, cost_cents: cost, stock_quantity: stock, minimum_quantity: minimum,
      is_active: active ?? null, has_variant: mapping.variantName !== undefined,
      has_brand: mapping.brandName !== undefined, has_category: mapping.categoryName !== undefined,
      has_price: mapping.price !== undefined, has_cost: mapping.cost !== undefined, has_stock: mapping.stock !== undefined,
      has_minimum: mapping.minimum !== undefined, has_active: mapping.active !== undefined,
    };
    if (messages.length) return { rowNumber: index + 2, productName, variantName, status: "invalid", messages, payload: null };
    if (matched) {
      const detail = updateExisting
        ? `Existente por ${barcodeMatch ? "barcode" : "SKU"}: se actualizarán sólo los campos mapeados.`
        : `Existente por ${barcodeMatch ? "barcode" : "SKU"}: no se reemplazará ningún dato.`;
      return { rowNumber: index + 2, productName, variantName, status: "existing", messages: [detail], payload };
    }
    const warnings: string[] = [];
    if (!barcode && !sku) warnings.push("Sin barcode ni SKU: una reimportación requerirá identificador o se bloqueará si ya existe esta presentación.");
    if (stock !== null && stock !== "0") warnings.push("El stock se registrará como movimiento inicial auditable.");
    return { rowNumber: index + 2, productName, variantName, status: warnings.length ? "warning" : "new", messages: warnings.length ? warnings : ["Producto y presentación nuevos."], payload };
  });
}
