/** Modelos de vista del catálogo (derivados de las tablas de Supabase). */

export type Reference = { id: string; name: string; is_active: boolean };
export type Brand = Reference;
export type Category = Reference;
export type Branch = { id: string; name: string; is_active: boolean };

export type Barcode = { id?: string; code: string; is_primary: boolean };

export type Variant = {
  id?: string;
  name: string;
  sku: string;
  is_active: boolean;
  barcodes: Barcode[];
};

export type Product = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  brand_id: string | null;
  category_id: string | null;
  variants: Variant[];
};

export type ProductDraft = Omit<Product, "id">;

/** Presentación ya guardada, aplanada con los datos de su producto para búsquedas y selectores. */
export type CatalogVariant = {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  /** "Producto · Presentación" */
  label: string;
  sku: string;
  barcodes: string[];
  primaryBarcode: string | null;
  brandId: string | null;
  isActive: boolean;
};

export type ReferenceTable = "brands" | "categories";
