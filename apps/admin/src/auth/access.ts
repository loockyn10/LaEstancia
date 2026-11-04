import { type BusinessRole, type ManagerRole, isManager } from "@pet-shop/domain";

export type Access =
  | { status: "configuration-error"; message: string }
  | { status: "resolving-session" | "signed-out" | "resolving-access" | "no-access" | "staff" }
  | { status: "authorized"; businessId: string; businessName: string; role: ManagerRole }
  | { status: "error"; message: string };

/**
 * Administración es una superficie sólo para owner/admin (D020). Staff se resuelve a su propio estado
 * y la app lo envía al POS; nunca monta ninguna pantalla ni consulta de datos administrativos.
 * Esto mejora la UX: la autoridad real sigue siendo RLS/RPC en PostgreSQL.
 */
export function accessForMembership(membership: { business_id: string; role: BusinessRole }, businessName: string): Access {
  if (!isManager(membership.role)) return { status: "staff" };
  return { status: "authorized", businessId: membership.business_id, businessName, role: membership.role };
}
