import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ean13Modules } from '../src/app/core/barcode';

/**
 * A short video of one EAN-13 barcode held still in front of the camera, in the Y4M format that Chromium's fake camera plays on a loop. The bars come from
 * the application's own label encoder (`core/barcode.ts`), drawn black on white with room around them, 4 pixels to a module. Returns the file's path, for
 * the browser's `--use-file-for-fake-video-capture` switch.
 */
export function barcodeVideo(value: string): string {
  const modules = ean13Modules(value);
  if (!modules) throw new Error(`${value} is not a valid EAN-13`);
  const W = 640;
  const H = 480;
  const unit = 4;
  const luma = Buffer.alloc(W * H, 255);
  const left = Math.floor((W - modules.length * unit) / 2);
  for (let row = 140; row < 340; row++) {
    for (let m = 0; m < modules.length; m++) if (modules[m] === '1') luma.fill(0, row * W + left + m * unit, row * W + left + (m + 1) * unit);
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const file = join(mkdtempSync(join(tmpdir(), 'zp-camera-')), 'barcode.y4m');
  writeFileSync(file, Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]));
  return file;
}
