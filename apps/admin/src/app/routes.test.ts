import { describe, expect, it } from "vitest";
import { matchRoute } from "../lib/router";
import { routes } from "./routes";

describe("Admin route table", () => {
  it("has unique paths", () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("resolves every menu entry to its own route", () => {
    for (const route of routes.filter((item) => item.nav)) {
      expect(matchRoute(routes, route.path)?.route.path).toBe(route.path);
    }
  });

  it("prefers static segments over parameters", () => {
    expect(matchRoute(routes, "/products/new")?.route.path).toBe("/products/new");
    expect(matchRoute(routes, "/purchases/new")?.route.path).toBe("/purchases/new");
    expect(matchRoute(routes, "/sales/new")?.route.path).toBe("/sales/new");
    const detail = matchRoute(routes, "/products/abc-123");
    expect(detail?.route.path).toBe("/products/:id");
    expect(detail?.params).toEqual({ id: "abc-123" });
  });

  it("does not match unknown or over-long paths", () => {
    expect(matchRoute(routes, "/login")).toBeNull();
    expect(matchRoute(routes, "/products/a/b")).toBeNull();
    expect(matchRoute(routes, "/service-role")).toBeNull();
  });

  it("keeps cost-bearing screens in the menu only for Administración (all routes are manager-only)", () => {
    const labels = routes.flatMap((route) => (route.nav ? [route.nav.label] : []));
    expect(labels).toEqual(expect.arrayContaining(["Precios", "Proveedores", "Listas de proveedores", "Compras", "Importar"]));
  });
});
