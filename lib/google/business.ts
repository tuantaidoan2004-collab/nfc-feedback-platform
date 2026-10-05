import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { authorize, OwnerError, requirePermission, transaction, type OwnerAccess, type OwnerCredential } from '../owner/auth';
import { recordActivity } from '../owner/activity';
import { googleSettings, type GoogleSettings } from '../owner/google';

/**
 * "Kết nối với Google Business để đồng bộ đánh giá 5 sao" (kịch bản mục 5, rieng/google-api.md mục 3).
 *
 * Two sources, one data path. `google`: the owner signs in with Google and allows `business.manage`; the refresh token is
 * kept sealed (AES-256-GCM, NFC_GOOGLE_TOKEN_KEY) and the server pulls reviews from the Business Profile APIs.
 * `maps`: until Google grants the platform API access (a Business Profile verified for 60 days is required), the Google
 * Maps review tool on Tài's machine (`~/MAps`; Tài 05/10: it replaces the sample data) supplies one shop's real reviews.
 * NFC_MAPS_SHOP names that shop and no other shop can connect to it. The tool's answers are turned into Google's own
 * JSON shape, so both sources meet in normalizeReview and every screen reads one table.
 */
export type ReviewRow = { reviewId: string; reviewerName: string | null; reviewerPhoto: string | null; isAnonymous: boolean; stars: number;
  comment: string | null; createdAt: string; updatedAt: string; reply: string | null; replyUpdatedAt: string | null };
/** averageRating and totalReviews are Google's figures: null for everyone but the owner (google-policy.md rule 10). */
export type Connection = { mode: 'google' | 'maps'; googleEmail: string | null; locationTitle: string | null; placeId: string | null;
  newReviewUri: string | null; averageRating: number | null; totalReviews: number | null; connectedAt: string; lastSyncedAt: string | null; lastError: string | null };
type Env = Record<string, string | undefined>;

