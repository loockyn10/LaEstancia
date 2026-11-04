import { useMemo, useState } from "react";
import { formatDateRange, formatPesos } from "@pet-shop/domain";
import { ActionMenu, Badge, Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader } from "@pet-shop/ui";
import { ListFooter } from "../../lib/ListFooter";
import { describeError } from "../../lib/errors";
import { usePagedList } from "../../lib/usePagedList";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { adjustPrices, listSupplierPvps, loadPricing } from "./pricing-api";
import { type FollowTarget, type OfferTarget, AmountsDialog, FollowPvpDialog, OfferDialog, PriceHistoryDialog } from "./PricingDialogs";
import { type PricingData, type PricingRow, bulkPreview, buildPricingRows, grossMargin, offerStatus, offerStatusTone, parsePercent, priceSourceLabel } from "./pricing-model";

const emptyData: PricingData = { prices: {}, sources: {}, costs: {}, effectivePrices: {}, offers: [] };

export function PricingPage() {
  const { businessId, variants, loading: catalogLoading } = useCatalog();
  const pricing = useQuery(() => loadPricing(businessId), [businessId], "No pudimos cargar los precios.");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [percentInput, setPercentInput] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [amounts, setAmounts] = useState<PricingRow | null>(null);
  const [history, setHistory] = useState<PricingRow | null>(null);
  const [offer, setOffer] = useState<OfferTarget | null>(null);
  const [follow, setFollow] = useState<FollowTarget | null>(null);

  const data = pricing.data ?? emptyData;
  const rows = useMemo(() => buildPricingRows(variants, data), [variants, data]);
  const { visible, total, hasMore, showMore } = usePagedList(rows);
  const selectedRows = rows.filter((row) => selected.includes(row.variantId));
  const adjustment = parsePercent(percentInput);
  const preview = adjustment === null ? [] : bulkPreview(selectedRows, adjustment);
  const rowName = (variantId: string) => rows.find((item) => item.variantId === variantId);

  function saved(message: string) {
    setAmounts(null);
    setOffer(null);
    setFollow(null);
    setNotice(message);
    void pricing.reload();
  }

  async function applyBulk() {
    if (!selectedRows.length) return setError("Seleccioná al menos una presentación con precio definido.");
    if (adjustment === null) return setError("Ingresá un porcentaje válido (puede ser negativo hasta -100).");
    setBulkSaving(true);
    setError(null);
    try {
      await adjustPrices(businessId, selectedRows.map((row) => row.variantId), adjustment);
      setSelected([]);
      setPercentInput("");
      setNotice("La actualización masiva se aplicó correctamente.");
      await pricing.reload();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBulkSaving(false);
    }
  }

  async function openFollow(row: PricingRow) {
    setError(null);
    setNotice(null);
    try {
      const options = await listSupplierPvps(businessId, row.variantId);
      if (!options.length) return setError("No hay un PVP aplicado de proveedor para esta presentación.");
      setFollow({ row, options });
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  const toggle = (variantId: string) => setSelected((current) => (current.includes(variantId) ? current.filter((id) => id !== variantId) : [...current, variantId]));

  return (
    <>
      <PageHeader description="Administrá el precio base y sus ofertas por presentación. Los costos y márgenes son privados para administración." eyebrow="Catálogo" title="Precios" />
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card className="bulk-panel">
        <div>
          <h2>Actualizar precios seleccionados</h2>
          <p className="muted">Aplicá un porcentaje sobre los precios de venta. Los costos no cambian.</p>
        </div>
        <Field label="Ajuste porcentual">
          <input aria-label="Ajuste porcentual" inputMode="decimal" onChange={(event) => setPercentInput(event.target.value)} placeholder="Ej. 8 o -5" value={percentInput} />
        </Field>
        <Button disabled={!selectedRows.length || adjustment === null} loading={bulkSaving} onClick={() => void applyBulk()}>
          {bulkSaving ? "Aplicando…" : "Confirmar actualización"}
        </Button>
      </Card>
      {selectedRows.length > 0 && adjustment !== null && (
        <Card title="Vista previa">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Actual</th><th>Nuevo</th></tr></thead>
              <tbody>
                {preview.map(({ row, nextPrice }) => (
                  <tr key={row.variantId}><td>{row.productName} · {row.variantName}</td><td>{formatPesos(row.price)}</td><td>{formatPesos(nextPrice)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(pricing.loading && !pricing.data) || (catalogLoading && !variants.length) ? (
        <LoadingState title="Cargando precios…" />
      ) : pricing.error ? (
        <ErrorState onRetry={() => void pricing.reload()} title={pricing.error} />
      ) : !rows.length ? (
        <EmptyState text="Cuando cargues productos con presentaciones, vas a poder definir sus precios acá." title="Todavía no hay presentaciones" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th aria-label="Seleccionar" />
                <th>Producto</th><th>Presentación</th><th>SKU</th><th>Precio normal</th><th>Origen</th><th>Oferta vigente</th><th>Precio efectivo</th>
                <th>Costo</th><th>Ganancia bruta</th><th>Margen bruto</th><th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const margin = grossMargin(row);
                return (
                  <tr key={row.variantId}>
                    <td><input aria-label={`Seleccionar ${row.productName} ${row.variantName}`} checked={selected.includes(row.variantId)} disabled={row.price === null} onChange={() => toggle(row.variantId)} type="checkbox" /></td>
                    <td><strong>{row.productName}</strong></td>
                    <td>{row.variantName}</td>
                    <td>{row.sku || "—"}</td>
                    <td>{formatPesos(row.price)}</td>
                    <td>{priceSourceLabel(row.priceSource)}</td>
                    <td>
                      {row.currentOffer ? (
                        <span><strong>{formatPesos(row.currentOffer.promotional_price_cents)}</strong><br /><small>{formatDateRange(row.currentOffer.starts_at, row.currentOffer.ends_at)}</small></span>
                      ) : "—"}
                    </td>
                    <td><strong>{formatPesos(row.effectivePrice)}</strong></td>
                    <td>{formatPesos(row.cost)}</td>
                    <td>{margin ? formatPesos(margin.profit) : "Sin datos"}</td>
                    <td>{margin?.marginPercent == null ? "Sin datos" : `${margin.marginPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}</td>
                    <td className="cell-actions">
                      <ActionMenu
                        items={[
                          { label: "Editar importes", onSelect: () => { setNotice(null); setError(null); setAmounts(row); } },
                          { label: "Nueva oferta", onSelect: () => { setNotice(null); setError(null); setOffer({ row, offer: null }); } },
                          { label: "Seguir PVP de proveedor", onSelect: () => void openFollow(row) },
                          { label: "Ver historial", onSelect: () => setHistory(row) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ListFooter hasMore={hasMore} onShowMore={showMore} shown={visible.length} total={total} />
        </div>
      )}

      {!pricing.loading && data.offers.length > 0 && (
        <Card description="Una oferta desactivada, futura o vencida nunca reemplaza el precio base." title="Ofertas programadas">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Presentación</th><th>Precio promocional</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.offers.map((item) => {
                  const row = rowName(item.variant_id);
                  const status = offerStatus(item);
                  return (
                    <tr key={item.id}>
                      <td>{row ? <><strong>{row.productName}</strong><br /><span className="muted">{row.variantName}</span></> : "Presentación no disponible"}</td>
                      <td>{formatPesos(item.promotional_price_cents)}</td>
                      <td>{formatDateRange(item.starts_at, item.ends_at)}</td>
                      <td><Badge tone={offerStatusTone[status]}>{status}</Badge></td>
                      <td>{row && <Button onClick={() => { setNotice(null); setError(null); setOffer({ row, offer: item }); }} variant="link">Editar</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AmountsDialog businessId={businessId} onClose={() => setAmounts(null)} onSaved={saved} row={amounts} />
      <OfferDialog businessId={businessId} onClose={() => setOffer(null)} onSaved={saved} target={offer} />
      <FollowPvpDialog businessId={businessId} onClose={() => setFollow(null)} onSaved={saved} target={follow} />
      <PriceHistoryDialog businessId={businessId} onClose={() => setHistory(null)} row={history} />
    </>
  );
}
