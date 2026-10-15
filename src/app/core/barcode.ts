/**
 * Barcode encoders for labels. Pure functions: a barcode is a string of modules, '1' = bar and '0' = space. They never invent data:
 * a value a format cannot hold returns null and the caller says so.
 */

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
] as const;

const START_B = 104;
const STOP = 106;

const widthsToModules = (pattern: string): string => {
  let out = '';
  let bar = true;
  for (const w of pattern) { out += (bar ? '1' : '0').repeat(Number(w)); bar = !bar; }
  return out;
};

/** Code 128 subset B (printable ASCII). Returns the modules, or null when the text cannot be encoded. */
export function code128Modules(text: string): string | null {
  if (!text || text.length > 80) return null;
  let sum = START_B;
  const codes: number[] = [START_B];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 || c > 126) return null;
    const value = c - 32;
    codes.push(value);
    sum += value * (i + 1);
  }
  codes.push(sum % 103, STOP);
  return codes.map((v) => widthsToModules(CODE128_PATTERNS[v]!)).join('');
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

/** EAN-13. Returns null unless the value is 13 digits with a correct check digit. */
export function ean13Modules(value: string): string | null {
  if (!isValidEan13(value)) return null;
  const parity = PARITY[Number(value[0])]!;
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === 'L' ? L : G)[Number(value[i])]!;
  out += '01010';
  for (let i = 7; i <= 12; i++) out += R[Number(value[i])]!;
  return out + '101';
}

/** The SVG path for a module string: one rectangle per run of bars, 1 unit wide per module, height 'h'. */
export function modulesToPath(modules: string, height = 40): string {
  let d = '';
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let j = i;
      while (j < modules.length && modules[j] === '1') j++;
      d += `M${i} 0h${j - i}v${height}h-${j - i}z`;
      i = j;
    } else i++;
  }
  return d;
}

export type BarcodeFormat = 'code128' | 'ean13';

export function barcodeModules(value: string | null, format: BarcodeFormat | null): string | null {
  if (!value || !format) return null;
  return format === 'ean13' ? ean13Modules(value) : code128Modules(value);
}
