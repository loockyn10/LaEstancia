import { useCallback, useEffect, useMemo, useState } from "react";
import { type PaymentMethod, formatDateTime, formatPesos } from "@pet-shop/domain";
import { CartPanel } from "../cart/CartPanel";
import { type CartLine, addLine, changeQuantity, removeLine, toSaleItems } from "../cart/cart";
import { CashPanel } from "../cash/CashPanel";
import { type CashSession, findOpenCashSession } from "../cash/cash-api";
import { CatalogPanel } from "../catalog/CatalogPanel";
import { usePosCatalog } from "../catalog/usePosCatalog";
import { describeError } from "../lib/errors";
import { FIRST_SYNC_MESSAGE, FIRST_SYNC_TITLE } from "../local-db/messages";
import { findOptionByBarcode, searchOptions } from "../local-db/search";
import type { LocalAccessContext, PosOption } from "../local-db/types";
import { type RecentSale, confirmSale, listRecentSales } from "../sales/sales-api";
import { PosHeader } from "./PosHeader";

const SALE_ERROR = "No se pudo completar la operación. Intentá nuevamente.";

/**
 * Pantalla principal. Lee el catálogo siempre desde IndexedDB; las operaciones que exigen servidor
 * (cobrar, caja, historial) sólo se habilitan con conexión.
 */
export function PosScreen({ access, online, onSignOut }: { access: LocalAccessContext; online: boolean; onSignOut: () => void }) {
  const catalog = usePosCatalog(access, online);
  const { branchId } = catalog;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [cash, setCash] = useState<CashSession | null>(null);
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const selectedBranch = catalog.branches.find((branch) => branch.id === branchId);
  const excluded = useMemo(() => new Set(cart.map((line) => line.id)), [cart]);
  const results = useMemo(() => (catalog.hasLocalData ? searchOptions(catalog.options, query, excluded) : []), [catalog.hasLocalData, catalog.options, query, excluded]);

  const loadOperations = useCallback(async () => {
    if (!online || !branchId) {
      setCash(null);
      setSales([]);
      return;
    }
    try {
      const [session, recent] = await Promise.all([findOpenCashSession(access.businessId, branchId), listRecentSales(access.businessId, branchId)]);
      setCash(session);
      setSales(recent);
    } catch (failure) {
      setError(describeError(failure, SALE_ERROR));
    }
  }, [access.businessId, branchId, online]);
  useEffect(() => { void loadOperations(); }, [loadOperations]);

  function add(option: PosOption) {
    const next = addLine(cart, option);
    if (next.error) return setError(next.error);
    setCart(next.cart);
    setQuery("");
    setError(null);
  }

  function submitSearch() {
    if (!branchId) return;
    const exact = findOptionByBarcode(catalog.options, query);
    if (exact && !excluded.has(exact.id)) add(exact);
    else if (results[0]) add(results[0]);
    else setError(exact ? "Ese producto ya está en el carrito." : "No encontramos un producto para esa búsqueda.");
  }

  async function changeBranch(nextBranchId: string) {
    setCart([]);
    setQuery("");
    await catalog.selectBranch(nextBranchId);
  }

  async function charge() {
    if (!online || !branchId || !cart.length) return;
    const items = toSaleItems(cart);
    if (!items) return setError("Revisá las cantidades: admiten hasta tres decimales.");
    setBusy(true);
    setError(null);
    try {
      await confirmSale({ businessId: access.businessId, branchId, payment, items, requestId });
      setCart([]);
      setRequestId(crypto.randomUUID());
      await Promise.all([catalog.refreshStock(), loadOperations()]);
    } catch (failure) {
      setError(describeError(failure, SALE_ERROR));
    } finally {
      setBusy(false);
    }
  }

  const cashLabel = online ? (cash ? `Caja abierta · ${cash.branch_name}` : "Caja cerrada") : "Caja no disponible sin conexión";

  return (
    <main className="pos">
      <PosHeader
        access={access}
        branchName={selectedBranch?.name}
        cashLabel={cashLabel}
        lastSync={catalog.lastSync}
        onSignOut={onSignOut}
        onSync={() => void catalog.syncNow(branchId)}
        online={online}
        syncing={catalog.syncing}
      />
      {catalog.syncError && <p className="notice notice-warning" role="status">{catalog.syncError}</p>}
      {!catalog.hasLocalData && (
        <section className="empty-local">
          <h1>{FIRST_SYNC_TITLE}</h1>
          <p>{FIRST_SYNC_MESSAGE}</p>
        </section>
      )}
      <section className="workspace">
        <CatalogPanel
          branchId={branchId}
          branches={catalog.branches}
          disabled={!catalog.hasLocalData}
          onAdd={add}
          onBranchChange={(id) => void changeBranch(id)}
          onQueryChange={setQuery}
          onSubmit={submitSearch}
          query={query}
          results={results}
        />
        <CartPanel
          busy={busy}
          cart={cart}
          error={error}
          onCharge={() => void charge()}
          onPaymentChange={setPayment}
          onQuantityChange={(id, quantity) => setCart((current) => changeQuantity(current, id, quantity))}
          onRemove={(id) => setCart((current) => removeLine(current, id))}
          online={online}
          payment={payment}
        />
      </section>
      <section className="operations">
        <CashPanel branchActive={Boolean(selectedBranch?.isActive)} branchId={branchId} businessId={access.businessId} onChanged={() => void loadOperations()} online={online} session={cash} />
        <article className="panel">
          <h2>Mis ventas recientes</h2>
          {!online ? (
            <p className="muted">El historial requiere conexión.</p>
          ) : sales.length ? (
            <ul>{sales.slice(0, 5).map((sale) => <li key={sale.id}>#{sale.sale_number} · {formatPesos(sale.total_cents)} · {formatDateTime(sale.created_at)}</li>)}</ul>
          ) : (
            <p className="muted">Todavía no hay ventas para mostrar.</p>
          )}
        </article>
      </section>
      <p className="offline-note">Catálogo, precios, ofertas y stock provienen de la última sincronización local. Confirmar ventas y operar caja todavía requiere conexión.</p>
    </main>
  );
}
