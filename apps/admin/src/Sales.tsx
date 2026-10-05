import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";
import type { Json } from "@pet-shop/database";

type Branch = { id: string; name: string; is_active: boolean };
type Variant = { id?: string; name: string; sku: string; is_active: boolean; barcodes: { code: string }[] };
type Product = { id: string; name: string; is_active: boolean; variants: Variant[] };
type PaymentMethod = "cash" | "debit" | "credit" | "transfer" | "other";
type Sale = { id: string; sale_number: number; branch_id: string; branch_name: string; status: "completed"; payment_method: PaymentMethod; total_cents: number; created_at: string; created_by_name: string | null };
type SaleItem = { id: string; variant_id: string; quantity: number; unit_price_cents: number; line_total_cents: number; product_name: string; variant_name: string };
type VariantOption = { id: string; label: string; productName: string; variantName: string; sku: string; barcodes: string[]; effectivePrice: number | null; onOffer: boolean };
type CartItem = VariantOption & { quantity: string };

const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const paymentLabel: Record<PaymentMethod, string> = { cash: "Efectivo", debit: "Débito", credit: "Crédito", transfer: "Transferencia", other: "Otro" };
function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d{1,3})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}
function errorText(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("insufficient inventory")) return "Stock insuficiente para completar la venta. No se registró ningún cambio.";
  if (message.includes("no effective price")) return "Una presentación no tiene un precio vigente.";
  if (message.includes("invalid sale") || message.includes("sale variants")) return "Sucursal o presentación inválida.";
  if (message.includes("not authorized") || message.includes("permission") || message.includes("row-level")) return "No tenés permisos para realizar esta acción.";
  return "No se pudo confirmar la venta. Revisá el carrito e intentá nuevamente.";
}

export function Sales({ businessId, branches, products, path, navigate }: { businessId: string; branches: Branch[]; products: Product[]; path: string; navigate: (path: string) => void }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [prices, setPrices] = useState<Map<string, { cents: number; onOffer: boolean }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const client = getSupabaseClient(); if (!client) return;
    const [saleResult, priceResult] = await Promise.all([
      client.rpc("list_sales", { target_business_id: businessId }),
      client.from("variant_effective_prices").select("variant_id,effective_price_cents,offer_id").eq("business_id", businessId),
    ]);
    const issue = saleResult.error ?? priceResult.error;
    if (issue) { setError(errorText(issue)); return; }
    setSales(saleResult.data ?? []);
    setPrices(new Map((priceResult.data ?? []).flatMap((item) => item.variant_id && item.effective_price_cents !== null ? [[item.variant_id, { cents: item.effective_price_cents, onOffer: item.offer_id !== null }] as const] : [])));
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  const options = useMemo<VariantOption[]>(() => products.filter((product) => product.is_active).flatMap((product) => product.variants.filter((variant) => variant.id && variant.is_active).map((variant) => ({ id: variant.id!, label: `${product.name} · ${variant.name}`, productName: product.name, variantName: variant.name, sku: variant.sku, barcodes: variant.barcodes.map((barcode) => barcode.code), effectivePrice: prices.get(variant.id!)?.cents ?? null, onOffer: prices.get(variant.id!)?.onOffer ?? false }))), [products, prices]);
  if (path === "/sales/new") return <SaleEditor businessId={businessId} branches={branches} options={options} navigate={navigate} reload={load} />;
  if (path.startsWith("/sales/")) return <SaleDetail businessId={businessId} sale={sales.find((item) => item.id === path.split("/")[2])} navigate={navigate} />;
  return <SaleList branches={branches} error={error} sales={sales} navigate={navigate} />;
}

