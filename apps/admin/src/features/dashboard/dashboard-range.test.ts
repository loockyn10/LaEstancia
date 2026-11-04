import { describe, expect, it } from "vitest";
import { periodFor, toBackendRange } from "./dashboard-range";

const wednesday = new Date(2026, 10, 4, 15, 0); // 4 de noviembre de 2026, hora local

describe("dashboard periods (calendar days, end exclusive)", () => {
  it("today, yesterday and the last seven days", () => {
    expect(periodFor("today", wednesday)).toEqual({ start: "2026-11-04", end: "2026-11-05" });
    expect(periodFor("yesterday", wednesday)).toEqual({ start: "2026-11-03", end: "2026-11-04" });
    expect(periodFor("last7", wednesday)).toEqual({ start: "2026-10-29", end: "2026-11-05" });
  });

  it("the current month ends at the first day of the next month, also across a year boundary", () => {
    expect(periodFor("month", wednesday)).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(periodFor("month", new Date(2026, 11, 31, 10))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("turns the inclusive range chosen on screen into the exclusive backend range", () => {
    expect(toBackendRange("2026-10-31", "2026-10-31")).toEqual({ start: "2026-10-31", end: "2026-11-01" });
  });
});
