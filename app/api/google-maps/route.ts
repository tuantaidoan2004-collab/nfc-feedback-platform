import { MAPS_BODY_LIMIT, mapsJobs, receiveMaps } from '@/lib/google/business';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerFailure, ownerJson } from '@/server/owner-v2';

/**
 * The Google Maps review tool on Tài's machine talks to this address only: GET which shops to read now (mapsJobs), POST
 * what it read for one shop (receiveMaps). No session, no cookie: an HMAC with the tool's key (NFC_MAPS_KEY) is the only
 * way in.
 */
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return ownerJson(await mapsJobs(database(), request.headers.get('x-timestamp'), request.headers.get('x-signature'))); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAPS_BODY_LIMIT) throw new OwnerError(413, 'TOO_LARGE');
    const body = await request.text();
    if (body.length > MAPS_BODY_LIMIT) throw new OwnerError(413, 'TOO_LARGE');
    return ownerJson(await receiveMaps(database(), body, request.headers.get('x-signature')));
  } catch (error) { return ownerFailure(error); }
}
