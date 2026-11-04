import { type FormEvent, useState } from "react";
import { ActiveBadge, Button, EmptyState, Field, LoadingState, PageHeader } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { saveReference, setReferenceActive } from "./catalog-api";
import { useCatalog } from "./catalog-context";
import type { Reference, ReferenceTable } from "./types";

type Props = { title: string; singular: string; feminine: boolean; table: ReferenceTable };

/** Marcas y categorías comparten comportamiento: listas planas activables. */
export function ReferencesPage({ title, singular, feminine, table }: Props) {
  const { businessId, brands, categories, loading, reload } = useCatalog();
  const items: Reference[] = table === "brands" ? brands : categories;
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const article = feminine ? "una" : "un";

  function reset() {
    setValue("");
    setEditing(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = value.trim();
    if (!clean) return;
    if (items.some((item) => item.id !== editing && item.name.localeCompare(clean, undefined, { sensitivity: "accent" }) === 0)) {
      return setError(`Ya existe ${article} ${singular} con ese nombre.`);
    }
    setSaving(true);
    setError(null);
    try {
      await saveReference(table, businessId, clean, editing ?? undefined);
      reset();
      await reload();
    } catch (failure) {
      setError(describeError(failure, "No se pudo guardar. Verificá los datos e intentá nuevamente."));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: Reference) {
    setSaving(true);
    setError(null);
    try {
      await setReferenceActive(table, businessId, item.id, !item.is_active);
      await reload();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader description={`Mantené tus ${title.toLowerCase()} disponibles y ordenadas.`} eyebrow="Catálogo" title={title} />
      <form className="reference-form card" onSubmit={(event) => void submit(event)}>
        <Field label={editing ? `Editar ${singular}` : `${feminine ? "Nueva" : "Nuevo"} ${singular}`}>
          <input onChange={(event) => setValue(event.target.value)} placeholder={`Nombre de ${feminine ? "la" : "el"} ${singular}`} required value={value} />
        </Field>
        <Button loading={saving} type="submit">{editing ? "Guardar cambios" : `Agregar ${singular}`}</Button>
        {editing && <Button onClick={reset} variant="secondary">Cancelar</Button>}
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !items.length ? (
        <LoadingState title={`Cargando ${title.toLowerCase()}…`} />
      ) : !items.length ? (
        <EmptyState text={`Agregá ${article === "una" ? "la primera" : "el primero"} desde el formulario.`} title={`Todavía no hay ${title.toLowerCase()}`} />
      ) : (
        <section className="reference-list card">
          {items.map((item) => (
            <article className="reference-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <ActiveBadge active={item.is_active} />
              </div>
              <div className="actions">
                <Button
                  onClick={() => {
                    setEditing(item.id);
                    setValue(item.name);
                    setError(null);
                  }}
                  variant="link"
                >
                  Editar
                </Button>
                <Button compact disabled={saving} onClick={() => void toggle(item)} variant="secondary">
                  {item.is_active ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
