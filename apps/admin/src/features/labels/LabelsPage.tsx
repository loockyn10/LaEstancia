import { useMemo, useState } from "react";
import { formatPesos } from "@pet-shop/domain";
import { Button, Card, ErrorState, LoadingState, PageHeader } from "@pet-shop/ui";
import { fetchAllRows } from "@pet-shop/database";
import { ListFooter } from "../../lib/ListFooter";
import { db } from "../../lib/supabase";
import { usePagedList } from "../../lib/usePagedList";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { type LabelFormat, type LabelItem, PrintedLabel } from "./PrintedLabel";

const formatTitles: Record<LabelFormat, string> = { small: "Etiqueta chica", shelf: "Etiqueta de góndola", offer: "Cartel de oferta" };
const formats: LabelFormat[] = ["small", "shelf", "offer"];

async function loadLabelPrices(businessId: string) {
  const supabase = db();
  const rows = await fetchAllRows((from, to) =>
    supabase.from("variant_effective_prices").select("variant_id,base_price_cents,effective_price_cents,promotional_price_cents").eq("business_id", businessId).order("variant_id").range(from, to),
  );
  return new Map(rows.map((row) => [row.variant_id, row]));
}

export function LabelsPage() {
  const { businessId, variants, brands, loading: catalogLoading } = useCatalog();
  const prices = useQuery(() => loadLabelPrices(businessId), [businessId], "No pudimos cargar los precios efectivos.");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [format, setFormat] = useState<LabelFormat>("small");
  const [search, setSearch] = useState("");

  const items = useMemo<LabelItem[]>(() => {
    const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
    return variants.map((variant) => {
      const price = prices.data?.get(variant.id);
      return {
        variantId: variant.id,
        productName: variant.productName,
        variantName: variant.variantName,
        brandName: variant.brandId ? brandNames.get(variant.brandId) ?? null : null,
        barcode: variant.primaryBarcode,
        basePrice: price?.base_price_cents ?? null,
        effectivePrice: price?.effective_price_cents ?? null,
        promotionalPrice: price?.promotional_price_cents ?? null,
      };
    });
  }, [variants, brands, prices.data]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-AR");
    return !normalized
      ? items
      : items.filter((item) => [item.productName, item.variantName, item.brandName ?? "", item.barcode ?? ""].some((value) => value.toLocaleLowerCase("es-AR").includes(normalized)));
  }, [items, search]);
  const { visible, total, hasMore, showMore } = usePagedList(filtered);

  const selectedItems = items.filter((item) => (selected[item.variantId] ?? 0) > 0);
  const copies = selectedItems.flatMap((item) => Array.from({ length: selected[item.variantId] }, (_, copy) => ({ item, copy })));
  const setQuantity = (variantId: string, quantity: number) => setSelected((current) => ({ ...current, [variantId]: Math.max(0, Math.min(99, quantity || 0)) }));
  const selectVisible = () => setSelected((current) => ({ ...current, ...Object.fromEntries(filtered.map((item) => [item.variantId, current[item.variantId] || 1])) }));

  return (
    <>
      <PageHeader
        actions={<Button disabled={!copies.length} onClick={() => window.print()}>Imprimir</Button>}
        className="no-print"
        description="Elegí presentaciones y cantidades; la vista previa muestra exactamente lo que se imprimirá."
        eyebrow="Catálogo"
        title="Etiquetas"
      />
      {prices.error && <ErrorState onRetry={() => void prices.reload()} title={prices.error} />}
      <Card className="label-controls no-print">
        <fieldset className="format-picker">
          <legend>Formato</legend>
          {formats.map((value) => (
            <label className="radio" key={value}>
              <input checked={format === value} name="label-format" onChange={() => setFormat(value)} type="radio" />
              {formatTitles[value]}
            </label>
          ))}
        </fieldset>
        <div className="label-search">
          <label className="field">
            <span className="field-label">Buscar producto, presentación, marca o código</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Royal Canin o 779…" value={search} />
          </label>
          <Button compact onClick={selectVisible} variant="secondary">Seleccionar visibles</Button>
        </div>
      </Card>

      <Card
        className="label-selection no-print"
        description={selectedItems.length ? `${selectedItems.length} seleccionadas · ${copies.length} copias` : "Seleccioná al menos una presentación."}
        title="Presentaciones"
      >
        {(prices.loading && !prices.data) || (catalogLoading && !variants.length) ? (
          <LoadingState title="Cargando precios efectivos…" />
        ) : !filtered.length ? (
          <p className="muted">No encontramos presentaciones con esa búsqueda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Imprimir</th><th>Producto</th><th>Presentación</th><th>Marca</th><th>Precio normal</th><th>Promoción vigente</th><th>Barcode principal</th><th>Copias</th></tr></thead>
              <tbody>
                {visible.map((item) => {
                  const quantity = selected[item.variantId] ?? 0;
                  return (
                    <tr key={item.variantId}>
                      <td><input aria-label={`Imprimir ${item.productName} ${item.variantName}`} checked={quantity > 0} onChange={(event) => setQuantity(item.variantId, event.target.checked ? Math.max(1, quantity) : 0)} type="checkbox" /></td>
                      <td><strong>{item.productName}</strong></td>
                      <td>{item.variantName}</td>
                      <td>{item.brandName ?? "—"}</td>
                      <td>{formatPesos(item.basePrice)}</td>
                      <td>{item.promotionalPrice === null ? "—" : formatPesos(item.promotionalPrice)}</td>
                      <td>{item.barcode ?? <span className="muted">Sin barcode</span>}</td>
                      <td><input aria-label={`Copias de ${item.productName} ${item.variantName}`} disabled={!quantity} min="1" onChange={(event) => setQuantity(item.variantId, Number(event.target.value))} type="number" value={quantity || ""} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ListFooter hasMore={hasMore} onShowMore={showMore} shown={visible.length} total={total} />
          </div>
        )}
      </Card>

      <section className={`print-preview format-${format}`}>
        <header className="card-header no-print">
          <div>
            <p className="eyebrow">Vista previa</p>
            <h2>{formatTitles[format]}</h2>
          </div>
          <span className="muted">{copies.length ? `${copies.length} unidad${copies.length === 1 ? "" : "es"} a imprimir` : "Sin selecciones"}</span>
        </header>
        {copies.length ? (
          <div className="print-sheet">
            {copies.map(({ item, copy }) => <PrintedLabel format={format} item={item} key={`${item.variantId}-${copy}`} />)}
          </div>
        ) : (
          <p className="empty-preview no-print">La vista previa aparecerá cuando selecciones una presentación.</p>
        )}
      </section>
    </>
  );
}
