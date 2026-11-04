import { describe, expect, it } from "vitest";
import { describeFunctionError, firstErrorMessage, visualErrorMessage } from "./function-errors";

describe("supplier list function errors", () => {
  it("reads the first usable message", () => {
    expect(firstErrorMessage({ error: "  falló  " })).toBe("falló");
    expect(firstErrorMessage({ msg: "otro" })).toBe("otro");
    expect(firstErrorMessage("texto")).toBeNull();
  });

  it("appends safe OpenAI details as a technical note", () => {
    const message = visualErrorMessage({ error: "La interpretación falló.", openai: { status: 429, type: "rate_limit", request_id: "req_1" } });
    expect(message).toBe("La interpretación falló. Detalle técnico: HTTP 429 · tipo: rate_limit · request id: req_1");
  });

  it("parses the response body of a failed invocation", async () => {
    const context = new Response(JSON.stringify({ error: "Sin permisos" }), { status: 403 });
    expect(await describeFunctionError({ message: "Edge Function returned a non-2xx status code", context })).toBe("Sin permisos");
    expect(await describeFunctionError({ message: "boom" })).toBe("boom");
  });
});
