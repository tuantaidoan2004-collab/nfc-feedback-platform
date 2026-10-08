import type { Pool } from 'pg';
import { authorize, OwnerError, requirePermission, transaction, type OwnerCredential } from '../owner/auth';
import { googleUrlProblem } from '../publishing/policy';
import { recordActivity } from '../owner/activity';
import { parsePlaceId, reviewLink } from './place-id';
import { placeIdFromLink } from './place-from-link';

/*
 * Place ID của quán (kịch bản mục 5): chủ quán dán mã, hoặc dán link Google Maps của quán và hệ thống tự tính mã (./place-id,
 * ./place-from-link; Tài 08/10), rồi tạo link đánh giá từ mã đó. Không cần khoá Google. Khi Tài bật thanh toán, ô tìm quán tự động là bước nâng kế tiếp (rieng/google-api.md mục 2).
 */

/** Saves the shop's Place ID and the review link built from it. Owner, or a member with the design permission. */
export async function savePlaceId(pool: Pool, credential: OwnerCredential, slug: string, body: unknown, fetcher: typeof fetch = fetch) {
  // The Place ID itself, or a Google Maps link to the place, short share links included (Tài 08/10).
  const pasted = body && typeof body === 'object' ? (body as Record<string, unknown>).placeId : null;
  const placeId = parsePlaceId(pasted) ?? await placeIdFromLink(pasted, fetcher);
  if (!placeId) throw new OwnerError(400, 'INVALID_PLACE_ID');
  const link = reviewLink(placeId);
  if (googleUrlProblem(link)) throw new OwnerError(400, 'INVALID_PLACE_ID');
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design');
    await db.query('UPDATE shops SET place_id=$2,google_url=$3,google_address=NULL WHERE id=$1', [access.shopId, placeId, link]);
    await recordActivity(db, access, 'google.place', placeId);
    return { placeId, reviewLink: link };
  });
}

/** What the Google step shows on return: the Place ID already saved, and the review link the shop's pages use. */
export async function placeStatus(pool: Pool, credential: OwnerCredential, slug: string) {
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'design');
    const row = (await db.query('SELECT name,place_id,google_url FROM shops WHERE id=$1', [access.shopId])).rows[0];
    return { name: row.name as string, placeId: row.place_id as string | null,
      reviewLink: row.google_url && row.google_url !== 'https://maps.google.com/' ? row.google_url as string : null };
  });
}
