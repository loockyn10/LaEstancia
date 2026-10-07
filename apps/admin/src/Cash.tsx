import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";

type Branch = { id: string; name: string; is_active: boolean };
type CashAction = "open" | "inbound" | "outbound" | "close";
type CashSession = {
  id: string;
  branch_id: string;
  branch_name: string;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  opened_by_name: string | null;
  opening_cash_cents: number;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  counted_cash_cents: number | null;
  expected_cash_cents: number;
  difference_cents: number | null;
  cash_sales_cents: number;
  debit_sales_cents: number;
  credit_sales_cents: number;
  transfer_sales_cents: number;
  other_sales_cents: number;
  inbound_cents: number;
  outbound_cents: number;
  notes: string | null;
};

const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
}).format(cents / 100);

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(value)) : "—";

function parsePesos(value: string) {
  const raw = value.replace(/[\s$]/g, "");
  if (!raw) return null;
  let integer = "";
  let decimals = "";
  const argentine = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  const decimalDot = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (argentine) [, integer, decimals = ""] = argentine;
  else if (decimalDot) [, integer, decimals = ""] = decimalDot;
  else return null;
  const cents = Number(integer.split(".").join("")) * 100 + Number(`${decimals}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function cashError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("already has an open")) return "La sucursal ya tiene una caja abierta.";
  if (message.includes("is not open")) return "La caja ya no está abierta. Actualizá la pantalla.";
  if (message.includes("opening cash") || message.includes("counted cash") || message.includes("movement amount")) return "Ingresá un importe válido.";
  if (message.includes("reason is required")) return "Ingresá un motivo para el movimiento.";
  if (message.includes("invalid cash session branch") || message.includes("invalid cash session")) return "La caja o sucursal no es válida para este negocio.";
  if (message.includes("not authorized") || message.includes("permission") || message.includes("row-level")) return "No tenés permisos para operar esta caja.";
  return "No se pudo completar la operación de caja. Intentá nuevamente.";
}

export function Cash({ businessId, branches }: { businessId: string; branches: Branch[] }) {
  const [branchId, setBranchId] = useState("");
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<CashAction | null>(null);
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branches.length) {
      setBranchId("");
      return;
    }
    if (!branches.some((branch) => branch.id === branchId)) {
      setBranchId(branches.find((branch) => branch.is_active)?.id ?? branches[0].id);
    }
  }, [branchId, branches]);

  const load = useCallback(async () => {
    if (!branchId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    const result = await client.rpc("list_cash_sessions", {
      target_business_id: businessId,
      target_branch_id: branchId,
    });
    if (result.error) setError(cashError(result.error));
    else setSessions((result.data ?? []) as CashSession[]);
    setLoading(false);
  }, [branchId, businessId]);

  useEffect(() => { void load(); }, [load]);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const openSession = sessions.find((session) => session.status === "open");
  const history = useMemo(() => sessions.filter((session) => session.status === "closed"), [sessions]);
  const parsedAmount = parsePesos(amount);
  const closeDifference = action === "close" && openSession && parsedAmount !== null
    ? parsedAmount - openSession.expected_cash_cents
    : null;

  function start(nextAction: CashAction) {
    setAction(nextAction);
    setAmount("");
    setDetail("");
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || parsedAmount === null || (action !== "open" && action !== "close" && parsedAmount <= 0)) {
      setError("Ingresá un importe válido.");
      return;
    }
    if ((action === "inbound" || action === "outbound") && !detail.trim()) {
      setError("Ingresá un motivo para el movimiento.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    setError(null);
    const result = action === "open"
      ? await client.rpc("open_cash_session", {
          target_business_id: businessId,
          target_branch_id: branchId,
          opening_cash_cents: parsedAmount,
          session_notes: detail.trim() || undefined,
        })
      : action === "close" && openSession
        ? await client.rpc("close_cash_session", {
            target_business_id: businessId,
            target_cash_session_id: openSession.id,
            counted_cash_cents: parsedAmount,
          })
        : openSession
          ? await client.rpc("record_cash_movement", {
              target_business_id: businessId,
              target_cash_session_id: openSession.id,
              movement_type: action === "inbound" ? "inbound" : "outbound",
              amount_cents: parsedAmount,
              movement_reason: detail.trim(),
            })
          : { error: { message: "cash session is not open" } };
    setSaving(false);
    if (result.error) {
      setError(cashError(result.error));
      return;
    }
    setAction(null);
    await load();
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Operación diaria</p><h1>Caja</h1><p className="subtle">Apertura, movimientos y cierre por sucursal.</p></div>
      <button className="secondary" disabled={loading} onClick={() => void load()} type="button">Actualizar</button>
    </header>
    <section className="cash-branch-picker">
      <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactiva)"}</option>)}</select></label>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!branches.length ? <section className="state-box"><h2>No hay sucursales disponibles</h2><p>La caja se opera siempre dentro de una sucursal.</p></section>
      : loading ? <section className="state-box"><h2>Cargando caja…</h2></section>
      : !openSession ? <section className="state-box"><h2>No hay una caja abierta</h2><p>{selectedBranch?.is_active ? "Abrí la caja para comenzar a asociar ventas y movimientos." : "La sucursal está inactiva y no puede abrir una caja nueva."}</p>{selectedBranch?.is_active && <button onClick={() => start("open")} type="button">Abrir caja</button>}</section>
      : <>
        <section className="cash-session-card">
          <header className="section-header"><div><p className="eyebrow">Caja abierta</p><h2>{openSession.branch_name}</h2><p>Desde {dateTime(openSession.opened_at)} · {openSession.opened_by_name ?? "Usuario registrado"}</p></div><span className="badge badge-active">Abierta</span></header>
          {openSession.notes && <p className="notice">{openSession.notes}</p>}
          <div className="cash-metrics">
            <article><span>Efectivo inicial</span><strong>{money(openSession.opening_cash_cents)}</strong></article>
            <article><span>Ventas en efectivo</span><strong>{money(openSession.cash_sales_cents)}</strong></article>
            <article><span>Ingresos manuales</span><strong>{money(openSession.inbound_cents)}</strong></article>
            <article><span>Egresos manuales</span><strong>{money(openSession.outbound_cents)}</strong></article>
            <article className="cash-expected"><span>Efectivo esperado</span><strong>{money(openSession.expected_cash_cents)}</strong></article>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Medio de pago</th><th>Ventas</th></tr></thead><tbody><tr><td>Efectivo</td><td>{money(openSession.cash_sales_cents)}</td></tr><tr><td>Débito</td><td>{money(openSession.debit_sales_cents)}</td></tr><tr><td>Crédito</td><td>{money(openSession.credit_sales_cents)}</td></tr><tr><td>Transferencia</td><td>{money(openSession.transfer_sales_cents)}</td></tr><tr><td>Otros</td><td>{money(openSession.other_sales_cents)}</td></tr></tbody></table></div>
          <div className="form-actions cash-actions"><button onClick={() => start("inbound")} type="button">Registrar ingreso</button><button className="secondary" onClick={() => start("outbound")} type="button">Registrar egreso</button><button className="secondary danger" onClick={() => start("close")} type="button">Cerrar caja</button></div>
        </section>
      </>}
    <section className="cash-history">
      <header className="section-header"><div><h2>Historial de cierres</h2><p>{selectedBranch?.name ?? "Sucursal"} · más recientes primero</p></div></header>
      {!history.length ? <p className="empty">Todavía no hay cierres para esta sucursal.</p> : <div className="table-wrap"><table><thead><tr><th>Cierre</th><th>Usuario</th><th>Inicial</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>{history.map((session) => <tr key={session.id}><td>{dateTime(session.closed_at)}</td><td>{session.closed_by_name ?? "Usuario registrado"}</td><td>{money(session.opening_cash_cents)}</td><td>{money(session.expected_cash_cents)}</td><td>{money(session.counted_cash_cents)}</td><td><strong className={(session.difference_cents ?? 0) < 0 ? "negative-amount" : ""}>{session.difference_cents && session.difference_cents > 0 ? "+" : ""}{money(session.difference_cents)}</strong></td></tr>)}</tbody></table></div>}
    </section>
    {action && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog"><header className="section-header"><div><h2>{action === "open" ? "Abrir caja" : action === "inbound" ? "Registrar ingreso" : action === "outbound" ? "Registrar egreso" : "Cerrar caja"}</h2><p>{selectedBranch?.name}</p></div><button className="secondary compact" disabled={saving} onClick={() => setAction(null)} type="button">Cerrar</button></header><form className="grid" onSubmit={(event) => void submit(event)}>
      {action === "close" && openSession && <div className="cash-close-summary wide"><span>Efectivo esperado</span><strong>{money(openSession.expected_cash_cents)}</strong></div>}
      <label className="wide">{action === "open" ? "Efectivo inicial" : action === "close" ? "Efectivo contado" : "Importe"}<input autoFocus inputMode="decimal" placeholder="Ej. 12500,50" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      {action === "open" && <label className="wide">Nota (opcional)<textarea maxLength={1000} rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>}
      {(action === "inbound" || action === "outbound") && <label className="wide">Motivo<textarea maxLength={500} required rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>}
      {action === "close" && <p className={`cash-difference wide ${closeDifference !== null && closeDifference < 0 ? "negative" : ""}`}>Diferencia estimada: <strong>{closeDifference === null ? "Ingresá el efectivo contado" : `${closeDifference > 0 ? "+" : ""}${money(closeDifference)}`}</strong></p>}
      {error && <p className="form-error wide" role="alert">{error}</p>}
      <div className="form-actions wide"><button disabled={saving} type="submit">{saving ? "Guardando…" : action === "close" ? "Confirmar cierre" : "Guardar"}</button><button className="secondary" disabled={saving} onClick={() => setAction(null)} type="button">Cancelar</button></div>
    </form></section></div>}
  </>;
}
