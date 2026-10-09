// The browser never receives an AI credential. This function authenticates the
// caller, creates a short-lived URL for one private list file, and accepts only
// structured candidates from the configured multimodal provider.
import { createClient } from "npm:@supabase/supabase-js@2";

const maxPagesPerRequest = 3;
const maxPages = 40;
type PurchaseOption = { supplierCode?: string; purchaseUnit?: "unit" | "box" | "bundle" | "bag" | "other"; purchaseUnitLabel?: string; stockUnitsPerPurchase?: number; purchasePriceCents: number; paidUnits?: number; bonusUnits?: number };
type Product = { name: string; presentation?: string; supplierCode?: string; barcode?: string; brand?: string; category?: string; suggestedRetailPriceCents?: number; purchaseOptions: PurchaseOption[]; source: { page?: number; regionOrReference?: string }; confidence: number; warnings: string[] };
const cleanString = (value: unknown, max = 1000) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const safeInteger = (value: unknown, allowZero = false) => typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0) ? value : null;

function normalizeOption(value: unknown): PurchaseOption | null {
  if (!value || typeof value !== "object") return null;
  const option = value as Record<string, unknown>;
  const purchasePriceCents = safeInteger(option.purchasePriceCents, true);
  const unit = cleanString(option.purchaseUnit, 20) ?? "other";
  const contents = option.stockUnitsPerPurchase === undefined ? 1 : Number(option.stockUnitsPerPurchase);
  const paidUnits = option.paidUnits === undefined ? 1 : safeInteger(option.paidUnits);
  const bonusUnits = option.bonusUnits === undefined ? 0 : safeInteger(option.bonusUnits, true);
  if (purchasePriceCents === null || !["unit", "box", "bundle", "bag", "other"].includes(unit) || !Number.isFinite(contents) || contents <= 0 || contents > 1000000 || paidUnits === null || bonusUnits === null) return null;
  return { supplierCode: cleanString(option.supplierCode, 200) ?? undefined, purchaseUnit: unit as PurchaseOption["purchaseUnit"], purchaseUnitLabel: cleanString(option.purchaseUnitLabel, 100) ?? undefined, stockUnitsPerPurchase: contents, purchasePriceCents, paidUnits, bonusUnits };
}

function normalizeProduct(value: unknown, requestedPages: number[]): Product | null {
  if (!value || typeof value !== "object") return null;
  const product = value as Record<string, unknown>;
  const name = cleanString(product.name);
  const source = product.source && typeof product.source === "object" ? product.source as Record<string, unknown> : {};
  const page = source.page === undefined ? undefined : safeInteger(source.page);
  const confidence = Number(product.confidence);
  const options = Array.isArray(product.purchaseOptions) ? product.purchaseOptions.map(normalizeOption) : [];
  if (!name || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || options.length === 0 || options.some((option) => option === null) || (page !== undefined && !requestedPages.includes(page))) return null;
  return { name, presentation: cleanString(product.presentation, 500) ?? undefined, supplierCode: cleanString(product.supplierCode, 200) ?? undefined, barcode: cleanString(product.barcode, 200) ?? undefined, brand: cleanString(product.brand, 300) ?? undefined, category: cleanString(product.category, 300) ?? undefined, suggestedRetailPriceCents: product.suggestedRetailPriceCents === undefined ? undefined : safeInteger(product.suggestedRetailPriceCents, true) ?? undefined, purchaseOptions: options as PurchaseOption[], source: { page, regionOrReference: cleanString(source.regionOrReference, 500) ?? undefined }, confidence, warnings: Array.isArray(product.warnings) && product.warnings.every((warning) => typeof warning === "string" && warning.length <= 500) ? product.warnings : [] };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const endpoint = Deno.env.get("SUPPLIER_LISTS_AI_URL");
  const secret = Deno.env.get("SUPPLIER_LISTS_AI_API_KEY");
  if (!url || !anonKey || !serviceRoleKey) return Response.json({ code: "server_configuration_missing", error: "Supabase Edge Function incompleta." }, { status: 500 });
  if (!endpoint || !secret) return Response.json({ code: "visual_interpretation_not_configured", error: "Interpretación visual no configurada.", missing: [!endpoint && "SUPPLIER_LISTS_AI_URL", !secret && "SUPPLIER_LISTS_AI_API_KEY"].filter(Boolean) }, { status: 503 });
  if (!authorization) return Response.json({ code: "unauthorized", error: "Sesión requerida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { business_id?: unknown; file_path?: unknown; mime_type?: unknown; file_format?: unknown; page_numbers?: unknown; text_pages?: unknown } | null;
  if (!body || typeof body.business_id !== "string" || typeof body.file_path !== "string" || typeof body.mime_type !== "string" || typeof body.file_format !== "string" || !Array.isArray(body.page_numbers)) return Response.json({ code: "invalid_request", error: "Solicitud de interpretación inválida." }, { status: 400 });
  const pageNumbers = [...new Set(body.page_numbers)].filter((page): page is number => safeInteger(page) !== null);
  if (pageNumbers.length === 0 || pageNumbers.length > maxPagesPerRequest || pageNumbers.some((page) => page > maxPages) || !["pdf", "jpg", "jpeg", "png"].includes(body.file_format)) return Response.json({ code: "invalid_page_batch", error: "Batch de páginas inválido." }, { status: 400 });
  if (!body.file_path.startsWith(`${body.business_id}/`)) return Response.json({ code: "invalid_file_path", error: "Archivo fuera del business." }, { status: 400 });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return Response.json({ code: "unauthorized", error: "Sesión inválida." }, { status: 401 });
  const { data: membership } = await userClient.from("business_memberships").select("role").eq("business_id", body.business_id).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ code: "forbidden", error: "No tenés permisos para interpretar listas." }, { status: 403 });
  const serviceClient = createClient(url, serviceRoleKey);
  const { data: signed, error: signedError } = await serviceClient.storage.from("supplier-price-lists").createSignedUrl(body.file_path, 120);
  if (signedError || !signed?.signedUrl) return Response.json({ code: "source_unavailable", error: "No pudimos leer el archivo original." }, { status: 404 });
  const textPages = Array.isArray(body.text_pages) ? body.text_pages.filter((page) => page && typeof page === "object") : [];
  const upstream = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ source_url: signed.signedUrl, mime_type: body.mime_type, file_format: body.file_format, page_numbers: pageNumbers, text_pages: textPages, response_schema: "supplier_price_list_candidates_v1" }) });
  if (!upstream.ok) return Response.json({ code: "visual_service_failed", error: "El servicio de interpretación visual falló." }, { status: 502 });
  const raw = await upstream.json().catch(() => null) as { products?: unknown } | null;
  if (!raw || !Array.isArray(raw.products)) return Response.json({ code: "invalid_visual_response", error: "El servicio devolvió una respuesta sin schema válido." }, { status: 502 });
  const products = raw.products.map((product) => normalizeProduct(product, pageNumbers));
  if (products.some((product) => product === null)) return Response.json({ code: "invalid_visual_response", error: "El servicio devolvió productos inválidos." }, { status: 502 });
  return Response.json({ products, page_numbers: pageNumbers });
});
