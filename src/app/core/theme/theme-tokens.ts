import { AA_LARGE, AA_NORMAL, contrastRatio, ensureContrast, isHex, readableOn, rgbTriplet } from './color';

/** The editable colour/typography fields of a theme. `BrandingDto` and the editor's draft both satisfy this. */
export interface ThemeInput {
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly surfaceColor: string;
  readonly textColor: string;
  readonly successColor?: string | null;
  readonly warningColor?: string | null;
  readonly errorColor?: string | null;
  readonly fontFamily: string;
}

/** Approved typography options (the backend whitelists the same keys). */
export const FONT_OPTIONS: readonly { key: string; label: string; stack: string }[] = [
  { key: 'system', label: 'System default', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { key: 'inter', label: 'Inter', stack: "Inter, system-ui, sans-serif" },
  { key: 'rounded', label: 'Rounded', stack: "ui-rounded, 'Nunito', 'Segoe UI', system-ui, sans-serif" },
  { key: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
  { key: 'mono', label: 'Monospace', stack: "ui-monospace, 'Cascadia Mono', Consolas, monospace" }
];

export const DEFAULT_STATUS = { success: '#15803D', warning: '#B45309', error: '#B91C1C' } as const;

const stackFor = (key: string): string => (FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0]!).stack;

/** Status colours default per theme so they are always readable as text on the surface (AA). */
export function statusColors(t: ThemeInput): { success: string; warning: string; error: string } {
  const readable = (preferred: string | null | undefined, fallback: string) =>
    isHex(preferred) ? preferred.toUpperCase() : ensureContrast(fallback, t.surfaceColor, AA_NORMAL);
  return {
    success: readable(t.successColor, DEFAULT_STATUS.success),
    warning: readable(t.warningColor, DEFAULT_STATUS.warning),
    error: readable(t.errorColor, DEFAULT_STATUS.error)
  };
}

/**
 * The single place that turns a theme into CSS variables. ThemeService applies the result to <html> (saved theme);
 * the branding editor applies the result of the DRAFT to the preview frame only. Same function, so preview == reality.
 */
export function themeVariables(t: ThemeInput): Record<string, string> {
  const status = statusColors(t);
  return {
    '--primary-rgb': rgbTriplet(t.primaryColor),
    '--secondary-rgb': rgbTriplet(t.secondaryColor),
    '--canvas-rgb': rgbTriplet(t.backgroundColor),
    '--panel-rgb': rgbTriplet(t.surfaceColor),
    '--ink-rgb': rgbTriplet(t.textColor),
    '--success-rgb': rgbTriplet(status.success),
    '--warning-rgb': rgbTriplet(status.warning),
    '--danger-rgb': rgbTriplet(status.error),
    '--on-primary-rgb': rgbTriplet(readableOn(t.primaryColor)),
    '--on-secondary-rgb': rgbTriplet(readableOn(t.secondaryColor)),
    '--font-app': stackFor(t.fontFamily)
  };
}

export interface ContrastIssue {
  readonly pair: string;
  readonly ratio: number;
  readonly required: number;
  readonly blocking: boolean;
  readonly message: string;
}

/** Instant, client-side contrast audit with the same thresholds the server enforces on publish. */
export function auditTheme(t: ThemeInput): ContrastIssue[] {
  const status = statusColors(t);
  const issues: ContrastIssue[] = [];

  const check = (pair: string, fg: string, bg: string, warnBelow: number, blockBelow: number, what: string) => {
    if (!isHex(fg) || !isHex(bg)) return;
    const ratio = contrastRatio(fg, bg);
    if (ratio >= warnBelow) return;
    issues.push({
      pair, ratio: Math.round(ratio * 100) / 100, required: warnBelow, blocking: ratio < blockBelow,
      message: `${what} has a contrast ratio of ${ratio.toFixed(1)}:1; at least ${warnBelow.toFixed(1)}:1 is recommended.`
    });
  };

  check('text/background', t.textColor, t.backgroundColor, AA_NORMAL, AA_LARGE, 'Main text on the page background');
  check('text/surface', t.textColor, t.surfaceColor, AA_NORMAL, AA_LARGE, 'Main text on cards');
  check('primary/background', t.primaryColor, t.backgroundColor, AA_LARGE, 1.5, 'The primary accent against the background');
  check('primary/surface', t.primaryColor, t.surfaceColor, AA_LARGE, 1.5, 'The primary accent against cards');
  check('secondary/background', t.secondaryColor, t.backgroundColor, AA_LARGE, 1.5, 'The secondary accent against the background');
  check('error/surface', status.error, t.surfaceColor, AA_NORMAL, AA_LARGE, 'Error text on cards');
  return issues;
}

/** "Rooftop 99 Lounge" -> "R99L", "Beach Club Pool Bar" -> "BCPB". Mirrors Company.ComputeInitials on the server. */
export function computeInitials(name: string): string {
  const chars: string[] = [];
  for (const word of name.split(/[\s\-_&.]+/).filter(Boolean)) {
    if (/^\d+$/.test(word)) chars.push(...word);
    else {
      const first = [...word].find((c) => /[\p{L}\p{N}]/u.test(c));
      if (first) chars.push(first);
    }
  }
  return chars.length ? chars.slice(0, 4).join('').toUpperCase() : 'ZP';
}
