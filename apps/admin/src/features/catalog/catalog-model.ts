import type { Barcode, CatalogVariant, Product, ProductDraft, Variant } from "./types";

export const blankVariant = (): Variant => ({ name: "Presentación única", sku: "", is_active: true, barcodes: [] });

export const blankProduct = (): ProductDraft => ({
  name: "",
  description: "",
  is_active: true,
  brand_id: null,
  category_id: null,
  variants: [blankVariant()],
});

export const productDraft = (product?: Product): ProductDraft =>
  product
    ? {
        name: product.name,
        description: product.description,
        is_active: product.is_active,
        brand_id: product.brand_id,
        category_id: product.category_id,
        variants: product.variants.length ? product.variants : [blankVariant()],
      }
    : blankProduct();

/** Aplana productos → presentaciones guardadas (las que ya tienen id). */
export function flattenVariants(products: readonly Product[]): CatalogVariant[] {
  return products.flatMap((product) =>
    product.variants.flatMap((variant) =>
      variant.id
        ? [{
            id: variant.id,
            productId: product.id,
            productName: product.name,
            variantName: variant.name,
            label: `${product.name} · ${variant.name}`,
            sku: variant.sku,
            barcodes: variant.barcodes.map((barcode) => barcode.code),
            primaryBarcode: variant.barcodes.find((barcode) => barcode.is_primary)?.code ?? null,
            brandId: product.brand_id,
            isActive: product.is_active && variant.is_active,
          }]
        : [],
    ),
  );
}

const normalize = (value: string) => value.toLocaleLowerCase("es-AR");

/** Búsqueda del listado de productos: nombre, SKU o código de barras de cualquier presentación. */
export function productMatches(product: Product, query: string): boolean {
  const search = normalize(query.trim());
  if (!search) return true;
  return (
    normalize(product.name).includes(search) ||
    product.variants.some(
      (variant) =>
        normalize(variant.sku).includes(search) || variant.barcodes.some((barcode) => normalize(barcode.code).includes(search)),
    )
  );
}

export type DraftValidation = { error: string; clean: null } | { error: null; clean: ProductDraft };

/** Normaliza el formulario y valida las reglas que PostgreSQL volverá a imponer (SKU/barcode únicos, un principal). */
export function validateProductDraft(draft: ProductDraft): DraftValidation {
  const clean: ProductDraft = {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    variants: draft.variants.map((variant) => ({
      ...variant,
      name: variant.name.trim(),
      sku: variant.sku.trim(),
      barcodes: variant.barcodes.map((item): Barcode => ({ ...item, code: item.code.trim() })).filter((item) => item.code),
    })),
  };
  if (!clean.name || clean.variants.some((item) => !item.name)) {
    return { error: "Completá el nombre del producto y de cada presentación.", clean: null };
  }
  const skus = clean.variants.filter((item) => item.sku).map((item) => item.sku.toLowerCase());
  const codes = clean.variants.flatMap((item) => item.barcodes.map((code) => code.code.toLowerCase()));
  if (new Set(skus).size !== skus.length) return { error: "No repitas un SKU dentro del mismo producto.", clean: null };
  if (new Set(codes).size !== codes.length) return { error: "No repitas un código de barras dentro del mismo producto.", clean: null };
  if (clean.variants.some((item) => item.barcodes.filter((code) => code.is_primary).length > 1)) {
    return { error: "Cada presentación puede tener un solo código principal.", clean: null };
  }
  return { error: null, clean };
}
