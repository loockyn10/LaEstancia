import { type FormEvent, useState } from "react";
import { ActiveBadge, Button, Card, EmptyState, ErrorState, Field, LoadingState, PageHeader } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { type Supplier, type SupplierDraft, listSuppliers, saveSupplier } from "./purchasing-api";

const blankDraft = (): SupplierDraft => ({ name: "", contact_name: "", phone: "", email: "", notes: "", is_active: true });
const SAVE_ERROR = "No se pudo guardar. Revisá los datos e intentá nuevamente.";

export function SuppliersPage() {
  const { businessId } = useCatalog();
  const suppliers = useQuery(() => listSuppliers(businessId), [businessId], "No pudimos cargar los proveedores.");
  const items = suppliers.data ?? [];
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(blankDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const search = query.trim().toLowerCase();
  const shown = items.filter((item) => `${item.name} ${item.contact_name ?? ""} ${item.phone ?? ""} ${item.email ?? ""}`.toLowerCase().includes(search));

  function start(item?: Supplier) {
    setEditing(item ?? null);
    setShowForm(true);
    setDraft(item ? { name: item.name, contact_name: item.contact_name ?? "", phone: item.phone ?? "", email: item.email ?? "", notes: item.notes ?? "", is_active: item.is_active } : blankDraft());
    setError(null);
  }

  function cancel() {
    setEditing(null);
    setShowForm(false);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return setError("Ingresá el nombre del proveedor.");
    setSaving(true);
    setError(null);
    try {
      await saveSupplier(businessId, draft, editing?.id);
      cancel();
      await suppliers.reload();
    } catch (failure) {
      setError(describeError(failure, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  const formVisible = showForm || (!suppliers.loading && !items.length && !suppliers.error);

  return (
    <>
      <PageHeader actions={<Button onClick={() => start()}>Nuevo proveedor</Button>} description="Datos de contacto de los proveedores de tu negocio." eyebrow="Compras" title="Proveedores" />
      {formVisible && (
        <Card title={editing ? "Editar proveedor" : "Nuevo proveedor"} actions={showForm ? <Button onClick={cancel} variant="secondary">Cancelar</Button> : undefined}>
          <form className="stack" onSubmit={(event) => void save(event)}>
            <div className="grid">
              <Field label="Nombre"><input autoFocus onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} /></Field>
              <Field label="Contacto"><input onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} value={draft.contact_name} /></Field>
              <Field label="Teléfono"><input onChange={(event) => setDraft({ ...draft, phone: event.target.value })} value={draft.phone} /></Field>
              <Field label="Email"><input onChange={(event) => setDraft({ ...draft, email: event.target.value })} type="email" value={draft.email} /></Field>
              <Field className="wide" label="Notas"><textarea onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} value={draft.notes} /></Field>
              <label className="check"><input checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} type="checkbox" /> Activo</label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions"><Button loading={saving} type="submit">{saving ? "Guardando…" : "Guardar proveedor"}</Button></div>
          </form>
        </Card>
      )}
      <section className="filters">
        <input aria-label="Buscar proveedores" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, contacto, teléfono o email" value={query} />
      </section>
      {suppliers.loading && !suppliers.data ? (
        <LoadingState title="Cargando proveedores…" />
      ) : suppliers.error ? (
        <ErrorState onRetry={() => void suppliers.reload()} title={suppliers.error} />
      ) : !shown.length ? (
        <EmptyState title="No hay proveedores para mostrar." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><br /><small>{item.email ?? ""}</small></td>
                  <td>{item.contact_name ?? "—"}</td>
                  <td>{item.phone ?? "—"}</td>
                  <td><ActiveBadge active={item.is_active} /></td>
                  <td><Button onClick={() => start(item)} variant="link">Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
