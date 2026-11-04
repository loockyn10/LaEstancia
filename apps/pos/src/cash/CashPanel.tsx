import { type FormEvent, useEffect, useState } from "react";
import { formatPesos, parsePesos } from "@pet-shop/domain";
import { Button, Dialog, Field } from "@pet-shop/ui";
import { describeError } from "../lib/errors";
import { type CashAction, type CashSession, runCashAction } from "./cash-api";

const titles: Record<CashAction, string> = { open: "Abrir caja", close: "Cerrar caja", inbound: "Registrar ingreso", outbound: "Registrar egreso" };
const amountLabels: Record<CashAction, string> = { open: "Efectivo inicial", close: "Efectivo contado", inbound: "Importe", outbound: "Importe" };
const CASH_ERROR = "No se pudo completar la operación de caja. Intentá nuevamente.";

type Props = {
  online: boolean;
  businessId: string;
  branchId: string;
  branchActive: boolean;
  session: CashSession | null;
  onChanged: () => void;
};

/** Caja operativa: abrir, registrar ingresos/egresos y cerrar. Requiere conexión (todavía no hay caja offline). */
export function CashPanel({ online, businessId, branchId, branchActive, session, onChanged }: Props) {
  const [action, setAction] = useState<CashAction | null>(null);

  return (
    <article className="panel">
      <h2>Caja</h2>
      {!online ? (
        <p className="muted">Conectate para operar la caja.</p>
      ) : session ? (
        <>
          <p>Abierta · Efectivo esperado <strong>{formatPesos(session.expected_cash_cents)}</strong></p>
          <div className="actions">
            <Button compact onClick={() => setAction("inbound")} variant="secondary">Ingreso</Button>
            <Button compact onClick={() => setAction("outbound")} variant="secondary">Egreso</Button>
            <Button compact onClick={() => setAction("close")} variant="danger">Cerrar caja</Button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">No hay una caja abierta para esta sucursal.</p>
          <Button disabled={!branchActive} onClick={() => setAction("open")}>Abrir caja</Button>
        </>
      )}
      <CashDialog
        action={action}
        branchId={branchId}
        businessId={businessId}
        onClose={() => setAction(null)}
        onDone={() => { setAction(null); onChanged(); }}
        session={session}
      />
    </article>
  );
}

function CashDialog({ action, branchId, businessId, session, onClose, onDone }: { action: CashAction | null; branchId: string; businessId: string; session: CashSession | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount("");
    setReason("");
    setError(null);
  }, [action]);

  const isMovement = action === "inbound" || action === "outbound";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const cents = parsePesos(amount);
    if (cents === null || (isMovement && cents <= 0)) return setError("Ingresá un importe válido.");
    if (isMovement && !reason.trim()) return setError("Ingresá un motivo para el movimiento.");
    setSaving(true);
    setError(null);
    try {
      await runCashAction({ businessId, branchId, action, openSession: session, amountCents: cents, reason: reason.trim() });
      onDone();
    } catch (failure) {
      setError(describeError(failure, CASH_ERROR));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} onClose={onClose} open={action !== null} size="sm" title={action ? titles[action] : ""}>
      <form onSubmit={(event) => void submit(event)}>
        {action === "close" && session && <p className="cash-expected">Efectivo esperado: <strong>{formatPesos(session.expected_cash_cents)}</strong></p>}
        <Field label={action ? amountLabels[action] : "Importe"}>
          <input autoFocus inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Ej. 12500,50" required value={amount} />
        </Field>
        {isMovement && <Field label="Motivo"><input maxLength={500} onChange={(event) => setReason(event.target.value)} required value={reason} /></Field>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : action === "close" ? "Confirmar cierre" : "Guardar"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}
