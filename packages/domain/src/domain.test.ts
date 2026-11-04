import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  describeBackendError,
  formatPesos,
  formatQuantity,
  isManager,
  lineTotalCents,
  loginEmail,
  parsePesos,
  parsePositiveQuantity,
  parseScaledQuantity,
  pesosInput,
  quantityInput,
  scaledFromNumber,
  toCalendarDate,
} from "./index";

describe("money", () => {
  it("parses Argentine and plain decimal formats to cents", () => {
    expect(parsePesos("1.250,50")).toBe(125_050);
    expect(parsePesos("$ 1250")).toBe(125_000);
    expect(parsePesos("12500.5")).toBe(1_250_050);
    expect(parsePesos("0,5")).toBe(50);
  });

  it("rejects negative, empty and malformed amounts", () => {
    expect(parsePesos("")).toBeNull();
    expect(parsePesos("-5")).toBeNull();
    expect(parsePesos("12,345")).toBeNull();
    expect(parsePesos("abc")).toBeNull();
  });

  it("formats cents and keeps editable inputs round-trippable", () => {
    expect(formatPesos(null)).toBe("Sin definir");
    expect(formatPesos(undefined, "—")).toBe("—");
    expect(formatPesos(125_000).replace(/\s/g, " ")).toBe("$ 1.250");
    expect(formatPesos(125_050).replace(/\s/g, " ")).toBe("$ 1.250,50");
    expect(pesosInput(125_050)).toBe("1250,50");
    expect(parsePesos(pesosInput(125_005))).toBe(125_005);
  });

  it("rounds a line to the nearest cent like confirm_sale", () => {
    expect(lineTotalCents(1.25, 1_000)).toBe(1_250);
    expect(lineTotalCents(0.333, 1_000)).toBe(333);
    expect(lineTotalCents(null, 1_000)).toBe(0);
  });
});

describe("quantity", () => {
  it("scales up to three decimals without floating point drift", () => {
    expect(parseScaledQuantity("1,250")).toBe(1_250n);
    expect(parseScaledQuantity("2")).toBe(2_000n);
    expect(parseScaledQuantity("0.001")).toBe(1n);
    expect(parseScaledQuantity("1.2345")).toBeNull();
    expect(scaledFromNumber(-3.5)).toBe(-3_500n);
  });

  it("formats and re-edits quantities", () => {
    expect(formatQuantity(1_250n)).toBe("1,25");
    expect(formatQuantity(7.5)).toBe("7,5");
    expect(formatQuantity(-2_000n)).toBe("-2");
    expect(formatQuantity(null)).toBe("—");
    expect(quantityInput(1234.5)).toBe("1234,5");
  });

  it("only accepts strictly positive sale quantities", () => {
    expect(parsePositiveQuantity("1,5")).toBe(1.5);
    expect(parsePositiveQuantity("0")).toBeNull();
    expect(parsePositiveQuantity("1.2345")).toBeNull();
    expect(parsePositiveQuantity("-1")).toBeNull();
  });
});

describe("dates", () => {
  it("adds calendar days across month boundaries", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(toCalendarDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("auth and roles", () => {
  it("maps only the documented identifiers to technical emails", () => {
    expect(loginEmail(" DUEÑO ")).toBe("dueno@laestancia.local");
    expect(loginEmail("empleado")).toBe("empleado@laestancia.local");
    expect(loginEmail("ana@ejemplo.com")).toBe("ana@ejemplo.com");
  });

  it("treats only owner and admin as managers", () => {
    expect(isManager("owner")).toBe(true);
    expect(isManager("admin")).toBe(true);
    expect(isManager("staff")).toBe(false);
  });
});

describe("describeBackendError", () => {
  it("translates known database failures", () => {
    expect(describeBackendError({ message: "insufficient inventory for variant" })).toMatch(/Stock insuficiente/);
    expect(describeBackendError({ message: 'duplicate key value violates unique constraint "product_barcodes_business_code_key"' })).toMatch(/código de barras/);
    expect(describeBackendError({ message: 'violates "product_variants_business_sku_key"' })).toMatch(/SKU/);
    expect(describeBackendError({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/permisos/);
    expect(describeBackendError({ message: "Failed to fetch" })).toMatch(/conexión/);
  });

  it("uses the screen fallback and hides technical detail in production", () => {
    expect(describeBackendError({ message: "boom" }, { fallback: "No se pudo guardar." })).toBe("No se pudo guardar.");
    expect(describeBackendError(null)).toMatch(/Intentá nuevamente/);
  });

  it("appends diagnostics only when requested", () => {
    const error = { code: "XX000", message: "boom", details: "detail" };
    expect(describeBackendError(error, { diagnostics: true })).toContain("[XX000 · boom · detail]");
    expect(describeBackendError(error)).not.toContain("boom");
  });
});
