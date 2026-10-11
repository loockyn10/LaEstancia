import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@pet-shop/database";
import { adminUrl, configurationError, loginEmail, supabase } from "./lib/supabase";
import { useOnlineStatus } from "./lib/online";
import {
  findLocalBarcode,
  getCachedAccessContext,
  getLocalOverview,
  saveAccessContext,
  saveSelectedBranch,
  searchLocalCatalog,
} from "./local-db/repository";
import type { LocalAccessContext, LocalBranch, PosOption } from "./local-db/types";
import { FIRST_SYNC_MESSAGE, FIRST_SYNC_TITLE } from "./local-db/messages";
import { supabaseSnapshotDownloader, synchronizeCatalog } from "./sync/catalog-sync";

type Payment = "cash" | "debit" | "credit" | "transfer" | "other";
type CartItem = PosOption & { quantity: string };
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

function Login({ online, expiredOffline }: { online: boolean; expiredOffline: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = supabase(); if (!client || !online) return;
    setSaving(true); setError(null);
    const { error: loginError } = await client.auth.signInWithPassword({ email: loginEmail(identifier), password });
    setSaving(false);
    if (loginError) setError("No pudimos iniciar sesión. Revisá tu usuario y contraseña.");
  }
  return <main className="auth"><section><p className="eyebrow">LA ESTANCIA POS</p><h1>Ingresar al punto de venta</h1>{online ? <p>Usá tu identificador asignado: dueño, admin o empleado.</p> : <p className="offline-message">{expiredOffline ? "La sesión guardada venció." : "No hay una sesión guardada disponible."} Conectate a internet para iniciar sesión.</p>}<form onSubmit={(event) => void submit(event)}><label>Usuario o email<input autoComplete="username" disabled={saving || !online} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} /></label><label>Contraseña<input autoComplete="current-password" disabled={saving || !online} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={saving || !online}>{saving ? "Ingresando…" : "Ingresar"}</button></form></section></main>;
}

export function App() {
  const online = useOnlineStatus();
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<LocalAccessContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiredOffline, setExpiredOffline] = useState(false);
  const configError = configurationError();

  useEffect(() => {
    const client = supabase(); if (!client) return;
    let current = true;
    const applySession = (session: { user: { id: string }; expires_at?: number } | null) => {
      if (!current) return;
      const expired = !online && Boolean(session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000));
      setExpiredOffline(expired);
      setUserId(session && !expired ? session.user.id : null);
      setLoading(false);
    };
    void client.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { current = false; subscription.subscription.unsubscribe(); };
  }, [online]);

  useEffect(() => {
    if (!userId) { setAccess(null); return; }
    let current = true;
    setLoading(true);
    void (async () => {
      if (!online) {
        const cached = await getCachedAccessContext(userId);
        if (current) { setAccess(cached); setLoading(false); }
        return;
      }
      const client = supabase(); if (!client) return;
      const membership = await client.from("business_memberships").select("business_id,role").eq("is_active", true).order("created_at").limit(1).maybeSingle();
      if (!current) return;
      if (membership.error || !membership.data) {
        if (!navigator.onLine) setAccess(await getCachedAccessContext(userId)); else setAccess(null);
        setLoading(false);
        return;
      }
      const business = await client.from("businesses").select("name").eq("id", membership.data.business_id).maybeSingle();
      if (!current) return;
      if (business.error || !business.data) { setAccess(null); setLoading(false); return; }
      const cached = await getCachedAccessContext(userId);
      const nextAccess: LocalAccessContext = {
        userId,
        businessId: membership.data.business_id,
        businessName: business.data.name,
        role: membership.data.role,
        selectedBranchId: cached?.businessId === membership.data.business_id ? cached.selectedBranchId : null,
        updatedAt: new Date().toISOString(),
      };
      await saveAccessContext(nextAccess);
      if (current) { setAccess(nextAccess); setLoading(false); }
    })();
    return () => { current = false; };
  }, [online, userId]);

  if (configError) return <main className="auth"><section><h1>Configuración pendiente</h1><p>{configError}</p></section></main>;
  if (loading) return <main className="auth"><section><h1>Preparando POS…</h1></section></main>;
  if (!userId) return <Login expiredOffline={expiredOffline} online={online} />;
  if (!access && !online) return <main className="auth"><section><h1>{FIRST_SYNC_TITLE}</h1><p>{FIRST_SYNC_MESSAGE}</p></section></main>;
  if (!access) return <main className="auth"><section><h1>Sin acceso asignado</h1><p>Tu cuenta no tiene una membresía activa.</p><button onClick={() => void supabase()?.auth.signOut()}>Cerrar sesión</button></section></main>;
  return <Pos access={access} online={online} />;
}

