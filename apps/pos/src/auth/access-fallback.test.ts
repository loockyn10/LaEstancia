import { describe, expect, it } from "vitest";
import { contextAfterFailedCheck } from "./access-fallback";

const cached = { businessId: "business-1" };

describe("contextAfterFailedCheck", () => {
  it("keeps the last known context when the request never reached the server", () => {
    expect(contextAfterFailedCheck({ status: 0 }, cached, true)).toBe(cached);
  });

  it("keeps the last known context when the browser went offline mid-request", () => {
    expect(contextAfterFailedCheck({ status: 503 }, cached, false)).toBe(cached);
  });

  it("never treats a server error response as authorization", () => {
    for (const status of [400, 401, 403, 404, 500, 503]) {
      expect(contextAfterFailedCheck({ status }, cached, true)).toBeNull();
    }
  });

  it("has nothing to fall back to without a cached context", () => {
    expect(contextAfterFailedCheck({ status: 0 }, null, true)).toBeNull();
  });
});
