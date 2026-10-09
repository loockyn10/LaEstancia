import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";
import { detectSupplierHeader, detectSupplierPdfText, detectSupplierRows, extractPdfTextPages, readSupplierSpreadsheet, shouldUseVisualPdfFallback, supplierColumnMapping, supplierListLimits, toDetectedSupplierProducts, type DetectedSupplierProduct, type PdfTextPage, type SupplierColumn, type SupplierColumnMapping, type SupplierSpreadsheet, type VisualDetectedProduct, visualInterpretationMessage } from "./supplier-price-list-import";
import { createProductUpdates, includeUpdates, matchingSelectionPatch } from "./supplier-price-list-matching";

type Role = "owner" | "admin" | "staff";
type Supplier = { id: string; name: string; is_active: boolean };
type Variant = { id: string; label: string; barcode: string };
type List = { id: string; supplier_id: string; file_name: string; file_path: string; file_format: string; mime_type: string; list_date: string | null; status: "draft" | "reviewed" | "applied"; created_at: string };
type Item = { id: string; detected_name: string; detected_presentation: string | null; supplier_code: string | null; barcode: string | null; suggested_retail_price_cents: number | null; product_variant_id: string | null; match_status: string; create_catalog_product: boolean; apply_to_catalog: boolean; warnings: string[]; supplier_purchase_options: Array<{ id: string; purchase_unit: string; stock_units_per_purchase: number; purchase_price_cents: number; units_paid: number; units_bonus: number; effective_unit_cost_cents: number; is_selected: boolean }> };
type UntypedResponse = { data: unknown; error: { message: string } | null };
type UntypedQuery = PromiseLike<UntypedResponse> & { select: (...args: unknown[]) => UntypedQuery; eq: (...args: unknown[]) => UntypedQuery; order: (...args: unknown[]) => UntypedQuery; insert: (...args: unknown[]) => UntypedQuery; update: (...args: unknown[]) => UntypedQuery; delete: (...args: unknown[]) => UntypedQuery; single: () => UntypedQuery };
type UntypedDatabaseClient = { from: (table: string) => UntypedQuery; rpc: (fn: string, args: Record<string, unknown>) => Promise<UntypedResponse> };
type FunctionClient = { functions: { invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: { message: string; context?: Response } | null }> } };

function firstErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of ["error", "message", "msg"]) {
    if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
  }
  return null;
}

