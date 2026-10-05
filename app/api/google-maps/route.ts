import { MAPS_BODY_LIMIT, receiveMaps } from '@/lib/google/business';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerFailure, ownerJson } from '@/server/owner-v2';

/**
 * The Google Maps review tool's webhook (Tài's machine → production): its "Webhook URL" is this address. No session, no
 * cookie: the body's HMAC with the tool's key (NFC_MAPS_KEY) is the only way in, see receiveMaps.
 */
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAPS_BODY_LIMIT) throw new OwnerError(413, 'TOO_LARGE');
    const body = await request.text();
    if (body.length > MAPS_BODY_LIMIT) throw new OwnerError(413, 'TOO_LARGE');
    return ownerJson(await receiveMaps(database(), body, request.headers.get('x-signature')));
  } catch (error) { return ownerFailure(error); }
}
