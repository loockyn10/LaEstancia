export type BusinessRole = "owner" | "admin" | "staff";
/** Roles con acceso a Administración (y también al POS). */
export type ManagerRole = Exclude<BusinessRole, "staff">;

/** Sólo conveniencia de UX: la autoridad real es RLS/RPC en PostgreSQL. */
export function isManager(role: BusinessRole): role is ManagerRole {
  return role === "owner" || role === "admin";
}

export const roleLabels: Record<BusinessRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  staff: "Empleado",
};
