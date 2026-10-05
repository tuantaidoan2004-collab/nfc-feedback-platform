import 'server-only';
import { NextResponse } from 'next/server';
import { fromThisSite } from './same-origin';
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
export function failure(error: unknown) { return error instanceof HttpError ? json({ error: error.code },error.status) : json({ error: 'SERVICE_UNAVAILABLE' },503); }
export function sameOrigin(request: Request) {
  if (!fromThisSite(request, process.env.APP_ORIGIN)) throw new HttpError(403,'ORIGIN_NOT_ALLOWED');
}
/**
 * The request's body as text, read as it arrives and dropped the moment it passes `limit` bytes (rà bảo mật 29/09, U1).
 * `text()` and `formData()` wait for the whole body first, so on a server with nothing in front of it limiting bodies, one
 * request could hold a gigabyte in memory. Past the limit: HttpError 413, and the rest is never read.
 */
export async function boundedText(request: Request, limit: number): Promise<string> {
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); throw new HttpError(413,'BODY_TOO_LARGE'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function body(request: Request): Promise<Record<string,unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'JSON_REQUIRED');
  if (!request.body) throw new HttpError(400,'INVALID_BODY');
  const text = await boundedText(request, 12000);
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw new HttpError(400,'INVALID_BODY'); }
}
