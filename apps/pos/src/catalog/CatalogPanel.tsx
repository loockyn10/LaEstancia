import type { FormEvent } from "react";
import { formatPesos } from "@pet-shop/domain";
import { Field, Select } from "@pet-shop/ui";
import type { LocalBranch, PosOption } from "../local-db/types";

type Props = {
  branches: readonly LocalBranch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Enter: confirma un scanner USB o toma el primer resultado. */
  onSubmit: () => void;
  results: readonly PosOption[];
  onAdd: (option: PosOption) => void;
  disabled: boolean;
};

/** Búsqueda/escaneo sobre el catálogo local (IndexedDB). No consulta Supabase. */
export function CatalogPanel({ branches, branchId, onBranchChange, query, onQueryChange, onSubmit, results, onAdd, disabled }: Props) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="panel catalog">
      <Field label="Sucursal">
        <Select
          aria-label="Sucursal"
          disabled={disabled}
          onChange={onBranchChange}
          options={branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.isActive ? "" : " (inactiva)"}` }))}
          placeholder="Sin sucursales"
          value={branchId}
        />
      </Field>
      <form onSubmit={submit}>
        <Field label="Buscar o escanear producto">
          <input autoFocus disabled={disabled} onChange={(event) => onQueryChange(event.target.value)} placeholder="Nombre, SKU o código de barras" type="search" value={query} />
        </Field>
      </form>
      <div className="results" role="list">
        {query &&
          results.map((item) => (
            <button key={item.id} onClick={() => onAdd(item)} role="listitem" type="button">
              <span>
                {item.productName}
                <small>{item.variantName}{item.sku ? ` · SKU ${item.sku}` : ""}</small>
              </span>
              <strong>
                {formatPesos(item.price)}{item.offer ? " · Oferta" : ""}
                <small>Stock conocido: {item.stock}</small>
              </strong>
            </button>
          ))}
        {query && !results.length && <p className="muted">Sin resultados vendibles.</p>}
      </div>
    </div>
  );
}
