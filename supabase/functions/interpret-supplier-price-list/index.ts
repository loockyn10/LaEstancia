// The browser never receives an OpenAI credential. This function authenticates
// the caller, creates a short-lived URL for one private list file, and returns
// only validated extraction candidates.
import { createClient } from "npm:@supabase/supabase-js@2";

type PurchaseUnit = "unit" | "box" | "bundle" | "bag" | "other";
type PurchaseOption = { supplierCode?: string; purchaseUnit?: PurchaseUnit; purchaseUnitLabel?: string; stockUnitsPerPurchase?: number; purchasePriceCents: number; paidUnits?: number; bonusUnits?: number };
type Product = { name: string; presentation?: string; supplierCode?: string; barcode?: string; brand?: string; category?: string; suggestedRetailPriceCents?: number; purchaseOptions: PurchaseOption[]; source: { page?: number; regionOrReference?: string }; confidence: number; warnings: string[] };

const supportedFormats = ["pdf", "jpg", "jpeg", "png"] as const;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const cleanString = (value: unknown, max = 1000) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const safeInteger = (value: unknown, allowZero = false) => typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0) ? value : null;

const candidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["products"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "presentation", "supplierCode", "barcode", "brand", "category", "suggestedRetailPriceCents", "purchaseOptions", "source", "confidence", "warnings"],
        properties: {
          name: { type: "string" },
          presentation: { type: ["string", "null"] },
          supplierCode: { type: ["string", "null"] },
          barcode: { type: ["string", "null"] },
          brand: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          suggestedRetailPriceCents: { type: ["integer", "null"] },
          purchaseOptions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["supplierCode", "purchaseUnit", "purchaseUnitLabel", "stockUnitsPerPurchase", "purchasePriceCents", "paidUnits", "bonusUnits"],
              properties: {
                supplierCode: { type: ["string", "null"] },
                purchaseUnit: { type: "string", enum: ["unit", "box", "bundle", "bag", "other"] },
                purchaseUnitLabel: { type: ["string", "null"] },
                stockUnitsPerPurchase: { type: "integer" },
                purchasePriceCents: { type: "integer" },
                paidUnits: { type: "integer" },
                bonusUnits: { type: "integer" },
              },
            },
          },
          source: {
            type: "object",
            additionalProperties: false,
            required: ["page", "regionOrReference"],
            properties: { page: { type: ["integer", "null"] }, regionOrReference: { type: ["string", "null"] } },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const extractorInstructions = `Interpretá una lista comercial de proveedor argentino y extraé solamente productos visibles en el archivo.

No inventes ningún campo ausente: usá null cuando corresponda y agregá una advertencia cuando la lectura sea dudosa. Conservá códigos de proveedor y EAN/barcodes como strings exactos, incluidos ceros iniciales; nunca infieras un barcode que no sea visible. Puede haber varios productos por imagen o por página.

Interpretá importes argentinos (puntos de miles y coma decimal) y devolvé todos los precios como enteros en centavos. Diferenciá el costo/precio de compra de un PVP/precio sugerido. Detectá packaging como x12U, caja x20, bulto x12, bolsa u otras unidades de compra. Representá promociones como 6+1 o 10+2 con paidUnits y bonusUnits. Una sección visual puede sugerir category, pero indicá incertidumbre cuando corresponda. Indicá source.page sólo si puede determinarse con seguridad. Para cada producto devolvé al menos una purchaseOption; si el precio de compra no es visible, no inventes un producto.`;

function normalizeOption(value: unknown): PurchaseOption | null {
  if (!value || typeof value !== "object") return null;
  const option = value as Record<string, unknown>;
  const purchasePriceCents = safeInteger(option.purchasePriceCents, true);
  const unit = cleanString(option.purchaseUnit, 20) ?? "other";
  const contents = safeInteger(option.stockUnitsPerPurchase);
  const paidUnits = safeInteger(option.paidUnits);
  const bonusUnits = safeInteger(option.bonusUnits, true);
  if (purchasePriceCents === null || !["unit", "box", "bundle", "bag", "other"].includes(unit) || contents === null || contents > 1000000 || paidUnits === null || bonusUnits === null) return null;
  return { supplierCode: cleanString(option.supplierCode, 200) ?? undefined, purchaseUnit: unit as PurchaseUnit, purchaseUnitLabel: cleanString(option.purchaseUnitLabel, 100) ?? undefined, stockUnitsPerPurchase: contents, purchasePriceCents, paidUnits, bonusUnits };
}

function normalizeProduct(value: unknown): Product | null {
  if (!value || typeof value !== "object") return null;
  const product = value as Record<string, unknown>;
  const name = cleanString(product.name);
  const source = product.source && typeof product.source === "object" ? product.source as Record<string, unknown> : {};
  const page = source.page === null || source.page === undefined ? undefined : safeInteger(source.page);
  const confidence = Number(product.confidence);
  const options = Array.isArray(product.purchaseOptions) ? product.purchaseOptions.map(normalizeOption) : [];
  if (!name || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || options.length === 0 || options.some((option) => option === null) || (source.page !== null && source.page !== undefined && page === null)) return null;
  return { name, presentation: cleanString(product.presentation, 500) ?? undefined, supplierCode: cleanString(product.supplierCode, 200) ?? undefined, barcode: cleanString(product.barcode, 200) ?? undefined, brand: cleanString(product.brand, 300) ?? undefined, category: cleanString(product.category, 300) ?? undefined, suggestedRetailPriceCents: product.suggestedRetailPriceCents === null || product.suggestedRetailPriceCents === undefined ? undefined : safeInteger(product.suggestedRetailPriceCents, true) ?? undefined, purchaseOptions: options as PurchaseOption[], source: { page, regionOrReference: cleanString(source.regionOrReference, 500) ?? undefined }, confidence, warnings: Array.isArray(product.warnings) && product.warnings.every((warning) => typeof warning === "string" && warning.length <= 500) ? product.warnings : [] };
}

function outputText(response: unknown): { text?: string; refusal?: string } {
  if (!response || typeof response !== "object") return {};
  const raw = response as Record<string, unknown>;
  if (typeof raw.output_text === "string") return { text: raw.output_text };
  if (!Array.isArray(raw.output)) return {};
  for (const item of raw.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const output = part as Record<string, unknown>;
      if (output.type === "refusal" && typeof output.refusal === "string") return { refusal: output.refusal };
      if (output.type === "output_text" && typeof output.text === "string") return { text: output.text };
    }
  }
  return {};
}

