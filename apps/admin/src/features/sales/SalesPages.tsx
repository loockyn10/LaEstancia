import { type FormEvent, useMemo, useState } from "react";
import { type PaymentMethod, formatDateTime, formatPesos, lineTotalCents, paymentMethodLabels, paymentMethods, parsePositiveQuantity } from "@pet-shop/domain";
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { navigate } from "../../lib/router";
import { useQuery } from "../../lib/useQuery";
import { type Branch, type CatalogVariant } from "../catalog/types";
import { useCatalog } from "../catalog/catalog-context";
import { type EffectivePrice, confirmSale, listSaleItems, listSales, loadEffectivePrices } from "./sales-api";

const SALE_ERROR = "No se pudo confirmar la venta. Revisá el carrito e intentá nuevamente.";
const branchOptions = (branches: readonly Branch[]) => branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.is_active ? "" : " (inactiva)"}` }));

export function SalesListPage() {
  const { businessId, branches } = useCatalog();
  const sales = useQuery(() => listSales(businessId), [businessId], "No pudimos cargar las ventas.");
  const [branch, setBranch] = useState("");
  const shown = (sales.data ?? []).filter((sale) => !branch || sale.branch_id === branch);

  return (
    <>
      <PageHeader actions={<Button onClick={() => navigate("/sales/new")}>Nueva venta</Button>} description="Ventas físicas completadas y su detalle histórico." eyebrow="Ventas" title="Ventas" />
      <section className="filters">
        <Select aria-label="Sucursal" onChange={setBranch} options={[{ value: "", label: "Todas las sucursales" }, ...branchOptions(branches)]} value={branch} />
      </section>
      {sales.loading && !sales.data ? (
        <LoadingState title="Cargando ventas…" />
      ) : sales.error ? (
        <ErrorState onRetry={() => void sales.reload()} title={sales.error} />
      ) : !shown.length ? (
        <EmptyState title="Todavía no hay ventas para mostrar." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Sucursal</th><th>Total</th><th>Pago</th><th>Usuario</th><th /></tr></thead>
            <tbody>
              {shown.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.sale_number}</td>
                  <td>{formatDateTime(sale.created_at)}</td>
                  <td>{sale.branch_name}</td>
                  <td>{formatPesos(sale.total_cents)}</td>
                  <td>{paymentMethodLabels[sale.payment_method]}</td>
                  <td>{sale.created_by_name ?? "—"}</td>
                  <td><Button onClick={() => navigate(`/sales/${sale.id}`)} variant="link">Ver</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type SellableVariant = CatalogVariant & { effectivePrice: number | null; onOffer: boolean };
type CartLine = SellableVariant & { quantity: string };

export function SaleEditorPage() {
  const { businessId, branches, variants } = useCatalog();
  const prices = useQuery(() => loadEffectivePrices(businessId), [businessId], "No pudimos cargar los precios vigentes.");
  const [branchId, setBranchId] = useState(branches.find((item) => item.is_active)?.id ?? branches[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const options = useMemo<SellableVariant[]>(() => {
    const map: Map<string, EffectivePrice> = prices.data ?? new Map();
    return variants.filter((variant) => variant.isActive).map((variant) => ({ ...variant, effectivePrice: map.get(variant.id)?.cents ?? null, onOffer: map.get(variant.id)?.onOffer ?? false }));
  }, [variants, prices.data]);

  const search = query.trim().toLowerCase();
  const shown = options.filter((item) => (!search || `${item.label} ${item.sku} ${item.barcodes.join(" ")}`.toLowerCase().includes(search)) && !cart.some((line) => line.id === item.id));
  const lineTotal = (line: CartLine) => lineTotalCents(parsePositiveQuantity(line.quantity), line.effectivePrice);
  const total = cart.reduce((sum, line) => sum + lineTotal(line), 0);

  function add(item: SellableVariant) {
    if (item.effectivePrice === null) return setError("Esta presentación no tiene un precio vigente y no se puede vender.");
    setCart([...cart, { ...item, quantity: "1" }]);
    setQuery("");
    setError(null);
  }

  function scan(event: FormEvent) {
    event.preventDefault();
    const exact = options.find((item) => item.barcodes.includes(query.trim()));
    if (exact) add(exact);
    else if (shown[0]) add(shown[0]);
    else setError("No encontramos una presentación para ese código o búsqueda.");
  }

  async function confirm() {
    if (!branchId) return setError("Elegí una sucursal.");
    if (!cart.length) return setError("Agregá al menos un ítem al carrito.");
    const items = cart.map((line) => ({ variant_id: line.id, quantity: parsePositiveQuantity(line.quantity) }));
    if (items.some((item) => item.quantity === null)) return setError("Revisá las cantidades: admiten hasta tres decimales y deben ser mayores a cero.");
    setSaving(true);
    setError(null);
    try {
      const saleId = await confirmSale({ businessId, branchId, payment, items: items as { variant_id: string; quantity: number }[], requestId });
      setRequestId(crypto.randomUUID());
      navigate(`/sales/${saleId}`);
    } catch (failure) {
      setError(describeError(failure, SALE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader actions={<Button onClick={() => navigate("/sales")} variant="secondary">Volver</Button>} description="El precio y el stock se validan nuevamente al confirmar." eyebrow="Ventas" title="Nueva venta" />
      <section className="card pos-layout">
        <div className="stack">
          <Field label="Sucursal"><Select aria-label="Sucursal" onChange={setBranchId} options={branchOptions(branches)} value={branchId} /></Field>
          <form onSubmit={scan}>
            <Field label="Buscar o escanear">
              <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, SKU o código de barras" value={query} />
            </Field>
          </form>
          {query && (
            <div className="search-results">
              {shown.slice(0, 8).map((item) => (
                <button className="link-button" key={item.id} onClick={() => add(item)} type="button">
                  {item.label}{item.sku ? ` · SKU ${item.sku}` : ""}
                  <small> · {item.effectivePrice === null ? "Sin precio" : formatPesos(item.effectivePrice)}{item.onOffer ? " · Oferta" : ""}</small>
                </button>
              ))}
              {!shown.length && <p className="muted">No hay presentaciones disponibles.</p>}
            </div>
          )}
        </div>
        <div className="stack">
          <h2>Carrito</h2>
          {!cart.length ? (
            <p className="empty">Buscá o escaneá una presentación para agregarla.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th /></tr></thead>
                <tbody>
                  {cart.map((line, index) => (
                    <tr key={line.id}>
                      <td>{line.productName}<br /><small>{line.variantName}{line.onOffer ? " · Oferta vigente" : ""}</small></td>
                      <td>
                        <input aria-label={`Cantidad de ${line.label}`} inputMode="decimal" onChange={(event) => setCart(cart.map((current, currentIndex) => (currentIndex === index ? { ...current, quantity: event.target.value } : current)))} value={line.quantity} />
                      </td>
                      <td>{line.effectivePrice === null ? "—" : formatPesos(line.effectivePrice)}</td>
                      <td>{formatPesos(lineTotal(line))}</td>
                      <td><Button onClick={() => setCart(cart.filter((_, currentIndex) => currentIndex !== index))} variant="link-danger">Quitar</Button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th colSpan={3}>TOTAL</th><th>{formatPesos(total)}</th><th /></tr></tfoot>
              </table>
            </div>
          )}
          <Field label="Medio de pago">
            <Select aria-label="Medio de pago" onChange={(value) => setPayment(value as PaymentMethod)} options={paymentMethods.map((value) => ({ value, label: paymentMethodLabels[value] }))} value={payment} />
          </Field>
          {(error ?? prices.error) && <p className="form-error" role="alert">{error ?? prices.error}</p>}
          <div className="form-actions">
            <Button disabled={!cart.length} loading={saving} onClick={() => void confirm()}>{saving ? "Confirmando…" : `Confirmar venta · ${formatPesos(total)}`}</Button>
          </div>
        </div>
      </section>
    </>
  );
}

export function SaleDetailPage({ saleId }: { saleId: string }) {
  const { businessId } = useCatalog();
  const sales = useQuery(() => listSales(businessId), [businessId], "No pudimos cargar la venta.");
  const sale = sales.data?.find((item) => item.id === saleId);
  const items = useQuery(() => (sale ? listSaleItems(businessId, saleId) : Promise.resolve([])), [businessId, saleId, sale?.id], "No pudimos cargar el detalle de la venta.");

  if (sales.loading && !sales.data) return <LoadingState title="Cargando venta…" />;
  if (!sale) return <EmptyState action={{ label: "Volver a ventas", onClick: () => navigate("/sales") }} title="Venta no encontrada" />;

  return (
    <>
      <PageHeader
        actions={<Button onClick={() => navigate("/sales")} variant="secondary">Volver</Button>}
        description={`${formatDateTime(sale.created_at)} · ${sale.branch_name} · ${paymentMethodLabels[sale.payment_method]} · ${sale.created_by_name ?? "—"}`}
        eyebrow="Ventas"
        title={`Venta #${sale.sale_number}`}
      />
      <Card actions={<strong>{formatPesos(sale.total_cents)}</strong>} title="Detalle">
        {items.error && <Notice tone="danger">{items.error}</Notice>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio vendido</th><th>Subtotal</th></tr></thead>
            <tbody>
              {(items.data ?? []).map((item) => (
                <tr key={item.id}><td>{item.product_name}<br /><small>{item.variant_name}</small></td><td>{item.quantity}</td><td>{formatPesos(item.unit_price_cents)}</td><td>{formatPesos(item.line_total_cents)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Esta venta está completada e inmutable. El precio mostrado es el snapshot registrado al confirmar.</p>
      </Card>
    </>
  );
}
