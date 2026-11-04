import { type FormEvent, useEffect, useMemo, useState } from "react";
import { formatDateTime, formatPesos, parsePesos } from "@pet-shop/domain";
import { ActiveBadge, Button, Dialog, EmptyState, ErrorState, Field, LoadingState, PageHeader, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { useQuery } from "../../lib/useQuery";
import { useCatalog } from "../catalog/catalog-context";
import { type CashAction, type CashSession, listCashSessions, runCashAction } from "./cash-api";

const money = (cents: number | null) => formatPesos(cents, "—");
const actionTitles: Record<CashAction, string> = { open: "Abrir caja", inbound: "Registrar ingreso", outbound: "Registrar egreso", close: "Cerrar caja" };
const CASH_ERROR = "No se pudo completar la operación de caja. Intentá nuevamente.";

export function CashPage() {
  const { businessId, branches } = useCatalog();
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!branches.length) return setBranchId("");
    if (!branches.some((branch) => branch.id === branchId)) setBranchId(branches.find((branch) => branch.is_active)?.id ?? branches[0].id);
  }, [branchId, branches]);

  const sessions = useQuery(() => (branchId ? listCashSessions(businessId, branchId) : Promise.resolve([] as CashSession[])), [businessId, branchId], CASH_ERROR);
  const [action, setAction] = useState<CashAction | null>(null);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const openSession = sessions.data?.find((session) => session.status === "open");
  const history = useMemo(() => (sessions.data ?? []).filter((session) => session.status === "closed"), [sessions.data]);

  return (
    <>
      <PageHeader
        actions={<Button disabled={sessions.loading} onClick={() => void sessions.reload()} variant="secondary">Actualizar</Button>}
        description="Apertura, movimientos y cierre por sucursal."
        eyebrow="Operación diaria"
        title="Caja"
      />
      <section className="cash-branch-picker">
        <Field label="Sucursal">
          <Select aria-label="Sucursal" onChange={setBranchId} options={branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.is_active ? "" : " (inactiva)"}` }))} value={branchId} />
        </Field>
      </section>
      {sessions.error && <ErrorState onRetry={() => void sessions.reload()} title={sessions.error} />}
      {!branches.length ? (
        <EmptyState text="La caja se opera siempre dentro de una sucursal." title="No hay sucursales disponibles" />
      ) : sessions.loading && !sessions.data ? (
        <LoadingState title="Cargando caja…" />
      ) : !openSession ? (
        <EmptyState
          action={selectedBranch?.is_active ? { label: "Abrir caja", onClick: () => setAction("open") } : undefined}
          text={selectedBranch?.is_active ? "Abrí la caja para comenzar a asociar ventas y movimientos." : "La sucursal está inactiva y no puede abrir una caja nueva."}
          title="No hay una caja abierta"
        />
      ) : (
        <section className="card cash-session-card">
          <header className="card-header">
            <div>
              <p className="eyebrow">Caja abierta</p>
              <h2>{openSession.branch_name}</h2>
              <p>Desde {formatDateTime(openSession.opened_at)} · {openSession.opened_by_name ?? "Usuario registrado"}</p>
            </div>
            <ActiveBadge active activeLabel="Abierta" />
          </header>
          {openSession.notes && <p className="notice notice-info">{openSession.notes}</p>}
          <div className="cash-metrics">
            <article><span>Efectivo inicial</span><strong>{money(openSession.opening_cash_cents)}</strong></article>
            <article><span>Ventas en efectivo</span><strong>{money(openSession.cash_sales_cents)}</strong></article>
            <article><span>Ingresos manuales</span><strong>{money(openSession.inbound_cents)}</strong></article>
            <article><span>Egresos manuales</span><strong>{money(openSession.outbound_cents)}</strong></article>
            <article className="cash-expected"><span>Efectivo esperado</span><strong>{money(openSession.expected_cash_cents)}</strong></article>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Medio de pago</th><th>Ventas</th></tr></thead>
              <tbody>
                <tr><td>Efectivo</td><td>{money(openSession.cash_sales_cents)}</td></tr>
                <tr><td>Débito</td><td>{money(openSession.debit_sales_cents)}</td></tr>
                <tr><td>Crédito</td><td>{money(openSession.credit_sales_cents)}</td></tr>
                <tr><td>Transferencia</td><td>{money(openSession.transfer_sales_cents)}</td></tr>
                <tr><td>Otros</td><td>{money(openSession.other_sales_cents)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <Button onClick={() => setAction("inbound")}>Registrar ingreso</Button>
            <Button onClick={() => setAction("outbound")} variant="secondary">Registrar egreso</Button>
            <Button onClick={() => setAction("close")} variant="danger">Cerrar caja</Button>
          </div>
        </section>
      )}

      <section className="card cash-history">
        <header className="card-header">
          <div><h2>Historial de cierres</h2><p>{selectedBranch?.name ?? "Sucursal"} · más recientes primero</p></div>
        </header>
        {!history.length ? (
          <p className="empty">Todavía no hay cierres para esta sucursal.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cierre</th><th>Usuario</th><th>Inicial</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
              <tbody>
                {history.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDateTime(session.closed_at)}</td>
                    <td>{session.closed_by_name ?? "Usuario registrado"}</td>
                    <td>{money(session.opening_cash_cents)}</td>
                    <td>{money(session.expected_cash_cents)}</td>
                    <td>{money(session.counted_cash_cents)}</td>
                    <td>
                      <strong className={(session.difference_cents ?? 0) < 0 ? "negative-amount" : ""}>
                        {session.difference_cents && session.difference_cents > 0 ? "+" : ""}{money(session.difference_cents)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CashActionDialog
        action={action}
        branchId={branchId}
        branchName={selectedBranch?.name}
        businessId={businessId}
        onClose={() => setAction(null)}
        onDone={() => { setAction(null); void sessions.reload(); }}
        openSession={openSession}
      />
    </>
  );
}

type DialogProps = {
  action: CashAction | null;
  branchId: string;
  branchName?: string;
  businessId: string;
  openSession?: CashSession;
  onClose: () => void;
  onDone: () => void;
};

function CashActionDialog({ action, branchId, branchName, businessId, openSession, onClose, onDone }: DialogProps) {
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount("");
    setDetail("");
    setError(null);
  }, [action]);

  const parsed = parsePesos(amount);
  const difference = action === "close" && openSession && parsed !== null ? parsed - openSession.expected_cash_cents : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || parsed === null || (action !== "open" && action !== "close" && parsed <= 0)) return setError("Ingresá un importe válido.");
    if ((action === "inbound" || action === "outbound") && !detail.trim()) return setError("Ingresá un motivo para el movimiento.");
    setSaving(true);
    setError(null);
    try {
      await runCashAction({ businessId, branchId, action, openSession, amountCents: parsed, detail });
      onDone();
    } catch (failure) {
      setError(describeError(failure, CASH_ERROR));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog busy={saving} description={branchName} onClose={onClose} open={action !== null} title={action ? actionTitles[action] : ""}>
      <form className="grid" onSubmit={(event) => void submit(event)}>
        {action === "close" && openSession && (
          <div className="cash-close-summary wide"><span>Efectivo esperado</span><strong>{money(openSession.expected_cash_cents)}</strong></div>
        )}
        <Field className="wide" label={action === "open" ? "Efectivo inicial" : action === "close" ? "Efectivo contado" : "Importe"}>
          <input autoFocus inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Ej. 12500,50" required value={amount} />
        </Field>
        {action === "open" && <Field className="wide" label="Nota (opcional)"><textarea maxLength={1000} onChange={(event) => setDetail(event.target.value)} rows={3} value={detail} /></Field>}
        {(action === "inbound" || action === "outbound") && <Field className="wide" label="Motivo"><textarea maxLength={500} onChange={(event) => setDetail(event.target.value)} required rows={3} value={detail} /></Field>}
        {action === "close" && (
          <p className={`cash-difference wide ${difference !== null && difference < 0 ? "negative" : ""}`}>
            Diferencia estimada: <strong>{difference === null ? "Ingresá el efectivo contado" : `${difference > 0 ? "+" : ""}${money(difference)}`}</strong>
          </p>
        )}
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide">
          <Button loading={saving} type="submit">{saving ? "Guardando…" : action === "close" ? "Confirmar cierre" : "Guardar"}</Button>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancelar</Button>
        </div>
      </form>
    </Dialog>
  );
}
