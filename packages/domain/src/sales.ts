export type PaymentMethod = "cash" | "debit" | "credit" | "transfer" | "other";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferencia",
  other: "Otro",
};

export const paymentMethods = Object.keys(paymentMethodLabels) as PaymentMethod[];
