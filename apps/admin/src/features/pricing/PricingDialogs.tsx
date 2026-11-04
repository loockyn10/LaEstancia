import { type FormEvent, useEffect, useState } from "react";
import { formatDateTime, formatPesos, localDateTimeInput, parsePesos, pesosInput } from "@pet-shop/domain";
import { Button, DateTimeField, Dialog, Field, Notice, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { useQuery } from "../../lib/useQuery";
import { type SupplierPvpOption, followSupplierPvp, loadPriceHistory, saveAmounts, saveOffer } from "./pricing-api";
import { type Offer, type PricingRow, priceSourceLabel } from "./pricing-model";

const subtitle = (row: PricingRow) => `${row.productName} · ${row.variantName}`;

type Common = { businessId: string; onSaved: (message: string) => void; onClose: () => void };

/** Importe vacío = quitar el importe actual. Devuelve undefined si el texto es inválido. */
const amountFrom = (input: string): number | null | undefined => (input.trim() ? parsePesos(input) ?? undefined : null);

export function AmountsDialog({ row, businessId, onSaved, onClose }: Common & { row: PricingRow | null }) {
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrice(pesosInput(row?.price));
    setCost(pesosInput(row?.cost));
    setError(null);
  }, [row]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;
    const parsedPrice = amountFrom(price);
    const parsedCost = amountFrom(cost);
    if (parsedPrice === undefined || parsedCost === undefined) return setError("Ingresá importes válidos, sin valores negativos y con hasta dos decimales.");
    setSaving(true);
    setError(null);
    try {
      await saveAmounts({ businessId, variantId: row.variantId, price: parsedPrice, cost: parsedCost });
      onSaved("Los importes se guardaron correctamente.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={row ? subtitle(row) : undefined} onClose={onClose} open={row !== null} title="Editar importes">
      <form className="grid" onSubmit={(event) => void submit(event)}>
        <Field label="Precio de venta">
          <input autoFocus inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="Ej. 12500,50" value={price} />
        </Field>
        <Field label="Costo">
          <input inputMode="decimal" onChange={(event) => setCost(event.target.value)} placeholder="Ej. 8000" value={cost} />
        </Field>
        <p className="muted wide">Dejá un campo vacío para quitar su importe actual.</p>
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : "Guardar importes"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}

export type OfferTarget = { row: PricingRow; offer: Offer | null };

export function OfferDialog({ target, businessId, onSaved, onClose }: Common & { target: OfferTarget | null }) {
  const [price, setPrice] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offer = target?.offer;
    setPrice(pesosInput(offer?.promotional_price_cents));
    setStartsAt(localDateTimeInput(offer?.starts_at ?? new Date().toISOString()));
    setEndsAt(localDateTimeInput(offer?.ends_at));
    setActive(offer?.active ?? true);
    setError(null);
  }, [target]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const promotionalPrice = parsePesos(price);
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (promotionalPrice === null || Number.isNaN(start.valueOf()) || (end && (Number.isNaN(end.valueOf()) || end <= start))) {
      return setError("Indicá un precio promocional válido y una vigencia con fin posterior al inicio.");
    }
    setSaving(true);
    setError(null);
    try {
      await saveOffer({ businessId, variantId: target.row.variantId, offerId: target.offer?.id, promotionalPriceCents: promotionalPrice, startsAt: start, endsAt: end, active });
      onSaved("La oferta se guardó correctamente. El precio base no se modificó.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={target ? subtitle(target.row) : undefined} onClose={onClose} open={target !== null} title={target?.offer ? "Editar oferta" : "Nueva oferta"}>
      <form className="grid" onSubmit={(event) => void submit(event)}>
        {target && <Notice className="wide">Precio normal: <strong>{formatPesos(target.row.price)}</strong>. La oferta no modifica este importe.</Notice>}
        <Field className="wide" label="Precio promocional">
          <input autoFocus inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="Ej. 12500,50" required value={price} />
        </Field>
        <Field label="Inicio">
          <DateTimeField aria-label="Inicio de la oferta" onChange={setStartsAt} required value={startsAt} />
        </Field>
        <Field label="Fin (opcional)">
          <DateTimeField aria-label="Fin de la oferta" clearable min={startsAt} onChange={setEndsAt} value={endsAt} />
        </Field>
        <label className="check wide">
          <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
          Activa
        </label>
        <p className="muted wide">No podés guardar dos ofertas activas que se superpongan para la misma presentación.</p>
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : "Guardar oferta"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}

export type FollowTarget = { row: PricingRow; options: SupplierPvpOption[] };

export function FollowPvpDialog({ target, businessId, onSaved, onClose }: Common & { target: FollowTarget | null }) {
  const [supplierId, setSupplierId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const current = target.row.priceSupplierId;
    setSupplierId(target.row.priceSource === "supplier_pvp" && current && target.options.some((option) => option.supplier_id === current) ? current : target.options[0].supplier_id);
    setError(null);
  }, [target]);

  async function submit() {
    if (!target || !supplierId) return;
    setSaving(true);
    setError(null);
    try {
      await followSupplierPvp(businessId, target.row.variantId, supplierId);
      onSaved("El precio volvió a seguir el PVP del proveedor seleccionado.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={target ? subtitle(target.row) : undefined} onClose={onClose} open={target !== null} size="sm" title="Volver a seguir PVP">
      <div className="stack">
        <Field label="Proveedor">
          <Select
            aria-label="Proveedor"
            onChange={setSupplierId}
            options={(target?.options ?? []).map((option) => ({ value: option.supplier_id, label: `${option.supplier_name} · ${formatPesos(option.pvp_cents)}` }))}
            value={supplierId}
          />
        </Field>
        <p className="muted">Se toma el último PVP aplicado de ese proveedor y el precio base volverá a actualizarse con sus próximas listas.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button disabled={!supplierId} loading={saving} onClick={() => void submit()}>{saving ? "Actualizando…" : "Seguir PVP seleccionado"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function PriceHistoryDialog({ row, businessId, onClose }: { row: PricingRow | null; businessId: string; onClose: () => void }) {
  return (
    <Dialog description={row ? subtitle(row) : undefined} onClose={onClose} open={row !== null} size="lg" title="Historial de importes">
      {row && <HistoryTable businessId={businessId} variantId={row.variantId} />}
    </Dialog>
  );
}

function HistoryTable({ businessId, variantId }: { businessId: string; variantId: string }) {
  const { data, loading, error } = useQuery(() => loadPriceHistory(businessId, variantId), [businessId, variantId]);
  if (loading) return <p className="muted">Cargando historial…</p>;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!data?.length) return <p className="muted">Todavía no hay cambios registrados.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Valor</th><th>Usuario</th></tr></thead>
        <tbody>
          {data.map((item) => (
            <tr key={`${item.type}-${item.id}`}>
              <td>{formatDateTime(item.changed_at)}</td>
              <td>{item.type}</td>
              <td>{item.type === "Precio" ? priceSourceLabel(item.price_source) : "—"}</td>
              <td>{item.amount_cents === null ? "Importe quitado" : formatPesos(item.amount_cents)}</td>
              <td>{item.changed_by ? "Usuario registrado" : "No disponible"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
