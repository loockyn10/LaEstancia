export type BackendErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** Reglas ordenadas: la primera que coincide gana. Se evalúan sobre code+message+details en minúsculas. */
const rules: ReadonlyArray<readonly [RegExp, string]> = [
  [/product_variants_business_sku|duplicate key.*sku|sku.*(already|duplicate|unique)/, "Ese SKU ya está asignado a otro producto."],
  [/product_barcodes_business_code|duplicate key.*barcode|barcode.*(already|duplicate|unique)/, "Ese código de barras ya está asignado a otro producto."],
  [/variant_offers_no_active_overlap/, "Esta vigencia se superpone con otra oferta activa de la misma presentación."],
  [/ends_at|check constraint/, "La fecha de fin debe ser posterior a la fecha de inicio."],
  [/insufficient inventory/, "Stock insuficiente. No se registró ningún cambio."],
  [/no effective price/, "Una presentación no tiene un precio vigente."],
  [/invalid inventory quantity|quantity must be greater/, "Cantidad inválida."],
  [/invalid inventory (branch|variant)/, "Producto o sucursal inválidos."],
  [/invalid sale|sale variants/, "Sucursal o presentación inválida."],
  [/only draft/, "La compra ya no está en borrador."],
  [/at least one item/, "Agregá al menos un ítem antes de confirmar."],
  [/already has an open/, "La sucursal ya tiene una caja abierta."],
  [/is not open/, "La caja ya no está abierta. Actualizá la pantalla."],
  [/opening cash|counted cash|movement amount/, "Ingresá un importe válido."],
  [/reason is required/, "Ingresá un motivo para el movimiento."],
  [/invalid cash session/, "La caja o sucursal no es válida para este negocio."],
  [/date range/, "Elegí un rango de fechas válido."],
  [/invalid dashboard branch/, "La sucursal elegida no es válida para este negocio."],
  [/not authorized|row-level security|permission denied/, "No tenés permisos para realizar esta acción."],
  [/failed to fetch|networkerror|network request failed|load failed/, "No hay conexión con el servidor. Revisá tu internet e intentá nuevamente."],
  [/jwt expired|invalid jwt|not authenticated/, "Tu sesión venció. Volvé a iniciar sesión."],
];

export const DEFAULT_ERROR_MESSAGE = "No se pudo completar la operación. Intentá nuevamente.";

function toErrorLike(error: unknown): BackendErrorLike {
  if (!error) return {};
  if (typeof error === "string") return { message: error };
  if (typeof error === "object") return error as BackendErrorLike;
  return { message: String(error) };
}

/** Texto técnico para diagnóstico (sólo desarrollo). */
export function technicalDetail(error: unknown): string {
  const { code, message, details, hint } = toErrorLike(error);
  return [code, message, details, hint].filter(Boolean).join(" · ");
}

/**
 * Traduce un error de Supabase/PostgreSQL a un mensaje humano en español.
 * `fallback` permite un mensaje específico de la pantalla cuando ninguna regla coincide.
 * Con `diagnostics: true` (desarrollo) agrega el detalle técnico entre corchetes.
 */
export function describeBackendError(
  error: unknown,
  options: { fallback?: string; diagnostics?: boolean } = {},
): string {
  const { code, message, details } = toErrorLike(error);
  const haystack = `${code ?? ""} ${message ?? ""} ${details ?? ""}`.toLowerCase();
  const human = rules.find(([pattern]) => pattern.test(haystack))?.[1] ?? options.fallback ?? DEFAULT_ERROR_MESSAGE;
  const detail = options.diagnostics ? technicalDetail(error) : "";
  return detail ? `${human} [${detail}]` : human;
}
