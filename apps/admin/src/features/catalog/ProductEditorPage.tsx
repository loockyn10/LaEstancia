import { type FormEvent, useEffect, useState } from "react";
import { Button, EmptyState, Field, LoadingState, PageHeader, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { navigate } from "../../lib/router";
import { saveProduct } from "./catalog-api";
import { blankVariant, productDraft, validateProductDraft } from "./catalog-model";
import { useCatalog } from "./catalog-context";
import type { Barcode, ProductDraft, Reference, Variant } from "./types";

const optionsFor = (empty: string, items: readonly Reference[], inactiveSuffix: string) => [
  { value: "", label: empty },
  ...items.map((item) => ({ value: item.id, label: `${item.name}${item.is_active ? "" : inactiveSuffix}` })),
];

/** `productId` ausente = alta de un producto nuevo. */
export function ProductEditorPage({ productId }: { productId?: string }) {
  const { businessId, products, brands, categories, loading, reload } = useCatalog();
  const product = productId ? products.find((item) => item.id === productId) : undefined;
  const [draft, setDraft] = useState<ProductDraft>(() => productDraft(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(productDraft(product));
    setError(null);
  }, [product]);

  const changeVariant = (index: number, patch: Partial<Variant>) =>
    setDraft((value) => ({ ...value, variants: value.variants.map((variant, current) => (current === index ? { ...variant, ...patch } : variant)) }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateProductDraft(draft);
    if (validation.clean === null) return setError(validation.error);
    setSaving(true);
    setError(null);
    try {
      await saveProduct(businessId, validation.clean, product);
      await reload();
      navigate("/products");
    } catch (failure) {
      setError(describeError(failure, "No se pudo guardar. Verificá los datos e intentá nuevamente."));
    } finally {
      setSaving(false);
    }
  }

  if (productId && !product) {
    return loading ? (
      <LoadingState title="Cargando producto…" />
    ) : (
      <EmptyState action={{ label: "Volver a productos", onClick: () => navigate("/products") }} text="Puede que haya sido eliminado o todavía esté cargando." title="Producto no encontrado" />
    );
  }

  return (
    <>
      <PageHeader
        actions={<Button onClick={() => navigate("/products")} variant="secondary">Cancelar</Button>}
        description="Los datos se guardan en el catálogo de tu negocio."
        eyebrow="Catálogo"
        title={product ? "Editar producto" : "Nuevo producto"}
      />
      <form className="product-form" onSubmit={(event) => void save(event)}>
        <section className="card">
          <h2 className="card-title">Datos principales</h2>
          <div className="grid">
            <Field className="wide" label="Nombre del producto">
              <input autoFocus onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
            </Field>
            <Field label="Marca">
              <Select onChange={(value) => setDraft({ ...draft, brand_id: value || null })} options={optionsFor("Sin marca", brands, " (inactiva)")} value={draft.brand_id ?? ""} />
            </Field>
            <Field label="Categoría">
              <Select onChange={(value) => setDraft({ ...draft, category_id: value || null })} options={optionsFor("Sin categoría", categories, " (inactiva)")} value={draft.category_id ?? ""} />
            </Field>
            <Field className="wide" label="Descripción (opcional)">
              <textarea onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} value={draft.description} />
            </Field>
            <label className="check">
              <input checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} type="checkbox" />
              Producto activo
            </label>
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <div>
              <h2>Presentaciones</h2>
              <p>Usá una sola para productos simples; agregá más cuando cambie el tamaño o formato.</p>
            </div>
            <Button onClick={() => setDraft({ ...draft, variants: [...draft.variants, { ...blankVariant(), name: "" }] })} variant="secondary">
              Agregar presentación
            </Button>
          </header>
          {draft.variants.map((variant, index) => (
            <VariantCard
              canRemove={draft.variants.length > 1}
              index={index}
              key={variant.id ?? `new-${index}`}
              onChange={(patch) => changeVariant(index, patch)}
              onRemove={() => setDraft({ ...draft, variants: draft.variants.filter((_, current) => current !== index) })}
              variant={variant}
            />
          ))}
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : "Guardar producto"}</Button>
          <Button disabled={saving} onClick={() => navigate("/products")} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </>
  );
}

type VariantCardProps = {
  variant: Variant;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<Variant>) => void;
  onRemove: () => void;
};

function VariantCard({ variant, index, canRemove, onChange, onRemove }: VariantCardProps) {
  const changeBarcode = (barcodeIndex: number, patch: Partial<Barcode>) =>
    onChange({ barcodes: variant.barcodes.map((item, current) => (current === barcodeIndex ? { ...item, ...patch } : item)) });

  return (
    <article className="variant">
      <div className="section-header">
        <h3>Presentación {index + 1}</h3>
        {canRemove && <Button onClick={onRemove} variant="link-danger">Eliminar presentación</Button>}
      </div>
      <div className="grid">
        <Field label="Nombre de presentación">
          <input onChange={(event) => onChange({ name: event.target.value })} required value={variant.name} />
        </Field>
        <Field label="SKU (opcional)">
          <input onChange={(event) => onChange({ sku: event.target.value })} value={variant.sku} />
        </Field>
        <label className="check">
          <input checked={variant.is_active} onChange={(event) => onChange({ is_active: event.target.checked })} type="checkbox" />
          Presentación activa
        </label>
      </div>
      <div className="barcode-area">
        <div className="section-header">
          <div>
            <h4>Códigos de barras</h4>
            <p>Podés cargar más de uno y elegir el principal.</p>
          </div>
          <Button compact onClick={() => onChange({ barcodes: [...variant.barcodes, { code: "", is_primary: !variant.barcodes.length }] })} variant="secondary">
            Agregar código
          </Button>
        </div>
        {!variant.barcodes.length ? (
          <p className="muted">Todavía no hay códigos cargados.</p>
        ) : (
          variant.barcodes.map((item, barcodeIndex) => (
            <div className="barcode-row" key={item.id ?? `new-${barcodeIndex}`}>
              <input aria-label={`Código de barras ${barcodeIndex + 1}`} onChange={(event) => changeBarcode(barcodeIndex, { code: event.target.value })} placeholder="Código de barras" required value={item.code} />
              <label className="radio">
                <input
                  checked={item.is_primary}
                  name={`primary-${index}`}
                  onChange={() => onChange({ barcodes: variant.barcodes.map((code, current) => ({ ...code, is_primary: current === barcodeIndex })) })}
                  type="radio"
                />
                Principal
              </label>
              <Button
                onClick={() => {
                  const rest = variant.barcodes.filter((_, current) => current !== barcodeIndex);
                  onChange({ barcodes: rest.map((code, current) => ({ ...code, is_primary: code.is_primary || current === 0 })) });
                }}
                variant="link-danger"
              >
                Quitar
              </Button>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
