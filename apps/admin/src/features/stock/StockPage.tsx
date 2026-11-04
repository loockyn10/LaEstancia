import { useEffect, useMemo, useRef, useState } from "react";
import { formatQuantity } from "@pet-shop/domain";
import { ActionMenu, Badge, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Select } from "@pet-shop/ui";
import { ListFooter } from "../../lib/ListFooter";
import { readSearchParam } from "../../lib/router";
import { usePagedList } from "../../lib/usePagedList";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { loadBalances } from "./stock-api";
import { HistoryDialog, MinimumDialog, MovementDialog } from "./StockDialogs";
import { type InventoryRow, type StockStatus, buildInventoryRows, filterInventoryRows, stockStatus, stockStatusLabel } from "./stock-model";

const statusOptions = [
  { value: "all", label: "Todos los estados" },
  { value: "ok", label: "OK" },
  { value: "low", label: "Stock bajo" },
  { value: "out", label: "Sin stock" },
];
const statusTone: Record<StockStatus, "success" | "warning" | "danger"> = { ok: "success", low: "warning", out: "danger" };

export function StockPage() {
  const { businessId, branches, variants, loading: catalogLoading } = useCatalog();
  const balances = useQuery(() => loadBalances(businessId), [businessId], "No pudimos cargar el stock.");
  const [branchFilter, setBranchFilter] = useState(() => readSearchParam("branch") ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => readSearchParam("status") ?? "all");
  const [notice, setNotice] = useState<string | null>(null);
  const [movement, setMovement] = useState<InventoryRow | null>(null);
  const [minimum, setMinimum] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);

  // Sin filtro explícito en la URL, la primera vez se muestra la primera sucursal activa.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !branches.length) return;
    defaultApplied.current = true;
    if (readSearchParam("branch") !== null) return;
    setBranchFilter(branches.find((branch) => branch.is_active)?.id ?? branches[0].id);
  }, [branches]);

  const rows = useMemo(() => {
    const visibleBranches = branchFilter ? branches.filter((branch) => branch.id === branchFilter) : branches;
    return buildInventoryRows(visibleBranches, variants, balances.data ?? {});
  }, [balances.data, branchFilter, branches, variants]);
  const filtered = useMemo(() => filterInventoryRows(rows, query, statusFilter), [rows, query, statusFilter]);
  const { visible, total, hasMore, showMore } = usePagedList(filtered);

  const branchOptions = [
    { value: "", label: "Todas las sucursales" },
    ...branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.is_active ? "" : " (inactiva)"}` })),
  ];

  function saved(message: string) {
    setMovement(null);
    setMinimum(null);
    setNotice(message);
    void balances.reload();
  }

  return (
    <>
      <PageHeader description="El stock se controla por presentación y sucursal. Registrá entradas, salidas y ajustes con trazabilidad." eyebrow="Inventario" title="Stock" />
      {notice && <Notice tone="success">{notice}</Notice>}
      <section className="filters">
        <input aria-label="Buscar stock" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, SKU o código" type="search" value={query} />
        <Select aria-label="Sucursal" onChange={setBranchFilter} options={branchOptions} value={branchFilter} />
        <Select aria-label="Estado de stock" onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
      </section>
      {(balances.loading && !balances.data) || (catalogLoading && !variants.length) ? (
        <LoadingState title="Cargando stock…" />
      ) : balances.error ? (
        <ErrorState onRetry={() => void balances.reload()} title={balances.error} />
      ) : !branches.length ? (
        <EmptyState text="Cuando exista una sucursal, el stock se podrá consultar por presentación." title="No hay sucursales disponibles" />
      ) : !filtered.length ? (
        <EmptyState text={rows.length ? "Probá con otra búsqueda o filtro." : "Cuando cargues productos con presentaciones, van a aparecer acá."} title="No encontramos stock" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Producto</th><th>Presentación</th><th>SKU</th><th>Sucursal</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const status = stockStatus(row);
                return (
                  <tr key={`${row.branchId}:${row.variantId}`}>
                    <td><strong>{row.productName}</strong></td>
                    <td>{row.variantName}</td>
                    <td>{row.sku || "—"}</td>
                    <td>{row.branchName}</td>
                    <td><strong>{formatQuantity(row.quantity)}</strong></td>
                    <td>{row.minimumQuantity === null ? "Sin definir" : formatQuantity(row.minimumQuantity)}</td>
                    <td><Badge tone={statusTone[status]}>{stockStatusLabel[status]}</Badge></td>
                    <td className="cell-actions">
                      <ActionMenu
                        items={[
                          { label: "Registrar movimiento", onSelect: () => { setNotice(null); setMovement(row); } },
                          { label: "Stock mínimo", onSelect: () => { setNotice(null); setMinimum(row); } },
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
      <MovementDialog businessId={businessId} onClose={() => setMovement(null)} onSaved={saved} row={movement} />
      <MinimumDialog businessId={businessId} onClose={() => setMinimum(null)} onSaved={saved} row={minimum} />
      <HistoryDialog businessId={businessId} onClose={() => setHistory(null)} row={history} />
    </>
  );
}
