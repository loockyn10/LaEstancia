import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";
import { detectSupplierRows, readSupplierSpreadsheet, type DetectedSupplierProduct, type SupplierSpreadsheet, visualInterpretationMessage } from "./supplier-price-list-import";

type Role = "owner" | "admin" | "staff";
type Supplier = { id: string; name: string; is_active: boolean };
type Variant = { id: string; label: string; barcode: string };
type List = { id: string; supplier_id: string; file_name: string; file_format: string; list_date: string | null; status: "draft" | "reviewed" | "applied"; created_at: string };
type Item = { id: string; detected_name: string; detected_presentation: string | null; supplier_code: string | null; barcode: string | null; suggested_retail_price_cents: number | null; product_variant_id: string | null; match_status: string; create_catalog_product: boolean; apply_to_catalog: boolean; warnings: string[]; supplier_purchase_options: Array<{ id: string; purchase_unit: string; stock_units_per_purchase: number; purchase_price_cents: number; units_paid: number; units_bonus: number; effective_unit_cost_cents: number; is_selected: boolean }> };
type UntypedResponse = { data: unknown; error: { message: string } | null };
type UntypedQuery = PromiseLike<UntypedResponse> & { select: (...args: unknown[]) => UntypedQuery; eq: (...args: unknown[]) => UntypedQuery; order: (...args: unknown[]) => UntypedQuery; insert: (...args: unknown[]) => UntypedQuery; update: (...args: unknown[]) => UntypedQuery; delete: (...args: unknown[]) => UntypedQuery; single: () => UntypedQuery };
type UntypedDatabaseClient = { from: (table: string) => UntypedQuery; rpc: (fn: string, args: Record<string, unknown>) => Promise<UntypedResponse> };
const manager = (role: Role) => role === "owner" || role === "admin";
const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function SupplierPriceLists({ businessId, role, variants }: { businessId: string; role: Role; variants: Variant[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [lists, setLists] = useState<List[]>([]); const [selected, setSelected] = useState<List | null>(null); const [items, setItems] = useState<Item[]>([]);
  const [supplierId, setSupplierId] = useState(""); const [file, setFile] = useState<File | null>(null); const [spreadsheet, setSpreadsheet] = useState<SupplierSpreadsheet | null>(null); const [sheetName, setSheetName] = useState(""); const [detected, setDetected] = useState<DetectedSupplierProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const editable = manager(role);
  const load = useCallback(async () => {
    const client = getSupabaseClient(); if (!client) return;
    const db = client as unknown as UntypedDatabaseClient;
    const [supplierResult, listResult] = await Promise.all([client.from("suppliers").select("id,name,is_active").eq("business_id", businessId).order("name"), db.from("supplier_price_lists").select("id,supplier_id,file_name,file_format,list_date,status,created_at").eq("business_id", businessId).order("created_at", { ascending: false })]);
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
    const next = event.target.files?.[0] ?? null; setFile(next); setSpreadsheet(null); setDetected(null); setError(null); setNotice(null);
    if (!next) return; const format = extension(next.name);
    if (!["csv", "xlsx", "pdf", "jpg", "jpeg", "png"].includes(format)) { setFile(null); return setError("Elegí CSV, XLSX, PDF, JPG, JPEG o PNG."); }
    if (format === "csv" || format === "xlsx") try { const book = await readSupplierSpreadsheet(next); setSpreadsheet(book); setSheetName(book.sheetNames[0]); } catch (readError) { setError(readError instanceof Error ? readError.message : "No pudimos leer el archivo."); }
    else setNotice(visualInterpretationMessage(format));
  }
  function interpret() {
    if (!spreadsheet || !sheetName) return; try { const next = detectSupplierRows(spreadsheet.sheets[sheetName], sheetName); setDetected(next); setError(null); } catch (interpretError) { setError(interpretError instanceof Error ? interpretError.message : "No pudimos interpretar la hoja."); }
  }
  async function stage() {
    if (!file || !supplierId) return setError("Elegí proveedor y archivo antes de continuar.");
    if (spreadsheet && !detected) return setError("Interpretá la hoja antes de guardar la revisión.");
    if (detected && (!detected.length || detected.some((item) => !item.purchase_options.length))) return setError("Corregí las filas sin costo válido antes de guardar la revisión.");
    const client = getSupabaseClient(); if (!client) return setError("Falta configurar Supabase."); const db = client as unknown as UntypedDatabaseClient; const { data: session } = await client.auth.getUser(); if (!session.user) return setError("Tu sesión ya no está disponible.");
    const id = crypto.randomUUID(); const format = extension(file.name); const path = `${businessId}/${id}/original.${format}`;
    setBusy(true); setError(null); setNotice(null);
    const header = await db.from("supplier_price_lists").insert({ id, business_id: businessId, supplier_id: supplierId, file_name: file.name, file_path: path, file_format: format, mime_type: file.type || "application/octet-stream", created_by: session.user.id }).select("id,supplier_id,file_name,file_format,list_date,status,created_at").single();
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
  async function apply() {
    if (!selected || selected.status === "applied") return; if (items.some((item) => item.apply_to_catalog && !item.product_variant_id && !item.create_catalog_product)) return setError("Resolvé cada producto: relacioná una presentación existente o confirmá crear un producto nuevo.");
    if (!window.confirm("Se actualizarán costos actuales mediante su historial oficial. El precio de venta no se modificará.")) return;
    const client = getSupabaseClient(); if (!client) return; const db = client as unknown as UntypedDatabaseClient; setBusy(true); setError(null);
    const result = await db.rpc("apply_supplier_price_list", { target_business_id: businessId, target_price_list_id: selected.id }); setBusy(false);
    if (result.error) return setError(`No se aplicaron cambios: ${result.error.message}`); setNotice(`Lista aplicada: ${Array.isArray(result.data) ? result.data.length : 0} costos actualizados. El PVP sugerido quedó solo como referencia.`); await load(); await loadItems({ ...selected, status: "applied" });
  }
  if (!editable) return <section className="state-box"><h2>Listas de proveedores</h2><p>Podés consultar las listas disponibles; el detalle de costos y la aplicación están reservados a owner y admin.</p></section>;
  return <><header className="page-header"><div><p className="eyebrow">Compras</p><h1>Listas de proveedores</h1><p className="subtle">El archivo se conserva y cada lista se revisa antes de cambiar costos. El PVP sugerido nunca cambia el precio de venta.</p></div></header>
    <section className="form-section import-panel"><h2>1. Importar lista</h2><div className="grid"><label>Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Elegí un proveedor</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Archivo<input accept=".csv,.xlsx,.pdf,.jpg,.jpeg,.png,text/csv,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseFile(event)} type="file" /></label></div>
      {spreadsheet && <><label>Hoja<select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setDetected(null); }}>{spreadsheet.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><div className="form-actions"><button onClick={interpret} type="button">Interpretar hoja</button></div></>}
      {file && !spreadsheet && <div className="form-actions"><button disabled={busy} onClick={() => void stage()} type="button">{busy ? "Guardando…" : "Guardar para interpretación visual"}</button></div>}
      {detected && <><p className="notice">{detected.length} productos detectados determinísticamente. Revisá la muestra antes de guardar.</p><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Código</th><th>EAN</th><th>Costo</th><th>Condición</th><th>Advertencias</th></tr></thead><tbody>{detected.slice(0, 12).map((item, index) => { const option = item.purchase_options[0]; return <tr key={index}><td>{item.name}<br /><small>{item.presentation}</small></td><td>{item.supplier_code ?? "—"}</td><td>{item.barcode ?? "—"}</td><td>{money(option?.purchase_price_cents ?? null)}</td><td>{option ? `${option.purchase_unit_label ?? "unidad"} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}` : "—"}</td><td>{item.warnings.join(" ") || "—"}</td></tr>; })}</tbody></table></div><div className="form-actions"><button disabled={busy} onClick={() => void stage()} type="button">{busy ? "Guardando…" : "Guardar para revisión"}</button></div></>}
    </section>
    <section className="list-section"><h2>Listas recibidas</h2>{!lists.length ? <p className="empty">Todavía no hay listas de proveedores.</p> : <div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>Archivo</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{lists.map((list) => <tr key={list.id}><td>{supplierName(list.supplier_id)}</td><td>{list.file_name}</td><td>{list.list_date ?? new Intl.DateTimeFormat("es-AR").format(new Date(list.created_at))}</td><td><span className="badge">{list.status === "draft" ? "Borrador" : list.status === "reviewed" ? "Revisar" : "Aplicada"}</span></td><td><button className="link-button" onClick={() => void loadItems(list)} type="button">{list.status === "applied" ? "Ver" : "Revisar"}</button></td></tr>)}</tbody></table></div>}</section>
    {selected && <section className="form-section import-panel"><div className="section-header"><div><p className="eyebrow">{supplierName(selected.supplier_id)}</p><h2>2. Matching y preview</h2><p>Los códigos de proveedor quedan vinculados para la próxima lista. Un barcode sólo ayuda a identificar la presentación; no identifica una opción de compra.</p></div></div><div className="import-summary"><strong>{metrics.total} detectados</strong><span>{metrics.linked} relacionados</span><span className={metrics.review ? "invalid-count" : ""}>{metrics.review} por resolver</span></div>
      {!items.length ? <p className="notice">Esta lista aún no tiene productos interpretados. PDF e imágenes requieren la integración visual configurada.</p> : <div className="table-wrap"><table><thead><tr><th>Producto / origen</th><th>Opción de compra</th><th>Costo efectivo</th><th>Matching</th><th>Aplicar</th></tr></thead><tbody>{items.map((item) => { const option = item.supplier_purchase_options.find((entry) => entry.is_selected) ?? item.supplier_purchase_options[0]; return <tr key={item.id}><td><strong>{item.detected_name}</strong><br /><small>{item.detected_presentation ?? "—"} · código: {item.supplier_code ?? "—"} · EAN: {item.barcode ?? "—"}</small>{item.warnings.length > 0 && <small className="danger"><br />{item.warnings.join(" ")}</small>}</td><td>{option ? `${option.purchase_unit} x${option.stock_units_per_purchase} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}` : "Inválida"}<br /><small>Compra: {money(option?.purchase_price_cents ?? null)}</small></td><td>{money(option?.effective_unit_cost_cents ?? null)}</td><td>{selected.status === "applied" ? variants.find((variant) => variant.id === item.product_variant_id)?.label ?? "—" : <><select value={item.product_variant_id ?? ""} onChange={(event) => void saveItem(item, { product_variant_id: event.target.value || null, create_catalog_product: false, match_status: event.target.value ? "matched" : "unmatched" })}><option value="">Sin relacionar</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}{variant.barcode ? ` · ${variant.barcode}` : ""}</option>)}</select><label className="check"><input checked={item.create_catalog_product} disabled={Boolean(item.product_variant_id)} onChange={(event) => void saveItem(item, { create_catalog_product: event.target.checked, match_status: event.target.checked ? "review_required" : "unmatched" })} type="checkbox" /> Crear producto nuevo</label></>}</td><td>{selected.status === "applied" ? "Aplicada" : <label className="check"><input checked={item.apply_to_catalog} onChange={(event) => void saveItem(item, { apply_to_catalog: event.target.checked })} type="checkbox" /> Incluir</label>}</td></tr>; })}</tbody></table></div>}
      {selected.status !== "applied" && items.length > 0 && <div className="form-actions"><button disabled={busy} onClick={() => void apply()} type="button">{busy ? "Aplicando…" : "3. Confirmar y aplicar"}</button></div>}</section>}
    {notice && <p className="notice">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