export const BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const LOCATIONS = (account: string) => `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title,metadata&pageSize=100`;
const REVIEWS = (account: string, location: string, page?: string) =>
  `https://mybusiness.googleapis.com/v4/${account}/${location}/reviews?pageSize=50${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;

/**
 * The Google Maps review tool: the key it answers to and signs with (its `api_key`; scripts/local.mjs reads it from the
 * tool's own config.json, production keeps it in NFC_MAPS_KEY), the one shop it follows, and -- only where the server can
 * reach Tài's machine, i.e. locally -- its address, to ask it. Production has no address: the tool sends (receiveMaps).
 * The key goes to the tool and nowhere else, never to a browser.
 */
export type MapsSettings = { url: string | null; key: string; shop: string };
export function mapsSettings(env: Env = process.env): MapsSettings | null {
  const url = env.NFC_MAPS_URL?.trim().replace(/\/+$/, ''), key = env.NFC_MAPS_KEY?.trim(), shop = env.NFC_MAPS_SHOP?.trim().toLowerCase();
  return key && shop ? { url: url && /^https?:\/\/[^\s]+$/.test(url) ? url : null, key, shop } : null;
}
/** The tool can be asked from here, for this shop. */
const askable = (tool: MapsSettings | null, slug: string): tool is MapsSettings & { url: string } => !!tool?.url && tool.shop === slug.toLowerCase();
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

// ── The Google Maps review tool, in Google's shape ───────────────────────────────────────────────────────────────────
/** One review as the tool's GET /api/reviews lists it (table `reviews` in ~/MAps/backend/app/db.py). */
export type MapsReview = { id?: unknown; author?: unknown; author_photo?: unknown; rating?: unknown; text?: unknown; owner_reply?: unknown;
  est_posted_at?: unknown; first_seen_at?: unknown };
const WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const words = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
/**
 * The tool writes Vietnam's wall clock without an offset. Google Maps shows only "2 tháng trước", so a review's day is the
 * tool's estimate (est_posted_at), kept at noon so it is the same day in any timezone; the screens say it is an estimate.
 */
function vietnamDay(value: unknown) {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00+07:00`)) ? new Date(`${day}T12:00:00+07:00`).toISOString() : undefined;
}
const vietnamMoment = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}+07:00`)) ? new Date(`${value}+07:00`).toISOString() : null;
export function fromMaps(review: MapsReview): GoogleReview {
  const day = vietnamDay(review.est_posted_at) ?? vietnamDay(review.first_seen_at), reply = words(review.owner_reply);
  return { reviewId: words(review.id), reviewer: { displayName: words(review.author), profilePhotoUrl: words(review.author_photo) },
    starRating: Number.isInteger(review.rating) ? WORDS[review.rating as number] : undefined, comment: words(review.text),
    createTime: day, updateTime: day, ...(reply ? { reviewReply: { comment: reply } } : {}) };
}
/** Google's score and count as the tool read them off Google Maps. */
const scoreOf = (average: unknown, total: unknown) => {
  const a = Number(average), t = Number(total);
  return { averageRating: a >= 1 && a <= 5 ? Math.round(a * 100) / 100 : null, totalReviewCount: Number.isInteger(t) && t >= 0 ? t : null };
};
async function mapsJson<T>(tool: { url: string; key: string }, path: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(`${tool.url}${path}`, { headers: { 'X-API-Key': tool.key }, cache: 'no-store', signal: AbortSignal.timeout(20000) })
    .catch(() => { throw new OwnerError(503, 'MAPS_UNREACHABLE'); });
  if (response.status === 401 || response.status === 403) throw new OwnerError(503, 'MAPS_REFUSED');
  if (!response.ok) throw new OwnerError(502, 'MAPS_UNAVAILABLE');
  return response.json().catch(() => { throw new OwnerError(502, 'MAPS_UNAVAILABLE'); }) as Promise<T>;
}
/** What the tool knows now: every review it has seen that Google still shows, Google's score and count, when it last looked. */
export async function fetchMaps(tool: { url: string; key: string }, fetcher: typeof fetch = fetch) {
  const overview = await mapsJson<{ place_name?: unknown; current?: { scraped_at?: unknown; avg_rating?: unknown; total_reviews?: unknown } | null }>(tool, '/api/overview', fetcher);
  const reviews: GoogleReview[] = [];
  for (let page = 1; page <= 20; page++) {
    const body = await mapsJson<{ items?: unknown }>(tool, `/api/reviews?scope=active&sort=newest&page_size=200&page=${page}`, fetcher);
    const items = Array.isArray(body.items) ? body.items as MapsReview[] : [];
    reviews.push(...items.map(fromMaps));
    if (items.length < 200) break;
  }
  return { reviews, ...scoreOf(overview.current?.avg_rating, overview.current?.total_reviews),
    title: words(overview.place_name)?.slice(0, 200) ?? null, scrapedAt: vietnamMoment(overview.current?.scraped_at) };
}

/**
 * Production, where nothing can reach Tài's machine: after each look at Google Maps the tool POSTs its whole list
 * (~/MAps/backend/app/tracker.py, event `run.completed` with `reviews`), signed `X-Signature: sha256=HMAC-SHA256(body,
 * api_key)`. Signed by the key or refused; an answer older than what the shop already has (a replay, a late retry) is
 * kept out; once the shop is on Google's APIs the tool is ignored. `test` is the tool's "Gửi thử" button.
 */
export const MAPS_BODY_LIMIT = 2_000_000;
export async function receiveMaps(pool: Pool, body: string, signature: string | null, env: Env = process.env) {
  const tool = mapsSettings(env);
  if (!tool) throw new OwnerError(404, 'NOT_FOUND');
  const given = /^sha256=([a-f0-9]{64})$/.exec(signature ?? '')?.[1], expected = createHmac('sha256', tool.key).update(body).digest();
  if (!given || !timingSafeEqual(Buffer.from(given, 'hex'), expected)) throw new OwnerError(401, 'BAD_SIGNATURE');
  let event: { event?: unknown; scraped_at?: unknown; place_name?: unknown; avg_rating?: unknown; total_reviews?: unknown; reviews?: unknown };
  try { event = JSON.parse(body); } catch { throw new OwnerError(400, 'INVALID_INPUT'); }
  if (event?.event === 'test') return { received: 'test' };
  const shop = (await pool.query('SELECT id FROM shops WHERE lower(slug)=$1', [tool.shop])).rows[0]?.id as string | undefined;
  if (!shop) throw new OwnerError(404, 'MAPS_SHOP_MISSING');
  if (event?.event === 'run.failed') {
    await pool.query("UPDATE google_business_connections SET last_error='MAPS_RUN_FAILED' WHERE shop_id=$1 AND mode='maps'", [shop]);
    return { received: 'run.failed' };
  }
  const syncedAt = vietnamMoment(event?.scraped_at);
  if (event?.event !== 'run.completed' || !Array.isArray(event.reviews) || event.reviews.length > 5000 || !syncedAt) throw new OwnerError(400, 'INVALID_INPUT');
  const reviews = (event.reviews as MapsReview[]).map(fromMaps), score = scoreOf(event.avg_rating, event.total_reviews);
  return transaction(pool, async db => {
    const row = (await db.query('SELECT mode,last_synced_at FROM google_business_connections WHERE shop_id=$1 FOR UPDATE', [shop])).rows[0];
    if (row?.mode === 'google') return { received: 'run.completed', ignored: 'GOOGLE_CONNECTED' };
    if (row?.last_synced_at && row.last_synced_at.getTime() >= Date.parse(syncedAt)) return { received: 'run.completed', ignored: 'NOT_NEWER' };
    await db.query(`INSERT INTO google_business_connections(shop_id,mode,location_title,place_id) SELECT id,'maps',$2,place_id FROM shops WHERE id=$1
      ON CONFLICT(shop_id) DO UPDATE SET location_title=coalesce(EXCLUDED.location_title,google_business_connections.location_title)`,
      [shop, words(event.place_name)?.slice(0, 200) ?? null]);
    return { received: 'run.completed', synced: await store(db, shop, reviews, score.averageRating, score.totalReviewCount, { complete: true, syncedAt }) };
  });
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
/**
 * `complete`: the list is everything Google still shows (the tool's), so a review missing from it has left Google and
 * leaves here too. `syncedAt`: when Google itself was read -- the tool's last look, not the moment we asked the tool.
 */
async function store(db: PoolClient, shopId: string, reviews: GoogleReview[], average: number | null, total: number | null,
  { complete = false, syncedAt = null }: { complete?: boolean; syncedAt?: string | null } = {}) {
  const rows = reviews.map(normalizeReview).filter((row): row is ReviewRow => !!row);
  // One statement for the whole list: on Neon each round trip costs, and the tool's webhook waits ten seconds at most.
  // A review listed twice keeps its last copy (one INSERT … ON CONFLICT cannot touch a row twice).
  const unique = [...new Map(rows.map(r => [r.reviewId, r])).values()];
  if (unique.length) await db.query(`INSERT INTO google_reviews(shop_id,review_id,reviewer_name,reviewer_photo,is_anonymous,stars,comment,created_at,updated_at,reply_comment,reply_updated_at)
    SELECT $1,* FROM unnest($2::text[],$3::text[],$4::text[],$5::boolean[],$6::smallint[],$7::text[],$8::timestamptz[],$9::timestamptz[],$10::text[],$11::timestamptz[])
    ON CONFLICT(shop_id,review_id) DO UPDATE SET reviewer_name=EXCLUDED.reviewer_name,reviewer_photo=EXCLUDED.reviewer_photo,
    is_anonymous=EXCLUDED.is_anonymous,stars=EXCLUDED.stars,comment=EXCLUDED.comment,updated_at=EXCLUDED.updated_at,reply_comment=EXCLUDED.reply_comment,
    reply_updated_at=EXCLUDED.reply_updated_at,synced_at=clock_timestamp()`,
    [shopId, ...(['reviewId', 'reviewerName', 'reviewerPhoto', 'isAnonymous', 'stars', 'comment', 'createdAt', 'updatedAt', 'reply', 'replyUpdatedAt'] as const)
      .map(key => unique.map(r => r[key]))]);
  // An empty list is never taken as "Google removed everything".
  if (complete && rows.length) await db.query('DELETE FROM google_reviews WHERE shop_id=$1 AND NOT (review_id = ANY($2::text[]))', [shopId, rows.map(r => r.reviewId)]);
  await db.query('UPDATE google_business_connections SET average_rating=$2,total_reviews=$3,last_synced_at=coalesce($4::timestamptz,clock_timestamp()),last_error=NULL WHERE shop_id=$1',
    [shopId, average, total, syncedAt]);
  return rows.length;
}

const ownerOnly = (access: OwnerAccess) => { if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED'); };

export class GoogleBusiness {
  constructor(private pool: Pool, private env: Env = process.env, private fetcher: typeof fetch = fetch) {}

  /**
   * The connection and the latest reviews, for Data and Dashboard. Reading reviews needs the feedback permission; Google's
   * score and count are the owner's alone (google-policy.md rule 10). `maps`: this shop is the one the tool follows and the tool can be asked from here.
   */
  async status(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'overview');
      const row = (await db.query('SELECT * FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rows[0];
      const figures = access.role === 'owner';
      const connection: Connection | null = row ? { mode: row.mode, googleEmail: row.google_email, locationTitle: row.location_title, placeId: row.place_id,
        newReviewUri: row.new_review_uri, averageRating: figures && row.average_rating !== null ? Number(row.average_rating) : null, totalReviews: figures ? row.total_reviews : null,
        connectedAt: row.connected_at.toISOString(), lastSyncedAt: row.last_synced_at?.toISOString() ?? null, lastError: row.last_error } : null;
      const canRead = access.actor.kind === 'owner' ? access.permissions.includes('feedback') : access.actor.scope === 'feedback';
      const reviews = connection && canRead ? (await db.query(`SELECT review_id,reviewer_name,reviewer_photo,is_anonymous,stars,comment,created_at,updated_at,reply_comment,reply_updated_at
        FROM google_reviews WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 50`, [access.shopId])).rows.map(r => ({ reviewId: r.review_id, reviewerName: r.reviewer_name,
        reviewerPhoto: r.reviewer_photo, isAnonymous: r.is_anonymous, stars: r.stars, comment: r.comment, createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(), reply: r.reply_comment, replyUpdatedAt: r.reply_updated_at?.toISOString() ?? null })) as ReviewRow[] : [];
      return { connection, reviews, real: businessEnabled(this.env), maps: askable(mapsSettings(this.env), access.slug),
        canManage: access.actor.kind === 'owner' && access.role === 'owner' };
    });
  }

  /** The Google Maps review tool: only the shop it follows (NFC_MAPS_SHOP) connects to it, and only that shop's owner. */
  async connectMaps(credential: OwnerCredential, slug: string) {
    const tool = mapsSettings(this.env);
    if (!askable(tool, slug)) throw new OwnerError(404, 'NOT_FOUND');
    const owner = async (db: PoolClient) => { const access = await authorize(db, credential, slug, 'write'); ownerOnly(access); return access; };
    await transaction(this.pool, owner);
    // The tool is asked between two transactions: a slow answer must not hold a pooled connection.
    const pulled = await fetchMaps(tool, this.fetcher);
    return transaction(this.pool, async db => {
      const access = await owner(db);
      await db.query(`INSERT INTO google_business_connections(shop_id,mode,location_title,place_id,connected_by) SELECT id,'maps',$2,place_id,$3 FROM shops WHERE id=$1
        ON CONFLICT(shop_id) DO UPDATE SET mode='maps',google_email=NULL,account_name=NULL,location_name=NULL,new_review_uri=NULL,refresh_token_sealed=NULL,
        location_title=EXCLUDED.location_title,place_id=EXCLUDED.place_id,connected_by=EXCLUDED.connected_by,connected_at=clock_timestamp()`,
        [access.shopId, pulled.title, access.userId]);
      const synced = await store(db, access.shopId, pulled.reviews, pulled.averageRating, pulled.totalReviewCount, { complete: true, syncedAt: pulled.scrapedAt });
      await recordActivity(db, access, 'google.connect', 'Google Maps');
      return { connected: true, mode: 'maps', synced };
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
      // The tool's reviews carry Google Maps' ids, the APIs' carry others: switching to the APIs starts from their list.
      await db.query("DELETE FROM google_reviews WHERE shop_id=$1 AND EXISTS (SELECT 1 FROM google_business_connections WHERE shop_id=$1 AND mode='maps')", [shop.id]);
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

  /** "Đồng bộ ngay": the tool's list again, or Google's latest. */
  async sync(credential: OwnerCredential, slug: string) {
    const { shopId, row, access } = await transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'feedback');
      return { access, shopId: access.shopId, row: (await db.query('SELECT * FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rows[0] };
    });
    if (!row) throw new OwnerError(404, 'GOOGLE_NOT_CONNECTED');
    let pulled: { reviews: GoogleReview[]; averageRating: number | null; totalReviewCount: number | null; scrapedAt?: string | null };
    try {
      if (row.mode === 'maps') {
        const tool = mapsSettings(this.env);
        if (!askable(tool, access.slug)) throw new OwnerError(503, 'MAPS_NOT_SET_UP');
        pulled = await fetchMaps(tool, this.fetcher);
      } else {
        const settings = googleSettings(this.env); if (!settings) throw new OwnerError(503, 'GOOGLE_UNAVAILABLE');
        pulled = await fetchReviews(await accessToken(settings, openToken(row.refresh_token_sealed, this.env), this.fetcher), row.account_name, row.location_name, this.fetcher);
      }
    } catch (error) {
      if (error instanceof OwnerError) await this.pool.query('UPDATE google_business_connections SET last_error=$2 WHERE shop_id=$1', [shopId, error.code]);
      throw error;
    }
    return transaction(this.pool, async db => {
      const synced = await store(db, shopId, pulled.reviews, pulled.averageRating, pulled.totalReviewCount, row.mode === 'maps' ? { complete: true, syncedAt: pulled.scrapedAt } : {});
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