async function describeFunctionError(error: { message?: unknown; context?: unknown }): Promise<string> {
  const context = error.context;
  if (context instanceof Response) {
    const text = await context.text().catch(() => "");
    if (text.trim()) {
      try {
        const body = JSON.parse(text) as unknown;
        return firstErrorMessage(body) ?? text.trim();
      } catch {
        return text.trim();
      }
    }
  } else if (context && typeof context === "object") {
    const contextObject = context as Record<string, unknown>;
    const body = contextObject.body;
    if (typeof body === "string" && body.trim()) {
      try {
        const parsed = JSON.parse(body) as unknown;
        return firstErrorMessage(parsed) ?? body.trim();
      } catch {
        return body.trim();
      }
    }
    return firstErrorMessage(body) ?? firstErrorMessage(contextObject) ?? String(error.message ?? "");
  }
  return typeof error.message === "string" ? error.message : "";
}
const manager = (role: Role) => role === "owner" || role === "admin";
const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function SupplierPriceLists({ businessId, role, variants }: { businessId: string; role: Role; variants: Variant[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [lists, setLists] = useState<List[]>([]); const [selected, setSelected] = useState<List | null>(null); const [items, setItems] = useState<Item[]>([]);
  const [supplierId, setSupplierId] = useState(""); const [file, setFile] = useState<File | null>(null); const [spreadsheet, setSpreadsheet] = useState<SupplierSpreadsheet | null>(null); const [sheetName, setSheetName] = useState(""); const [headerRowIndex, setHeaderRowIndex] = useState(0); const [columnMapping, setColumnMapping] = useState<SupplierColumnMapping>({}); const [pdfPages, setPdfPages] = useState<PdfTextPage[] | null>(null); const [detected, setDetected] = useState<DetectedSupplierProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [progress, setProgress] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const editable = manager(role);
  const load = useCallback(async () => {
    const client = getSupabaseClient(); if (!client) return;
    const db = client as unknown as UntypedDatabaseClient;
    const [supplierResult, listResult] = await Promise.all([client.from("suppliers").select("id,name,is_active").eq("business_id", businessId).order("name"), db.from("supplier_price_lists").select("id,supplier_id,file_name,file_path,file_format,mime_type,list_date,status,created_at").eq("business_id", businessId).order("created_at", { ascending: false })]);
    if (supplierResult.error || listResult.error) return setError("No pudimos cargar las listas de proveedores.");
    setSuppliers(supplierResult.data ?? []); setLists((listResult.data as List[] | null) ?? []);
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  const supplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? "Proveedor";
  const metrics = useMemo(() => ({ total: items.length, linked: items.filter((item) => item.product_variant_id).length, review: items.filter((item) => !item.product_variant_id && !item.create_catalog_product).length }), [items]);
  async function loadItems(list: List) {
    const client = getSupabaseClient(); if (!client) return; const db = client as unknown as UntypedDatabaseClient;
    setSelected(list); setError(null); setNotice(null);
    const { data, error: loadError } = await db.from("supplier_catalog_items").select("id,detected_name,detected_presentation,supplier_code,barcode,suggested_retail_price_cents,product_variant_id,match_status,create_catalog_product,apply_to_catalog,warnings,supplier_purchase_options(id,purchase_unit,stock_units_per_purchase,purchase_price_cents,units_paid,units_bonus,effective_unit_cost_cents,is_selected)").eq("price_list_id", list.id).eq("business_id", businessId).order("created_at");
    if (loadError) return setError("No pudimos cargar los productos detectados."); setItems((data as Item[] | null) ?? []);
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null; setFile(next); setSpreadsheet(null); setPdfPages(null); setDetected(null); setError(null); setNotice(null); setProgress(null);
    if (!next) return; const format = extension(next.name);
    if (!["csv", "xlsx", "pdf", "jpg", "jpeg", "png"].includes(format)) { setFile(null); return setError("Elegí CSV, XLSX, PDF, JPG, JPEG o PNG."); }
    if (next.size > supplierListLimits.maxFileBytes) { setFile(null); return setError("La lista supera el límite de 20 MB."); }
    if (format === "csv" || format === "xlsx") try { const book = await readSupplierSpreadsheet(next); const firstSheet = book.sheetNames[0]; const header = detectSupplierHeader(book.sheets[firstSheet]); setSpreadsheet(book); setSheetName(firstSheet); setHeaderRowIndex(header.rowIndex); setColumnMapping(header.mapping); setNotice(header.confidence ? `Encabezados detectados en fila ${header.rowIndex + 1}. Podés corregirlos antes de interpretar.` : "No detectamos encabezados con confianza; elegí la fila y mapeá las columnas."); } catch (readError) { setError(readError instanceof Error ? readError.message : "No pudimos leer el archivo."); }
    else if (format === "pdf") try { const pages = await extractPdfTextPages(next, (current, total) => setProgress(`Leyendo texto de página ${current} de ${total}…`)); setPdfPages(pages); setProgress(null); setNotice(`PDF · ${pages.length} páginas. Se intentará interpretar texto seleccionable antes de usar visión.`); } catch (readError) { setError(readError instanceof Error ? readError.message : "No pudimos leer el PDF."); setProgress(null); }
    else setNotice(visualInterpretationMessage(format));
  }
  async function interpret() {
    if (spreadsheet && sheetName) try { const next = detectSupplierRows(spreadsheet.sheets[sheetName], sheetName, { headerRowIndex, mapping: columnMapping }); setDetected(next); setError(null); setNotice(`${next.length} productos detectados determinísticamente.`); return; } catch (interpretError) { setError(interpretError instanceof Error ? interpretError.message : "No pudimos interpretar la hoja."); return; }
    if (pdfPages) {
      const next = detectSupplierPdfText(pdfPages);
      if (!shouldUseVisualPdfFallback(pdfPages, next)) { setDetected(next); setNotice(`${next.length} productos detectados desde texto seleccionable. Revisá la muestra antes de guardar.`); return; }
    }
    await interpretVisually();
  }

  async function createDraftAndUpload() {
    if (!file || !supplierId) throw new Error("Elegí proveedor y archivo antes de continuar.");
    const client = getSupabaseClient(); if (!client) throw new Error("Falta configurar Supabase.");
    const db = client as unknown as UntypedDatabaseClient; const { data: session } = await client.auth.getUser(); if (!session.user) throw new Error("Tu sesión ya no está disponible.");
    const id = crypto.randomUUID(); const format = extension(file.name); const path = `${businessId}/${id}/original.${format}`;
    const header = await db.from("supplier_price_lists").insert({ id, business_id: businessId, supplier_id: supplierId, file_name: file.name, file_path: path, file_format: format, mime_type: file.type || "application/octet-stream", created_by: session.user.id }).select("id,supplier_id,file_name,file_path,file_format,mime_type,list_date,status,created_at").single();
    if (header.error || !header.data) throw new Error("No pudimos crear el borrador de la lista.");
    const upload = await client.storage.from("supplier-price-lists").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upload.error) { await db.from("supplier_price_lists").delete().eq("id", id).eq("business_id", businessId); throw new Error("No pudimos conservar el archivo original."); }
    return { client, db, id, path, format, header: header.data as List };
  }

  async function interpretVisually() {
    if (!file || !supplierId) return setError("Elegí proveedor y archivo antes de interpretar.");
    setBusy(true); setError(null); setNotice(null); setProgress("Preparando archivo para interpretación visual…");
    let draft: Awaited<ReturnType<typeof createDraftAndUpload>> | null = null;
    const candidates: DetectedSupplierProduct[] = [];
    try {
      draft = await createDraftAndUpload();
      setProgress(`Interpretando ${file.type === "application/pdf" ? "PDF completo" : "imagen"}…`);
      const invoke = await (draft.client as unknown as FunctionClient).functions.invoke("interpret-supplier-price-list", { body: { business_id: businessId, file_path: draft.path, mime_type: file.type || "application/octet-stream", file_format: draft.format } });
      if (invoke.error) {
        throw new Error(await describeFunctionError(invoke.error));
      }
      const response = invoke.data as { products?: VisualDetectedProduct[] } | null;
      if (!response || !Array.isArray(response.products)) throw new Error("La interpretación visual devolvió una respuesta inválida.");
      candidates.push(...toDetectedSupplierProducts(response.products));
      if (!candidates.length) throw new Error("No se detectaron productos. Revisá el archivo o corregí manualmente la lista.");
      const saved = await draft.db.rpc("save_supplier_price_list_items", { target_business_id: businessId, target_price_list_id: draft.id, detected_items: candidates });
      if (saved.error) throw new Error(`El archivo quedó como borrador, pero no se pudieron guardar los productos: ${saved.error.message}`);
      await load(); await loadItems(draft.header); setNotice(`${candidates.length} productos detectados. Revisá matching y opciones antes de aplicar.`);
    } catch (interpretError) {
      if (draft && candidates.length) {
        const saved = await draft.db.rpc("save_supplier_price_list_items", { target_business_id: businessId, target_price_list_id: draft.id, detected_items: candidates });
        if (!saved.error) { await load(); await loadItems(draft.header); setNotice(`${candidates.length} productos detectados antes del error. Podés revisarlos; las páginas restantes requieren reintento.`); }
      }
      setError(interpretError instanceof Error ? interpretError.message : "No pudimos interpretar visualmente el archivo.");
    }
    finally { setBusy(false); setProgress(null); }
  }
  async function retryInterpretation(list: List) {
    if (list.status !== "draft") return;
    const client = getSupabaseClient();
    if (!client) return setError("Falta configurar Supabase.");
    const db = client as unknown as UntypedDatabaseClient;
    setBusy(true); setError(null); setNotice(null); setProgress("Reintentando interpretación con el archivo original…");
    try {
      let candidates: DetectedSupplierProduct[] = [];
      let localPages: PdfTextPage[] | null = null;
      if (list.file_format === "pdf") {
        const original = await client.storage.from("supplier-price-lists").download(list.file_path);
        if (original.error || !original.data) throw new Error("No pudimos recuperar el PDF original para reintentar.");
        const retryFile = new File([await original.data.arrayBuffer()], list.file_name, { type: list.mime_type });
        localPages = await extractPdfTextPages(retryFile, (current, total) => setProgress(`Leyendo texto de página ${current} de ${total}…`));
        candidates = detectSupplierPdfText(localPages);
      }
      if (!candidates.length || (localPages !== null && shouldUseVisualPdfFallback(localPages, candidates))) {
        setProgress(`Interpretando ${list.file_format === "pdf" ? "PDF completo" : "imagen"}…`);
        const invoke = await (client as unknown as FunctionClient).functions.invoke("interpret-supplier-price-list", { body: { business_id: businessId, file_path: list.file_path, mime_type: list.mime_type, file_format: list.file_format } });
        if (invoke.error) throw new Error(await describeFunctionError(invoke.error));
        const response = invoke.data as { products?: VisualDetectedProduct[] } | null;
        if (!response || !Array.isArray(response.products) || response.products.length === 0) throw new Error("La interpretación visual no devolvió productos utilizables.");
        candidates = toDetectedSupplierProducts(response.products);
      }
      if (!candidates.length) throw new Error("No se detectaron productos utilizables.");
      // The RPC replaces only unconfirmed staging for this same list, so a retry
      // cannot duplicate candidates or touch the real catalogue.
      const saved = await db.rpc("save_supplier_price_list_items", { target_business_id: businessId, target_price_list_id: list.id, detected_items: candidates });
      if (saved.error) throw new Error(`No pudimos guardar los productos reintentados: ${saved.error.message}`);
      const reviewed = { ...list, status: "reviewed" as const };
      await load(); await loadItems(reviewed); setNotice(`${candidates.length} productos detectados. La lista quedó lista para revisión.`);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "No pudimos reintentar la interpretación.");
    } finally { setBusy(false); setProgress(null); }
  }
  async function stage() {
    if (!file || !supplierId) return setError("Elegí proveedor y archivo antes de continuar.");
    if (spreadsheet && !detected) return setError("Interpretá la hoja antes de guardar la revisión.");
    if (detected && (!detected.length || detected.some((item) => !item.purchase_options.length))) return setError("Corregí las filas sin costo válido antes de guardar la revisión.");
    const client = getSupabaseClient(); if (!client) return setError("Falta configurar Supabase."); const db = client as unknown as UntypedDatabaseClient; const { data: session } = await client.auth.getUser(); if (!session.user) return setError("Tu sesión ya no está disponible.");
    const id = crypto.randomUUID(); const format = extension(file.name); const path = `${businessId}/${id}/original.${format}`;
    setBusy(true); setError(null); setNotice(null);
    const header = await db.from("supplier_price_lists").insert({ id, business_id: businessId, supplier_id: supplierId, file_name: file.name, file_path: path, file_format: format, mime_type: file.type || "application/octet-stream", created_by: session.user.id }).select("id,supplier_id,file_name,file_path,file_format,mime_type,list_date,status,created_at").single();
    if (header.error || !header.data) { setBusy(false); return setError("No pudimos crear el borrador de la lista."); }
    const stagedHeader = header.data as List;
    const upload = await client.storage.from("supplier-price-lists").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upload.error) { await db.from("supplier_price_lists").delete().eq("id", id).eq("business_id", businessId); setBusy(false); return setError("No pudimos conservar el archivo original."); }
    if (!detected) { setBusy(false); await load(); await loadItems(stagedHeader); return setNotice("Archivo conservado como borrador. La interpretación visual no está configurada; no se detectaron ni aplicaron productos."); }
    const saved = await db.rpc("save_supplier_price_list_items", { target_business_id: businessId, target_price_list_id: id, detected_items: detected });
    setBusy(false); if (saved.error) return setError(`El archivo quedó como borrador, pero no se pudieron guardar los productos: ${saved.error.message}`);
    await load(); setDetected(null); setSpreadsheet(null); setFile(null); await loadItems(stagedHeader); setNotice(`${saved.data as number} productos detectados. Revisá matching y opciones antes de aplicar.`);
  }
  async function saveItem(item: Item, patch: Record<string, unknown>) {
    const client = getSupabaseClient(); if (!client || !selected) return; const db = client as unknown as UntypedDatabaseClient; setBusy(true);
    const result = await db.from("supplier_catalog_items").update(patch).eq("id", item.id).eq("business_id", businessId); setBusy(false);
    if (result.error) return setError("No pudimos guardar la corrección."); await loadItems(selected);
  }
  async function saveItems(updates: Array<{ id: string; patch: Record<string, unknown> }>) {
    const client = getSupabaseClient(); if (!client || !selected || !updates.length) return;
    const db = client as unknown as UntypedDatabaseClient; setBusy(true);
    const results = await Promise.all(updates.map(({ id, patch }) => db.from("supplier_catalog_items").update(patch).eq("id", id).eq("business_id", businessId)));
    setBusy(false);
    if (results.some((result) => result.error)) return setError("No pudimos guardar las acciones masivas.");
    await loadItems(selected);
  }
  async function toggleCreateProducts() { await saveItems(createProductUpdates(items)); }
  async function setAllIncluded(include: boolean) { await saveItems(includeUpdates(items, include)); }
  async function apply() {
    if (!selected || selected.status === "applied") return; if (items.some((item) => item.apply_to_catalog && !item.product_variant_id && !item.create_catalog_product)) return setError("Resolvé cada producto: relacioná una presentación existente o confirmá crear un producto nuevo.");
    if (!window.confirm("Se actualizarán costos actuales mediante su historial oficial. El precio de venta no se modificará.")) return;
    const client = getSupabaseClient(); if (!client) return; const db = client as unknown as UntypedDatabaseClient; setBusy(true); setError(null);
    const result = await db.rpc("apply_supplier_price_list", { target_business_id: businessId, target_price_list_id: selected.id }); setBusy(false);
    if (result.error) return setError(`No se aplicaron cambios: ${result.error.message}`); setNotice(`Lista aplicada: ${Array.isArray(result.data) ? result.data.length : 0} costos actualizados. El PVP sugerido quedó solo como referencia.`); await load(); await loadItems({ ...selected, status: "applied" });
  }
  if (!editable) return <section className="state-box"><h2>Listas de proveedores</h2><p>Podés consultar las listas disponibles; el detalle de costos y la aplicación están reservados a owner y admin.</p></section>;
  return <><header className="page-header"><div><p className="eyebrow">Compras</p><h1>Listas de proveedores</h1><p className="subtle">El archivo se conserva y cada lista se revisa antes de cambiar costos. El PVP sugerido nunca cambia el precio de venta.</p></div></header>
    <section className="form-section import-panel"><h2>1. Importar lista</h2><div className="grid"><label>Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Elegí un proveedor</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Lista de proveedor<input accept=".csv,.xlsx,.pdf,.jpg,.jpeg,.png,text/csv,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseFile(event)} type="file" /></label></div>
      {file && <p className="muted">{file.name} · {extension(file.name).toUpperCase()}{pdfPages ? ` · ${pdfPages.length} páginas` : ""}</p>}
      {spreadsheet && <><label>Hoja<select value={sheetName} onChange={(event) => { const nextSheet = event.target.value; const header = detectSupplierHeader(spreadsheet.sheets[nextSheet]); setSheetName(nextSheet); setHeaderRowIndex(header.rowIndex); setColumnMapping(header.mapping); setDetected(null); }}>{spreadsheet.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Fila de encabezados<select value={headerRowIndex} onChange={(event) => { const nextRow = Number(event.target.value); setHeaderRowIndex(nextRow); setColumnMapping(supplierColumnMapping(spreadsheet.sheets[sheetName][nextRow] ?? [])); setDetected(null); }}>{spreadsheet.sheets[sheetName].slice(0, Math.min(30, spreadsheet.sheets[sheetName].length)).map((row, index) => <option key={index} value={index}>Fila {index + 1}{row.some(Boolean) ? ` · ${row.filter(Boolean).slice(0, 4).join(" | ")}` : " · vacía"}</option>)}</select></label><p className="muted">Encabezados detectados en fila {headerRowIndex + 1}. Revisá el mapeo antes de interpretar.</p><div className="grid">{([['name', 'Producto / descripción'], ['supplier_code', 'Código proveedor'], ['barcode', 'Código de barras'], ['cost', 'Costo'], ['suggested_retail_price_cents', 'PVP sugerido'], ['presentation', 'Presentación'], ['brand', 'Marca'], ['category', 'Categoría']] as Array<[SupplierColumn, string]>).map(([field, label]) => <label key={field}>{label}<select value={columnMapping[field] ?? ""} onChange={(event) => { const value = event.target.value; setColumnMapping((current) => ({ ...current, [field]: value === "" ? undefined : Number(value) })); setDetected(null); }}><option value="">Sin mapear</option>{(spreadsheet.sheets[sheetName][headerRowIndex] ?? []).map((header, index) => <option key={index} value={index}>Columna {index + 1}{header ? ` · ${header}` : ""}</option>)}</select></label>)}</div><div className="form-actions"><button disabled={busy} onClick={() => void interpret()} type="button">Interpretar hoja</button></div></>}
      {file && !spreadsheet && <div className="form-actions"><button disabled={busy} onClick={() => void interpret()} type="button">{busy ? "Interpretando…" : "Interpretar lista"}</button></div>}
      {detected && <><p className="notice">{detected.length} productos detectados determinísticamente. Revisá la muestra antes de guardar.</p><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Código</th><th>EAN</th><th>Costo</th><th>Condición</th><th>Advertencias</th></tr></thead><tbody>{detected.slice(0, 12).map((item, index) => { const option = item.purchase_options[0]; return <tr key={index}><td>{item.name}<br /><small>{item.presentation}</small></td><td>{item.supplier_code ?? "—"}</td><td>{item.barcode ?? "—"}</td><td>{money(option?.purchase_price_cents ?? null)}</td><td>{option ? `${option.purchase_unit_label ?? "unidad"} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}` : "—"}</td><td>{item.warnings.join(" ") || "—"}</td></tr>; })}</tbody></table></div><div className="form-actions"><button disabled={busy} onClick={() => void stage()} type="button">{busy ? "Guardando…" : "Guardar para revisión"}</button></div></>}
    </section>
    <section className="list-section"><h2>Listas recibidas</h2>{!lists.length ? <p className="empty">Todavía no hay listas de proveedores.</p> : <div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>Archivo</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{lists.map((list) => <tr key={list.id}><td>{supplierName(list.supplier_id)}</td><td>{list.file_name}</td><td>{list.list_date ?? new Intl.DateTimeFormat("es-AR").format(new Date(list.created_at))}</td><td><span className="badge">{list.status === "draft" ? "Interpretación pendiente" : list.status === "reviewed" ? "Revisar" : "Aplicada"}</span></td><td>{list.status === "draft" ? <button className="link-button" disabled={busy} onClick={() => void retryInterpretation(list)} type="button">Reintentar interpretación</button> : <button className="link-button" onClick={() => void loadItems(list)} type="button">{list.status === "applied" ? "Ver" : "Revisar"}</button>}</td></tr>)}</tbody></table></div>}</section>
    {selected && <section className="form-section import-panel"><div className="section-header"><div><p className="eyebrow">{supplierName(selected.supplier_id)}</p><h2>2. Matching y preview</h2><p>Los códigos de proveedor quedan vinculados para la próxima lista. Un barcode sólo ayuda a identificar la presentación; no identifica una opción de compra.</p></div></div><div className="import-summary"><strong>{metrics.total} detectados</strong><span>{metrics.linked} relacionados</span><span className={metrics.review ? "invalid-count" : ""}>{metrics.review} por resolver</span></div>
      {!items.length ? <div className="notice"><p>{selected.status === "draft" ? "Interpretación pendiente: no hay candidatos utilizables todavía." : "Esta lista aún no tiene productos interpretados."}</p>{selected.status === "draft" && <button className="secondary compact" disabled={busy} onClick={() => void retryInterpretation(selected)} type="button">{busy ? "Reintentando…" : "Reintentar interpretación"}</button>}</div> : <>{selected.status !== "applied" && <div className="form-actions matching-actions"><button className="secondary compact" disabled={busy || !items.some((item) => !item.product_variant_id)} onClick={() => void toggleCreateProducts()} type="button">{items.some((item) => !item.product_variant_id) && items.filter((item) => !item.product_variant_id).every((item) => item.create_catalog_product) ? "Desmarcar productos nuevos" : "Marcar sin relacionar como producto nuevo"}</button><button className="secondary compact" disabled={busy} onClick={() => void setAllIncluded(true)} type="button">Incluir todos</button><button className="secondary compact" disabled={busy} onClick={() => void setAllIncluded(false)} type="button">Excluir todos</button></div>}<div className="table-wrap"><table><thead><tr><th>Producto / origen</th><th>Opción de compra</th><th>Costo efectivo</th><th>Matching</th><th>Aplicar</th></tr></thead><tbody>{items.map((item) => { const option = item.supplier_purchase_options.find((entry) => entry.is_selected) ?? item.supplier_purchase_options[0]; return <tr key={item.id}><td><strong>{item.detected_name}</strong><br /><small>{item.detected_presentation ?? "—"} · código: {item.supplier_code ?? "—"} · EAN: {item.barcode ?? "—"}</small>{item.warnings.length > 0 && <small className="danger"><br />{item.warnings.join(" ")}</small>}</td><td>{option ? `${option.purchase_unit} x${option.stock_units_per_purchase} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}` : "Inválida"}<br /><small>Compra: {money(option?.purchase_price_cents ?? null)}</small></td><td>{money(option?.effective_unit_cost_cents ?? null)}</td><td>{selected.status === "applied" ? variants.find((variant) => variant.id === item.product_variant_id)?.label ?? "—" : <><select value={item.product_variant_id ?? ""} onChange={(event) => void saveItem(item, matchingSelectionPatch(event.target.value || null))}><option value="">Sin relacionar</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}{variant.barcode ? ` · ${variant.barcode}` : ""}</option>)}</select><label className="check"><input checked={item.create_catalog_product} disabled={Boolean(item.product_variant_id)} onChange={(event) => void saveItem(item, { create_catalog_product: event.target.checked, match_status: event.target.checked ? "review_required" : "unmatched" })} type="checkbox" /> Crear producto nuevo</label></>}</td><td>{selected.status === "applied" ? "Aplicada" : <label className="check"><input checked={item.apply_to_catalog} onChange={(event) => void saveItem(item, { apply_to_catalog: event.target.checked })} type="checkbox" /> Incluir</label>}</td></tr>; })}</tbody></table></div></>}
      {selected.status !== "applied" && items.length > 0 && <div className="form-actions"><button disabled={busy} onClick={() => void apply()} type="button">{busy ? "Aplicando…" : "3. Confirmar y aplicar"}</button></div>}</section>}
    {progress && <p className="notice">{progress}</p>}{notice && <p className="notice">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
