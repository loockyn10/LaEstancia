/** Resultado mínimo de una consulta PostgREST. `status: 0` = la petición no obtuvo respuesta (red, DNS, abort). */
export type AccessCheckOutcome = { status: number };

/**
 * Contexto a usar cuando la revalidación online de membresía/negocio devuelve error.
 * Sólo un fallo de red (sin respuesta del servidor, o el navegador quedó sin conexión) permite seguir con el
 * último contexto local conocido. Cualquier respuesta con error del servidor (401, 403, 5xx, RLS…) se trata
 * como "sin acceso": un error inesperado nunca se interpreta como autorización.
 */
export function contextAfterFailedCheck<T>(outcome: AccessCheckOutcome, cached: T | null, browserOnline: boolean): T | null {
  return outcome.status === 0 || !browserOnline ? cached : null;
}
