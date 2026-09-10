import 'server-only';
import { NextResponse } from 'next/server';
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
export function failure(error: unknown) { return error instanceof HttpError ? json({ error: error.code },error.status) : json({ error: 'SERVICE_UNAVAILABLE' },503); }
export function sameOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || request.headers.get('origin') !== origin) throw new HttpError(403,'ORIGIN_NOT_ALLOWED');
}
export async function body(request: Request): Promise<Record<string,unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'JSON_REQUIRED');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400,'INVALID_BODY');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const {done,value} = await reader.read(); if (done) break; length += value.byteLength; if (length > 12000) { await reader.cancel(); throw new HttpError(413,'BODY_TOO_LARGE'); } chunks.push(value); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw new HttpError(400,'INVALID_BODY'); }
}
