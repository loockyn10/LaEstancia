import { useMemo } from "react";
import { formatCalendarDate, formatPesos } from "@pet-shop/domain";
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Select } from "@pet-shop/ui";
import { useCatalog } from "../catalog/catalog-context";
import { type CatalogItem, type ItemPatch, type PriceList, fileExtension } from "./supplier-lists-api";
import type { SupplierColumn } from "./supplier-price-list-import";
import { matchingSelectionPatch } from "./supplier-price-list-matching";
import { useSupplierListWorkflow } from "./useSupplierListWorkflow";

const money = (cents: number | null) => formatPesos(cents, "—");
const columnFields: Array<[SupplierColumn, string]> = [
  ["name", "Producto / descripción"], ["supplier_code", "Código proveedor"], ["barcode", "Código de barras"], ["cost", "Costo"],
  ["suggested_retail_price_cents", "PVP sugerido"], ["presentation", "Presentación"], ["brand", "Marca"], ["category", "Categoría"],
];
const matchReasonLabel = (reason: CatalogItem["match_reason"]) =>
  reason === "supplier_code" ? "Coincidencia por código de proveedor" : reason === "barcode" ? "Coincidencia por EAN / barcode" : reason === "sku" ? "Coincidencia por SKU" : reason === "manual" ? "Relacionado manualmente" : null;
const optionText = (option: CatalogItem["supplier_purchase_options"][number]) => `${option.purchase_unit} x${option.stock_units_per_purchase} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}`;

