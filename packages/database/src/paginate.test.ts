import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "./paginate";

const table = (size: number) => Array.from({ length: size }, (_, index) => ({ id: index }));

function pager(rows: { id: number }[]) {
  return vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
}

describe("fetchAllRows", () => {
  it("reads every page instead of truncating at the server limit", async () => {
    const fetchPage = pager(table(2_500));
    const rows = await fetchAllRows(fetchPage, 1_000);
    expect(rows).toHaveLength(2_500);
    expect(rows[2_499]).toEqual({ id: 2_499 });
    expect(fetchPage.mock.calls.map(([from, to]) => [from, to])).toEqual([[0, 999], [1_000, 1_999], [2_000, 2_999]]);
  });

  it("stops after a short page and handles empty results", async () => {
    expect(await fetchAllRows(pager(table(3)), 1_000)).toHaveLength(3);
    expect(await fetchAllRows(pager([]), 1_000)).toEqual([]);
  });

  it("requests one extra page when the table size is an exact multiple", async () => {
    const fetchPage = pager(table(2_000));
    expect(await fetchAllRows(fetchPage, 1_000)).toHaveLength(2_000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("throws the backend error of any page", async () => {
    const failure = { message: "boom" };
    const fetchPage = vi.fn(async (from: number) => (from === 0
      ? { data: table(1_000), error: null }
      : { data: null, error: failure }));
    await expect(fetchAllRows(fetchPage, 1_000)).rejects.toBe(failure);
  });
});
