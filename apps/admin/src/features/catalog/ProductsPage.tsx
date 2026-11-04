import { useMemo, useState } from "react";
import { ActiveBadge, Button, EmptyState, ErrorState, LoadingState, PageHeader, Select } from "@pet-shop/ui";
import { ListFooter } from "../../lib/ListFooter";
import { navigate } from "../../lib/router";
import { usePagedList } from "../../lib/usePagedList";
import { productMatches } from "./catalog-model";
import { useCatalog } from "./catalog-context";
import type { Reference } from "./types";

const stateOptions = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
  { value: "all", label: "Todos" },
];

const withAll = (label: string, items: readonly Reference[]) => [{ value: "", label }, ...items.map((item) => ({ value: item.id, label: item.name }))];

export function ProductsPage() {
  const { products, brands, categories, loading, error, reload } = useCatalog();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("active");

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          (!brand || product.brand_id === brand) &&
          (!category || product.category_id === category) &&
          (state === "all" || product.is_active === (state === "active")) &&
          productMatches(product, query),
      ),
    [products, query, brand, category, state],
  );
  const { visible, total, hasMore, showMore } = usePagedList(filtered);
  const nameOf = (list: readonly Reference[], id: string | null) => list.find((item) => item.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        actions={<Button onClick={() => navigate("/products/new")}>Nuevo producto</Button>}
        description="Organizá lo que vendés y sus presentaciones."
        eyebrow="Catálogo"
        title="Productos"
      />
      <section className="filters">
        <input aria-label="Buscar productos" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, SKU o código" type="search" value={query} />
        <Select aria-label="Marca" onChange={setBrand} options={withAll("Todas las marcas", brands)} value={brand} />
        <Select aria-label="Categoría" onChange={setCategory} options={withAll("Todas las categorías", categories)} value={category} />
        <Select aria-label="Estado" onChange={setState} options={stateOptions} value={state} />
      </section>
      {loading && !products.length ? (
        <LoadingState title="Cargando productos…" />
      ) : error ? (
        <ErrorState onRetry={() => void reload()} title={error} />
      ) : !filtered.length ? (
        <EmptyState
          action={products.length ? undefined : { label: "Crear producto", onClick: () => navigate("/products/new") }}
          text={products.length ? "Probá con otra búsqueda o filtro." : "Cuando agregues el primero, va a aparecer acá."}
          title="No encontramos productos"
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Producto</th><th>Marca</th><th>Categoría</th><th>Presentaciones</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong></td>
                  <td>{nameOf(brands, product.brand_id)}</td>
                  <td>{nameOf(categories, product.category_id)}</td>
                  <td>{product.variants.length}</td>
                  <td><ActiveBadge active={product.is_active} /></td>
                  <td><Button onClick={() => navigate(`/products/${product.id}`)} variant="link">Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListFooter hasMore={hasMore} onShowMore={showMore} shown={visible.length} total={total} />
        </div>
      )}
    </>
  );
}
