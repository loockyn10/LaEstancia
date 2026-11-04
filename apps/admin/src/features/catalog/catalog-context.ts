import { createContext, useContext } from "react";
import type { CatalogData } from "./catalog-api";
import type { CatalogVariant } from "./types";

export type CatalogContextValue = CatalogData & {
  /** Presentaciones guardadas, aplanadas con su producto. */
  variants: CatalogVariant[];
  businessId: string;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog debe usarse dentro de CatalogProvider.");
  return value;
}
