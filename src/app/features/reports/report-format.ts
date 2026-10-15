import { ReportCell, ReportColumn } from '../../core/models/nav-ops.model';

/** Pure display helpers for report cells. Nothing here changes a figure: it only formats what the server calculated. */

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return value.toFixed(2); // an unknown currency code must not break the screen
  }
}

export function formatNumber(value: number, maxDecimals = 4): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDecimals }).format(value);
}

/** A "YYYY-MM-DD" business date shown without any time-zone shifting (it is already the company's date). */
export function formatDateOnly(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function isNumeric(type: ReportColumn['type']): boolean {
  return type === 'int' || type === 'number' || type === 'money' || type === 'percent';
}

/** The text of a cell for non-date types. Dates need the company time zone and are rendered by the page. */
export function formatCell(value: ReportCell, column: ReportColumn, currency: string): string {
  if (value === null || value === undefined || value === '') return '';
  switch (column.type) {
    case 'money': return typeof value === 'number' ? formatMoney(value, currency) : String(value);
    case 'int': return typeof value === 'number' ? formatNumber(value, 0) : String(value);
    case 'number': return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'percent': return typeof value === 'number' ? `${formatNumber(value, 1)}%` : String(value);
    case 'bool': return value === true ? 'Yes' : value === false ? 'No' : String(value);
    case 'date': return typeof value === 'string' ? formatDateOnly(value) : String(value);
    default: return String(value);
  }
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'primary';

/** Status words to a tone. Unknown words stay neutral rather than being guessed at. */
export function badgeTone(text: string): BadgeTone {
  const t = text.toLowerCase();
  if (/(^ok$|approved|closed|reconciled|instock|in stock|paid|received|moving|covered|sold|receipt|equivalent)/.test(t)) return 'success';
  if (/(expired|out of stock|negative|obsolete|rejected|damaged|overdue|no cost|failed|cancelled|not connected)/.test(t)) return 'danger';
  if (/(pending|expiring|reorder|below|slow|counting|submitted|draft|order needed|needs|never sold|not configured|dispatched|returned|partially)/.test(t)) return 'warning';
  return 'primary';
}

/** Triggers a browser download. Used for CSV exports (the file has been built and audited by the server). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