function SaleList({ sales, branches, error, navigate }: { sales: Sale[]; branches: Branch[]; error: string | null; navigate: (path: string) => void }) {
  const [branch, setBranch] = useState("");
  const shown = sales.filter((sale) => !branch || sale.branch_id === branch);
  return <><header className="page-header"><div><p className="eyebrow">Ventas</p><h1>Ventas</h1><p className="subtle">Ventas físicas completadas y su detalle histórico.</p></div><button type="button" onClick={() => navigate("/sales/new")}>Nueva venta</button></header>
    <section className="list-section"><div className="filters"><select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">Todas las sucursales</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{error && <p className="form-error">{error}</p>}
      {!shown.length ? <p className="empty">Todavía no hay ventas para mostrar.</p> : <div className="table-wrap"><table><thead><tr><th>Número</th><th>Fecha</th><th>Sucursal</th><th>Total</th><th>Pago</th><th>Usuario</th><th /></tr></thead><tbody>{shown.map((sale) => <tr key={sale.id}><td>#{sale.sale_number}</td><td>{dateTime(sale.created_at)}</td><td>{sale.branch_name}</td><td>{money(sale.total_cents)}</td><td>{paymentLabel[sale.payment_method]}</td><td>{sale.created_by_name ?? "—"}</td><td><button className="link-button" type="button" onClick={() => navigate(`/sales/${sale.id}`)}>Ver</button></td></tr>)}</tbody></table></div>}</section></>;
}

function SaleEditor({ businessId, branches, options, navigate, reload }: { businessId: string; branches: Branch[]; options: VariantOption[]; navigate: (path: string) => void; reload: () => Promise<void> }) {
  const [branchId, setBranchId] = useState(branches.find((item) => item.is_active)?.id ?? branches[0]?.id ?? "");
  const [query, setQuery] = useState(""); const [cart, setCart] = useState<CartItem[]>([]); const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const shown = options.filter((item) => !query.trim() || `${item.label} ${item.sku} ${item.barcodes.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).filter((item) => !cart.some((cartItem) => cartItem.id === item.id));
  const total = cart.reduce((sum, item) => sum + Math.round((parseQuantity(item.quantity) ?? 0) * (item.effectivePrice ?? 0)), 0);
  function add(item: VariantOption) { if (item.effectivePrice === null) return setError("Esta presentación no tiene un precio vigente y no se puede vender."); setCart([...cart, { ...item, quantity: "1" }]); setQuery(""); setError(null); }
  function scan(event: React.FormEvent) { event.preventDefault(); const exact = options.find((item) => item.barcodes.some((barcode) => barcode === query.trim())); if (exact) add(exact); else if (shown[0]) add(shown[0]); else setError("No encontramos una presentación para ese código o búsqueda."); }
  async function confirm() {
    if (!branchId) return setError("Elegí una sucursal.");
    if (!cart.length) return setError("Agregá al menos un ítem al carrito.");
    const items = cart.map((item) => ({ variant_id: item.id, quantity: parseQuantity(item.quantity) }));
    if (items.some((item) => item.quantity === null)) return setError("Revisá las cantidades: admiten hasta tres decimales y deben ser mayores a cero.");
    const client = getSupabaseClient(); if (!client) return; setSaving(true); setError(null);
    const result = await client.rpc("confirm_sale", { target_business_id: businessId, target_branch_id: branchId, sale_payment_method: payment, requested_items: items as Json, request_id: requestId });
    setSaving(false);
    if (result.error || !result.data?.[0]) return setError(errorText(result.error));
    await reload(); navigate(`/sales/${result.data[0].sale_id}`); setRequestId(crypto.randomUUID());
  }
  return <><header className="page-header"><div><p className="eyebrow">Ventas</p><h1>Nueva venta</h1><p className="subtle">El precio y el stock se validan nuevamente al confirmar.</p></div><button className="secondary" type="button" onClick={() => navigate("/sales")}>Volver</button></header>
    <section className="form-section pos-layout"><div className="pos-controls"><label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactiva)"}</option>)}</select></label><form onSubmit={scan}><label>Buscar o escanear<input autoFocus placeholder="Nombre, SKU o código de barras" value={query} onChange={(event) => setQuery(event.target.value)} /></label></form>{query && <div className="search-results">{shown.slice(0, 8).map((item) => <button className="link-button" key={item.id} type="button" onClick={() => add(item)}>{item.label}{item.sku ? ` · SKU ${item.sku}` : ""}<small> · {item.effectivePrice === null ? "Sin precio" : money(item.effectivePrice)}{item.onOffer ? " · Oferta" : ""}</small></button>)}{!shown.length && <p className="muted">No hay presentaciones disponibles.</p>}</div>}</div>
      <div className="pos-cart"><h2>Carrito</h2>{!cart.length ? <p className="empty">Buscá o escaneá una presentación para agregarla.</p> : <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th /></tr></thead><tbody>{cart.map((item, index) => <tr key={item.id}><td>{item.productName}<br /><small>{item.variantName}{item.onOffer ? " · Oferta vigente" : ""}</small></td><td><input aria-label={`Cantidad de ${item.label}`} inputMode="decimal" value={item.quantity} onChange={(event) => setCart(cart.map((current, currentIndex) => currentIndex === index ? { ...current, quantity: event.target.value } : current))} /></td><td>{item.effectivePrice === null ? "—" : money(item.effectivePrice)}</td><td>{money(Math.round((parseQuantity(item.quantity) ?? 0) * (item.effectivePrice ?? 0)))}</td><td><button className="link-button danger" type="button" onClick={() => setCart(cart.filter((_, currentIndex) => currentIndex !== index))}>Quitar</button></td></tr>)}</tbody><tfoot><tr><th colSpan={3}>TOTAL</th><th>{money(total)}</th><th /></tr></tfoot></table></div>}<label>Medio de pago<select value={payment} onChange={(event) => setPayment(event.target.value as PaymentMethod)}>{(Object.keys(paymentLabel) as PaymentMethod[]).map((item) => <option key={item} value={item}>{paymentLabel[item]}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button disabled={saving || !cart.length} type="button" onClick={() => void confirm()}>{saving ? "Confirmando…" : `Confirmar venta · ${money(total)}`}</button></div></div>
    </section></>;
}

function SaleDetail({ businessId, sale, navigate }: { businessId: string; sale?: Sale; navigate: (path: string) => void }) {
  const [items, setItems] = useState<SaleItem[]>([]); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { if (!sale) return; const client = getSupabaseClient(); if (!client) return; const result = await client.rpc("list_sale_items", { target_business_id: businessId, target_sale_id: sale.id }); if (result.error) setError(errorText(result.error)); else setItems(result.data ?? []); })(); }, [businessId, sale]);
  if (!sale) return <section className="form-section"><h1>Venta no encontrada</h1><button type="button" onClick={() => navigate("/sales")}>Volver a ventas</button></section>;
  return <><header className="page-header"><div><p className="eyebrow">Ventas</p><h1>Venta #{sale.sale_number}</h1><p className="subtle">{dateTime(sale.created_at)} · {sale.branch_name} · {paymentLabel[sale.payment_method]} · {sale.created_by_name ?? "—"}</p></div><button className="secondary" type="button" onClick={() => navigate("/sales")}>Volver</button></header><section className="form-section"><div className="section-header"><h2>Detalle</h2><strong>{money(sale.total_cents)}</strong></div>{error && <p className="form-error">{error}</p>}<div className="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio vendido</th><th>Subtotal</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.product_name}<br /><small>{item.variant_name}</small></td><td>{item.quantity}</td><td>{money(item.unit_price_cents)}</td><td>{money(item.line_total_cents)}</td></tr>)}</tbody></table></div><p className="muted">Esta venta está completada e inmutable. El precio mostrado es el snapshot registrado al confirmar.</p></section></>;
}
