import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";

type Role = "owner" | "admin" | "staff";
type Branch = { id: string; name: string; is_active: boolean };
type Overview = {
  sales_total_cents: number;
  sales_count: number;
  average_ticket_cents: number;
  purchase_total_cents: number | null;
  purchase_count: number | null;
  out_of_stock_count: number;
  low_stock_count: number;
  gross_margin_cents: number | null;
  gross_margin_percent: number | null;
  margin_missing_cost_item_count: number | null;
};
type Payment = { payment_method: "cash" | "debit" | "credit" | "transfer" | "other"; total_cents: number; percentage: number };
type TopProduct = { product_name: string; variant_name: string; quantity: number; revenue_cents: number };
type CashSummary = {
  branch_id: string;
  branch_name: string;
  open_session_id: string | null;
  opened_at: string | null;
  expected_cash_cents: number | null;
  last_closed_at: string | null;
  last_difference_cents: number | null;
};
type RangePreset = "today" | "yesterday" | "last7" | "month" | "custom";

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}
function nextMonthStart(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  return localDate(date);
}
function periodFor(preset: Exclude<RangePreset, "custom">) {
  const today = localDate(new Date());
  if (preset === "today") return { start: today, end: addDays(today, 1) };
  if (preset === "yesterday") return { start: addDays(today, -1), end: today };
  if (preset === "last7") return { start: addDays(today, -6), end: addDays(today, 1) };
  return { start: monthStart(today), end: nextMonthStart(today) };
}
function formatPesos(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2,
  }).format(cents / 100);
}
function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(quantity);
}
function formatDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sin cierres";
}
function paymentLabel(method: Payment["payment_method"]) {
  return ({ cash: "Efectivo", debit: "Débito", credit: "Crédito", transfer: "Transferencia", other: "Otros" })[method];
}
function dashboardError(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("not authorized") || normalized.includes("permission")) return "No tenés permiso para consultar el dashboard.";
  if (normalized.includes("date range")) return "Elegí un rango de fechas válido.";
  if (normalized.includes("branch")) return "La sucursal elegida no es válida para este negocio.";
  return "No pudimos cargar el dashboard. Intentá actualizar.";
}

