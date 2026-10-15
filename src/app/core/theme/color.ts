/** Pure colour maths, shared by the theme tokens, the contrast warnings and the generated logo. Mirrors the backend ColorMath. */

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0;

const HEX = /^#[0-9a-f]{6}$/i;

export const isHex = (value: string | null | undefined): value is string => !!value && HEX.test(value);

export function toRgb(hex: string): [number, number, number] {
  if (!isHex(hex)) return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "30 80 255": the CSS variable format Tailwind's `rgb(var(--x-rgb) / <alpha>)` expects. */
export const rgbTriplet = (hex: string): string => toRgb(hex).join(' ');

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background` (always at least ~4.58:1). */
export function readableOn(background: string): '#FFFFFF' | '#0F172A' {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#0F172A', background) ? '#FFFFFF' : '#0F172A';
}

export const normalizeHex = (value: string): string => {
  const v = value.trim();
  const withHash = v.startsWith('#') ? v : `#${v}`;
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return withHash.toUpperCase();
};

// ---- HSL helpers (status colours that must stay readable on a custom surface) ------------------

export function toHsl(hex: string): [number, number, number] {
  const [r8, g8, b8] = toRgb(hex);
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

/** Moves the lightness of `color` until it reaches `minRatio` against `background`. */
export function ensureContrast(color: string, background: string, minRatio: number): string {
  if (contrastRatio(color, background) >= minRatio) return color.toUpperCase();
  const [h, s, l] = toHsl(color);
  const darkBg = relativeLuminance(background) < 0.5;
  for (let step = 1; step <= 100; step++) {
    const candidate = fromHsl(h, s, darkBg ? Math.min(1, l + step * 0.01) : Math.max(0, l - step * 0.01));
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return darkBg ? '#FFFFFF' : '#000000';
}
