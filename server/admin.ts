import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AdminError } from '@/lib/admin/auth';
import { OwnerError } from '@/lib/owner/auth';
import { ownerInput, ownerOrigin } from './owner-v2';
import { nfcEnvDeclared } from './env';

export const adminEnabled = () => nfcEnvDeclared() && process.env.NFC_ADMIN_ENABLED === 'true';
export function adminGate() { if (!adminEnabled()) throw new AdminError(404, 'NOT_FOUND'); }

// Everything administrative lives under /gov, including its API, so the cookie can be scoped to that subtree
// instead of the whole origin. A credential that reaches every shop is then never attached to a customer page
// request. The owner cookie still uses path '/'; narrowing that is a change to tested routes, not this slice.
export const adminCookie = 'nfc_admin_v1';
export const adminCookiePath = '/gov';
export async function adminSessionToken() { return (await cookies()).get(adminCookie)?.value; }

export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
export const adminJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: privateHeaders });
export const adminFailure = (error: unknown) => {
  if (error instanceof AdminError) return adminJson({ error: error.code }, error.status);
  // An unexpected failure answers with one generic code, so unless the reason is recorded here it is lost and
  // a 503 becomes undebuggable. Name and message only: no stack, no values that passed through the request.
  console.error('ADMIN_UNEXPECTED', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  return adminJson({ error: 'SERVICE_UNAVAILABLE' }, 503);
};

// Origin and body handling are reused rather than copied: one hardened parser, fixed in one place. Only the
// error type is translated, so an administrative route never answers with an owner error code.
const translate = (error: unknown) => { throw error instanceof OwnerError ? new AdminError(error.status, error.code) : new AdminError(400, 'INVALID_INPUT'); };
export function adminOrigin(request: Request) { try { ownerOrigin(request); } catch (error) { translate(error); } }
export async function adminInput(request: Request, limit?: number) { try { return await ownerInput(request, limit); } catch (error) { return translate(error); } }