export function Dashboard({ businessId, branches, role, navigate }: { businessId: string; branches: Branch[]; role: Role; navigate: (path: string) => void }) {
  const [preset, setPreset] = useState<RangePreset>("today");
  const initialPeriod = useMemo(() => periodFor("today"), []);
  const [startDate, setStartDate] = useState(initialPeriod.start);
  const [endDate, setEndDate] = useState(addDays(initialPeriod.end, -1));
  const [branchId, setBranchId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [cash, setCash] = useState<CashSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canReadSensitive = role === "owner" || role === "admin";

  const selectedRange = useMemo(() => ({ start: startDate, end: addDays(endDate, 1) }), [endDate, startDate]);
  const load = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    if (selectedRange.end <= selectedRange.start) {
      setError("La fecha de fin debe ser posterior o igual a la de inicio.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = {
      target_business_id: businessId,
      target_branch_id: branchId || undefined,
      target_start_date: selectedRange.start,
      target_end_date: selectedRange.end,
    };
    const [overviewResult, paymentResult, productsResult, cashResult] = await Promise.all([
      client.rpc("dashboard_overview", params),
      client.rpc("dashboard_payment_methods", params),
      client.rpc("dashboard_top_products", { ...params, result_limit: 5 }),
      client.rpc("dashboard_cash_summary", { target_business_id: businessId, target_branch_id: branchId || undefined }),
    ]);
    const failure = overviewResult.error ?? paymentResult.error ?? productsResult.error ?? cashResult.error;
    if (failure) setError(dashboardError(failure.message));
    else {
      setOverview((overviewResult.data?.[0] ?? null) as Overview | null);
      setPayments((paymentResult.data ?? []) as Payment[]);
      setTopProducts((productsResult.data ?? []) as TopProduct[]);
      setCash((cashResult.data ?? []) as CashSummary[]);
    }
    setLoading(false);
  }, [branchId, businessId, selectedRange.end, selectedRange.start]);
  useEffect(() => { void load(); }, [load]);

  function changePreset(next: RangePreset) {
    setPreset(next);
    if (next !== "custom") {
      const period = periodFor(next);
      setStartDate(period.start);
      setEndDate(addDays(period.end, -1));
    }
  }
  function openStock(status: "out" | "low") {
    const query = new URLSearchParams({ status, ...(branchId ? { branch: branchId } : {}) });
    navigate(`/stock?${query.toString()}`);
  }

  return <>
    <header className="page-header dashboard-header">
      <div><p className="eyebrow">Operación diaria</p><h1>Dashboard</h1><p className="subtle">Ventas, stock, compras y caja en un vistazo.</p></div>
      <button className="secondary" disabled={loading} onClick={() => void load()} type="button">Actualizar</button>
    </header>
    <section className="dashboard-filters" aria-label="Filtros del dashboard">
      <label>Período<select value={preset} onChange={(event) => changePreset(event.target.value as RangePreset)}><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="last7">Últimos 7 días</option><option value="month">Este mes</option><option value="custom">Rango personalizado</option></select></label>
      {preset === "custom" && <><label>Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Hasta<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></>}
      <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactiva)"}</option>)}</select></label>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <section className="state-box"><h2>Cargando el dashboard…</h2><p>Calculando el resumen operativo del período.</p></section> : !overview ? <section className="state-box"><h2>No pudimos preparar el dashboard</h2><button onClick={() => void load()} type="button">Reintentar</button></section> : <>
      <section className="dashboard-cards" aria-label="Indicadores principales">
        <article><span>Ventas</span><strong>{formatPesos(overview.sales_total_cents)}</strong><small>{overview.sales_count} {overview.sales_count === 1 ? "venta" : "ventas"}</small></article>
        <article><span>Ticket promedio</span><strong>{formatPesos(overview.average_ticket_cents)}</strong><small>Ventas del período</small></article>
        {canReadSensitive && <article><span>Margen bruto estimado</span>{overview.gross_margin_cents === null ? <strong>Sin cobertura completa</strong> : <strong>{formatPesos(overview.gross_margin_cents)}</strong>}<small>{overview.gross_margin_cents === null ? `${overview.margin_missing_cost_item_count ?? 0} líneas sin costo histórico` : `${overview.gross_margin_percent ?? 0}% sobre ventas · histórico estimado`}</small></article>}
        {canReadSensitive && <article><span>Compras confirmadas</span><strong>{formatPesos(overview.purchase_total_cents)}</strong><small>{overview.purchase_count ?? 0} {overview.purchase_count === 1 ? "compra" : "compras"}</small></article>}
        <button className="dashboard-card alert-card out" onClick={() => openStock("out")} type="button"><span>Sin stock</span><strong>{overview.out_of_stock_count}</strong><small>Presentaciones por sucursal</small></button>
        <button className="dashboard-card alert-card low" onClick={() => openStock("low")} type="button"><span>Stock bajo</span><strong>{overview.low_stock_count}</strong><small>Presentaciones por sucursal</small></button>
      </section>
      {!overview.sales_count && <p className="notice">No hay ventas en el período elegido. Los importes y porcentajes se muestran en cero.</p>}
      <section className="dashboard-grid">
        <article className="dashboard-panel"><header><h2>Ventas por medio de pago</h2><p>Importe y participación del período.</p></header>{payments.every((item) => item.total_cents === 0) ? <p className="empty">Todavía no hay cobros para este período.</p> : <div className="payment-list">{payments.map((item) => <div key={item.payment_method}><div><span>{paymentLabel(item.payment_method)}</span><strong>{formatPesos(item.total_cents)}</strong></div><div className="payment-bar"><i style={{ width: `${item.percentage}%` }} /></div><small>{item.percentage}%</small></div>)}</div>}</article>
        <article className="dashboard-panel"><header><h2>Productos más vendidos</h2><p>Ordenados por cantidad vendida.</p></header>{!topProducts.length ? <p className="empty">Todavía no hay productos vendidos en este período.</p> : <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Presentación</th><th>Cantidad</th><th>Facturación</th></tr></thead><tbody>{topProducts.map((item) => <tr key={`${item.product_name}:${item.variant_name}`}><td><strong>{item.product_name}</strong></td><td>{item.variant_name}</td><td>{formatQuantity(item.quantity)}</td><td>{formatPesos(item.revenue_cents)}</td></tr>)}</tbody></table></div>}</article>
      </section>
      <section className="dashboard-panel dashboard-cash"><header><h2>Caja</h2><p>Cajas abiertas y último cierre de cada sucursal.</p></header>{!cash.length ? <p className="empty">No hay sucursales disponibles.</p> : <div className="table-wrap"><table><thead><tr><th>Sucursal</th><th>Estado</th><th>Efectivo esperado</th><th>Último cierre</th><th>Diferencia</th></tr></thead><tbody>{cash.map((item) => <tr key={item.branch_id}><td><strong>{item.branch_name}</strong></td><td>{item.open_session_id ? <span className="badge badge-active">Abierta</span> : <span className="badge">Sin caja abierta</span>}</td><td>{item.open_session_id ? formatPesos(item.expected_cash_cents) : "—"}</td><td>{formatDateTime(item.last_closed_at)}</td><td>{item.last_difference_cents === null ? "—" : <strong className={item.last_difference_cents < 0 ? "negative-amount" : ""}>{item.last_difference_cents > 0 ? "+" : ""}{formatPesos(item.last_difference_cents)}</strong>}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </>;
}
