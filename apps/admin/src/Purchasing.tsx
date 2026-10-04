import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";

type Role = "owner" | "admin" | "staff";
type Branch = { id: string; name: string; is_active: boolean };
type Variant = { id?: string; name: string; sku: string; barcodes: { code: string }[] };
type Product = { id: string; name: string; variants: Variant[] };
type Supplier = { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; notes: string | null; is_active: boolean };
type PurchaseStatus = "draft" | "confirmed" | "cancelled";
type Purchase = { id: string; supplier_id: string | null; branch_id: string; purchase_date: string; document_number: string | null; notes: string | null; status: PurchaseStatus; created_at: string };
type PurchaseItem = { id?: string; variant_id: string; quantity: string; unit_cost_cents: number; };

const canManage = (role: Role) => role === "owner" || role === "admin";
const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
const centsInput = (cents: number) => cents % 100 ? `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}` : String(cents / 100);
function parseCents(value: string) {
  const raw = value.trim().replace(/[\s$]/g, "");
  const match = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,([0-9]{1,2}))?$/) ?? raw.match(/^(\d+)(?:\.([0-9]{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1].replace(/\./g, "")) * 100 + Number(`${match[2] ?? ""}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}
function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d{1,3})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}
function errorText(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("only draft")) return "La compra ya no está en borrador.";
  if (message.includes("at least one item")) return "Agregá al menos un ítem antes de confirmar.";
  if (message.includes("not authorized") || message.includes("row-level")) return "No tenés permisos para realizar esta acción.";
  return "No se pudo guardar. Revisá los datos e intentá nuevamente.";
}
function blankSupplier() { return { name: "", contact_name: "", phone: "", email: "", notes: "", is_active: true }; }

export function Suppliers({ businessId, role }: { businessId: string; role: Role }) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(blankSupplier());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = canManage(role);
  const load = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error: loadError } = await client.from("suppliers").select("id,name,contact_name,phone,email,notes,is_active").eq("business_id", businessId).order("name");
    if (loadError) setError(errorText(loadError)); else setItems(data ?? []);
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  const shown = items.filter((item) => `${item.name} ${item.contact_name ?? ""} ${item.phone ?? ""} ${item.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  function start(item?: Supplier) {
    setEditing(item ?? null);
    setShowForm(true);
    setDraft(item ? { name: item.name, contact_name: item.contact_name ?? "", phone: item.phone ?? "", email: item.email ?? "", notes: item.notes ?? "", is_active: item.is_active } : blankSupplier());
    setError(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;
    const client = getSupabaseClient();
    const payload = { business_id: businessId, name: draft.name.trim(), contact_name: draft.contact_name.trim() || null, phone: draft.phone.trim() || null, email: draft.email.trim() || null, notes: draft.notes.trim() || null, is_active: draft.is_active };
    if (!payload.name) return setError("Ingresá el nombre del proveedor.");
    setSaving(true); setError(null);
    const result = editing ? await client!.from("suppliers").update(payload).eq("id", editing.id).eq("business_id", businessId) : await client!.from("suppliers").insert(payload);
    setSaving(false);
    if (result.error) return setError(errorText(result.error));
    setShowForm(false); setEditing(null); await load();
  }
  return <>
    <header className="page-header"><div><p className="eyebrow">Compras</p><h1>Proveedores</h1><p className="subtle">Datos de contacto de los proveedores de tu negocio.</p></div>{editable && <button type="button" onClick={() => start()}>Nuevo proveedor</button>}</header>
    {showForm || (editable && !items.length) ? <form className="form-section" onSubmit={(event) => void save(event)}>
      <div className="section-header"><h2>{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2><button className="secondary" type="button" onClick={() => { setEditing(null); setShowForm(false); setError(null); }}>Cancelar</button></div>
      <div className="grid"><label>Nombre<input autoFocus required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>Contacto<input value={draft.contact_name} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} /></label><label>Teléfono<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label className="wide">Notas<textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label><label className="check"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Activo</label></div>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button disabled={saving} type="submit">{saving ? "Guardando…" : "Guardar proveedor"}</button></div>
    </form> : null}
    <section className="list-section"><div className="filters"><input placeholder="Buscar por nombre, contacto, teléfono o email" value={query} onChange={(e) => setQuery(e.target.value)} /></div>{error && !editing && <p className="form-error">{error}</p>}
      {!shown.length ? <p className="empty">No hay proveedores para mostrar.</p> : <div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Estado</th>{editable && <th />}</tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><br /><small>{item.email ?? ""}</small></td><td>{item.contact_name ?? "—"}</td><td>{item.phone ?? "—"}</td><td><span className={`badge ${item.is_active ? "badge-active" : ""}`}>{item.is_active ? "Activo" : "Inactivo"}</span></td>{editable && <td><button className="link-button" type="button" onClick={() => start(item)}>Editar</button></td>}</tr>)}</tbody></table></div>}
    </section>
  </>;
}

export function Purchases({ businessId, role, branches, products, path, navigate }: { businessId: string; role: Role; branches: Branch[]; products: Product[]; path: string; navigate: (path: string) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const editable = canManage(role);
  const load = useCallback(async () => {
    const client = getSupabaseClient(); if (!client) return;
    const [supplierResult, purchaseResult] = await Promise.all([
      client.from("suppliers").select("id,name,contact_name,phone,email,notes,is_active").eq("business_id", businessId).order("name"),
      client.from("purchases").select("id,supplier_id,branch_id,purchase_date,document_number,notes,status,created_at").eq("business_id", businessId).order("purchase_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    const issue = supplierResult.error ?? purchaseResult.error;
    if (issue) setError(errorText(issue)); else { setSuppliers(supplierResult.data ?? []); setPurchases(purchaseResult.data ?? []); }
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  if (path === "/purchases/new" || path.startsWith("/purchases/")) return <PurchaseEditor businessId={businessId} role={role} branches={branches} products={products} suppliers={suppliers} purchase={path === "/purchases/new" ? undefined : purchases.find((item) => item.id === path.split("/")[2])} navigate={navigate} reload={load} />;
  return <PurchaseList editable={editable} purchases={purchases} suppliers={suppliers} branches={branches} error={error} navigate={navigate} />;
}

function PurchaseList({ editable, purchases, suppliers, branches, error, navigate }: { editable: boolean; purchases: Purchase[]; suppliers: Supplier[]; branches: Branch[]; error: string | null; navigate: (path: string) => void }) {
  const [status, setStatus] = useState("all"); const [supplierId, setSupplierId] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const shown = purchases.filter((item) => (status === "all" || item.status === status) && (!supplierId || item.supplier_id === supplierId) && (!from || item.purchase_date >= from) && (!to || item.purchase_date <= to));
  const supplierName = (id: string | null) => suppliers.find((item) => item.id === id)?.name ?? "Sin proveedor";
  const branchName = (id: string) => branches.find((item) => item.id === id)?.name ?? "—";
  return <><header className="page-header"><div><p className="eyebrow">Compras</p><h1>Compras</h1><p className="subtle">Los borradores no afectan stock ni costos.</p></div>{editable && <button type="button" onClick={() => navigate("/purchases/new")}>Nueva compra</button>}</header>
    <section className="list-section"><div className="filters"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="draft">Borrador</option><option value="confirmed">Confirmada</option><option value="cancelled">Cancelada</option></select><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Todos los proveedores</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>{error && <p className="form-error">{error}</p>}
    {!shown.length ? <p className="empty">No hay compras para mostrar.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Sucursal</th><th>Estado</th><th /></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td>{new Intl.DateTimeFormat("es-AR").format(new Date(`${item.purchase_date}T12:00:00`))}</td><td>{supplierName(item.supplier_id)}</td><td>{branchName(item.branch_id)}</td><td><span className="badge">{item.status === "draft" ? "Borrador" : item.status === "confirmed" ? "Confirmada" : "Cancelada"}</span></td><td><button className="link-button" type="button" onClick={() => navigate(`/purchases/${item.id}`)}>{item.status === "draft" && editable ? "Editar" : "Ver"}</button></td></tr>)}</tbody></table></div>}</section></>;
}

function PurchaseEditor({ businessId, role, branches, products, suppliers, purchase, navigate, reload }: { businessId: string; role: Role; branches: Branch[]; products: Product[]; suppliers: Supplier[]; purchase?: Purchase; navigate: (path: string) => void; reload: () => Promise<void> }) {
  const editable = canManage(role); const [loading, setLoading] = useState(Boolean(purchase)); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ supplier_id: purchase?.supplier_id ?? "", branch_id: purchase?.branch_id ?? branches.find((item) => item.is_active)?.id ?? branches[0]?.id ?? "", purchase_date: purchase?.purchase_date ?? new Date().toISOString().slice(0, 10), document_number: purchase?.document_number ?? "", notes: purchase?.notes ?? "" });
  const [items, setItems] = useState<PurchaseItem[]>([]);
  useEffect(() => { setDraft({ supplier_id: purchase?.supplier_id ?? "", branch_id: purchase?.branch_id ?? branches.find((item) => item.is_active)?.id ?? branches[0]?.id ?? "", purchase_date: purchase?.purchase_date ?? new Date().toISOString().slice(0, 10), document_number: purchase?.document_number ?? "", notes: purchase?.notes ?? "" }); }, [purchase, branches]);
  useEffect(() => { void (async () => { if (!purchase || role === "staff") { setLoading(false); return; } const client = getSupabaseClient(); const { data, error: loadError } = await client!.from("purchase_items").select("id,variant_id,quantity,unit_cost_cents").eq("purchase_id", purchase.id).eq("business_id", businessId).order("created_at"); if (loadError) setError(errorText(loadError)); else setItems((data ?? []).map((item) => ({ ...item, quantity: String(item.quantity) }))); setLoading(false); })(); }, [purchase, businessId, role]);
  const variants = useMemo(() => products.flatMap((product) => product.variants.filter((variant) => variant.id).map((variant) => ({ id: variant.id!, label: `${product.name} · ${variant.name}`, sku: variant.sku, barcode: variant.barcodes.map((code) => code.code).join(" ") }))), [products]);
  const shownVariants = variants.filter((variant) => !query.trim() || `${variant.label} ${variant.sku} ${variant.barcode}`.toLowerCase().includes(query.trim().toLowerCase())).filter((variant) => !items.some((item) => item.variant_id === variant.id));
  const itemName = (id: string) => variants.find((variant) => variant.id === id)?.label ?? "Presentación no encontrada";
  const total = items.reduce((sum, item) => sum + (parseQuantity(item.quantity) ?? 0) * item.unit_cost_cents, 0);
  const readonly = !editable || purchase?.status !== undefined && purchase.status !== "draft";
  function changeItem(index: number, patch: Partial<PurchaseItem>) { setItems(items.map((item, current) => current === index ? { ...item, ...patch } : item)); }
  async function save(confirm = false) {
    if (readonly) return; const client = getSupabaseClient(); if (!client) return;
    if (!draft.branch_id || !draft.purchase_date) return setError("Elegí sucursal y fecha.");
    if (items.some((item) => parseQuantity(item.quantity) === null || item.unit_cost_cents < 0)) return setError("Revisá cantidad y costo de todos los ítems.");
    if (confirm && !items.length) return setError("Agregá al menos un ítem antes de confirmar.");
    setSaving(true); setError(null);
    const payload = { business_id: businessId, supplier_id: draft.supplier_id || null, branch_id: draft.branch_id, purchase_date: draft.purchase_date, document_number: draft.document_number.trim() || null, notes: draft.notes.trim() || null };
    let header;
    if (purchase) {
      header = await client.from("purchases").update(payload).eq("id", purchase.id).eq("business_id", businessId).select("id").single();
    } else {
      const { data: sessionData } = await client.auth.getUser();
      if (!sessionData.user) { setSaving(false); return setError("Tu sesión ya no está disponible. Volvé a ingresar."); }
      header = await client.from("purchases").insert({ ...payload, created_by: sessionData.user.id }).select("id").single();
    }
    if (header.error || !header.data) { setSaving(false); return setError(errorText(header.error)); }
    const purchaseId = header.data.id;
    const remove = await client.from("purchase_items").delete().eq("purchase_id", purchaseId).eq("business_id", businessId);
    if (remove.error) { setSaving(false); return setError(errorText(remove.error)); }
    if (items.length) { const insert = await client.from("purchase_items").insert(items.map((item) => ({ purchase_id: purchaseId, business_id: businessId, variant_id: item.variant_id, quantity: parseQuantity(item.quantity)!, unit_cost_cents: item.unit_cost_cents }))); if (insert.error) { setSaving(false); return setError(errorText(insert.error)); } }
    if (confirm) { const confirmation = await client.rpc("confirm_purchase", { target_business_id: businessId, target_purchase_id: purchaseId }); if (confirmation.error) { setSaving(false); return setError(errorText(confirmation.error)); } }
    setSaving(false); await reload(); navigate(`/purchases/${purchaseId}`);
  }
  async function cancel() { if (!purchase || !editable || purchase.status !== "draft") return; const client = getSupabaseClient(); setSaving(true); const result = await client!.from("purchases").update({ status: "cancelled" }).eq("id", purchase.id).eq("business_id", businessId); setSaving(false); if (result.error) return setError(errorText(result.error)); await reload(); navigate("/purchases"); }
  if (loading) return <section className="form-section"><p>Cargando compra…</p></section>;
  if (!purchase && window.location.pathname !== "/purchases/new") return <section className="form-section"><h1>Compra no encontrada</h1><button type="button" onClick={() => navigate("/purchases")}>Volver a compras</button></section>;
  return <><header className="page-header"><div><p className="eyebrow">Compras</p><h1>{purchase ? purchase.status === "draft" ? "Editar compra" : "Detalle de compra" : "Nueva compra"}</h1><p className="subtle">{readonly ? "Esta compra no se puede editar." : "Guardá como borrador o confirmá cuando esté completa."}</p></div><button className="secondary" type="button" onClick={() => navigate("/purchases")}>Volver</button></header>
    <section className="form-section"><h2>Datos de compra</h2><div className="grid"><label>Proveedor<select disabled={readonly} value={draft.supplier_id} onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value })}><option value="">Sin proveedor</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (inactivo)"}</option>)}</select></label><label>Sucursal destino<select disabled={readonly} required value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}><option value="">Elegí una sucursal</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (inactiva)"}</option>)}</select></label><label>Fecha<input disabled={readonly} type="date" value={draft.purchase_date} onChange={(e) => setDraft({ ...draft, purchase_date: e.target.value })} /></label><label>Referencia / comprobante<input disabled={readonly} value={draft.document_number} onChange={(e) => setDraft({ ...draft, document_number: e.target.value })} /></label><label className="wide">Notas<textarea disabled={readonly} rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label></div></section>
    <section className="form-section"><div className="section-header"><div><h2>Ítems</h2><p>Buscá por producto, presentación, SKU o código de barras.</p></div></div>{!readonly && <div className="filters"><input placeholder="Buscar presentación para agregar" value={query} onChange={(e) => setQuery(e.target.value)} /></div>}{!readonly && query && <div className="search-results">{shownVariants.slice(0, 8).map((variant) => <button className="link-button" key={variant.id} type="button" onClick={() => { setItems([...items, { variant_id: variant.id, quantity: "1", unit_cost_cents: 0 }]); setQuery(""); }}>{variant.label}{variant.sku ? ` · SKU ${variant.sku}` : ""}</button>)}{!shownVariants.length && <p className="muted">No encontramos presentaciones disponibles.</p>}</div>}
      {role === "staff" ? <p className="empty">Podés consultar la compra, pero los costos e ítems son visibles sólo para owner y admin.</p> : !items.length ? <p className="empty">Todavía no agregaste ítems.</p> : <div className="table-wrap"><table><thead><tr><th>Producto / presentación</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th>{!readonly && <th />}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id ?? item.variant_id}><td>{itemName(item.variant_id)}</td><td>{readonly ? item.quantity : <input aria-label="Cantidad" value={item.quantity} onChange={(e) => changeItem(index, { quantity: e.target.value })} />}</td><td>{readonly ? money(item.unit_cost_cents) : <input aria-label="Costo unitario" value={centsInput(item.unit_cost_cents)} onChange={(e) => { const value = parseCents(e.target.value); if (value !== null) changeItem(index, { unit_cost_cents: value }); }} />}</td><td>{money((parseQuantity(item.quantity) ?? 0) * item.unit_cost_cents)}</td>{!readonly && <td><button className="link-button danger" type="button" onClick={() => setItems(items.filter((_, current) => current !== index))}>Quitar</button></td>}</tr>)}</tbody><tfoot><tr><th colSpan={3}>TOTAL</th><th>{money(total)}</th>{!readonly && <th />}</tr></tfoot></table></div>}</section>
    {purchase?.status === "confirmed" && <section className="form-section"><strong>Confirmada</strong><p>El stock y el costo actual se actualizaron al confirmar. Esta compra es inmutable; la reversión requiere un flujo futuro.</p></section>}
    {error && <p className="form-error" role="alert">{error}</p>}{!readonly && <div className="form-actions"><button disabled={saving} type="button" onClick={() => void save(false)}>{saving ? "Guardando…" : "Guardar borrador"}</button><button disabled={saving} type="button" onClick={() => { if (window.confirm("Al confirmar se actualizará stock y costo. Esta acción no podrá deshacerse desde esta pantalla.")) void save(true); }}>Confirmar compra</button>{purchase && <button className="secondary danger" disabled={saving} type="button" onClick={() => void cancel()}>Cancelar borrador</button>}</div>}
  </>;
}
