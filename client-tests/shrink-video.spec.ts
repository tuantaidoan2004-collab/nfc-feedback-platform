import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Shrinking a poster video (lát E9) runs on canvas, captureStream and MediaRecorder, which only a real browser has.
 * Same vehicle as shrink-image.spec.ts: transpile the module, inject it, drive it in Chrome.
 */
declare global {
  interface Window { videoModule: typeof import('../lib/client/shrink-video'); }
}
let origin: string;
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>NFC video test</title>'); });
test.beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const script = `window.videoModule=(()=>{const exports={};${ts.transpileModule(readFileSync('lib/client/shrink-video.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText};return exports;})();`;

test('Chrome: a heavy Full HD clip comes out 720p, lighter, the same length and playable; a light small one is left alone', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript({ content: script });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { shrinkVideo, mp4Recorder, POSTER_VIDEO } = window.videoModule;
    const type = mp4Recorder();
    if (!type) return { type: null };
    /** A clip like a phone's: every frame full of fine moving detail, recorded far above the poster rate. */
    const record = async (width: number, height: number, seconds: number, bitsPerSecond: number, busy = true) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!, stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitsPerSecond });
      const chunks: Blob[] = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      let seed = 11; const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const paint = () => {
        context.fillStyle = busy ? '#123' : `hsl(${random() * 30 | 0},40%,40%)`; context.fillRect(0, 0, width, height);
        for (let i = 0; i < (busy ? 1500 : 0); i++) {
          context.fillStyle = `hsl(${random() * 360 | 0},70%,${30 + random() * 50 | 0}%)`;
          context.fillRect(random() * width, random() * height, 2 + random() * 14, 2 + random() * 14);
        }
      };
      paint(); recorder.start(500);
      const timer = setInterval(paint, 1000 / 30);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      clearInterval(timer); recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      return new Blob(chunks, { type: 'video/mp4' });
    };
    const read = async (blob: Blob) => {
      const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(Error('unplayable')); });
      // A recorder's MP4 may not state its length up front; seeking to the end makes the browser find it.
      if (!Number.isFinite(video.duration)) { video.currentTime = 1e6; await new Promise(resolve => { video.ontimeupdate = resolve; }); }
      const out = { width: video.videoWidth, height: video.videoHeight, seconds: video.duration };
      URL.revokeObjectURL(video.src); return out;
    };
    const heavy = await record(1920, 1080, 3, 12_000_000);
    const progress: number[] = [];
    const shrunk = await shrinkVideo(heavy, POSTER_VIDEO, share => progress.push(share));
    // Flat frames: a recorder cannot make noise small, so a light clip has to be one that is light by nature.
    const light = await record(640, 360, 1, 400_000, false);
    return { type, heavy: { size: heavy.size, ...await read(heavy) }, shrunk: shrunk && { size: shrunk.to, from: shrunk.from, type: shrunk.type, ...await read(shrunk.blob) },
      progressed: progress.length > 3 && progress[progress.length - 1] > 0.9, lightRate: light.size * 8, light: await shrinkVideo(light) };
  });
  test.skip(result.type === null, 'This Chrome has no MP4 recorder; the upload then sends the original, as designed.');
  expect(result.heavy).toMatchObject({ width: 1920, height: 1080 });
  expect(result.shrunk).toMatchObject({ width: 1280, height: 720, type: 'video/mp4', from: result.heavy!.size });
  expect(result.shrunk!.size).toBeLessThan(result.heavy!.size);
  expect(Math.abs(result.shrunk!.seconds - result.heavy!.seconds)).toBeLessThan(0.6);
  expect(result.progressed).toBe(true);
  // The fixture really is light (under the 1.5 Mbps target), or this line would test nothing.
  expect(result.lightRate).toBeLessThan(1_500_000);
  expect(result.light).toBeNull();
});
