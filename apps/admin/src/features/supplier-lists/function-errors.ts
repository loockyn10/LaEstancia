/**
 * Errores de la Edge Function `interpret-supplier-price-list`. Devuelve un mensaje legible y, cuando
 * OpenAI informó detalles seguros (status, tipo, código, request id), los agrega como detalle técnico.
 */

export function firstErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of ["error", "message", "msg"]) {
    const entry = object[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return null;
}

export function visualErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const friendly = firstErrorMessage(body);
  const details = body.openai;
  if (!details || typeof details !== "object") return friendly;
  const openai = details as Record<string, unknown>;
  const pieces = [
    typeof openai.status === "number" ? `HTTP ${openai.status}` : null,
    typeof openai.type === "string" ? `tipo: ${openai.type}` : null,
    typeof openai.code === "string" ? `código: ${openai.code}` : null,
    typeof openai.message === "string" ? openai.message : null,
    typeof openai.request_id === "string" ? `request id: ${openai.request_id}` : null,
  ].filter((part): part is string => Boolean(part));
  return [friendly, pieces.length ? `Detalle técnico: ${pieces.join(" · ")}` : null].filter(Boolean).join(" ");
}

export async function describeFunctionError(error: { message?: unknown; context?: unknown }): Promise<string> {
  const context = error.context;
  if (context instanceof Response) {
    const text = await context.text().catch(() => "");
    if (text.trim()) {
      try {
        return visualErrorMessage(JSON.parse(text) as unknown) ?? text.trim();
      } catch {
        return text.trim();
      }
    }
  } else if (context && typeof context === "object") {
    const contextObject = context as Record<string, unknown>;
    const body = contextObject.body;
    if (typeof body === "string" && body.trim()) {
      try {
        return firstErrorMessage(JSON.parse(body) as unknown) ?? body.trim();
      } catch {
        return body.trim();
      }
    }
    return visualErrorMessage(body) ?? firstErrorMessage(contextObject) ?? String(error.message ?? "");
  }
  return typeof error.message === "string" ? error.message : "";
}
