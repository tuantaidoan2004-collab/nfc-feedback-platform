import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { authorize, OwnerError, requirePermission, transaction, type OwnerAccess, type OwnerCredential } from '../owner/auth';
import { recordActivity } from '../owner/activity';
import { googleSettings, type GoogleSettings } from '../owner/google';

/**
 * "Kết nối với Google Business để đồng bộ đánh giá 5 sao" (kịch bản mục 5, rieng/google-api.md mục 3).
 *
 * Two modes, one data path. `google`: the owner signs in with Google and allows `business.manage`; the refresh token is
 * kept sealed (AES-256-GCM, NFC_GOOGLE_TOKEN_KEY) and the server pulls reviews from the Business Profile APIs.
 * `simulated`: until Google grants the platform API access (a Business Profile verified for 60 days is required), a local
 * deployment connects to sample data shaped exactly like Google's JSON, so every screen is real except the source.
 * Production never simulates: real shop owners must not see invented reviews.
 */
export type ReviewRow = { reviewId: string; reviewerName: string | null; reviewerPhoto: string | null; isAnonymous: boolean; stars: number;
  comment: string | null; createdAt: string; updatedAt: string; reply: string | null; replyUpdatedAt: string | null };
export type Connection = { mode: 'google' | 'simulated'; googleEmail: string | null; locationTitle: string | null; placeId: string | null;
  newReviewUri: string | null; averageRating: number | null; totalReviews: number | null; connectedAt: string; lastSyncedAt: string | null; lastError: string | null };
type Env = Record<string, string | undefined>;

