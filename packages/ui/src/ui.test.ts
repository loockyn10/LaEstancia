import { describe, expect, it } from "vitest";
import { isWithin, monthGrid, normalizeTime, parseIsoDate, shiftIsoDate, shiftIsoMonth } from "./calendar-model";
import { type SelectOption, filterOptions, initialActiveIndex, nextEnabledIndex, typeAheadIndex } from "./select-model";

const options: SelectOption[] = [
  { value: "a", label: "Árbol de Navidad" },
  { value: "b", label: "Alimento premium", hint: "SKU PREM-15" },
  { value: "c", label: "Bolsa", disabled: true },
  { value: "d", label: "Correa" },
];

describe("select model", () => {
  it("filters ignoring case and accents, including the hint", () => {
    expect(filterOptions(options, "arbol").map((option) => option.value)).toEqual(["a"]);
    expect(filterOptions(options, "prem-15").map((option) => option.value)).toEqual(["b"]);
    expect(filterOptions(options, "  ")).toHaveLength(4);
    expect(filterOptions(options, "zzz")).toEqual([]);
  });

  it("skips disabled options when moving with the keyboard", () => {
    expect(nextEnabledIndex(options, 1, 1)).toBe(3);
    expect(nextEnabledIndex(options, 3, -1)).toBe(1);
    expect(nextEnabledIndex(options, 3, 1)).toBe(3);
  });

  it("starts on the selected option or the first enabled one", () => {
    expect(initialActiveIndex(options, "d")).toBe(3);
    expect(initialActiveIndex(options, "")).toBe(0);
    expect(initialActiveIndex(options, "c")).toBe(0);
  });

  it("supports type-ahead cycling", () => {
    expect(typeAheadIndex(options, "c", -1)).toBe(3);
    expect(typeAheadIndex(options, "b", -1)).toBe(-1);
    expect(typeAheadIndex(options, "a", 0)).toBe(1);
  });
});

describe("calendar model", () => {
  it("builds a six-week Monday-first grid", () => {
    const grid = monthGrid(2026, 10); // noviembre 2026 empieza en domingo
    expect(grid).toHaveLength(42);
    expect(grid[0].date).toBe("2026-10-26");
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("validates and shifts dates across month ends", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(shiftIsoDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftIsoMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(isWithin("2026-05-05", "2026-05-01", "2026-05-31")).toBe(true);
    expect(isWithin("2026-06-01", undefined, "2026-05-31")).toBe(false);
  });

  it("normalizes typed times", () => {
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("1430")).toBe("14:30");
    expect(normalizeTime("2460")).toBeNull();
    expect(normalizeTime("9")).toBeNull();
  });
});
