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
export type SupplierColumn = "name" | "presentation" | "supplier_code" | "barcode" | "cost" | "suggested_retail_price_cents" | "brand" | "category";
export type SupplierColumnMapping = Partial<Record<SupplierColumn, number>>;
export type SupplierHeaderDetection = { rowIndex: number; confidence: number; headers: string[]; mapping: SupplierColumnMapping };
export type PdfTextPage = { page: number; text: string };
export type PdfPageInterpretation = { page: number; products: DetectedSupplierProduct[]; requiresVisualFallback: boolean };
export type VisualDetectedProduct = {
  name: string;
  presentation?: string | null;
  supplierCode?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  suggestedRetailPriceCents?: number | null;
  purchaseOptions: Array<{
    supplierCode?: string | null;
    purchaseUnit?: "unit" | "box" | "bundle" | "bag" | "other";
    purchaseUnitLabel?: string | null;
    stockUnitsPerPurchase?: number;
    purchasePriceCents: number;
    paidUnits?: number;
    bonusUnits?: number;
  }>;
  source: { page?: number; regionOrReference?: string | null };
  confidence?: number;
  warnings?: string[];
};

export const supplierListLimits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxPdfPages: 40,
} as const;

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
const folded = (value: string) => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const aliases: Record<SupplierColumn, string[]> = {
  name: ["producto", "nombre", "articulo", "artículo", "descripcion", "descripción"],
  presentation: ["presentacion", "presentación", "detalle"],
  supplier_code: ["codigo proveedor", "código proveedor", "codigo interno", "código interno", "codigo", "código"],
  barcode: ["ean", "barcode", "codigo barras", "código barras", "codigo de barras", "código de barras"],
  cost: ["costo", "precio costo", "precio compra", "costo compra", "nueva lista precios", "nueva lista de precios", "precio"],
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

function columnIndex(headers: string[], field: SupplierColumn) {
  const names = aliases[field].map(folded);
  return headers.findIndex((header) => names.includes(folded(header)));
}
function at(row: string[], index: number) { return index < 0 ? "" : row[index]?.trim() ?? ""; }

export function detectSupplierHeader(grid: string[][], maximumRows = 30): SupplierHeaderDetection {
  const candidates = grid.slice(0, Math.max(1, maximumRows)).map((headers, rowIndex) => {
    const mapping = Object.fromEntries((Object.keys(aliases) as SupplierColumn[]).map((field) => [field, columnIndex(headers, field)] as const).filter(([, index]) => index >= 0)) as SupplierColumnMapping;
    const matched = Object.keys(mapping) as SupplierColumn[];
    const score = matched.reduce((total, field) => total + (field === "name" || field === "cost" ? 3 : 2), 0);
    return { rowIndex, confidence: score, headers, mapping };
  });
  const best = candidates.reduce((winner, candidate) => candidate.confidence > winner.confidence ? candidate : winner, candidates[0] ?? { rowIndex: 0, confidence: 0, headers: [], mapping: {} });
  return best;
}

export function supplierColumnMapping(headers: string[]): SupplierColumnMapping {
  return Object.fromEntries((Object.keys(aliases) as SupplierColumn[]).map((field) => [field, columnIndex(headers, field)] as const).filter(([, index]) => index >= 0)) as SupplierColumnMapping;
}

function parseSupplierMoneyCents(input: string): number | null {
  const conventional = parseMoneyCents(input);
  if (conventional !== null) return conventional;
  const value = input.replace(/[$\s]/g, "");
  // XLSX numeric cells occasionally arrive as binary floating-point tails
  // (for example 8014.177500000001). Treat long fractional tails as a decimal
  // number and round to cents, while the conventional parser keeps 1.234 as
  // an Argentine thousands separator.
  const match = value.match(/^(\d+)[.,](\d{3,})$/);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = match[2].padEnd(3, "0");
  const cents = BigInt(fraction.slice(0, 2));
  const rounded = cents + (fraction[2] >= "5" ? 1n : 0n);
  const result = whole * 100n + rounded;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
function parsePromo(value: string) {
  const match = value.match(/(?:promo(?:ción)?\s*)?(\d+)\s*\+\s*(\d+)/i);
  return match ? { paid: Number(match[1]), bonus: Number(match[2]) } : { paid: 1, bonus: 0 };
}
function parsePackaging(value: string) {
  const match = value.match(/\b(caja|bulto|bolsa|pack)\s*(?:x|de)?\s*(\d+(?:[.,]\d{1,3})?)|\b(?:unidades?\s+de\s+venta|unidades?|uds?)\s*[:x-]?\s*(\d+(?:[.,]\d{1,3})?)\b|\b(\d+(?:[.,]\d{1,3})?)\s*u\b/i);
  if (!match) return { unit: "unit" as const, label: null, contents: 1, warning: null };
  const unit = match[1]?.toLocaleLowerCase("es-AR") ?? "unit";
  const contents = Number((match[2] ?? match[3] ?? match[4]).replace(",", "."));
  return { unit: unit === "caja" ? "box" as const : unit === "bulto" ? "bundle" as const : unit === "bolsa" ? "bag" as const : "other" as const, label: match[0], contents, warning: `Presentación inferida: ${match[0]}.` };
}

export async function extractPdfTextPages(file: File, onProgress?: (current: number, total: number) => void): Promise<PdfTextPage[]> {
  if (file.size > supplierListLimits.maxFileBytes) throw new Error("El PDF supera el límite de 20 MB.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (document.numPages > supplierListLimits.maxPdfPages) throw new Error(`El PDF tiene ${document.numPages} páginas; el límite es ${supplierListLimits.maxPdfPages}.`);
  const pages: PdfTextPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    pages.push({ page: pageNumber, text });
    onProgress?.(pageNumber, document.numPages);
  }
  return pages;
}

const labelledValue = (line: string, label: RegExp) => line.match(label)?.[1]?.trim() ?? null;
const productHeading = (line: string) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(line)
  && !/(costo|compra|pvp|precio|valor\s*x\s*bulto|unidades?\s+de\s+venta|ean|barcode|c[oó]digo|art[íi]culo|^\s*(?:\d+[+x]|caja|bulto|bolsa|pack|\d+u))/i.test(line)
  && line.length >= 3;

const purchasePriceLabel = /(?:precio\s*(?:de\s+)?compra|precio\s+costo|costo|valor\s*x\s*bulto|precio\s*(?:\+\s*iva)?)(?!\s*(?:de\s+venta|sugerido))/i;
const purchasePriceValue = /(?:precio\s*(?:de\s+)?compra|precio\s+costo|costo|valor\s*x\s*bulto|precio\s*(?:\+\s*iva)?)(?!\s*(?:de\s+venta|sugerido))\s*[:$-]*\s*([^·]+)/i;
const presentationValue = /(?:presentaci[oó]n|detalle)\s*[:-]*\s*([^·]+)/i;

function splitNameAndPresentation(value: string) {
  const match = value.match(/^(.*?)(?:\s*[·,/-]\s*|\s+)(\d+(?:[.,]\d+)?\s*(?:kg|kgs?|g|gr|grs|ml|l|lts?|u|un(?:idades?)?))$/i);
  return match ? { name: match[1].trim(), presentation: match[2].trim() } : { name: value, presentation: null };
}

function countPurchasePriceSignals(text: string) {
  return text.split(/\r?\n/).filter((line) => purchasePriceLabel.test(line)).length;
}

/** Conservative parser for selectable PDF text. It produces candidates only
 * when a product block carries a valid purchase price; visual interpretation
 * handles graphic catalogues and ambiguous layouts. */
export function detectSupplierPdfText(pages: PdfTextPage[]): DetectedSupplierProduct[] {
  const detected: DetectedSupplierProduct[] = [];
  for (const page of pages) {
    let current: { name: string; lines: string[]; category: string | null } | null = null;
    let category: string | null = null;
    const flush = () => {
      if (!current) return;
      const joined = current.lines.join(" · ");
      const costText = labelledValue(joined, purchasePriceValue);
      const cost = costText ? parseSupplierMoneyCents(costText) : null;
      if (cost !== null) {
        const inferred = splitNameAndPresentation(current.name);
        const presentation = labelledValue(joined, presentationValue) ?? inferred.presentation;
        const supplierCode = labelledValue(joined, /(?:c[oó]digo(?:\s+interno)?|art(?:[íi]culo)?)\s*[:#-]*\s*([A-Za-z0-9._/-]+)/i);
        const barcode = labelledValue(joined, /(?:ean|barcode|c[oó]digo\s+de\s+barras)\s*[:#-]*\s*([A-Za-z0-9]+)/i);
        const pvpText = labelledValue(joined, /(?:pvp|precio\s+(?:de\s+)?venta\s+sugerido|precio\s+sugerido)\s*[:$-]*\s*([^·]+)/i);
        const packaging = parsePackaging(`${current.name} ${presentation ?? ""} ${joined}`);
        const promo = parsePromo(joined);
        detected.push({
          name: inferred.name,
          presentation,
          supplier_code: supplierCode,
          sku: null,
          barcode,
          brand: null,
          category: current.category,
          suggested_retail_price_cents: pvpText ? parseSupplierMoneyCents(pvpText) : null,
          source_reference: { page: page.page, source_text: joined },
          warnings: [packaging.warning, current.category ? "Categoría sugerida desde el encabezado de página." : null].filter((value): value is string => Boolean(value)),
          confidence: 0.8,
          purchase_options: [{ supplier_code: supplierCode, purchase_unit: packaging.unit, purchase_unit_label: packaging.label, stock_units_per_purchase: packaging.contents, purchase_price_cents: cost, units_paid: promo.paid, units_bonus: promo.bonus, is_selected: true }],
        });
      }
      current = null;
    };
    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^[A-ZÁÉÍÓÚÜÑ\s&/-]{4,}$/.test(line) && !/\d/.test(line)) { flush(); category = line; continue; }
      if (productHeading(line)) { flush(); current = { name: line, lines: [line], category }; continue; }
      if (current) current.lines.push(line);
    }
    flush();
  }
  return detected;
}

/** Decide independently per page: a difficult page must not discard the others. */
export function interpretSupplierPdfPages(pages: PdfTextPage[]): PdfPageInterpretation[] {
  return pages.map((page) => {
    const products = detectSupplierPdfText([page]);
    const signals = countPurchasePriceSignals(page.text);
    return { page: page.page, products, requiresVisualFallback: products.length === 0 || signals > products.length };
  });
}

export function visualFallbackPages(pages: PdfTextPage[]) {
  return interpretSupplierPdfPages(pages).filter((entry) => entry.requiresVisualFallback).map((entry) => entry.page);
}

/** Backwards-compatible aggregate helper for callers that only need a yes/no. */
export function shouldUseVisualPdfFallback(pages: PdfTextPage[], products: DetectedSupplierProduct[]) {
  return products.length === 0 || visualFallbackPages(pages).length > 0;
}

export function deduplicateDetectedSupplierProducts(products: DetectedSupplierProduct[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const option = product.purchase_options[0];
    const key = [product.supplier_code ?? "", product.barcode ?? "", normalize(product.name), product.presentation ?? "", option?.purchase_price_cents ?? ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toDetectedSupplierProducts(products: VisualDetectedProduct[]): DetectedSupplierProduct[] {
  return products.map((product) => ({
    name: product.name.trim(),
    presentation: product.presentation?.trim() || null,
    supplier_code: product.supplierCode?.trim() || null,
    sku: null,
    barcode: product.barcode?.trim() || null,
    brand: product.brand?.trim() || null,
    category: product.category?.trim() || null,
    suggested_retail_price_cents: product.suggestedRetailPriceCents ?? null,
    source_reference: { page: product.source.page ?? null, region_or_reference: product.source.regionOrReference ?? null },
    warnings: product.warnings ?? [],
    confidence: product.confidence ?? 0.5,
    purchase_options: product.purchaseOptions.map((option) => ({
      supplier_code: option.supplierCode?.trim() || product.supplierCode?.trim() || null,
      purchase_unit: option.purchaseUnit ?? "other",
      purchase_unit_label: option.purchaseUnitLabel?.trim() || null,
      stock_units_per_purchase: option.stockUnitsPerPurchase ?? 1,
      purchase_price_cents: option.purchasePriceCents,
      units_paid: option.paidUnits ?? 1,
      units_bonus: option.bonusUnits ?? 0,
      is_selected: true,
    })),
  }));
}

/** Deterministic adapter for tabular supplier lists.  It intentionally never
 * guesses a catalogue match; that happens after staging, by stable code/EAN. */
export function detectSupplierRows(grid: string[][], sheetName: string, options?: { headerRowIndex?: number; mapping?: SupplierColumnMapping }): DetectedSupplierProduct[] {
  const detection = detectSupplierHeader(grid);
  const headerRowIndex = options?.headerRowIndex ?? detection.rowIndex;
  const headers = grid[headerRowIndex] ?? [];
  const mapping = options?.mapping ?? supplierColumnMapping(headers);
  const indexes = Object.fromEntries((Object.keys(aliases) as SupplierColumn[]).map((field) => [field, mapping[field] ?? -1])) as Record<SupplierColumn, number>;
  if (indexes.name < 0) throw new Error("Mapeá o renombrá una columna de producto/nombre antes de continuar.");
  let section: string | null = null;
  return grid.slice(headerRowIndex + 1).flatMap((row, rowIndex) => {
    const populated = row.filter((value) => value.trim());
    const matchingHeaders = row.reduce((count, value, index) => count + (value && folded(value) === folded(headers[index] ?? "") ? 1 : 0), 0);
    if (matchingHeaders >= 2) return [];
    const name = at(row, indexes.name);
    if (!name) return [];
    const costInput = at(row, indexes.cost);
    const hasIdentifier = Boolean(at(row, indexes.supplier_code) || at(row, indexes.barcode));
    if (populated.length === 1 && !costInput && !hasIdentifier) { section = name; return []; }
    const cost = parseSupplierMoneyCents(costInput);
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
      category: at(row, indexes.category) || section,
      suggested_retail_price_cents: parseSupplierMoneyCents(at(row, indexes.suggested_retail_price_cents)),
      source_reference: { sheet: sheetName, row: headerRowIndex + rowIndex + 2, source_text: row.filter(Boolean).join(" · ") },
      warnings,
      confidence: warnings.length ? 0.65 : 0.95,
      purchase_options: cost === null ? [] : [{ supplier_code: at(row, indexes.supplier_code) || null, purchase_unit: packaging.unit, purchase_unit_label: packaging.label, stock_units_per_purchase: packaging.contents, purchase_price_cents: cost, units_paid: promo.paid, units_bonus: promo.bonus, is_selected: true }],
    }];
  });
}

export function visualInterpretationMessage(format: string) {
  return `${format.toUpperCase()} requiere interpretación visual server-side. La IA sólo devuelve candidatos para revisión; no crea productos ni modifica costos.`;
}
