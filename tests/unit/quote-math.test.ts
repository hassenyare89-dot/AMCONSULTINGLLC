import { describe, expect, it } from "vitest";
import { estimateTotals, formatMoney, lineTotal } from "@/lib/shared/quote-math";

describe("estimate totals", () => {
  it("avoids floating point drift", () => {
    expect(lineTotal({ quantity: 3, unit_price: 0.1 })).toBe(0.3);
    expect(lineTotal({ quantity: 1.5, unit_price: 95.55 })).toBe(143.33);
  });
  it("computes subtotal, tax and total in cents", () => {
    const t = estimateTotals(
      [
        { quantity: 8, unit_price: 115 },
        { quantity: 2.5, unit_price: 40.1 },
      ],
      0.07,
    );
    expect(t).toEqual({ subtotal: 1020.25, tax_amount: 71.42, total: 1091.67 });
  });
  it("rejects invalid tax rates", () => {
    expect(() => estimateTotals([], 1.5)).toThrow();
    expect(() => estimateTotals([], -0.1)).toThrow();
  });
  it("formats USD", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney("bad")).toBe("$0.00");
  });
});
