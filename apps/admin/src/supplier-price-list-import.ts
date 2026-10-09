import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import { parseMoneyCents } from "./catalog-import";

export type DetectedPurchaseOption = {
  supplier_code: string | null;
  purchase_unit: "unit" | "box" | "bundle" | "bag" | "other";
  purchase_unit_label: string | null;
  stock_units_per_purchase: number;
  purchase_price_cents: number;
  units_paid: number;
  units_bonus: number;
  is_selected: boolean;
};
export type DetectedSupplierProduct = {
  name: string;
  presentation: string | null;
  supplier_code: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  suggested_retail_price_cents: number | null;
  source_reference: Record<string, unknown>;
  warnings: string[];
  confidence: number;
  purchase_options: DetectedPurchaseOption[];
};
export type SupplierSpreadsheet = { sheetNames: string[]; sheets: Record<string, string[][]> };

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
const aliases: Record<string, string[]> = {
  name: ["producto", "nombre", "articulo", "artículo", "descripcion", "descripción"],
  presentation: ["presentacion", "presentación", "detalle"],
  supplier_code: ["codigo proveedor", "código proveedor", "codigo interno", "código interno", "codigo", "código"],
  barcode: ["ean", "barcode", "codigo barras", "código barras", "codigo de barras", "código de barras"],
  cost: ["costo", "precio costo", "precio compra", "costo compra"],
  suggested_retail_price_cents: ["pvp", "precio sugerido", "pvp sugerido", "precio venta sugerido"],
  brand: ["marca"], category: ["categoria", "categoría", "rubro"],
};

export async function readSupplierSpreadsheet(file: File): Promise<SupplierSpreadsheet> {
  const sheets: Record<string, string[][]> = /\.csv$/i.test(file.name)
    ? { CSV: Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" }).data.map((row) => row.map((cell) => String(cell ?? "").trim())) }
    : Object.fromEntries((await readXlsxFile(file)).map(({ sheet, data }) => [sheet, data.map((row) => row.map((cell) => String(cell ?? "").trim()))]));
  const sheetNames = Object.keys(sheets);
  if (!sheetNames.length) throw new Error("El archivo no contiene hojas legibles.");
  return { sheets, sheetNames };
}

function columnIndex(headers: string[], field: string) {
  return headers.findIndex((header) => aliases[field].includes(normalize(header)));
}
function at(row: string[], index: number) { return index < 0 ? "" : row[index]?.trim() ?? ""; }
function parsePromo(value: string) {
  const match = value.match(/(?:promo(?:ción)?\s*)?(\d+)\s*\+\s*(\d+)/i);
  return match ? { paid: Number(match[1]), bonus: Number(match[2]) } : { paid: 1, bonus: 0 };
}
function parsePackaging(value: string) {
  const match = value.match(/\b(caja|bulto|bolsa|pack)\s*(?:x|de)?\s*(\d+(?:[.,]\d{1,3})?)/i);
  if (!match) return { unit: "unit" as const, label: null, contents: 1, warning: null };
  const unit = match[1].toLocaleLowerCase("es-AR");
  const contents = Number(match[2].replace(",", "."));
  return { unit: unit === "caja" ? "box" as const : unit === "bulto" ? "bundle" as const : unit === "bolsa" ? "bag" as const : "other" as const, label: match[0], contents, warning: `Presentación inferida: ${match[0]}.` };
}

/** Deterministic adapter for tabular supplier lists.  It intentionally never
 * guesses a catalogue match; that happens after staging, by stable code/EAN. */
export function detectSupplierRows(grid: string[][], sheetName: string): DetectedSupplierProduct[] {
  const [headers = [], ...rows] = grid;
  const indexes = Object.fromEntries(Object.keys(aliases).map((field) => [field, columnIndex(headers, field)])) as Record<string, number>;
  if (indexes.name < 0) throw new Error("Mapeá o renombrá una columna de producto/nombre antes de continuar.");
  return rows.flatMap((row, rowIndex) => {
    const name = at(row, indexes.name);
    if (!name) return [];
    const costInput = at(row, indexes.cost);
    const cost = parseMoneyCents(costInput);
    const packaging = parsePackaging(`${name} ${at(row, indexes.presentation)}`);
    const promo = parsePromo(`${name} ${at(row, indexes.presentation)}`);
    const warnings = [packaging.warning, costInput && cost === null ? "Precio de compra inválido." : null].filter((value): value is string => Boolean(value));
    if (cost === null) warnings.push("Falta precio de compra; no se puede aplicar como costo.");
    return [{
      name,
      presentation: at(row, indexes.presentation) || null,
      supplier_code: at(row, indexes.supplier_code) || null,
      sku: null,
      barcode: at(row, indexes.barcode) || null,
      brand: at(row, indexes.brand) || null,
      category: at(row, indexes.category) || null,
      suggested_retail_price_cents: parseMoneyCents(at(row, indexes.suggested_retail_price_cents)),
      source_reference: { sheet: sheetName, row: rowIndex + 2, source_text: row.filter(Boolean).join(" · ") },
      warnings,
      confidence: warnings.length ? 0.65 : 0.95,
      purchase_options: cost === null ? [] : [{ supplier_code: at(row, indexes.supplier_code) || null, purchase_unit: packaging.unit, purchase_unit_label: packaging.label, stock_units_per_purchase: packaging.contents, purchase_price_cents: cost, units_paid: promo.paid, units_bonus: promo.bonus, is_selected: true }],
    }];
  });
}

export function visualInterpretationMessage(format: string) {
  return `${format.toUpperCase()} se conservó como original. La interpretación visual asistida requiere configurar SUPPLIER_LISTS_AI_URL en la Edge Function; no se envió el archivo ni se escribieron productos.`;
}
