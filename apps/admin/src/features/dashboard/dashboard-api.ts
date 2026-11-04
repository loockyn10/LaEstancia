import type { Database } from "@pet-shop/database";
import { db } from "../../lib/supabase";
import type { DateRange } from "./dashboard-range";

type Functions = Database["public"]["Functions"];
export type Overview = Functions["dashboard_overview"]["Returns"][number];
export type PaymentShare = Functions["dashboard_payment_methods"]["Returns"][number];
export type TopProduct = Functions["dashboard_top_products"]["Returns"][number];
export type CashSummary = Functions["dashboard_cash_summary"]["Returns"][number];

export type DashboardData = { overview: Overview | null; payments: PaymentShare[]; topProducts: TopProduct[]; cash: CashSummary[] };

/** Los agregados se calculan en PostgreSQL (RPC SECURITY DEFINER con rol owner/admin); el navegador sólo los muestra. */
export async function loadDashboard(businessId: string, range: DateRange, branchId: string): Promise<DashboardData> {
  const supabase = db();
  const params = {
    target_business_id: businessId,
    target_branch_id: branchId || undefined,
    target_start_date: range.start,
    target_end_date: range.end,
  };
  const [overview, payments, products, cash] = await Promise.all([
    supabase.rpc("dashboard_overview", params),
    supabase.rpc("dashboard_payment_methods", params),
    supabase.rpc("dashboard_top_products", { ...params, result_limit: 5 }),
    supabase.rpc("dashboard_cash_summary", { target_business_id: businessId, target_branch_id: branchId || undefined }),
  ]);
  const failure = overview.error ?? payments.error ?? products.error ?? cash.error;
  if (failure) throw failure;
  return {
    overview: overview.data?.[0] ?? null,
    payments: payments.data ?? [],
    topProducts: products.data ?? [],
    cash: cash.data ?? [],
  };
}
