import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Shrinking runs on canvas and WebP, which only exist in a browser, so these run in a real Chrome page rather
 * than in Node (lát A6). Same vehicle as identity-lifecycle.spec.ts: transpile the module, inject it, drive it.
 */
declare global {
  interface Window { shrinkModule: typeof import('../lib/client/shrink-image'); }
}
let origin: string;
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>NFC shrink test</title>'); });
test.beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const bundle = (path: string, name: string) => `window.${name}=(()=>{const exports={};${ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText};return exports;})();`;
const scripts = bundle('lib/client/shrink-image.ts', 'shrinkModule');

test('Chromium: a camera-sized picture is bounded and re-encoded; anything that would not gain is left alone', async ({ page }) => {
  await page.addInitScript({ content: scripts });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { shrinkImage, shrinkNotice, POSTER, PORTRAIT } = window.shrinkModule;
    /**
     * Photograph-like: smooth lighting plus a great deal of fine detail, which is what actually makes a camera
     * file big. An earlier version of this test painted a repeating pattern instead; PNG squeezed that to 137 KB
     * while WebP of the same thing came to 942 KB, so the module correctly refused to touch it -- and the test
     * was measuring nothing. What a shop uploads from a phone is a large, detailed JPEG.
     */
    const paint = (width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!;
      const light = context.createLinearGradient(0, 0, width, height);
      light.addColorStop(0, '#2b4a7a'); light.addColorStop(0.5, '#c96f3a'); light.addColorStop(1, '#123');
      context.fillStyle = light; context.fillRect(0, 0, width, height);
      let seed = 7; const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 9000; i++) {
        context.fillStyle = `hsla(${random() * 360 | 0},${40 + random() * 50 | 0}%,${20 + random() * 60 | 0}%,0.55)`;
        context.beginPath(); context.arc(random() * width, random() * height, 1 + random() * 9, 0, 7); context.fill();
      }
      return canvas;
    };
    const blobOf = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
      new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), type, quality));
    const sizeOf = async (blob: Blob) => { const bitmap = await createImageBitmap(blob); const out = { w: bitmap.width, h: bitmap.height }; bitmap.close(); return out; };

    const camera = await blobOf(paint(3000, 2000), 'image/jpeg', 0.92);
    const poster = await shrinkImage(camera, POSTER);
    const portrait = await shrinkImage(camera, PORTRAIT);

    // A small WebP already inside the bounds: re-encoding would only lose a little more of it for nothing.
    const smallWebp = await blobOf(paint(300, 200), 'image/webp', 0.9);
    const untouchedWebp = await shrinkImage(smallWebp, POSTER);

    /**
     * A hard, repeating pattern is the case where WebP loses badly: measured here at 137 KB as PNG against 942 KB
     * as WebP. This fixture is not invented -- it is what an earlier version of this test used by mistake for the
     * camera picture, which is how the case was found. The rule that keeps the original is what stops a picture
     * like this being uploaded seven times larger than it arrived.
     */
    const patterned = document.createElement('canvas');
    patterned.width = 3000; patterned.height = 2000;
    const pen = patterned.getContext('2d')!;
    const pixels = pen.createImageData(3000, 2000);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = (i * 7) % 256; pixels.data[i + 1] = (i * 13) % 256; pixels.data[i + 2] = (i * 29) % 256; pixels.data[i + 3] = 255;
    }
    pen.putImageData(pixels, 0, 0);
    const drawing = await blobOf(patterned, 'image/png');
    const untouchedDrawing = await shrinkImage(drawing, POSTER);

    // Not a picture, and a picture the browser cannot decode: both pass through rather than failing the upload.
    const notAPicture = await shrinkImage(new Blob(['plain text'], { type: 'text/plain' }), POSTER);
    const corrupt = await shrinkImage(new Blob(['not really a png'], { type: 'image/png' }), POSTER);

    return {
      cameraSize: camera.size,
      poster: { type: poster.type, to: poster.to, ...await sizeOf(poster.blob) },
      portrait: { type: portrait.type, ...await sizeOf(portrait.blob) },
      untouchedWebp: { same: untouchedWebp.blob === smallWebp, to: untouchedWebp.to, from: untouchedWebp.from },
      untouchedDrawing: { same: untouchedDrawing.blob === drawing, from: untouchedDrawing.from, to: untouchedDrawing.to },
      notAPicture: { same: notAPicture.blob instanceof Blob, type: notAPicture.type },
      corrupt: { to: corrupt.to, from: corrupt.from },
      notice: shrinkNotice(poster),
      silent: shrinkNotice(untouchedWebp),
    };
  });

  // The longest edge is what the bound is about; the other edge follows, so the picture is not distorted.
  expect(Math.max(result.poster.w, result.poster.h)).toBe(1600);
  expect(result.poster.w / result.poster.h).toBeCloseTo(1.5, 2);
  expect(result.poster.type).toBe('image/webp');
  // The whole point: what the customer downloads is a fraction of what the shop picked.
  // Measured on this fixture: 753 KB down to 144 KB, a factor of five. Asserted at three, so a browser that
  // encodes a little differently does not make this flap, while a regression that stopped shrinking would.
  expect(result.poster.to).toBeLessThan(result.cameraSize / 3);
  expect(Math.max(result.portrait.w, result.portrait.h)).toBe(512);

  // Nothing is re-encoded when there is nothing to gain, so uploading twice does not degrade a picture twice.
  expect(result.untouchedWebp.same).toBe(true);
  expect(result.untouchedWebp.to).toBe(result.untouchedWebp.from);
  expect(result.untouchedDrawing.same).toBe(true);
  expect(result.untouchedDrawing.to).toBe(result.untouchedDrawing.from);
  // A file we have no business re-encoding, and one the browser cannot read, are handed on untouched: a picture
  // that arrives large beats a picture that does not arrive.
  expect(result.notAPicture.type).toBe('text/plain');
  expect(result.corrupt.to).toBe(result.corrupt.from);

  expect(result.notice).toMatch(/^Đã nén ảnh .* → .* để khách mở trang nhanh hơn\.$/);
  expect(result.silent).toBe('');
});
