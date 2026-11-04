import type { PosOption } from "./types";

/** Minúsculas sin tildes: "Pérro" y "perro" coinciden. */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");

const haystack = (option: PosOption) => fold(`${option.productName} ${option.variantName} ${option.sku} ${option.barcodes.join(" ")}`);

/** Búsqueda por nombre, presentación, SKU o barcode sobre opciones ya cargadas desde IndexedDB (sin red). */
export function searchOptions(
  options: readonly PosOption[],
  query: string,
  excludedVariantIds: ReadonlySet<string> = new Set(),
  limit = 8,
): PosOption[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const found: PosOption[] = [];
  for (const option of options) {
    if (excludedVariantIds.has(option.id) || !haystack(option).includes(needle)) continue;
    found.push(option);
    if (found.length === limit) break;
  }
  return found;
}

/** Coincidencia exacta de barcode (lo que entrega un scanner USB al confirmar con Enter). */
export function findOptionByBarcode(options: readonly PosOption[], code: string): PosOption | null {
  const wanted = code.trim();
  if (!wanted) return null;
  return options.find((option) => option.barcodes.includes(wanted)) ?? null;
}
