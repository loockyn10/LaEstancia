import { useMemo, useState } from "react";
import { addCalendarDays, formatDateTime, formatPesos, paymentMethodLabels } from "@pet-shop/domain";
import { Badge, Button, DateField, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Select } from "@pet-shop/ui";
import { navigate } from "../../lib/router";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { loadDashboard } from "./dashboard-api";
import { type RangePreset, periodFor, rangePresetOptions, toBackendRange } from "./dashboard-range";

const formatQuantity = (quantity: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(quantity);

export function DashboardPage() {
  const { businessId, branches } = useCatalog();
  const initial = useMemo(() => periodFor("today"), []);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(addCalendarDays(initial.end, -1));
  const [branchId, setBranchId] = useState("");

  const range = useMemo(() => toBackendRange(startDate, endDate), [startDate, endDate]);
  const rangeError = range.end <= range.start ? "La fecha de fin debe ser posterior o igual a la de inicio." : null;
  const dashboard = useQuery(
    async () => (rangeError ? null : loadDashboard(businessId, range, branchId)),
    [businessId, range, branchId, rangeError],
    "No pudimos cargar el dashboard. Intentá actualizar.",
  );
  const data = dashboard.data;
  const overview = data?.overview ?? null;

  function changePreset(next: RangePreset) {
    setPreset(next);
    if (next === "custom") return;
    const period = periodFor(next);
    setStartDate(period.start);
    setEndDate(addCalendarDays(period.end, -1));
  }

  function openStock(status: "out" | "low") {
    const query = new URLSearchParams({ status, ...(branchId ? { branch: branchId } : {}) });
    navigate(`/stock?${query.toString()}`);
  }

  const branchOptions = [{ value: "", label: "Todas las sucursales" }, ...branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.is_active ? "" : " (inactiva)"}` }))];

  return (
    <>
      <PageHeader
        actions={<Button disabled={dashboard.loading} onClick={() => void dashboard.reload()} variant="secondary">Actualizar</Button>}
        description="Ventas, stock, compras y caja en un vistazo."
        eyebrow="Operación diaria"
        title="Dashboard"
      />
      <section aria-label="Filtros del dashboard" className="dashboard-filters">
        <Field label="Período">
          <Select aria-label="Período" onChange={(value) => changePreset(value as RangePreset)} options={rangePresetOptions} value={preset} />
        </Field>
        {preset === "custom" && (
          <>
            <Field label="Desde"><DateField aria-label="Desde" max={endDate} onChange={(value) => value && setStartDate(value)} value={startDate} /></Field>
            <Field label="Hasta"><DateField aria-label="Hasta" min={startDate} onChange={(value) => value && setEndDate(value)} value={endDate} /></Field>
          </>
        )}
        <Field label="Sucursal">
          <Select aria-label="Sucursal" onChange={setBranchId} options={branchOptions} value={branchId} />
        </Field>
      </section>

      {rangeError ? (
        <Notice tone="danger">{rangeError}</Notice>
      ) : dashboard.loading && !data ? (
        <LoadingState text="Calculando el resumen operativo del período." title="Cargando el dashboard…" />
      ) : dashboard.error ? (
        <ErrorState onRetry={() => void dashboard.reload()} title={dashboard.error} />
      ) : !overview ? (
        <ErrorState onRetry={() => void dashboard.reload()} title="No pudimos preparar el dashboard" />
      ) : (
        <>
          <section aria-label="Indicadores principales" className="dashboard-cards">
            <article><span>Ventas</span><strong>{formatPesos(overview.sales_total_cents)}</strong><small>{overview.sales_count} {overview.sales_count === 1 ? "venta" : "ventas"}</small></article>
            <article><span>Ticket promedio</span><strong>{formatPesos(overview.average_ticket_cents)}</strong><small>Ventas del período</small></article>
            <article>
              <span>Margen bruto estimado</span>
              <strong>{overview.gross_margin_cents === null ? "Sin cobertura completa" : formatPesos(overview.gross_margin_cents)}</strong>
              <small>{overview.gross_margin_cents === null ? `${overview.margin_missing_cost_item_count ?? 0} líneas sin costo histórico` : `${overview.gross_margin_percent ?? 0}% sobre ventas · histórico estimado`}</small>
            </article>
            <article><span>Compras confirmadas</span><strong>{formatPesos(overview.purchase_total_cents)}</strong><small>{overview.purchase_count ?? 0} {overview.purchase_count === 1 ? "compra" : "compras"}</small></article>
            <button className="dashboard-card alert-card out" onClick={() => openStock("out")} type="button"><span>Sin stock</span><strong>{overview.out_of_stock_count}</strong><small>Presentaciones por sucursal</small></button>
            <button className="dashboard-card alert-card low" onClick={() => openStock("low")} type="button"><span>Stock bajo</span><strong>{overview.low_stock_count}</strong><small>Presentaciones por sucursal</small></button>
          </section>
          {!overview.sales_count && <Notice>No hay ventas en el período elegido. Los importes y porcentajes se muestran en cero.</Notice>}

          <section className="dashboard-grid">
            <article className="dashboard-panel">
              <header><h2>Ventas por medio de pago</h2><p>Importe y participación del período.</p></header>
              {data!.payments.every((item) => item.total_cents === 0) ? (
                <p className="empty">Todavía no hay cobros para este período.</p>
              ) : (
                <div className="payment-list">
                  {data!.payments.map((item) => (
                    <div key={item.payment_method}>
                      <div><span>{paymentMethodLabels[item.payment_method]}</span><strong>{formatPesos(item.total_cents)}</strong></div>
                      <div className="payment-bar"><i style={{ width: `${item.percentage}%` }} /></div>
                      <small>{item.percentage}%</small>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <article className="dashboard-panel">
              <header><h2>Productos más vendidos</h2><p>Ordenados por cantidad vendida.</p></header>
              {!data!.topProducts.length ? (
                <p className="empty">Todavía no hay productos vendidos en este período.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Presentación</th><th>Cantidad</th><th>Facturación</th></tr></thead>
                    <tbody>
                      {data!.topProducts.map((item) => (
                        <tr key={`${item.product_name}:${item.variant_name}`}><td><strong>{item.product_name}</strong></td><td>{item.variant_name}</td><td>{formatQuantity(item.quantity)}</td><td>{formatPesos(item.revenue_cents)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <section className="dashboard-panel dashboard-cash">
            <header><h2>Caja</h2><p>Cajas abiertas y último cierre de cada sucursal.</p></header>
            {!data!.cash.length ? (
              <EmptyState title="No hay sucursales disponibles" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Sucursal</th><th>Estado</th><th>Efectivo esperado</th><th>Último cierre</th><th>Diferencia</th></tr></thead>
                  <tbody>
                    {data!.cash.map((item) => (
                      <tr key={item.branch_id}>
                        <td><strong>{item.branch_name}</strong></td>
                        <td>{item.open_session_id ? <Badge tone="success">Abierta</Badge> : <Badge>Sin caja abierta</Badge>}</td>
                        <td>{item.open_session_id ? formatPesos(item.expected_cash_cents) : "—"}</td>
                        <td>{formatDateTime(item.last_closed_at, "Sin cierres")}</td>
                        <td>{item.last_difference_cents === null ? "—" : <strong className={item.last_difference_cents < 0 ? "negative-amount" : ""}>{item.last_difference_cents > 0 ? "+" : ""}{formatPesos(item.last_difference_cents)}</strong>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
