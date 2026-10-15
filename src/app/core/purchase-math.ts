/**
 * The arithmetic of a purchase document, worked out live as the person types. It is the same arithmetic as the server's
 * (ZestPoint.Business/Domain/PurchaseMath.cs): both are checked against the same worked examples, and the server recomputes on save, so
 * what the screen shows is never a different answer from what is recorded. Money is rounded to two places once per figure, half away from zero.
 */

export const TARE_TOLERANCE_PERCENT = 1.5;

/**
 * Rounds half away from zero to a number of places. It works from the shortest decimal text of the number (so 1.005 is a half, as a
 * decimal type sees it) instead of multiplying, which would turn 1.005 into 100.49999999999999.
 */
function roundTo(value: number, places: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const text = abs.toString();
  const shifted = text.includes('e') ? abs * 10 ** places : Number(`${text}e${places}`);
  return (sign * Math.round(shifted)) / 10 ** places;
}

export function round2(value: number): number {
  return roundTo(value, 2);
}

export interface LineInput { quantity: number; unitCost: number; discountPercent: number; taxRatePercent: number }

export interface LineResult {
  /** Quantity x cost. */
  gross: number;
  discount: number;
  /** Gross less discount (still contains the tax when prices include tax). */
  net: number;
  tax: number;
  /** What is payable for the line. */
  total: number;
}

export function lineAmounts(l: LineInput, taxInclusive: boolean): LineResult {
  const gross = round2(l.quantity * l.unitCost);
  const discount = round2((gross * l.discountPercent) / 100);
  const net = round2(gross - discount);
  if (taxInclusive) {
    const tax = round2(net - net / (1 + l.taxRatePercent / 100));
    return { gross, discount, net, tax, total: net };
  }
  const added = round2((net * l.taxRatePercent) / 100);
  return { gross, discount, net, tax: added, total: round2(net + added) };
}

export interface Totals { subtotal: number; discount: number; netInward: number; tax: number; total: number }

export function sumLines(lines: readonly LineResult[]): Totals {
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const l of lines) { subtotal += l.gross; discount += l.discount; tax += l.tax; total += l.total; }
  return { subtotal: round2(subtotal), discount: round2(discount), netInward: round2(subtotal - discount), tax: round2(tax), total: round2(total) };
}

/** The cost per base unit stock is valued at: after the line discount, without tax, four decimals. */
export function netUnitCost(unitCost: number, discountPercent: number, taxRatePercent: number, taxInclusive: boolean): number {
  const afterDiscount = unitCost * (1 - discountPercent / 100);
  const exTax = taxInclusive ? afterDiscount / (1 + taxRatePercent / 100) : afterDiscount;
  return roundTo(exTax, 4);
}

/** Whether a weighed tare is close enough to the expected one; null when either is unknown. */
export function tareWithinTolerance(measuredGrams: number | null | undefined, expectedGrams: number | null | undefined): boolean | null {
  if (measuredGrams == null || expectedGrams == null || expectedGrams <= 0) return null;
  return (Math.abs(measuredGrams - expectedGrams) / expectedGrams) * 100 <= TARE_TOLERANCE_PERCENT;
}

/** Quantity from packs: a case of 12 ordered twice is 24 base units. */
export function quantityFromPacks(packCount: number, packSize: number): number {
  return Math.round(packCount * packSize * 10000) / 10000;
}
