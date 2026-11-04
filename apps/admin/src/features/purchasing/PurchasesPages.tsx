import { useEffect, useMemo, useState } from "react";
import { formatCalendarDate, formatPesos, parsePesos, parsePositiveQuantity, pesosInput, todayCalendarDate } from "@pet-shop/domain";
import { Badge, Button, Card, DateField, EmptyState, ErrorState, Field, LoadingState, PageHeader, Select, useConfirm } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { navigate } from "../../lib/router";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { type Branch } from "../catalog/types";
import { type PurchaseHeader, type PurchaseItem, type PurchaseStatus, cancelPurchaseDraft, listPurchases, listSuppliers, loadPurchaseItems, savePurchase } from "./purchasing-api";

const statusLabel: Record<PurchaseStatus, string> = { draft: "Borrador", confirmed: "Confirmada", cancelled: "Cancelada" };
const statusTone: Record<PurchaseStatus, "neutral" | "success" | "danger"> = { draft: "neutral", confirmed: "success", cancelled: "danger" };
const SAVE_ERROR = "No se pudo guardar. Revisá los datos e intentá nuevamente.";
const branchOptions = (branches: readonly Branch[]) => branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.is_active ? "" : " (inactiva)"}` }));

export function PurchasesListPage() {
  const { businessId, branches } = useCatalog();
  const purchases = useQuery(() => listPurchases(businessId), [businessId], "No pudimos cargar las compras.");
  const suppliers = useQuery(() => listSuppliers(businessId), [businessId]);
  const [status, setStatus] = useState("all");
  const [supplierId, setSupplierId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const shown = (purchases.data ?? []).filter((item) => (status === "all" || item.status === status) && (!supplierId || item.supplier_id === supplierId) && (!from || item.purchase_date >= from) && (!to || item.purchase_date <= to));
  const supplierName = (id: string | null) => suppliers.data?.find((item) => item.id === id)?.name ?? "Sin proveedor";
  const branchName = (id: string) => branches.find((item) => item.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader actions={<Button onClick={() => navigate("/purchases/new")}>Nueva compra</Button>} description="Los borradores no afectan stock ni costos." eyebrow="Compras" title="Compras" />
      <section className="filters purchase-filters">
        <Select
          aria-label="Estado"
          onChange={setStatus}
          options={[{ value: "all", label: "Todos los estados" }, ...(Object.keys(statusLabel) as PurchaseStatus[]).map((value) => ({ value, label: statusLabel[value] }))]}
          value={status}
        />
        <Select aria-label="Proveedor" onChange={setSupplierId} options={[{ value: "", label: "Todos los proveedores" }, ...(suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name }))]} value={supplierId} />
        <Field label="Desde"><DateField aria-label="Desde" clearable max={to || undefined} onChange={setFrom} value={from} /></Field>
        <Field label="Hasta"><DateField aria-label="Hasta" clearable min={from || undefined} onChange={setTo} value={to} /></Field>
      </section>
      {purchases.loading && !purchases.data ? (
        <LoadingState title="Cargando compras…" />
      ) : purchases.error ? (
        <ErrorState onRetry={() => void purchases.reload()} title={purchases.error} />
      ) : !shown.length ? (
        <EmptyState title="No hay compras para mostrar." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Sucursal</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td>{formatCalendarDate(item.purchase_date)}</td>
                  <td>{supplierName(item.supplier_id)}</td>
                  <td>{branchName(item.branch_id)}</td>
                  <td><Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge></td>
                  <td><Button onClick={() => navigate(`/purchases/${item.id}`)} variant="link">{item.status === "draft" ? "Editar" : "Ver"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const centsInput = (cents: number) => pesosInput(cents);
/** Ítem en edición: `costText` conserva lo que se está tipeando (por ejemplo "12,") sin pisarlo al parsear. */
type EditorItem = PurchaseItem & { costText?: string };

/** `purchaseId` ausente = compra nueva. */
export function PurchaseEditorPage({ purchaseId }: { purchaseId?: string }) {
  const { businessId, branches, variants } = useCatalog();
  const purchases = useQuery(() => listPurchases(businessId), [businessId], "No pudimos cargar la compra.");
  const suppliers = useQuery(() => listSuppliers(businessId), [businessId]);
  const purchase = purchaseId ? purchases.data?.find((item) => item.id === purchaseId) : undefined;
  const { ask, dialog } = useConfirm();

  const initialHeader = (): PurchaseHeader => ({
    supplier_id: purchase?.supplier_id ?? "",
    branch_id: purchase?.branch_id ?? branches.find((item) => item.is_active)?.id ?? branches[0]?.id ?? "",
    purchase_date: purchase?.purchase_date ?? todayCalendarDate(),
    document_number: purchase?.document_number ?? "",
    notes: purchase?.notes ?? "",
  });
  const [header, setHeader] = useState(initialHeader);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(Boolean(purchaseId));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setHeader(initialHeader()), [purchase, branches]);
  useEffect(() => {
    if (!purchase) return;
    let alive = true;
    setItemsLoading(true);
    loadPurchaseItems(businessId, purchase.id)
      .then((loaded) => alive && setItems(loaded))
      .catch((failure) => alive && setError(describeError(failure, SAVE_ERROR)))
      .finally(() => alive && setItemsLoading(false));
    return () => { alive = false; };
  }, [businessId, purchase]);

  const readonly = purchase !== undefined && purchase.status !== "draft";
  const search = query.trim().toLowerCase();
  const matches = useMemo(
    () => variants.filter((variant) => (!search || `${variant.label} ${variant.sku} ${variant.barcodes.join(" ")}`.toLowerCase().includes(search)) && !items.some((item) => item.variant_id === variant.id)),
    [variants, search, items],
  );
  const itemName = (id: string) => variants.find((variant) => variant.id === id)?.label ?? "Presentación no encontrada";
  const lineTotal = (item: EditorItem) => (parsePositiveQuantity(item.quantity) ?? 0) * item.unit_cost_cents;
  const total = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const changeItem = (index: number, patch: Partial<EditorItem>) => setItems(items.map((item, current) => (current === index ? { ...item, ...patch } : item)));

  async function save(confirm: boolean) {
    if (readonly) return;
    if (!header.branch_id || !header.purchase_date) return setError("Elegí sucursal y fecha.");
    if (items.some((item) => parsePositiveQuantity(item.quantity) === null || item.unit_cost_cents < 0)) return setError("Revisá cantidad y costo de todos los ítems.");
    if (confirm && !items.length) return setError("Agregá al menos un ítem antes de confirmar.");
    if (confirm && !(await ask({ title: "Confirmar compra", message: "Al confirmar se actualizará el stock y el costo actual. Esta acción no podrá deshacerse desde esta pantalla.", confirmLabel: "Confirmar compra" }))) return;
    setSaving(true);
    setError(null);
    try {
      const id = await savePurchase({ businessId, purchaseId: purchase?.id, header, items, confirm });
      await purchases.reload();
      navigate(`/purchases/${id}`);
    } catch (failure) {
      setError(describeError(failure, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  async function cancelDraft() {
    if (!purchase || readonly) return;
    if (!(await ask({ title: "Cancelar borrador", message: "El borrador quedará cancelado y no se podrá editar.", confirmLabel: "Cancelar borrador", tone: "danger" }))) return;
    setSaving(true);
    try {
      await cancelPurchaseDraft(businessId, purchase.id);
      await purchases.reload();
      navigate("/purchases");
    } catch (failure) {
      setError(describeError(failure, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  if (purchaseId && !purchase) {
    return purchases.loading ? <LoadingState title="Cargando compra…" /> : <EmptyState action={{ label: "Volver a compras", onClick: () => navigate("/purchases") }} title="Compra no encontrada" />;
  }
  if (itemsLoading) return <LoadingState title="Cargando compra…" />;

  return (
    <>
      <PageHeader
        actions={<Button onClick={() => navigate("/purchases")} variant="secondary">Volver</Button>}
        description={readonly ? "Esta compra no se puede editar." : "Guardá como borrador o confirmá cuando esté completa."}
        eyebrow="Compras"
        title={purchase ? (purchase.status === "draft" ? "Editar compra" : "Detalle de compra") : "Nueva compra"}
      />
      <Card title="Datos de compra">
        <div className="grid">
          <Field label="Proveedor">
            <Select aria-label="Proveedor" disabled={readonly} onChange={(value) => setHeader({ ...header, supplier_id: value })} options={[{ value: "", label: "Sin proveedor" }, ...(suppliers.data ?? []).map((item) => ({ value: item.id, label: `${item.name}${item.is_active ? "" : " (inactivo)"}` }))]} value={header.supplier_id} />
          </Field>
          <Field label="Sucursal destino">
            <Select aria-label="Sucursal destino" disabled={readonly} onChange={(value) => setHeader({ ...header, branch_id: value })} options={branchOptions(branches)} placeholder="Elegí una sucursal" required value={header.branch_id} />
          </Field>
          <Field label="Fecha"><DateField aria-label="Fecha de la compra" disabled={readonly} onChange={(value) => setHeader({ ...header, purchase_date: value })} required value={header.purchase_date} /></Field>
          <Field label="Referencia / comprobante"><input disabled={readonly} onChange={(event) => setHeader({ ...header, document_number: event.target.value })} value={header.document_number} /></Field>
          <Field className="wide" label="Notas"><textarea disabled={readonly} onChange={(event) => setHeader({ ...header, notes: event.target.value })} rows={3} value={header.notes} /></Field>
        </div>
      </Card>

      <Card description="Buscá por producto, presentación, SKU o código de barras." title="Ítems">
        {!readonly && <div className="filters"><input aria-label="Buscar presentación" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar presentación para agregar" value={query} /></div>}
        {!readonly && query && (
          <div className="search-results">
            {matches.slice(0, 8).map((variant) => (
              <button className="link-button" key={variant.id} onClick={() => { setItems([...items, { variant_id: variant.id, quantity: "1", unit_cost_cents: 0 }]); setQuery(""); }} type="button">
                {variant.label}{variant.sku ? ` · SKU ${variant.sku}` : ""}
              </button>
            ))}
            {!matches.length && <p className="muted">No encontramos presentaciones disponibles.</p>}
          </div>
        )}
        {!items.length ? (
          <p className="empty">Todavía no agregaste ítems.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto / presentación</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th>{!readonly && <th />}</tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id ?? item.variant_id}>
                    <td>{itemName(item.variant_id)}</td>
                    <td>{readonly ? item.quantity : <input aria-label="Cantidad" onChange={(event) => changeItem(index, { quantity: event.target.value })} value={item.quantity} />}</td>
                    <td>
                      {readonly ? formatPesos(item.unit_cost_cents) : (
                        <input aria-invalid={item.costText !== undefined && parsePesos(item.costText) === null} aria-label="Costo unitario" inputMode="decimal" onChange={(event) => changeItem(index, { costText: event.target.value, unit_cost_cents: parsePesos(event.target.value) ?? item.unit_cost_cents })} value={item.costText ?? centsInput(item.unit_cost_cents)} />
                      )}
                    </td>
                    <td>{formatPesos(lineTotal(item))}</td>
                    {!readonly && <td><Button onClick={() => setItems(items.filter((_, current) => current !== index))} variant="link-danger">Quitar</Button></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={3}>TOTAL</th><th>{formatPesos(total)}</th>{!readonly && <th />}</tr></tfoot>
            </table>
          </div>
        )}
      </Card>

      {purchase?.status === "confirmed" && (
        <Card><strong>Confirmada</strong><p>El stock y el costo actual se actualizaron al confirmar. Esta compra es inmutable; la reversión requiere un flujo futuro.</p></Card>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!readonly && (
        <div className="form-actions">
          <Button disabled={saving} onClick={() => void save(false)}>Guardar borrador</Button>
          <Button disabled={saving} onClick={() => void save(true)}>Confirmar compra</Button>
          {purchase && <Button disabled={saving} onClick={() => void cancelDraft()} variant="danger">Cancelar borrador</Button>}
        </div>
      )}
      {dialog}
    </>
  );
}
