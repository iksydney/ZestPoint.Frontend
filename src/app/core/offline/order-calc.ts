import { LocalOrder, OrderLineDto } from '../models/ops.model';

/**
 * Local mirror of the server's OrderCalculator (ZestPoint.Business/Domain/OrderCalculator.cs). It exists ONLY so the POS can show
 * totals while offline; the server recomputes everything when the order syncs and its figures replace these.
 * Rounding: two decimals, half away from zero, once per figure.
 */
export const round2 = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON * 100)) / 100;
};

export function recalculate(order: LocalOrder): LocalOrder {
  let subtotal = 0;
  let lineDiscounts = 0;
  // What a whole-bill discount may be taken from (items that do not block discounts), and how much of that is taxable.
  let discountable = 0;
  let taxableDiscountable = 0;
  let taxableFixed = 0;
  const lines: OrderLineDto[] = order.lines.map((l) => {
    if (l.status === 'Voided') return { ...l, lineTotal: 0 };
    const gross = round2((l.unitPrice + l.modifierTotal) * l.quantity);
    let discount = Math.min(Math.max(0, l.discountAmount), gross);
    if (l.package?.mixed) {
      // A mixed package: each part of its price keeps the rule of the item it came from (same rule as the server).
      const both = Math.min(gross, round2(l.package.splitExemptNoDiscount * l.quantity));
      const fixedPart = Math.min(gross - both, round2(l.package.splitNoDiscount * l.quantity));
      const exempt = Math.min(gross - both - fixedPart, round2(l.package.splitExempt * l.quantity));
      const ordinary = gross - both - fixedPart - exempt;
      const open = ordinary + exempt;
      discount = Math.min(discount, open);
      subtotal += gross;
      lineDiscounts += discount;
      taxableFixed += fixedPart;
      discountable += open - discount;
      taxableDiscountable += open === 0 ? 0 : ordinary - (discount * ordinary) / open;
      return { ...l, lineTotal: round2(gross - discount) };
    }
    subtotal += gross;
    lineDiscounts += discount;
    if (l.blockDiscount) { if (!l.taxExempt) taxableFixed += gross - discount; }
    else {
      discountable += gross - discount;
      if (!l.taxExempt) taxableDiscountable += gross - discount;
    }
    return { ...l, lineTotal: round2(gross - discount) };
  });

  const net = subtotal - lineDiscounts;
  const orderDiscount = Math.min(Math.max(0, order.orderDiscount), discountable);
  const netAfter = net - orderDiscount;
  const tip = Math.max(0, order.tipAmount);

  // Tax on the taxable lines only; the whole-bill discount is shared in proportion (same rule as the server).
  const taxable = taxableFixed + (discountable === 0 ? 0 : taxableDiscountable === discountable ? discountable - orderDiscount : (taxableDiscountable * (discountable - orderDiscount)) / discountable);

  let tax: number;
  let total: number;
  if (order.taxInclusive) {
    tax = order.taxRatePercent <= 0 ? 0 : round2((taxable * order.taxRatePercent) / (100 + order.taxRatePercent));
    total = netAfter + tip;
  } else {
    tax = round2((taxable * order.taxRatePercent) / 100);
    total = netAfter + tax + tip;
  }

  const amountPaid = order.amountPaid;
  const editable = order.status === 'Open' || order.status === 'PartiallyPaid';
  let status = order.status;
  if (editable) status = amountPaid <= 0 ? 'Open' : amountPaid >= total && total > 0 ? 'Paid' : 'PartiallyPaid';

  return {
    ...order,
    lines,
    subtotal: round2(subtotal),
    discountTotal: round2(lineDiscounts),
    orderDiscount: round2(orderDiscount),
    taxTotal: tax,
    tipAmount: tip,
    total: round2(total),
    balance: Math.max(0, round2(total - amountPaid)),
    status
  };
}

/**
 * What the item's own discount takes off one unit sold at `unitPrice` (same rule as the server): the percentage, but never taking the
 * unit below its minimum price. `floor` is for the same unit: a case's floor is its singles' floor times what it holds.
 */
export function itemDiscountPerUnit(unitPrice: number, percent: number, floor: number | null | undefined): number {
  if (!(percent > 0) || !(unitPrice > 0)) return 0;
  return Math.max(0, Math.min(round2((unitPrice * percent) / 100), round2(unitPrice - Math.min(unitPrice, floor ?? 0))));
}

/** The item's-own-discount part of a line's discount at a given quantity. */
export const itemDiscountOf = (line: OrderLineDto, quantity: number): number => round2((line.itemDiscountPerUnit ?? 0) * quantity);

/**
 * Lines with the same key are the same thing at the same price, and the bill shows them as one row however many times the item was
 * added or sent. A serial-numbered unit is always a row of its own.
 */
export function lineKey(l: OrderLineDto): string {
  if (l.serialNumber) return l.id;
  return [
    l.productId, l.sellingUnitId ?? '', l.unitPrice, l.modifierTotal, l.itemDiscountPerUnit ?? 0, l.seat ?? '', l.notes ?? '',
    l.modifiers.map((m) => m.id).sort().join(','), (l.package?.contents ?? []).map((c) => `${c.name}:${c.quantity}`).join(',')
  ].join('|');
}

/** Splits an amount into equal shares that sum exactly to it (remainder cents go to the first shares). */
export function splitEvenly(amount: number, parts: number): number[] {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents % parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}