export function SupplierPriceListsPage() {
  const { businessId, variants } = useCatalog();
  const flow = useSupplierListWorkflow(businessId, variants);
  const { selected, items, variantPrices } = flow;
  const supplierName = (id: string) => flow.suppliers.find((supplier) => supplier.id === id)?.name ?? "Proveedor";
  // Una sola lista de opciones compartida por todas las filas (evita N × V objetos por render).
  const variantOptions = useMemo(
    () => [{ value: "", label: "Sin relacionar" }, ...variants.map((variant) => ({ value: variant.id, label: variant.label, hint: variant.barcodes[0] }))],
    [variants],
  );

  function salePricePreview(item: CatalogItem) {
    const pvp = item.suggested_retail_price_cents;
    if (pvp === null) return item.create_catalog_product ? "Sin PVP: el producto nuevo quedará sin precio de venta para revisión." : "Sin PVP proveedor.";
    if (!item.product_variant_id) return item.create_catalog_product ? `Producto nuevo · PVP proveedor ${money(pvp)} · precio inicial ${money(pvp)} · origen PVP proveedor.` : `PVP proveedor ${money(pvp)} · falta relacionar o confirmar producto nuevo.`;
    const current = variantPrices[item.product_variant_id];
    if (!current) return `PVP proveedor ${money(pvp)} · la presentación no tiene precio actual: iniciará siguiendo este PVP.`;
    if (current.price_source === "manual") return `PVP nuevo ${money(pvp)} · precio de venta ${money(current.amount_cents)} · precio manual: se mantiene.`;
    if (current.supplier_id === selected?.supplier_id) return `PVP anterior ${money(current.amount_cents)} · PVP nuevo ${money(pvp)} · precio venta ${money(current.amount_cents)} → ${money(pvp)}.`;
    return `PVP nuevo ${money(pvp)} · precio de venta ${money(current.amount_cents)} · sigue el PVP de otro proveedor: se mantiene.`;
  }

  const statusText = (list: PriceList) =>
    list.status === "draft" ? "Interpretación pendiente"
      : list.status === "reviewed" ? (flow.pendingVisualPages[list.id]?.length ? `Revisión parcial (${flow.pendingVisualPages[list.id].length} páginas pendientes)` : "Revisar")
      : "Aplicada";

  const headerRows = flow.spreadsheet?.sheets[flow.sheetName] ?? [];
  const headerCells = headerRows[flow.headerRowIndex] ?? [];

  return (
    <>
      <PageHeader
        description="El archivo se conserva y cada lista se revisa antes de aplicar costos. El PVP puede iniciar o actualizar precios que siguen explícitamente a ese proveedor; nunca pisa precios manuales."
        eyebrow="Compras"
        title="Listas de proveedores"
      />

      <Card className="import-panel" title="1. Importar lista">
        <div className="grid">
          <Field label="Proveedor">
            <Select
              aria-label="Proveedor"
              onChange={flow.setSupplierId}
              options={flow.suppliers.filter((supplier) => supplier.is_active).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              placeholder="Elegí un proveedor"
              value={flow.supplierId}
            />
          </Field>
          <Field label="Lista de proveedor">
            <input accept=".csv,.xlsx,.pdf,.jpg,.jpeg,.png,text/csv,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void flow.chooseFile(event)} type="file" />
          </Field>
        </div>
        {flow.file && <p className="muted">{flow.file.name} · {fileExtension(flow.file.name).toUpperCase()}{flow.pdfPages ? ` · ${flow.pdfPages.length} páginas` : ""}</p>}

        {flow.spreadsheet && (
          <>
            <div className="grid">
              <Field label="Hoja">
                <Select aria-label="Hoja" onChange={flow.chooseSheet} options={flow.spreadsheet.sheetNames.map((name) => ({ value: name, label: name }))} value={flow.sheetName} />
              </Field>
              <Field label="Fila de encabezados">
                <Select
                  aria-label="Fila de encabezados"
                  onChange={(value) => flow.chooseHeaderRow(Number(value))}
                  options={headerRows.slice(0, 30).map((row, index) => ({ value: String(index), label: `Fila ${index + 1}${row.some(Boolean) ? ` · ${row.filter(Boolean).slice(0, 4).join(" | ")}` : " · vacía"}` }))}
                  value={String(flow.headerRowIndex)}
                />
              </Field>
            </div>
            <p className="muted">Encabezados detectados en fila {flow.headerRowIndex + 1}. Revisá el mapeo antes de interpretar.</p>
            <div className="grid">
              {columnFields.map(([field, label]) => (
                <Field key={field} label={label}>
                  <Select
                    aria-label={label}
                    onChange={(value) => flow.mapColumn(field, value === "" ? undefined : Number(value))}
                    options={[{ value: "", label: "Sin mapear" }, ...headerCells.map((header, index) => ({ value: String(index), label: `Columna ${index + 1}${header ? ` · ${header}` : ""}` }))]}
                    value={flow.columnMapping[field] === undefined ? "" : String(flow.columnMapping[field])}
                  />
                </Field>
              ))}
            </div>
            <div className="form-actions"><Button disabled={flow.busy} onClick={() => void flow.interpret()}>Interpretar hoja</Button></div>
          </>
        )}
        {flow.file && !flow.spreadsheet && (
          <div className="form-actions"><Button loading={flow.busy} onClick={() => void flow.interpret()}>{flow.busy ? "Interpretando…" : "Interpretar lista"}</Button></div>
        )}

        {flow.detected && (
          <>
            <Notice>{flow.detected.length} productos detectados determinísticamente. Revisá la muestra antes de guardar.</Notice>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>Código</th><th>EAN</th><th>Costo</th><th>Condición</th><th>Advertencias</th></tr></thead>
                <tbody>
                  {flow.detected.slice(0, 12).map((item, index) => {
                    const option = item.purchase_options[0];
                    return (
                      <tr key={index}>
                        <td>{item.name}<br /><small>{item.presentation}</small></td>
                        <td>{item.supplier_code ?? "—"}</td>
                        <td>{item.barcode ?? "—"}</td>
                        <td>{money(option?.purchase_price_cents ?? null)}</td>
                        <td>{option ? `${option.purchase_unit_label ?? "unidad"} · paga ${option.units_paid}${option.units_bonus ? ` + ${option.units_bonus}` : ""}` : "—"}</td>
                        <td>{item.warnings.join(" ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-actions"><Button loading={flow.busy} onClick={() => void flow.stage()}>{flow.busy ? "Guardando…" : "Guardar para revisión"}</Button></div>
          </>
        )}
      </Card>

      <h2 className="section-title">Listas recibidas</h2>
      {flow.lists.loading && !flow.lists.data ? (
        <LoadingState title="Cargando listas…" />
      ) : flow.lists.error ? (
        <ErrorState onRetry={() => void flow.lists.reload()} title={flow.lists.error} />
      ) : !flow.lists.data?.length ? (
        <EmptyState title="Todavía no hay listas de proveedores." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Proveedor</th><th>Archivo</th><th>Fecha</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {flow.lists.data.map((list) => (
                <tr key={list.id}>
                  <td>{supplierName(list.supplier_id)}</td>
                  <td>{list.file_name}</td>
                  <td>{list.list_date ? formatCalendarDate(list.list_date) : new Intl.DateTimeFormat("es-AR").format(new Date(list.created_at))}</td>
                  <td><Badge tone={list.status === "applied" ? "success" : list.status === "reviewed" ? "info" : "neutral"}>{statusText(list)}</Badge></td>
                  <td>
                    <div className="actions">
                      <Button onClick={() => void flow.loadItems(list)} variant="link">{list.status === "applied" ? "Ver" : "Revisar"}</Button>
                      {list.status !== "applied" && (list.status === "draft" || list.file_format === "pdf" || flow.pendingVisualPages[list.id]?.length) && (
                        <Button disabled={flow.busy} onClick={() => void flow.retryInterpretation(list)} variant="link">Reintentar páginas pendientes</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Card
          className="import-panel"
          description="Los códigos de proveedor quedan vinculados para la próxima lista. Un barcode sólo ayuda a identificar la presentación; no identifica una opción de compra."
          title="2. Matching y preview"
        >
          <p className="eyebrow">{supplierName(selected.supplier_id)}</p>
          <div className="import-summary">
            <strong>{flow.metrics.total} detectados</strong>
            <span>{flow.metrics.linked} relacionados</span>
            <span className={flow.metrics.review ? "invalid-count" : ""}>{flow.metrics.review} por resolver</span>
          </div>
          {!items.length ? (
            <div className="notice notice-info">
              <p>{selected.status === "draft" ? "Interpretación pendiente: no hay candidatos utilizables todavía." : "Esta lista aún no tiene productos interpretados."}</p>
              {selected.status === "draft" && <Button compact loading={flow.busy} onClick={() => void flow.retryInterpretation(selected)} variant="secondary">{flow.busy ? "Reintentando…" : "Reintentar interpretación"}</Button>}
            </div>
          ) : (
            <>
              {selected.status !== "applied" && (
                <div className="form-actions matching-actions">
                  <Button compact disabled={flow.busy || !items.some((item) => !item.product_variant_id)} onClick={() => void flow.toggleCreateProducts()} variant="secondary">
                    {items.some((item) => !item.product_variant_id) && items.filter((item) => !item.product_variant_id).every((item) => item.create_catalog_product) ? "Desmarcar productos nuevos" : "Marcar sin relacionar como producto nuevo"}
                  </Button>
                  <Button compact disabled={flow.busy} onClick={() => void flow.setAllIncluded(true)} variant="secondary">Incluir todos</Button>
                  <Button compact disabled={flow.busy} onClick={() => void flow.setAllIncluded(false)} variant="secondary">Excluir todos</Button>
                </div>
              )}
              {flow.barcodeConflicts.map((conflict) => (
                <p className="form-error" key={conflict.barcode}>Conflicto: el barcode {conflict.barcode} aparece asociado a productos distintos. Relacioná las filas al mismo producto o excluí una antes de aplicar.</p>
              ))}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto / origen</th><th>Opción de compra</th><th>Costo efectivo</th><th>Precio de venta</th><th>Matching</th><th>Aplicar</th></tr></thead>
                  <tbody>
                    {items.map((item) => {
                      const option = item.supplier_purchase_options.find((entry) => entry.is_selected) ?? item.supplier_purchase_options[0];
                      const reason = matchReasonLabel(item.match_reason);
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.detected_name}</strong><br />
                            <small>{item.detected_presentation ?? "—"} · código: {item.supplier_code ?? "—"} · EAN: {item.barcode ?? "—"}</small>
                            {item.warnings.length > 0 && <small className="danger"><br />{item.warnings.join(" ")}</small>}
                          </td>
                          <td>{option ? optionText(option) : "Inválida"}<br /><small>Compra: {money(option?.purchase_price_cents ?? null)}</small></td>
                          <td>{money(option?.effective_unit_cost_cents ?? null)}</td>
                          <td><small>{salePricePreview(item)}</small></td>
                          <td className="match-cell">
                            {selected.status === "applied" ? variants.find((variant) => variant.id === item.product_variant_id)?.label ?? "—" : (
                              <>
                                <Select aria-label={`Presentación para ${item.detected_name}`} onChange={(value) => void flow.saveItem(item, matchingSelectionPatch(value || null) as ItemPatch)} options={variantOptions} searchable value={item.product_variant_id ?? ""} />
                                {reason && <small className="muted">{reason}</small>}
                                <label className="check">
                                  <input checked={item.create_catalog_product} disabled={Boolean(item.product_variant_id)} onChange={(event) => void flow.saveItem(item, { create_catalog_product: event.target.checked, match_status: event.target.checked ? "review_required" : "unmatched", match_reason: null })} type="checkbox" />
                                  Crear producto nuevo
                                </label>
                              </>
                            )}
                          </td>
                          <td>
                            {selected.status === "applied" ? "Aplicada" : (
                              <label className="check"><input checked={item.apply_to_catalog} onChange={(event) => void flow.saveItem(item, { apply_to_catalog: event.target.checked })} type="checkbox" /> Incluir</label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {selected.status !== "applied" && items.length > 0 && (
            <div className="form-actions"><Button loading={flow.busy} onClick={() => void flow.apply()}>{flow.busy ? "Aplicando…" : "3. Confirmar y aplicar"}</Button></div>
          )}
        </Card>
      )}

      {flow.progress && <Notice>{flow.progress}</Notice>}
      {flow.notice && <Notice>{flow.notice}</Notice>}
      {flow.error && <Notice tone="danger">{flow.error}</Notice>}
      {flow.dialog}
    </>
  );
}
