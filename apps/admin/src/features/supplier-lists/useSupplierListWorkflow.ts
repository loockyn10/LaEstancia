import { type ChangeEvent, useMemo, useState } from "react";
import { useConfirm } from "@pet-shop/ui";
import { useQuery } from "../../lib/useQuery";
import { type CatalogVariant } from "../catalog/types";
import { listSuppliers } from "../purchasing/purchasing-api";
import {
  type CatalogItem,
  type ItemPatch,
  type PriceList,
  type VariantPriceInfo,
  applyPriceList,
  createDraftAndUpload,
  downloadOriginal,
  fileExtension,
  interpretVisually,
  listPriceLists,
  loadListItems,
  loadVariantPrices,
  saveDetectedItems,
  updateItems,
} from "./supplier-lists-api";
import {
  type DetectedSupplierProduct,
  type PdfTextPage,
  type SupplierColumnMapping,
  type SupplierSpreadsheet,
  deduplicateDetectedSupplierProducts,
  detectSupplierHeader,
  detectSupplierRows,
  extractPdfTextPages,
  interpretSupplierPdfPages,
  readSupplierSpreadsheet,
  supplierColumnMapping,
  supplierListLimits,
  toDetectedSupplierProducts,
  visualFallbackPages,
  visualInterpretationMessage,
} from "./supplier-price-list-import";
import { barcodeMatchPatch, barcodeVariant, createProductUpdates, findBarcodeConflicts, includeUpdates } from "./supplier-price-list-matching";

const message = (failure: unknown, fallback: string) => (failure instanceof Error ? failure.message : fallback);

/**
 * Flujo completo de listas de proveedor: importar → interpretar (hoja, texto de PDF o visión) → guardar
 * como staging → revisar matching → aplicar. El estado vive acá; la pantalla sólo lo presenta.
 */
