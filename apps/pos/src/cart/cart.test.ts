import { describe, expect, it } from "vitest";
import type { PosOption } from "../local-db/types";
import { addLine, cartTotal, changeQuantity, removeLine, toSaleItems } from "./cart";

const option = (id: string, price: number): PosOption => ({ id, productName: `Producto ${id}`, variantName: "Única", sku: "", barcodes: [], price, offer: false, stock: 10 });

describe("POS cart", () => {
  it("adds each presentation once, starting at quantity 1", () => {
    const first = addLine([], option("a", 1_000));
    expect(first.cart).toEqual([{ ...option("a", 1_000), quantity: "1" }]);
    const duplicate = addLine(first.cart, option("a", 1_000));
    expect(duplicate.error).toMatch(/ya está en el carrito/);
    expect(duplicate.cart).toHaveLength(1);
  });

  it("totals decimal quantities rounding each line to the nearest cent", () => {
    let cart = addLine([], option("a", 1_000)).cart;
    cart = addLine(cart, option("b", 333)).cart;
    cart = changeQuantity(cart, "a", "1,5");
    cart = changeQuantity(cart, "b", "3");
    expect(cartTotal(cart)).toBe(1_500 + 999);
    expect(cartTotal(removeLine(cart, "a"))).toBe(999);
  });

  it("treats an invalid quantity as zero in the total and blocks the sale payload", () => {
    const cart = changeQuantity(addLine([], option("a", 1_000)).cart, "a", "abc");
    expect(cartTotal(cart)).toBe(0);
    expect(toSaleItems(cart)).toBeNull();
  });

  it("sends only variant ids and quantities, never prices", () => {
    const cart = changeQuantity(addLine([], option("a", 1_000)).cart, "a", "2,25");
    expect(toSaleItems(cart)).toEqual([{ variant_id: "a", quantity: 2.25 }]);
    expect(JSON.stringify(toSaleItems(cart))).not.toMatch(/price/);
  });
});
