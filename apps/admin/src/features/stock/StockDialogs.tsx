import { type FormEvent, useEffect, useMemo, useState } from "react";
import { formatDateTime, formatQuantity, parseScaledQuantity, quantityInput } from "@pet-shop/domain";
import { Button, Dialog, Field, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { useQuery } from "../../lib/useQuery";
import { listMovements, recordMovement, saveMinimum } from "./stock-api";
import { type InventoryRow, type MovementInput, movementLabel, previewMovement } from "./stock-model";

const movementOptions = [
  { value: "inbound", label: "Entrada" },
  { value: "outbound", label: "Salida" },
  { value: "adjustment", label: "Ajuste" },
];

const subtitle = (row: InventoryRow) => `${row.productName} · ${row.variantName} · ${row.branchName}`;

type DialogProps = { row: InventoryRow | null; businessId: string; onClose: () => void; onSaved: (message: string) => void };

export function MovementDialog({ row, businessId, onClose, onSaved }: DialogProps) {
  const [type, setType] = useState<MovementInput>("inbound");
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setType("inbound");
    setInput("");
    setNote("");
    setError(null);
  }, [row]);

  const quantity = parseScaledQuantity(input);
  const preview = useMemo(() => (row && quantity !== null ? previewMovement(row.quantity, type, quantity) : null), [row, quantity, type]);
  const invalid = !preview || preview.next < 0n || preview.delta === 0n || (type !== "adjustment" && quantity === 0n);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row || quantity === null || !preview) return setError("Cantidad inválida.");
    if (invalid) return setError(preview.next < 0n ? "Stock insuficiente." : "Cantidad inválida.");
    setSaving(true);
    setError(null);
    try {
      await recordMovement({ businessId, branchId: row.branchId, variantId: row.variantId, type, quantity, note });
      onSaved("El movimiento se registró correctamente.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={row ? subtitle(row) : undefined} onClose={onClose} open={row !== null} title="Registrar movimiento">
      <form className="grid" onSubmit={(event) => void submit(event)}>
        <Field label="Tipo">
          <Select aria-label="Tipo de movimiento" onChange={(value) => setType(value as MovementInput)} options={movementOptions} value={type} />
        </Field>
        <Field label={type === "adjustment" ? "Cantidad física real" : "Cantidad"}>
          <input autoFocus inputMode="decimal" onChange={(event) => setInput(event.target.value)} placeholder="Ej. 2 o 1,250" required value={input} />
        </Field>
        <Field className="wide" label="Motivo o nota (opcional)">
          <textarea maxLength={2000} onChange={(event) => setNote(event.target.value)} value={note} />
        </Field>
        {preview && (
          <p className={`stock-preview wide ${preview.next < 0n ? "invalid" : ""}`}>
            Stock actual: <strong>{formatQuantity(preview.current)}</strong> · Movimiento: <strong>{preview.delta > 0n ? "+" : ""}{formatQuantity(preview.delta)}</strong> · Nuevo stock: <strong>{formatQuantity(preview.next)}</strong>
            {preview.next < 0n && " — Stock insuficiente"}
          </p>
        )}
        <p className="muted wide">El ajuste registra la cantidad física final y calcula automáticamente su diferencia.</p>
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide">
          <Button disabled={invalid} loading={saving} type="submit">{saving ? "Guardando…" : "Confirmar movimiento"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function MinimumDialog({ row, businessId, onClose, onSaved }: DialogProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInput(quantityInput(row?.minimumQuantity));
    setError(null);
  }, [row]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;
    const minimum = input.trim() ? parseScaledQuantity(input) : null;
    if (input.trim() && minimum === null) return setError("Cantidad inválida.");
    setSaving(true);
    setError(null);
    try {
      await saveMinimum({ businessId, branchId: row.branchId, variantId: row.variantId, minimum });
      onSaved("El stock mínimo se guardó correctamente.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={row ? subtitle(row) : undefined} onClose={onClose} open={row !== null} size="sm" title="Stock mínimo">
      <form onSubmit={(event) => void submit(event)}>
        <Field hint="Dejá el campo vacío para no marcar esta presentación como stock bajo." label="Stock mínimo opcional">
          <input autoFocus inputMode="decimal" onChange={(event) => setInput(event.target.value)} placeholder="Ej. 3 o 1,500" value={input} />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : "Guardar mínimo"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function HistoryDialog({ row, businessId, onClose }: Omit<DialogProps, "onSaved">) {
  return (
    <Dialog description={row ? subtitle(row) : undefined} onClose={onClose} open={row !== null} size="lg" title="Historial de movimientos">
      {row && <HistoryTable businessId={businessId} row={row} />}
    </Dialog>
  );
}

function HistoryTable({ businessId, row }: { businessId: string; row: InventoryRow }) {
  const { data, loading, error } = useQuery(() => listMovements(businessId, row.branchId, row.variantId), [businessId, row.branchId, row.variantId]);
  if (loading) return <p className="muted">Cargando historial…</p>;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!data?.length) return <p className="muted">Todavía no hay movimientos registrados.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Stock resultante</th><th>Usuario</th><th>Nota</th></tr></thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{formatDateTime(item.created_at)}</td>
              <td>{movementLabel(item.type)}</td>
              <td>{item.quantity_delta > 0 ? "+" : ""}{formatQuantity(item.quantity_delta)}</td>
              <td>{formatQuantity(item.resulting_quantity)}</td>
              <td>{item.created_by_name || "Usuario registrado"}</td>
              <td>{item.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
