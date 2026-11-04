import { type ReactNode, useMemo } from "react";
import { useQuery } from "../../lib/useQuery";
import { type CatalogData, loadCatalog } from "./catalog-api";
import { type CatalogContextValue, CatalogContext } from "./catalog-context";
import { flattenVariants } from "./catalog-model";

const empty: CatalogData = { brands: [], categories: [], products: [], branches: [] };

/** Una sola carga del catálogo compartida por todas las pantallas del Admin (productos, stock, precios, etc.). */
export function CatalogProvider({ businessId, children }: { businessId: string; children: ReactNode }) {
  const { data, loading, error, reload } = useQuery(() => loadCatalog(businessId), [businessId], "No pudimos cargar el catálogo.");
  const value = useMemo<CatalogContextValue>(() => {
    const catalog = data ?? empty;
    return { ...catalog, variants: flattenVariants(catalog.products), businessId, loading, error, reload };
  }, [data, businessId, loading, error, reload]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
