import { type PaymentMethod, formatPesos, paymentMethodLabels, paymentMethods } from "@pet-shop/domain";
import { Button, Field, Select } from "@pet-shop/ui";
import { type CartLine, cartTotal, lineTotal } from "./cart";

type Props = {
  cart: readonly CartLine[];
  payment: PaymentMethod;
  onPaymentChange: (payment: PaymentMethod) => void;
  onQuantityChange: (id: string, quantity: string) => void;
  onRemove: (id: string) => void;
  online: boolean;
  busy: boolean;
  error: string | null;
  onCharge: () => void;
};

/** Carrito y cobro. El cobro requiere conexión: PostgreSQL resuelve precio, stock y caja al confirmar. */
export function CartPanel({ cart, payment, onPaymentChange, onQuantityChange, onRemove, online, busy, error, onCharge }: Props) {
  return (
    <aside className="panel cart">
      <h1>Carrito</h1>
      {!cart.length ? (
        <p className="muted">Buscá o escaneá un producto para empezar.</p>
      ) : (
        <div className="cart-lines">
          {cart.map((line) => (
            <article key={line.id}>
              <div>
                <strong>{line.productName}</strong>
                <small>{line.variantName} · {formatPesos(line.price)}</small>
              </div>
              <input aria-label={`Cantidad de ${line.productName}`} inputMode="decimal" onChange={(event) => onQuantityChange(line.id, event.target.value)} value={line.quantity} />
              <strong>{formatPesos(lineTotal(line))}</strong>
              <Button onClick={() => onRemove(line.id)} variant="link-danger">Quitar</Button>
            </article>
          ))}
        </div>
      )}
      <Field label="Medio de pago">
        <Select aria-label="Medio de pago" onChange={(value) => onPaymentChange(value as PaymentMethod)} options={paymentMethods.map((value) => ({ value, label: paymentMethodLabels[value] }))} value={payment} />
      </Field>
      <div className="total"><span>Total</span><strong>{formatPesos(cartTotal(cart))}</strong></div>
      <Button className="charge" disabled={!online || !cart.length} loading={busy} onClick={onCharge}>
        {busy ? "Procesando…" : online ? "COBRAR" : "CONECTATE PARA COBRAR"}
      </Button>
      {error && <p className="error" role="alert">{error}</p>}
    </aside>
  );
}