export function useSupplierListWorkflow(businessId: string, variants: readonly CatalogVariant[]) {
  const suppliers = useQuery(() => listSuppliers(businessId), [businessId], "No pudimos cargar los proveedores.");
  const lists = useQuery(() => listPriceLists(businessId), [businessId], "No pudimos cargar las listas de proveedores.");
  const { ask, dialog } = useConfirm();

  const [selected, setSelected] = useState<PriceList | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, VariantPriceInfo>>({});
  const [supplierId, setSupplierId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [spreadsheet, setSpreadsheet] = useState<SupplierSpreadsheet | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [columnMapping, setColumnMapping] = useState<SupplierColumnMapping>({});
  const [pdfPages, setPdfPages] = useState<PdfTextPage[] | null>(null);
  const [detected, setDetected] = useState<DetectedSupplierProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingVisualPages, setPendingVisualPages] = useState<Record<string, number[]>>({});

  const metrics = useMemo(
    () => ({ total: items.length, linked: items.filter((item) => item.product_variant_id).length, review: items.filter((item) => !item.product_variant_id && !item.create_catalog_product).length }),
    [items],
  );
  const barcodeConflicts = useMemo(() => findBarcodeConflicts(items), [items]);
  const clearPending = (listId: string) => setPendingVisualPages((current) => { const next = { ...current }; delete next[listId]; return next; });

  async function loadItems(list: PriceList) {
    setSelected(list);
    setError(null);
    setNotice(null);
    try {
      const loaded = await loadListItems(businessId, list.id);
      setVariantPrices(await loadVariantPrices(businessId));
      // Matching automático por barcode (sólo propone: un barcode no identifica una opción de compra).
      const automatic = list.status === "applied" ? [] : loaded.flatMap((item) => {
        if (item.product_variant_id) return [];
        const variant = barcodeVariant(item.barcode, [...variants]);
        return variant ? [{ id: item.id, patch: barcodeMatchPatch(variant.id) as ItemPatch }] : [];
      });
      if (automatic.length) {
        await updateItems(businessId, automatic);
        const patches = new Map(automatic.map((entry) => [entry.id, entry.patch]));
        setItems(loaded.map((item) => ({ ...item, ...(patches.get(item.id) ?? {}) }) as CatalogItem));
        return;
      }
      setItems(loaded);
    } catch {
      setError("No pudimos cargar los productos detectados.");
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setSpreadsheet(null);
    setPdfPages(null);
    setDetected(null);
    setError(null);
    setNotice(null);
    setProgress(null);
    if (!next) return;
    const format = fileExtension(next.name);
    if (!["csv", "xlsx", "pdf", "jpg", "jpeg", "png"].includes(format)) {
      setFile(null);
      return setError("Elegí CSV, XLSX, PDF, JPG, JPEG o PNG.");
    }
    if (next.size > supplierListLimits.maxFileBytes) {
      setFile(null);
      return setError("La lista supera el límite de 20 MB.");
    }
    if (format === "csv" || format === "xlsx") {
      try {
        const book = await readSupplierSpreadsheet(next);
        const firstSheet = book.sheetNames[0];
        const header = detectSupplierHeader(book.sheets[firstSheet]);
        setSpreadsheet(book);
        setSheetName(firstSheet);
        setHeaderRowIndex(header.rowIndex);
        setColumnMapping(header.mapping);
        setNotice(header.confidence ? `Encabezados detectados en fila ${header.rowIndex + 1}. Podés corregirlos antes de interpretar.` : "No detectamos encabezados con confianza; elegí la fila y mapeá las columnas.");
      } catch (failure) {
        setError(message(failure, "No pudimos leer el archivo."));
      }
    } else if (format === "pdf") {
      try {
        const pages = await extractPdfTextPages(next, (current, total) => setProgress(`Leyendo texto de página ${current} de ${total}…`));
        setPdfPages(pages);
        setProgress(null);
        setNotice(`PDF · ${pages.length} páginas. Se intentará interpretar texto seleccionable antes de usar visión.`);
      } catch (failure) {
        setError(message(failure, "No pudimos leer el PDF."));
        setProgress(null);
      }
    } else setNotice(visualInterpretationMessage(format));
  }

  function chooseSheet(nextSheet: string) {
    if (!spreadsheet) return;
    const header = detectSupplierHeader(spreadsheet.sheets[nextSheet]);
    setSheetName(nextSheet);
    setHeaderRowIndex(header.rowIndex);
    setColumnMapping(header.mapping);
    setDetected(null);
  }

  function chooseHeaderRow(nextRow: number) {
    if (!spreadsheet) return;
    setHeaderRowIndex(nextRow);
    setColumnMapping(supplierColumnMapping(spreadsheet.sheets[sheetName][nextRow] ?? []));
    setDetected(null);
  }

  function mapColumn(field: keyof SupplierColumnMapping, index: number | undefined) {
    setColumnMapping((current) => ({ ...current, [field]: index }));
    setDetected(null);
  }

  async function interpret() {
    if (spreadsheet && sheetName) {
      try {
        const next = detectSupplierRows(spreadsheet.sheets[sheetName], sheetName, { headerRowIndex, mapping: columnMapping });
        setDetected(next);
        setError(null);
        setNotice(`${next.length} productos detectados determinísticamente.`);
      } catch (failure) {
        setError(message(failure, "No pudimos interpretar la hoja."));
      }
      return;
    }
    if (pdfPages) {
      const interpreted = interpretSupplierPdfPages(pdfPages);
      const localCandidates = interpreted.flatMap((entry) => entry.products);
      const fallbackPages = interpreted.filter((entry) => entry.requiresVisualFallback).map((entry) => entry.page);
      if (!fallbackPages.length) {
        setDetected(localCandidates);
        setNotice(`${localCandidates.length} productos detectados desde texto seleccionable. Revisá la muestra antes de guardar.`);
        return;
      }
      return interpretFile({ localCandidates, fallbackPages });
    }
    return interpretFile();
  }

  /** Sube el original, interpreta cada página con visión y guarda lo detectado (conserva lo parcial si falla). */
  async function interpretFile(options?: { localCandidates: DetectedSupplierProduct[]; fallbackPages: number[] }) {
    if (!file || !supplierId) return setError("Elegí proveedor y archivo antes de interpretar.");
    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress("Preparando archivo para interpretación visual…");
    let draft: Awaited<ReturnType<typeof createDraftAndUpload>> | null = null;
    const candidates: DetectedSupplierProduct[] = [...(options?.localCandidates ?? [])];
    let remaining = options?.fallbackPages ?? [];
    try {
      draft = await createDraftAndUpload({ businessId, supplierId, file });
      const pages: Array<number | null> = options?.fallbackPages ?? [null];
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        remaining = pages.slice(index).filter((candidate): candidate is number => candidate !== null);
        setProgress(page === null ? "Interpretando imagen…" : `Interpretando visualmente página ${page} (${index + 1}/${pages.length})…`);
        const products = await interpretVisually({ businessId, filePath: draft.path, mimeType: file.type || "application/octet-stream", fileFormat: draft.format, page });
        candidates.push(...toDetectedSupplierProducts(products));
      }
      const unique = deduplicateDetectedSupplierProducts(candidates);
      if (!unique.length) throw new Error("No se detectaron productos. Revisá el archivo o corregí manualmente la lista.");
      try {
        await saveDetectedItems(businessId, draft.id, unique);
      } catch (failure) {
        throw new Error(`El archivo quedó como borrador, pero no se pudieron guardar los productos: ${message(failure, "error desconocido")}`);
      }
      clearPending(draft.id);
      await lists.reload();
      await loadItems({ ...draft.header, status: "reviewed" });
      setNotice(`${unique.length} productos detectados. Revisá matching y opciones antes de aplicar.`);
    } catch (failure) {
      if (draft && candidates.length) {
        const unique = deduplicateDetectedSupplierProducts(candidates);
        try {
          await saveDetectedItems(businessId, draft.id, unique);
          setPendingVisualPages((current) => ({ ...current, [draft!.id]: remaining }));
          await lists.reload();
          await loadItems({ ...draft.header, status: "reviewed" });
          setNotice(`Interpretación parcial — ${unique.length} productos conservados. Podés revisar lo detectado y reintentar las ${remaining.length} páginas pendientes.`);
        } catch {
          /* el borrador queda sin productos; el error original se informa abajo */
        }
      }
      setError(message(failure, "No pudimos interpretar visualmente el archivo."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function retryInterpretation(list: PriceList) {
    if (list.status === "applied") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress("Reintentando interpretación con el archivo original…");
    try {
      let candidates: DetectedSupplierProduct[] = [];
      let localPages: PdfTextPage[] | null = null;
      let fallbackPages: number[] = [];
      if (list.file_format === "pdf") {
        const original = await downloadOriginal(list.file_path);
        const retryFile = new File([await original.arrayBuffer()], list.file_name, { type: list.mime_type });
        localPages = await extractPdfTextPages(retryFile, (current, total) => setProgress(`Leyendo texto de página ${current} de ${total}…`));
        candidates = interpretSupplierPdfPages(localPages).flatMap((entry) => entry.products);
        fallbackPages = pendingVisualPages[list.id] ?? visualFallbackPages(localPages);
      }
      const pages = localPages === null ? [null] : fallbackPages;
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        setProgress(page === null ? "Interpretando imagen…" : `Reintentando página ${page} (${index + 1}/${pages.length})…`);
        const products = await interpretVisually({ businessId, filePath: list.file_path, mimeType: list.mime_type, fileFormat: list.file_format, page });
        if (!products.length) throw new Error("La interpretación visual no devolvió productos utilizables.");
        candidates.push(...toDetectedSupplierProducts(products));
      }
      candidates = deduplicateDetectedSupplierProducts(candidates);
      if (!candidates.length) throw new Error("No se detectaron productos utilizables.");
      try {
        await saveDetectedItems(businessId, list.id, candidates);
      } catch (failure) {
        throw new Error(`No pudimos guardar los productos reintentados: ${message(failure, "error desconocido")}`);
      }
      clearPending(list.id);
      await lists.reload();
      await loadItems({ ...list, status: "reviewed" });
      setNotice(`${candidates.length} productos detectados. La lista quedó lista para revisión.`);
    } catch (failure) {
      setError(message(failure, "No pudimos reintentar la interpretación."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  /** Guarda el archivo original y lo detectado como staging para revisión (sin tocar el catálogo). */
  async function stage() {
    if (!file || !supplierId) return setError("Elegí proveedor y archivo antes de continuar.");
    if (spreadsheet && !detected) return setError("Interpretá la hoja antes de guardar la revisión.");
    if (detected && (!detected.length || detected.some((item) => !item.purchase_options.length))) return setError("Corregí las filas sin costo válido antes de guardar la revisión.");
    setBusy(true);
    setError(null);
    setNotice(null);
    let draft;
    try {
      draft = await createDraftAndUpload({ businessId, supplierId, file });
    } catch (failure) {
      setBusy(false);
      return setError(message(failure, "No pudimos crear el borrador de la lista."));
    }
    if (!detected) {
      setBusy(false);
      await lists.reload();
      await loadItems(draft.header);
      return setNotice("Archivo conservado como borrador. La interpretación visual no está configurada; no se detectaron ni aplicaron productos.");
    }
    try {
      const saved = await saveDetectedItems(businessId, draft.id, detected);
      await lists.reload();
      setDetected(null);
      setSpreadsheet(null);
      setFile(null);
      await loadItems(draft.header);
      setNotice(`${saved} productos detectados. Revisá matching y opciones antes de aplicar.`);
    } catch (failure) {
      setError(`El archivo quedó como borrador, pero no se pudieron guardar los productos: ${message(failure, "error desconocido")}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveItems(updates: Array<{ id: string; patch: ItemPatch }>, failure: string) {
    if (!selected || !updates.length) return;
    setBusy(true);
    try {
      await updateItems(businessId, updates);
    } catch {
      setBusy(false);
      return setError(failure);
    }
    setBusy(false);
    await loadItems(selected);
  }

  const saveItem = (item: CatalogItem, patch: ItemPatch) => saveItems([{ id: item.id, patch }], "No pudimos guardar la corrección.");
  const toggleCreateProducts = () => saveItems(createProductUpdates(items) as Array<{ id: string; patch: ItemPatch }>, "No pudimos guardar las acciones masivas.");
  const setAllIncluded = (include: boolean) => saveItems(includeUpdates(items, include) as Array<{ id: string; patch: ItemPatch }>, "No pudimos guardar las acciones masivas.");

  async function apply() {
    if (!selected || selected.status === "applied") return;
    if (items.some((item) => item.apply_to_catalog && !item.product_variant_id && !item.create_catalog_product)) return setError("Resolvé cada producto: relacioná una presentación existente o confirmá crear un producto nuevo.");
    if (barcodeConflicts.length) return setError(`Hay barcodes repetidos asociados a productos diferentes: ${barcodeConflicts.map((conflict) => conflict.barcode).join(", ")}. Resolvé los conflictos antes de aplicar.`);
    const forcedExisting = items.find((item) => item.apply_to_catalog && item.create_catalog_product && barcodeVariant(item.barcode, [...variants]));
    if (forcedExisting) return setError(`El código de barras ${forcedExisting.barcode} ya pertenece a ${barcodeVariant(forcedExisting.barcode, [...variants])?.label}. Relacioná esta fila con esa presentación o quitá el barcode.`);
    const confirmed = await ask({
      title: "Aplicar lista de proveedor",
      message: "Se actualizarán costos mediante su historial oficial. Los productos nuevos con PVP iniciarán su precio de venta; los precios manuales existentes no se modificarán.",
      confirmLabel: "Confirmar y aplicar",
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await applyPriceList(businessId, selected.id);
      setNotice(`Lista aplicada: ${updated} costos actualizados y precios PVP sincronizados cuando corresponde.`);
      await lists.reload();
      await loadItems({ ...selected, status: "applied" });
    } catch (failure) {
      setError(`No se aplicaron cambios: ${message(failure, "error desconocido")}`);
    } finally {
      setBusy(false);
    }
  }

  return {
    suppliers: suppliers.data ?? [],
    lists,
    selected,
    items,
    variantPrices,
    supplierId,
    setSupplierId,
    file,
    spreadsheet,
    sheetName,
    headerRowIndex,
    columnMapping,
    pdfPages,
    detected,
    error,
    notice,
    progress,
    busy,
    pendingVisualPages,
    metrics,
    barcodeConflicts,
    dialog,
    loadItems,
    chooseFile,
    chooseSheet,
    chooseHeaderRow,
    mapColumn,
    interpret,
    stage,
    retryInterpretation,
    saveItem,
    toggleCreateProducts,
    setAllIncluded,
    apply,
  };
}
