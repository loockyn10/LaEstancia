import type { Database } from "@pet-shop/database";
import { db } from "../../lib/supabase";
import type { ImportPlanRow } from "./catalog-import";

export type ImportResult = Database["public"]["Functions"]["import_catalog_rows_v2"]["Returns"][number];

/**
 * Aplica el catálogo en una única transacción (RPC `import_catalog_rows_v2`). PostgreSQL vuelve a validar
 * rol, ownership, identificadores y sucursal: el preview del navegador es sólo ayuda para la persona.
 */
export async function importCatalogRows(args: { businessId: string; branchId: string; rows: NonNullable<ImportPlanRow["payload"]>[]; updateExisting: boolean }): Promise<ImportResult[]> {
  const { data, error } = await db().rpc("import_catalog_rows_v2", {
    target_business_id: args.businessId,
    target_branch_id: args.branchId || undefined,
    import_rows: args.rows,
    update_existing: args.updateExisting,
  });
  if (error) throw error;
  return data ?? [];
}
