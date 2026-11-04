import { describe, expect, it } from "vitest";
import { accessForMembership } from "./access";

describe("Admin access by role", () => {
  it("lets owner and admin into Administración", () => {
    expect(accessForMembership({ business_id: "b1", role: "owner" }, "La Estancia")).toEqual({ status: "authorized", businessId: "b1", businessName: "La Estancia", role: "owner" });
    expect(accessForMembership({ business_id: "b1", role: "admin" }, "La Estancia")).toMatchObject({ status: "authorized", role: "admin" });
  });

  it("never authorizes staff: they are resolved to the POS state and carry no business data", () => {
    const access = accessForMembership({ business_id: "b1", role: "staff" }, "La Estancia");
    expect(access).toEqual({ status: "staff" });
    expect(JSON.stringify(access)).not.toContain("b1");
  });
});
