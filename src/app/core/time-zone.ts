/**
 * Wall-clock time in a named time zone <-> UTC, for date-time boxes that must mean the COMPANY's time (a special that starts "Friday
 * 18:00" starts at 18:00 where the venue is, whatever zone the browser is in). Times stay UTC on the wire.
 */

/** The parts of an instant as seen on a clock in `timeZone`. */
function partsIn(date: Date, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(date)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p['year']!, mo: p['month']!, d: p['day']!, h: p['hour']!, mi: p['minute']! };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** A UTC instant as "yyyy-MM-ddTHH:mm" on the company's clock (the value of a datetime-local box). Empty for no value. */
export function utcToZoned(utcIso: string | null | undefined, timeZone: string): string {
  if (!utcIso) return '';
  const date = new Date(utcIso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(utcIso) ? utcIso : `${utcIso}Z`);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const p = partsIn(date, timeZone);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
  } catch { return ''; }
}

/** "yyyy-MM-ddTHH:mm" on the company's clock as a UTC ISO instant. Null for no or unreadable value. */
export function zonedToUtc(local: string | null | undefined, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return null;
  const want = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  try {
    // Start from "as if it were UTC", see what the zone's clock shows for that instant, and move by the difference. Twice, so a
    // daylight-saving change between the guess and the answer is absorbed.
    let guess = want;
    for (let i = 0; i < 2; i++) {
      const p = partsIn(new Date(guess), timeZone);
      guess += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    }
    return new Date(guess).toISOString();
  } catch { return null; }
}