function errorResponse(code: string, error: string, status: number) {
  return Response.json({ code, error }, { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("SUPPLIER_LISTS_AI_MODEL") || "gpt-5.6-luna";
  if (!url || !anonKey || !serviceRoleKey) return errorResponse("server_configuration_missing", "Supabase Edge Function incompleta.", 500);
  if (!openAiKey) return Response.json({ code: "visual_interpretation_not_configured", error: "Interpretación visual no configurada.", missing: ["OPENAI_API_KEY"] }, { status: 503, headers: corsHeaders });
  if (!authorization) return errorResponse("unauthorized", "Sesión requerida.", 401);

  const body = await request.json().catch(() => null) as { business_id?: unknown; file_path?: unknown; mime_type?: unknown; file_format?: unknown } | null;
  if (!body || typeof body.business_id !== "string" || typeof body.file_path !== "string" || typeof body.mime_type !== "string" || typeof body.file_format !== "string" || !supportedFormats.includes(body.file_format as typeof supportedFormats[number])) return errorResponse("invalid_request", "Solicitud de interpretación inválida.", 400);
  if (!body.file_path.startsWith(`${body.business_id}/`)) return errorResponse("invalid_file_path", "Archivo fuera del business.", 400);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return errorResponse("unauthorized", "Sesión inválida.", 401);
  const { data: membership } = await userClient.from("business_memberships").select("role").eq("business_id", body.business_id).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return errorResponse("forbidden", "No tenés permisos para interpretar listas.", 403);

  const serviceClient = createClient(url, serviceRoleKey);
  const { data: signed, error: signedError } = await serviceClient.storage.from("supplier-price-lists").createSignedUrl(body.file_path, 120);
  if (signedError || !signed?.signedUrl) return errorResponse("source_unavailable", "No pudimos leer el archivo original.", 404);

  const content = [
    { type: "input_text", text: extractorInstructions },
    body.file_format === "pdf"
      ? { type: "input_file", file_url: signed.signedUrl, filename: "supplier-price-list.pdf", detail: "high" }
      : { type: "input_image", image_url: signed.signedUrl, detail: "high" },
  ];

  let openAiResponse: Response;
  try {
    openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${openAiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "supplier_price_list_candidates_v1", strict: true, schema: candidateSchema } } }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") return errorResponse("openai_timeout", "La interpretación visual superó el tiempo máximo.", 504);
    return errorResponse("openai_unavailable", "No pudimos comunicarnos con OpenAI.", 502);
  }

  if (openAiResponse.status === 401 || openAiResponse.status === 403) return errorResponse("openai_auth_failed", "OpenAI rechazó las credenciales del servidor.", 502);
  if (openAiResponse.status === 429) return errorResponse("openai_rate_limited", "OpenAI está temporalmente sin capacidad para interpretar la lista.", 429);
  if (openAiResponse.status >= 500) return errorResponse("openai_server_error", "OpenAI no está disponible temporalmente.", 502);
  if (!openAiResponse.ok) return errorResponse("openai_request_failed", "OpenAI no pudo procesar la lista.", 502);

  const response = await openAiResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!response) return errorResponse("invalid_visual_response", "OpenAI devolvió una respuesta inválida.", 502);
  if (response.status === "incomplete") return errorResponse("openai_incomplete", "OpenAI no pudo completar la interpretación de la lista.", 502);
  const extracted = outputText(response);
  if (extracted.refusal) return errorResponse("openai_refusal", "OpenAI no pudo interpretar este archivo.", 422);
  if (!extracted.text) return errorResponse("openai_incomplete", "OpenAI devolvió una respuesta incompleta.", 502);
  let raw: { products?: unknown } | null;
  try {
    raw = JSON.parse(extracted.text) as { products?: unknown } | null;
  } catch {
    return errorResponse("invalid_visual_response", "OpenAI devolvió JSON inválido.", 502);
  }
  if (!raw || !Array.isArray(raw.products)) return errorResponse("invalid_visual_response", "OpenAI devolvió una respuesta sin schema válido.", 502);
  const products = raw.products.map(normalizeProduct);
  if (products.some((product) => product === null)) return errorResponse("invalid_visual_response", "OpenAI devolvió productos inválidos.", 502);
  return Response.json({ products }, { headers: corsHeaders });
});
