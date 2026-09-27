import { body, failure, HttpError, json, sameOrigin } from '@/server/http';
import { signStartDraft, startEnabled } from '@/server/start';
import { DraftError, readDraftInput } from '@/lib/start/draft';
import { qrSvg } from '@/lib/qr';

/**
 * Signs what the builder has so far and hands back its link and that link's QR code (lát D4). Stateless: nothing is
 * written, so there is nothing to clean up and no one to rate-limit beyond the cost of one HMAC.
 */
export async function POST(request: Request) {
  if (!startEnabled()) return new Response(null, { status: 404 });
  try {
    sameOrigin(request);
    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new HttpError(503, 'APP_ORIGIN_MISSING');
    let draft;
    try { draft = readDraftInput(await body(request)); }
    catch (error) { if (error instanceof DraftError) throw new HttpError(400, error.code); throw error; }
    const { token, expiresAt } = signStartDraft(draft);
    const url = `${origin}/thu/${token}`;
    return json({ token, url, expiresAt: expiresAt.toISOString(), qr: qrSvg(url, 'Mã QR mở bản nháp trang của quán') });
  } catch (error) { return failure(error); }
}
