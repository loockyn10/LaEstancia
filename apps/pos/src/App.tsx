import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Json } from "@pet-shop/database";
import { adminUrl, configurationError, loginEmail, supabase } from "./lib/supabase";

type Role = "owner" | "admin" | "staff";
type Access = { businessId: string; businessName: string; role: Role; userId: string };
type Branch = { id: string; name: string; is_active: boolean };
type Product = { id: string; name: string; is_active: boolean };
type Variant = { id: string; product_id: string; name: string; sku: string | null; is_active: boolean };
type Barcode = { variant_id: string; code: string };
type Price = { variant_id: string; effective_price_cents: number | null; offer_id: string | null };
type Balance = { variant_id: string; quantity: number };
type Payment = "cash" | "debit" | "credit" | "transfer" | "other";
type Option = { id: string; productName: string; variantName: string; sku: string; barcodes: string[]; price: number; offer: boolean; stock: number };
type CartItem = Option & { quantity: string };
type CashSession = { id: string; status: "open" | "closed"; expected_cash_cents: number; branch_name: string; opening_cash_cents: number };
type Sale = { id: string; sale_number: number; total_cents: number; created_at: string };

const payments: Record<Payment, string> = { cash: "Efectivo", debit: "Débito", credit: "Crédito", transfer: "Transferencia", other: "Otro" };
const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const quantity = (value: string) => /^\d+(?:[.,]\d{1,3})?$/.test(value.trim()) && Number(value.replace(",", ".")) > 0 ? Number(value.replace(",", ".")) : null;
const dateTime = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const errorText = (message?: string) => {
  const value = message?.toLowerCase() ?? "";
  if (value.includes("insufficient inventory")) return "Stock insuficiente. La venta no registró cambios.";
  if (value.includes("no effective price")) return "Hay un producto sin precio vigente.";
  if (value.includes("not authorized") || value.includes("permission")) return "No tenés permiso para realizar esta operación.";
  return "No se pudo completar la operación. Intentá nuevamente.";
};

function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = supabase(); if (!client) return;
    setSaving(true); setError(null);
    const { error: loginError } = await client.auth.signInWithPassword({ email: loginEmail(identifier), password });
    setSaving(false);
    if (loginError) setError("No pudimos iniciar sesión. Revisá tu usuario y contraseña.");
  }
  return <main className="auth"><section><p className="eyebrow">LA ESTANCIA POS</p><h1>Ingresar al punto de venta</h1><p>Usá tu identificador asignado: dueño, admin o empleado.</p><form onSubmit={(event) => void submit(event)}><label>Usuario o email<input autoComplete="username" disabled={saving} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} /></label><label>Contraseña<input autoComplete="current-password" disabled={saving} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={saving}>{saving ? "Ingresando…" : "Ingresar"}</button></form></section></main>;
}

export function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const configError = configurationError();
  useEffect(() => {
    const client = supabase(); if (!client) return;
    let current = true;
    void client.auth.getSession().then(({ data }) => { if (current) { setUserId(data.session?.user.id ?? null); setLoading(false); } });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => { setUserId(session?.user.id ?? null); });
    return () => { current = false; subscription.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const client = supabase(); if (!client || !userId) { setAccess(null); return; }
    let current = true;
    void (async () => {
      const membership = await client.from("business_memberships").select("business_id,role").eq("is_active", true).order("created_at").limit(1).maybeSingle();
      if (!current || membership.error || !membership.data) { setAccess(null); setLoading(false); return; }
      const business = await client.from("businesses").select("name").eq("id", membership.data.business_id).maybeSingle();
      if (current && business.data) setAccess({ businessId: membership.data.business_id, businessName: business.data.name, role: membership.data.role as Role, userId });
      if (current) setLoading(false);
    })();
    return () => { current = false; };
  }, [userId]);
  if (configError) return <main className="auth"><section><h1>Configuración pendiente</h1><p>{configError}</p></section></main>;
  if (loading) return <main className="auth"><section><h1>Preparando POS…</h1></section></main>;
  if (!userId) return <Login />;
  if (!access) return <main className="auth"><section><h1>Sin acceso asignado</h1><p>Tu cuenta no tiene una membresía activa.</p><button onClick={() => void supabase()?.auth.signOut()}>Cerrar sesión</button></section></main>;
  return <Pos access={access} />;
}

