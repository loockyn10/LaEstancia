// Visual lists are intentionally interpreted outside the browser.  Deploy this
// function only after setting SUPPLIER_LISTS_AI_URL and its provider secret in
// Supabase Edge Function secrets.  It returns candidates; it never writes DB.
type Candidate = {
  name: string;
  presentation?: string;
  supplier_code?: string;
  barcode?: string;
  purchase_options: Array<{ purchase_price_cents: number; purchase_unit?: string; stock_units_per_purchase?: number; units_paid?: number; units_bonus?: number }>;
};

function validCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && Array.isArray(candidate.purchase_options)
    && candidate.purchase_options.every((option) => option && typeof option === "object" && Number.isSafeInteger((option as Record<string, unknown>).purchase_price_cents));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const endpoint = Deno.env.get("SUPPLIER_LISTS_AI_URL");
  const secret = Deno.env.get("SUPPLIER_LISTS_AI_API_KEY");
  if (!endpoint || !secret) return Response.json({ error: "interpretación visual no configurada", missing: [!endpoint && "SUPPLIER_LISTS_AI_URL", !secret && "SUPPLIER_LISTS_AI_API_KEY"].filter(Boolean) }, { status: 503 });
  const body = await request.json().catch(() => null) as { file_path?: unknown; mime_type?: unknown } | null;
  if (!body || typeof body.file_path !== "string" || typeof body.mime_type !== "string") return Response.json({ error: "invalid request" }, { status: 400 });
  // The configured service receives a private storage reference, not a browser
  // credential. Its response is accepted only when it matches this narrow DTO.
  const upstream = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ file_path: body.file_path, mime_type: body.mime_type }) });
  if (!upstream.ok) return Response.json({ error: "visual interpretation failed" }, { status: 502 });
  const result = await upstream.json().catch(() => null) as { items?: unknown } | null;
  if (!result || !Array.isArray(result.items) || !result.items.every(validCandidate)) return Response.json({ error: "visual interpretation returned an invalid schema" }, { status: 502 });
  return Response.json({ items: result.items });
});
