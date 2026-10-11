import { describe, expect, it } from "vitest";
import { loginEmail } from "./supabase";

describe("POS simple login identifiers", () => {
  it("maps only the documented initial identifiers to technical Auth emails", () => {
    expect(loginEmail("dueño")).toBe("dueno@laestancia.local");
    expect(loginEmail(" ADMIN ")).toBe("admin@laestancia.local");
    expect(loginEmail("empleado")).toBe("empleado@laestancia.local");
    expect(loginEmail("operador@ejemplo.com")).toBe("operador@ejemplo.com");
  });
});
