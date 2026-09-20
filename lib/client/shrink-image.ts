/**
 * Shrinks a picture in the browser before it is uploaded (lát A6, Tài 2026-09-20).
 *
 * A phone camera hands over four or five megabytes of pixels that no guest page will ever show at that size, and
 * every customer who taps a card then pays for them on 4G. Redrawing to a bounded size and re-encoding as WebP
 * turns that into a couple of hundred kilobytes with nothing a person can see going missing.
 *
 * Three rules keep it honest:
 *   - if anything goes wrong -- a format the browser will not decode, a canvas that will not encode -- the original
 *     file is uploaded unchanged. A picture that arrives large beats a picture that does not arrive;
 *   - if the result is not smaller, the original is used. Already-optimised pictures get bigger when re-encoded;
 *   - a picture already inside the bounds is left alone, so uploading the same file twice does not lose a little
 *     more of it each time.
 */
export type ShrinkLimits = { maxEdge: number; quality: number };
/** A page poster fills a phone screen; at twice the pixels of a 800px layout it stays sharp on a retina display. */
export const POSTER: ShrinkLimits = { maxEdge: 1600, quality: 0.82 };
/** A logo or an avatar is shown small and often, so it is bounded much harder. */
export const PORTRAIT: ShrinkLimits = { maxEdge: 512, quality: 0.85 };

export type Shrunk = { blob: Blob; type: string; from: number; to: number };

/** WebP is what every browser this product supports can encode; the check is the encoder's own answer, not a list. */
async function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  // A browser that cannot encode the type asked for quietly answers with PNG, which would be larger, not smaller.
  return blob && blob.type === type ? blob : null;
}

export async function shrinkImage(file: File | Blob, limits: ShrinkLimits): Promise<Shrunk> {
  const unchanged = { blob: file, type: file.type, from: file.size, to: file.size };
  // Only the three types the upload accepts; anything else is not ours to re-encode.
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return unchanged;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      if (!longest) return unchanged;
      const scale = Math.min(1, limits.maxEdge / longest);
      // Already small enough and already WebP: re-encoding would only lose a little more of it for nothing.
      if (scale === 1 && file.type === 'image/webp') return unchanged;
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return unchanged;
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await encode(canvas, 'image/webp', limits.quality);
      if (!blob || blob.size >= file.size) return unchanged;
      return { blob, type: blob.type, from: file.size, to: blob.size };
    } finally { bitmap.close(); }
  } catch { return unchanged; }
}

/** What to tell the person, once, in their own terms. Silence when nothing was gained. */
export function shrinkNotice(result: Shrunk) {
  if (result.to >= result.from) return '';
  const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  return `Đã nén ảnh ${size(result.from)} → ${size(result.to)} để khách mở trang nhanh hơn.`;
}