function Pos({ access }: { access: Access }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [cash, setCash] = useState<CashSession | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const online = navigator.onLine;
  const reload = useCallback(async () => {
    const client = supabase(); if (!client) return;
    setError(null);
    const branchResult = await client.from("branches").select("id,name,is_active").eq("business_id", access.businessId).order("name");
    if (branchResult.error) return setError(errorText(branchResult.error.message));
    const availableBranches = branchResult.data ?? [];
    setBranches(availableBranches);
    const nextBranch = availableBranches.some((branch) => branch.id === branchId) ? branchId : availableBranches.find((branch) => branch.is_active)?.id ?? availableBranches[0]?.id ?? "";
    setBranchId(nextBranch);
    const [products, variants, barcodes, prices, balances, sessionResult, salesResult] = await Promise.all([
      client.from("products").select("id,name,is_active").eq("business_id", access.businessId).eq("is_active", true),
      client.from("product_variants").select("id,product_id,name,sku,is_active").eq("business_id", access.businessId).eq("is_active", true),
      client.from("product_barcodes").select("variant_id,code").eq("business_id", access.businessId),
      client.from("variant_effective_prices").select("variant_id,effective_price_cents,offer_id").eq("business_id", access.businessId),
      nextBranch ? client.from("inventory_balances").select("variant_id,quantity").eq("business_id", access.businessId).eq("branch_id", nextBranch) : Promise.resolve({ data: [], error: null }),
      nextBranch ? client.rpc("list_cash_sessions", { target_business_id: access.businessId, target_branch_id: nextBranch }) : Promise.resolve({ data: [], error: null }),
      nextBranch ? client.rpc("list_sales", { target_business_id: access.businessId, target_branch_id: nextBranch }) : Promise.resolve({ data: [], error: null }),
    ]);
    const issue = products.error ?? variants.error ?? barcodes.error ?? prices.error ?? balances.error ?? sessionResult.error ?? salesResult.error;
    if (issue) return setError(errorText(issue.message));
    const productById = new Map((products.data as Product[]).map((item) => [item.id, item]));
    const barcodeByVariant = new Map<string, string[]>();
    for (const item of (barcodes.data as Barcode[])) barcodeByVariant.set(item.variant_id, [...(barcodeByVariant.get(item.variant_id) ?? []), item.code]);
    const priceByVariant = new Map((prices.data as Price[]).flatMap((item) => item.effective_price_cents === null ? [] : [[item.variant_id, item]]));
    const stockByVariant = new Map((balances.data as Balance[]).map((item) => [item.variant_id, Number(item.quantity)]));
    setOptions((variants.data as Variant[]).flatMap((item) => {
      const product = productById.get(item.product_id); const price = priceByVariant.get(item.id);
      return product && price ? [{ id: item.id, productName: product.name, variantName: item.name, sku: item.sku ?? "", barcodes: barcodeByVariant.get(item.id) ?? [], price: price.effective_price_cents!, offer: price.offer_id !== null, stock: stockByVariant.get(item.id) ?? 0 }] : [];
    }));
    setCash(((sessionResult.data ?? []) as CashSession[]).find((item) => item.status === "open") ?? null);
    setSales((salesResult.data ?? []) as Sale[]);
    setLastSync(new Date());
  }, [access.businessId, branchId]);
  useEffect(() => { void reload(); }, [reload]);
  const shown = useMemo(() => options.filter((item) => `${item.productName} ${item.variantName} ${item.sku} ${item.barcodes.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).filter((item) => !cart.some((line) => line.id === item.id)).slice(0, 8), [cart, options, query]);
  const total = cart.reduce((sum, item) => sum + Math.round((quantity(item.quantity) ?? 0) * item.price), 0);
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  function add(item: Option) { setCart((current) => [...current, { ...item, quantity: "1" }]); setQuery(""); setError(null); }
  function scan(event: FormEvent) { event.preventDefault(); const exact = options.find((item) => item.barcodes.includes(query.trim())); if (exact) add(exact); else if (shown[0]) add(shown[0]); else setError("No encontramos un producto para esa búsqueda."); }
  async function confirm() {
    const client = supabase(); if (!client || !branchId || !cart.length) return;
    const items = cart.map((item) => ({ variant_id: item.id, quantity: quantity(item.quantity) }));
    if (items.some((item) => item.quantity === null)) return setError("Revisá las cantidades: admiten hasta tres decimales.");
    setBusy(true); setError(null);
    const result = await client.rpc("confirm_sale", { target_business_id: access.businessId, target_branch_id: branchId, sale_payment_method: payment, requested_items: items as Json, request_id: requestId });
    setBusy(false);
    if (result.error) return setError(errorText(result.error.message));
    setCart([]); setRequestId(crypto.randomUUID()); await reload();
  }
  async function cashAction(action: "open" | "close" | "inbound" | "outbound") {
    const client = supabase(); if (!client || !branchId) return;
    const raw = window.prompt(action === "open" ? "Efectivo inicial" : action === "close" ? "Efectivo contado" : "Importe");
    if (raw === null) return;
    const cents = Math.round(Number(raw.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(cents) || (action !== "open" && cents <= 0)) return setError("Ingresá un importe válido.");
    const reason = action === "inbound" || action === "outbound" ? window.prompt("Motivo")?.trim() : "";
    if ((action === "inbound" || action === "outbound") && !reason) return;
    setBusy(true); setError(null);
    const result = action === "open" ? await client.rpc("open_cash_session", { target_business_id: access.businessId, target_branch_id: branchId, opening_cash_cents: cents })
      : action === "close" && cash ? await client.rpc("close_cash_session", { target_business_id: access.businessId, target_cash_session_id: cash.id, counted_cash_cents: cents })
      : cash ? await client.rpc("record_cash_movement", { target_business_id: access.businessId, target_cash_session_id: cash.id, movement_type: action === "inbound" ? "inbound" : "outbound", amount_cents: cents, movement_reason: reason ?? "" }) : { error: { message: "cash session is not open" } };
    setBusy(false);
    if (result.error) setError(errorText(result.error.message)); else await reload();
  }
  return <main className="pos"><header><div><p className="eyebrow">LA ESTANCIA POS</p><strong>{access.businessName}</strong></div><div className="operator"><span>{access.role === "staff" ? "Empleado" : access.role}</span><span>{selectedBranch?.name ?? "Sin sucursal"}</span>{access.role !== "staff" && <a href={adminUrl()}>Administración</a>}<button className="link" onClick={() => void supabase()?.auth.signOut()}>Salir</button></div></header><section className="status"><span className={online ? "online" : "offline"}>{online ? "En línea" : "Sin conexión"}</span><span>{cash ? `Caja abierta · ${cash.branch_name}` : "Caja cerrada"}</span><span>{lastSync ? `Actualizado ${dateTime(lastSync.toISOString())}` : "Sin sincronizar"}</span><button className="link" disabled={busy} onClick={() => void reload()}>Actualizar</button></section><section className="workspace"><div className="catalog"><label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactiva)"}</option>)}</select></label><form onSubmit={scan}><label>Buscar o escanear producto<input autoFocus disabled={!online || busy} placeholder="Nombre, SKU o código de barras" value={query} onChange={(event) => setQuery(event.target.value)} /></label></form><div className="results">{query && shown.map((item) => <button key={item.id} onClick={() => add(item)} type="button"><span>{item.productName}<small>{item.variantName}{item.sku ? ` · SKU ${item.sku}` : ""}</small></span><strong>{money(item.price)}{item.offer ? " · Oferta" : ""}<small>Stock: {item.stock}</small></strong></button>)}{query && !shown.length && <p>Sin resultados vendibles.</p>}</div></div><aside className="cart"><h1>Carrito</h1>{cart.length === 0 ? <p>Buscá o escaneá un producto para empezar.</p> : <div>{cart.map((item, index) => <article key={item.id}><div><strong>{item.productName}</strong><small>{item.variantName} · {money(item.price)}</small></div><input aria-label={`Cantidad de ${item.productName}`} inputMode="decimal" value={item.quantity} onChange={(event) => setCart((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} /><strong>{money(Math.round((quantity(item.quantity) ?? 0) * item.price))}</strong><button className="link danger" onClick={() => setCart((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</button></article>)}</div>}<label>Medio de pago<select value={payment} onChange={(event) => setPayment(event.target.value as Payment)}>{Object.entries(payments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="total"><span>Total</span><strong>{money(total)}</strong></div><button className="charge" disabled={busy || !online || !cart.length} onClick={() => void confirm()}>{busy ? "Procesando…" : "COBRAR"}</button>{error && <p className="error" role="alert">{error}</p>}</aside></section><section className="operations"><article><h2>Caja</h2>{cash ? <><p>Abierta · Efectivo esperado <strong>{money(cash.expected_cash_cents)}</strong></p><div><button disabled={busy} onClick={() => void cashAction("inbound")}>Ingreso</button><button disabled={busy} onClick={() => void cashAction("outbound")}>Egreso</button><button className="secondary" disabled={busy} onClick={() => void cashAction("close")}>Cerrar caja</button></div></> : <><p>No hay una caja abierta para esta sucursal.</p><button disabled={busy || !selectedBranch?.is_active} onClick={() => void cashAction("open")}>Abrir caja</button></>}</article><article><h2>Mis ventas recientes</h2>{sales.length ? <ul>{sales.slice(0, 5).map((sale) => <li key={sale.id}>#{sale.sale_number} · {money(sale.total_cents)} · {dateTime(sale.created_at)}</li>)}</ul> : <p>Todavía no hay ventas para mostrar.</p>}</article></section><p className="offline-note">El POS requiere conexión para registrar ventas en este sprint. La aplicación y esta pantalla quedan disponibles sin conexión para el próximo paso offline-first.</p></main>;
}
