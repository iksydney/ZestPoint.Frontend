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
  const lines: OrderLineDto[] = order.lines.map((l) => {
    if (l.status === 'Voided') return { ...l, lineTotal: 0 };
    const gross = round2((l.unitPrice + l.modifierTotal) * l.quantity);
    const discount = Math.min(Math.max(0, l.discountAmount), gross);
    subtotal += gross;
    lineDiscounts += discount;
    return { ...l, lineTotal: round2(gross - discount) };
  });

  const net = subtotal - lineDiscounts;
  const orderDiscount = Math.min(Math.max(0, order.orderDiscount), net);
  const netAfter = net - orderDiscount;
  const tip = Math.max(0, order.tipAmount);

  let tax: number;
  let total: number;
  if (order.taxInclusive) {
    tax = order.taxRatePercent <= 0 ? 0 : round2((netAfter * order.taxRatePercent) / (100 + order.taxRatePercent));
    total = netAfter + tip;
  } else {
    tax = round2((netAfter * order.taxRatePercent) / 100);
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

/** Splits an amount into equal shares that sum exactly to it (remainder cents go to the first shares). */
export function splitEvenly(amount: number, parts: number): number[] {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents % parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}