function Pos({ access, online }: { access: LocalAccessContext; online: boolean }) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [shown, setShown] = useState<PosOption[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [cash, setCash] = useState<CashSession | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const autoSyncedBusiness = useRef<string | null>(null);

  const hydrateLocal = useCallback(async (preferredBranchId?: string | null) => {
    const overview = await getLocalOverview(access.businessId);
    setBranches(overview.branches);
    setLastSync(overview.lastSyncAt);
    setHasLocalData(overview.hasLocalData);
    const nextBranch = overview.branches.some((branch) => branch.id === preferredBranchId)
      ? preferredBranchId!
      : overview.branches.find((branch) => branch.isActive)?.id ?? overview.branches[0]?.id ?? "";
    setBranchId(nextBranch);
    if (nextBranch) await saveSelectedBranch(access.userId, access.businessId, nextBranch);
    setCatalogRevision((current) => current + 1);
  }, [access.businessId, access.userId]);

  const syncNow = useCallback(async (preferredBranchId?: string | null) => {
    const client = supabase(); if (!client || !online) return false;
    setSyncing(true); setError(null);
    try {
      await synchronizeCatalog(access.businessId, supabaseSnapshotDownloader(client));
      await hydrateLocal(preferredBranchId);
      return true;
    } catch (syncError) {
      console.error("POS catalog synchronization failed", syncError);
      setError("No se pudo sincronizar. Podés seguir usando los últimos datos locales disponibles.");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [access.businessId, hydrateLocal, online]);

  useEffect(() => { void hydrateLocal(access.selectedBranchId); }, [access.selectedBranchId, hydrateLocal]);
  useEffect(() => {
    if (!online || autoSyncedBusiness.current === access.businessId) return;
    autoSyncedBusiness.current = access.businessId;
    void syncNow(access.selectedBranchId);
  }, [access.businessId, access.selectedBranchId, online, syncNow]);

  const excludedVariantIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);
  useEffect(() => {
    let current = true;
    if (!branchId || !hasLocalData || !query.trim()) { setShown([]); return; }
    void searchLocalCatalog(access.businessId, branchId, query, excludedVariantIds).then((items) => { if (current) setShown(items); });
    return () => { current = false; };
  }, [access.businessId, branchId, catalogRevision, excludedVariantIds, hasLocalData, query]);

  const loadOnlineOperations = useCallback(async () => {
    const client = supabase();
    if (!client || !online || !branchId) { setCash(null); setSales([]); return; }
    const [sessionResult, salesResult] = await Promise.all([
      client.rpc("list_cash_sessions", { target_business_id: access.businessId, target_branch_id: branchId }),
      client.rpc("list_sales", { target_business_id: access.businessId, target_branch_id: branchId }),
    ]);
    const issue = sessionResult.error ?? salesResult.error;
    if (issue) { setError(errorText(issue.message)); return; }
    setCash(((sessionResult.data ?? []) as CashSession[]).find((item) => item.status === "open") ?? null);
    setSales((salesResult.data ?? []) as Sale[]);
  }, [access.businessId, branchId, online]);
  useEffect(() => { void loadOnlineOperations(); }, [loadOnlineOperations]);

  const total = cart.reduce((sum, item) => sum + Math.round((quantity(item.quantity) ?? 0) * item.price), 0);
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  function add(item: PosOption) {
    if (cart.some((line) => line.id === item.id)) return setError("Ese producto ya está en el carrito.");
    setCart((current) => [...current, { ...item, quantity: "1" }]); setQuery(""); setError(null);
  }
  async function scan(event: FormEvent) {
    event.preventDefault();
    if (!branchId) return;
    const exact = await findLocalBarcode(access.businessId, branchId, query);
    if (exact) add(exact); else if (shown[0]) add(shown[0]); else setError("No encontramos un producto para esa búsqueda.");
  }
  async function changeBranch(nextBranchId: string) {
    setBranchId(nextBranchId); setCart([]); setQuery("");
    await saveSelectedBranch(access.userId, access.businessId, nextBranchId);
  }
  async function confirm() {
    const client = supabase(); if (!client || !online || !branchId || !cart.length) return;
    const items = cart.map((item) => ({ variant_id: item.id, quantity: quantity(item.quantity) }));
    if (items.some((item) => item.quantity === null)) return setError("Revisá las cantidades: admiten hasta tres decimales.");
    setBusy(true); setError(null);
    const result = await client.rpc("confirm_sale", { target_business_id: access.businessId, target_branch_id: branchId, sale_payment_method: payment, requested_items: items as Json, request_id: requestId });
    setBusy(false);
    if (result.error) return setError(errorText(result.error.message));
    setCart([]); setRequestId(crypto.randomUUID());
    await syncNow(branchId); await loadOnlineOperations();
  }
  async function cashAction(action: "open" | "close" | "inbound" | "outbound") {
    const client = supabase(); if (!client || !online || !branchId) return;
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
    if (result.error) setError(errorText(result.error.message)); else await loadOnlineOperations();
  }

  return <main className="pos"><header><div><p className="eyebrow">LA ESTANCIA POS</p><strong>{access.businessName}</strong></div><div className="operator"><span>{access.role === "staff" ? "Empleado" : access.role}</span><span>{selectedBranch?.name ?? "Sin sucursal"}</span>{access.role !== "staff" && <a href={adminUrl()}>Administración</a>}<button className="link" onClick={() => void supabase()?.auth.signOut()}>Salir</button></div></header><section className="status"><span className={online ? "online" : "offline"}>{online ? "Conectado" : "Sin conexión"}</span><span>{online ? (cash ? `Caja abierta · ${cash.branch_name}` : "Caja cerrada") : "Caja no disponible sin conexión"}</span><span>{lastSync ? `Última sincronización: ${dateTime(lastSync)}` : "Sin sincronización previa"}</span><button className="link" disabled={!online || syncing} onClick={() => void syncNow(branchId)}>{syncing ? "Sincronizando…" : "Sincronizar"}</button></section>{!hasLocalData && <section className="empty-local"><h1>{FIRST_SYNC_TITLE}</h1><p>{FIRST_SYNC_MESSAGE}</p></section>}<section className="workspace"><div className="catalog"><label>Sucursal<select disabled={!hasLocalData} value={branchId} onChange={(event) => void changeBranch(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.isActive ? "" : " (inactiva)"}</option>)}</select></label><form onSubmit={(event) => void scan(event)}><label>Buscar o escanear producto<input autoFocus disabled={!hasLocalData} placeholder="Nombre, SKU o código de barras" value={query} onChange={(event) => setQuery(event.target.value)} /></label></form><div className="results">{query && shown.map((item) => <button key={item.id} onClick={() => add(item)} type="button"><span>{item.productName}<small>{item.variantName}{item.sku ? ` · SKU ${item.sku}` : ""}</small></span><strong>{money(item.price)}{item.offer ? " · Oferta" : ""}<small>Stock conocido: {item.stock}</small></strong></button>)}{query && !shown.length && <p>Sin resultados vendibles.</p>}</div></div><aside className="cart"><h1>Carrito</h1>{cart.length === 0 ? <p>Buscá o escaneá un producto para empezar.</p> : <div>{cart.map((item, index) => <article key={item.id}><div><strong>{item.productName}</strong><small>{item.variantName} · {money(item.price)}</small></div><input aria-label={`Cantidad de ${item.productName}`} inputMode="decimal" value={item.quantity} onChange={(event) => setCart((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} /><strong>{money(Math.round((quantity(item.quantity) ?? 0) * item.price))}</strong><button className="link danger" onClick={() => setCart((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</button></article>)}</div>}<label>Medio de pago<select value={payment} onChange={(event) => setPayment(event.target.value as Payment)}>{Object.entries(payments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="total"><span>Total</span><strong>{money(total)}</strong></div><button className="charge" disabled={busy || !online || !cart.length} onClick={() => void confirm()}>{busy ? "Procesando…" : online ? "COBRAR" : "CONECTATE PARA COBRAR"}</button>{error && <p className="error" role="alert">{error}</p>}</aside></section><section className="operations"><article><h2>Caja</h2>{!online ? <p>Conectate para operar la caja.</p> : cash ? <><p>Abierta · Efectivo esperado <strong>{money(cash.expected_cash_cents)}</strong></p><div><button disabled={busy} onClick={() => void cashAction("inbound")}>Ingreso</button><button disabled={busy} onClick={() => void cashAction("outbound")}>Egreso</button><button className="secondary" disabled={busy} onClick={() => void cashAction("close")}>Cerrar caja</button></div></> : <><p>No hay una caja abierta para esta sucursal.</p><button disabled={busy || !selectedBranch?.isActive} onClick={() => void cashAction("open")}>Abrir caja</button></>}</article><article><h2>Mis ventas recientes</h2>{!online ? <p>El historial requiere conexión.</p> : sales.length ? <ul>{sales.slice(0, 5).map((sale) => <li key={sale.id}>#{sale.sale_number} · {money(sale.total_cents)} · {dateTime(sale.created_at)}</li>)}</ul> : <p>Todavía no hay ventas para mostrar.</p>}</article></section><p className="offline-note">Catálogo, precios, ofertas y stock provienen de la última sincronización local. Confirmar ventas y operar caja todavía requiere conexión.</p></main>;
}
