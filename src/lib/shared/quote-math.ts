/** Money math in integer cents to avoid floating-point drift. */
export type LineInput = { quantity: number; unit_price: number };

export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => Math.round(c) / 100;

export function lineTotal(item: LineInput): number {
  // quantity can have 2 decimals; compute in cents then round half-up.
  return fromCents(Math.round(item.quantity * toCents(item.unit_price)));
}

export function estimateTotals(items: readonly LineInput[], taxRate: number) {
  if (!(taxRate >= 0 && taxRate < 1)) throw new Error("tax rate must be in [0, 1)");
  const subtotalC = items.reduce((s, i) => s + toCents(lineTotal(i)), 0);
  const taxC = Math.round(subtotalC * taxRate);
  return {
    subtotal: fromCents(subtotalC),
    tax_amount: fromCents(taxC),
    total: fromCents(subtotalC + taxC),
  };
}

export function formatMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(v) ? v : 0,
  );
}