export const BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const LOCATIONS = (account: string) => `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title,metadata&pageSize=100`;
const REVIEWS = (account: string, location: string, page?: string) =>
  `https://mybusiness.googleapis.com/v4/${account}/${location}/reviews?pageSize=50${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;

export const simulationAllowed = (env: Env = process.env) => env.NFC_ENV === 'local';
/** Real Google needs the platform's OAuth client and an explicit switch, set only once Google has approved API access. */
export const businessEnabled = (env: Env = process.env) => !!googleSettings(env) && env.NFC_GOOGLE_BUSINESS_ENABLED === 'true';

// ── Sealing the refresh token ────────────────────────────────────────────────────────────────────────────────────────
function tokenKey(env: Env) {
  const raw = env.NFC_GOOGLE_TOKEN_KEY?.trim();
  if (!raw || raw.length < 32) throw new OwnerError(503, 'GOOGLE_TOKEN_KEY_MISSING');
  return createHash('sha256').update(`nfc-google-token-v1\0${raw}`).digest();
}
export function sealToken(token: string, env: Env = process.env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', tokenKey(env), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}
export function openToken(sealed: string, env: Env = process.env) {
  const [version, iv, body, tag] = sealed.split('.');
  if (version !== 'v1' || !iv || !body || !tag) throw new OwnerError(500, 'GOOGLE_TOKEN_UNREADABLE');
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(env), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

// ── Google's review JSON → our row ───────────────────────────────────────────────────────────────────────────────────
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
type GoogleReview = { reviewId?: string; name?: string; reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string; comment?: string; createTime?: string; updateTime?: string; reviewReply?: { comment?: string; updateTime?: string } };
const https = (value: unknown) => typeof value === 'string' && /^https:\/\/[^\s]{1,990}$/.test(value) ? value : null;
const iso = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
export function normalizeReview(review: GoogleReview): ReviewRow | null {
  const reviewId = review.reviewId ?? review.name?.split('/').pop(), stars = STARS[review.starRating ?? ''];
  const createdAt = iso(review.createTime), updatedAt = iso(review.updateTime) ?? createdAt;
  if (!reviewId || reviewId.length > 300 || !stars || !createdAt || !updatedAt) return null;
  // Google appends "(Translated by Google)" blocks to comments in other languages; the original is what the shop needs.
  const comment = review.comment ? review.comment.split('\n\n(Translated by Google)')[0].slice(0, 10000) : null;
  return { reviewId, reviewerName: review.reviewer?.isAnonymous ? null : (review.reviewer?.displayName ?? null)?.slice(0, 200) ?? null,
    reviewerPhoto: https(review.reviewer?.profilePhotoUrl), isAnonymous: !!review.reviewer?.isAnonymous, stars, comment,
    createdAt, updatedAt, reply: review.reviewReply?.comment?.slice(0, 4096) ?? null, replyUpdatedAt: iso(review.reviewReply?.updateTime) };
}

// ── Sample data in Google's own shape ────────────────────────────────────────────────────────────────────────────────
const SAMPLE_PEOPLE = ['Minh Anh', 'Trần Quốc Bảo', 'Lan Phương', 'Hoàng Nam', 'Ngọc Trâm', 'Đức Huy', 'Thu Hà', 'Khánh Linh', 'Quang Vinh', 'Mai Chi', 'Tuấn Kiệt', 'Bảo Ngọc'];
const SAMPLE_WORDS: [string, string | null][] = [
  ['FIVE', 'Đồ uống ngon, nhân viên dễ thương, không gian yên tĩnh. Sẽ quay lại!'], ['FIVE', 'Quán xinh, nhạc nhẹ, ngồi làm việc rất thích.'],
  ['FOUR', 'Ổn, giá hợp lý. Cuối tuần hơi đông nên chờ lâu một chút.'], ['FIVE', null], ['THREE', 'Đồ uống được, nhưng chỗ gửi xe hơi chật.'],
  ['FIVE', 'Phục vụ nhanh, chủ quán thân thiện.'], ['TWO', 'Hôm nay đồ uống bị nhạt, mong quán xem lại.'], ['FOUR', 'Bánh ngọt ngon, cà phê đậm vừa.'],
  ['FIVE', 'Ghé lần thứ ba rồi, vẫn ổn định như mọi khi.'], ['FOUR', null], ['FIVE', 'Không gian đẹp, chụp ảnh rất hợp.'], ['ONE', 'Chờ 25 phút mới có nước.'],
];
export function sampleReviews(seedText: string, now = Date.now()): { reviews: GoogleReview[]; averageRating: number; totalReviewCount: number } {
  let seed = 0; for (const ch of seedText) seed = (seed * 33 + ch.charCodeAt(0)) >>> 0;
  const reviews = SAMPLE_WORDS.map(([starRating, comment], i) => {
    const at = new Date(now - (i * 2.7 + (seed % 5)) * 86400000).toISOString();
    const person = SAMPLE_PEOPLE[(i + seed) % SAMPLE_PEOPLE.length];
    return { name: `accounts/1/locations/1/reviews/sample-${seed.toString(36)}-${i}`, reviewId: `sample-${seed.toString(36)}-${i}`,
      reviewer: { displayName: person, isAnonymous: false }, starRating, ...(comment ? { comment } : {}), createTime: at, updateTime: at,
      ...(i === 0 ? { reviewReply: { comment: 'Cảm ơn bạn đã ghé quán, hẹn gặp lại bạn nhé!', updateTime: at } } : {}) } as GoogleReview;
  });
  const values = reviews.map(r => STARS[r.starRating!]);
  return { reviews, averageRating: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10, totalReviewCount: 128 + (seed % 90) };
}

// ── Real Google calls (used when businessEnabled) ────────────────────────────────────────────────────────────────────
export async function accessToken(settings: GoogleSettings, refreshToken: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(settings.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const body = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  // invalid_grant: the owner removed the app from their Google account, or a Testing-mode token passed its 7 days.
  if (!response.ok || !body.access_token) throw new OwnerError(401, body.error === 'invalid_grant' ? 'GOOGLE_ACCESS_REVOKED' : 'GOOGLE_REFUSED');
  return body.access_token;
}
async function getJson<T>(url: string, token: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new OwnerError(401, 'GOOGLE_ACCESS_REVOKED');
  if (response.status === 403 || response.status === 429) throw new OwnerError(503, 'GOOGLE_API_NOT_GRANTED');
  if (!response.ok) throw new OwnerError(502, 'GOOGLE_UNAVAILABLE');
  return response.json() as Promise<T>;
}
/** The location to sync: the one whose Place ID matches the shop's, else the only one, else the first. */
export async function findLocation(token: string, placeId: string | null, fetcher: typeof fetch = fetch) {
  const accounts = (await getJson<{ accounts?: { name: string }[] }>(ACCOUNTS, token, fetcher)).accounts ?? [];
  const found: { account: string; name: string; title: string; placeId: string | null; newReviewUri: string | null }[] = [];
  for (const account of accounts.slice(0, 10)) {
    const body = await getJson<{ locations?: { name: string; title?: string; metadata?: { placeId?: string; newReviewUri?: string } }[] }>(LOCATIONS(account.name), token, fetcher);
    for (const location of body.locations ?? []) found.push({ account: account.name, name: location.name, title: location.title ?? '',
      placeId: location.metadata?.placeId ?? null, newReviewUri: https(location.metadata?.newReviewUri) });
  }
  if (!found.length) throw new OwnerError(404, 'GOOGLE_NO_LOCATION');
  return found.find(l => placeId && l.placeId === placeId) ?? found[0];
}
export async function fetchReviews(token: string, account: string, location: string, fetcher: typeof fetch = fetch, pages = 4) {
  const all: GoogleReview[] = []; let page: string | undefined, average: number | null = null, total: number | null = null;
  for (let i = 0; i < pages; i++) {
    const body = await getJson<{ reviews?: GoogleReview[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(REVIEWS(account, location, page), token, fetcher);
    all.push(...(body.reviews ?? [])); average = body.averageRating ?? average; total = body.totalReviewCount ?? total;
    if (!body.nextPageToken) break; page = body.nextPageToken;
  }
  return { reviews: all, averageRating: average, totalReviewCount: total };
}

// ── Storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function store(db: PoolClient, shopId: string, reviews: GoogleReview[], average: number | null, total: number | null) {
  const rows = reviews.map(normalizeReview).filter((row): row is ReviewRow => !!row);
  for (const r of rows) await db.query(`INSERT INTO google_reviews(shop_id,review_id,reviewer_name,reviewer_photo,is_anonymous,stars,comment,created_at,updated_at,reply_comment,reply_updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(shop_id,review_id) DO UPDATE SET reviewer_name=EXCLUDED.reviewer_name,reviewer_photo=EXCLUDED.reviewer_photo,
    is_anonymous=EXCLUDED.is_anonymous,stars=EXCLUDED.stars,comment=EXCLUDED.comment,updated_at=EXCLUDED.updated_at,reply_comment=EXCLUDED.reply_comment,
    reply_updated_at=EXCLUDED.reply_updated_at,synced_at=clock_timestamp()`,
    [shopId, r.reviewId, r.reviewerName, r.reviewerPhoto, r.isAnonymous, r.stars, r.comment, r.createdAt, r.updatedAt, r.reply, r.replyUpdatedAt]);
  await db.query('UPDATE google_business_connections SET average_rating=$2,total_reviews=$3,last_synced_at=clock_timestamp(),last_error=NULL WHERE shop_id=$1',
    [shopId, average, total]);
  return rows.length;
}

const ownerOnly = (access: OwnerAccess) => { if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED'); };

export class GoogleBusiness {
  constructor(private pool: Pool, private env: Env = process.env, private fetcher: typeof fetch = fetch) {}

  /** The connection and the latest reviews, for Data and Dashboard. Reading reviews needs the feedback permission. */
  async status(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'overview');
      const row = (await db.query('SELECT * FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rows[0];
      const connection: Connection | null = row ? { mode: row.mode, googleEmail: row.google_email, locationTitle: row.location_title, placeId: row.place_id,
        newReviewUri: row.new_review_uri, averageRating: row.average_rating === null ? null : Number(row.average_rating), totalReviews: row.total_reviews,
        connectedAt: row.connected_at.toISOString(), lastSyncedAt: row.last_synced_at?.toISOString() ?? null, lastError: row.last_error } : null;
      const canRead = access.actor.kind === 'owner' ? access.permissions.includes('feedback') : access.actor.scope === 'feedback';
      const reviews = connection && canRead ? (await db.query(`SELECT review_id,reviewer_name,reviewer_photo,is_anonymous,stars,comment,created_at,updated_at,reply_comment,reply_updated_at
        FROM google_reviews WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 50`, [access.shopId])).rows.map(r => ({ reviewId: r.review_id, reviewerName: r.reviewer_name,
        reviewerPhoto: r.reviewer_photo, isAnonymous: r.is_anonymous, stars: r.stars, comment: r.comment, createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(), reply: r.reply_comment, replyUpdatedAt: r.reply_updated_at?.toISOString() ?? null })) as ReviewRow[] : [];
      return { connection, reviews, real: businessEnabled(this.env), simulation: simulationAllowed(this.env), canManage: access.actor.kind === 'owner' && access.role === 'owner' };
    });
  }

  /** Local only: connect to sample data shaped like Google's, then sync it like real reviews. */
  async connectSimulated(credential: OwnerCredential, slug: string) {
    if (!simulationAllowed(this.env)) throw new OwnerError(404, 'NOT_FOUND');
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); ownerOnly(access);
      const shop = (await db.query('SELECT name,place_id FROM shops WHERE id=$1', [access.shopId])).rows[0];
      await db.query(`INSERT INTO google_business_connections(shop_id,mode,google_email,account_name,location_name,location_title,place_id,connected_by)
        VALUES($1,'simulated','chu.quan.mau@gmail.com','accounts/1','locations/1',$2,$3,$4)
        ON CONFLICT(shop_id) DO UPDATE SET mode='simulated',refresh_token_sealed=NULL,location_title=EXCLUDED.location_title,place_id=EXCLUDED.place_id,connected_at=clock_timestamp()`,
        [access.shopId, shop.name, shop.place_id, access.userId]);
      const sample = sampleReviews(access.shopId);
      const synced = await store(db, access.shopId, sample.reviews, sample.averageRating, sample.totalReviewCount);
      await recordActivity(db, access, 'google.connect', 'dữ liệu thử');
      return { connected: true, mode: 'simulated', synced };
    });
  }

  /** Real Google, after the OAuth callback: keep the sealed token, find the location, pull the reviews. */
  async connectGoogle(userId: string, slug: string, refreshToken: string, email: string | null) {
    const settings = googleSettings(this.env);
    if (!settings || !businessEnabled(this.env)) throw new OwnerError(404, 'NOT_FOUND');
    const shop = (await this.pool.query(`SELECT s.id,s.place_id FROM shops s JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.user_id=$2 AND m.active AND m.role='owner'
      WHERE s.slug=$1`, [slug, userId])).rows[0];
    if (!shop) throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
    const token = await accessToken(settings, refreshToken, this.fetcher);
    const location = await findLocation(token, shop.place_id, this.fetcher);
    const pulled = await fetchReviews(token, location.account, location.name, this.fetcher);
    return transaction(this.pool, async db => {
      await db.query(`INSERT INTO google_business_connections(shop_id,mode,google_email,account_name,location_name,location_title,place_id,new_review_uri,refresh_token_sealed,connected_by)
        VALUES($1,'google',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(shop_id) DO UPDATE SET mode='google',google_email=EXCLUDED.google_email,account_name=EXCLUDED.account_name,
        location_name=EXCLUDED.location_name,location_title=EXCLUDED.location_title,place_id=EXCLUDED.place_id,new_review_uri=EXCLUDED.new_review_uri,
        refresh_token_sealed=EXCLUDED.refresh_token_sealed,connected_by=EXCLUDED.connected_by,connected_at=clock_timestamp()`,
        [shop.id, email, location.account, location.name, location.title.slice(0, 200), location.placeId, location.newReviewUri, sealToken(refreshToken, this.env), userId]);
      // The official review link replaces the one built from the Place ID.
      if (location.newReviewUri) await db.query('UPDATE shops SET google_url=$2,place_id=COALESCE(place_id,$3) WHERE id=$1', [shop.id, location.newReviewUri, location.placeId]);
      return { synced: await store(db, shop.id, pulled.reviews, pulled.averageRating, pulled.totalReviewCount) };
    });
  }

  /** "Đồng bộ ngay": simulated data again, or Google's latest. */
  async sync(credential: OwnerCredential, slug: string) {
    const { shopId, row, access } = await transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'feedback');
      return { access, shopId: access.shopId, row: (await db.query('SELECT * FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rows[0] };
    });
    if (!row) throw new OwnerError(404, 'GOOGLE_NOT_CONNECTED');
    let pulled: { reviews: GoogleReview[]; averageRating: number | null; totalReviewCount: number | null };
    if (row.mode === 'simulated') pulled = sampleReviews(shopId);
    else {
      const settings = googleSettings(this.env); if (!settings) throw new OwnerError(503, 'GOOGLE_UNAVAILABLE');
      try { pulled = await fetchReviews(await accessToken(settings, openToken(row.refresh_token_sealed, this.env), this.fetcher), row.account_name, row.location_name, this.fetcher); }
      catch (error) {
        if (error instanceof OwnerError) await this.pool.query('UPDATE google_business_connections SET last_error=$2 WHERE shop_id=$1', [shopId, error.code]);
        throw error;
      }
    }
    return transaction(this.pool, async db => {
      const synced = await store(db, shopId, pulled.reviews, pulled.averageRating, pulled.totalReviewCount);
      await recordActivity(db, access, 'google.sync', `${synced} đánh giá`);
      return { synced };
    });
  }

  async disconnect(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); ownerOnly(access);
      await db.query('DELETE FROM google_reviews WHERE shop_id=$1', [access.shopId]);
      if (!(await db.query('DELETE FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rowCount) throw new OwnerError(404, 'GOOGLE_NOT_CONNECTED');
      await recordActivity(db, access, 'google.disconnect', null);
      return { connected: false };
    });
  }
}
