import type { Pool, PoolClient } from 'pg';
import { authorize, transaction, type OwnerAccess, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';

/**
 * Tab Dashboard (kịch bản mục 7, theo ảnh YouTube Studio Tài gửi 05/10), đọc trong một lần: hiệu suất của thẻ mới nhất · số
 * liệu của quán 28 ngày (so với 28 ngày trước) · thẻ hàng đầu 48 giờ · phản hồi gần đây · điểm Google. Chỉ trang thật
 * (`scope='live'`), bỏ phiên bị chặn bot (lát A1) như mọi số đếm khác. Lời khách viết chỉ trả cho ai có quyền đọc góp ý.
 */
export type Overview = {
  latest: null | { slug: string; label: string; publishedAt: string; opens: number; google: number; feedback: number; googleAfterMs: number | null };
  pages: { published: number; cards: number; activeCards: number };
  summary: { opens: number; opensBefore: number; google: number; googleBefore: number; feedback: number; feedbackBefore: number };
  top: { slug: string; label: string; opens: number }[];
  /** Google's score and count, the owner's alone (google-policy.md rule 10): `figures: false` for everyone else. */
  google: null | { rating: number | null; total: number | null; source: 'google' | 'maps'; figures: boolean; syncedAt: string | null };
  recent: null | { kind: 'google' | 'private'; name: string | null; stars: number | null; text: string | null; at: string }[];
};

// A visit, an event or a feedback send belongs to the page whose release the guest opened.
const pageOfVisit = (visit: string) => `(SELECT pr.page_id FROM published_visit_contexts c JOIN page_releases pr ON pr.id=c.release_id WHERE c.visit_id=${visit})`;
const clean = (session: string) => `EXISTS(SELECT 1 FROM visit_sessions vs WHERE vs.id=${session} AND vs.suspected_at IS NULL)`;

async function latestPage(db: PoolClient, shopId: string) {
  const page = (await db.query(`SELECT p.id,p.slug,COALESCE(NULLIF(p.label,''),pr.config_snapshot->>'name',p.slug) label,
      (SELECT min(r.created_at) FROM page_releases r WHERE r.page_id=p.id) published_at
    FROM pages p JOIN page_releases pr ON pr.id=p.active_release_id
    WHERE p.shop_id=$1 AND p.state IN ('active','paused') ORDER BY published_at DESC,p.id LIMIT 1`, [shopId])).rows[0];
  if (!page) return null;
  const stats = (await db.query(`SELECT
      (SELECT count(*)::int FROM page_visits v WHERE v.shop_id=$1 AND v.scope='live' AND ${clean('v.session_id')} AND ${pageOfVisit('v.id')}=$2) opens,
      (SELECT count(*)::int FROM page_events e WHERE e.shop_id=$1 AND e.scope='live' AND e.name='google_tapped' AND e.visit_id IS NOT NULL
        AND ${clean('e.session_id')} AND ${pageOfVisit('e.visit_id')}=$2) google,
      (SELECT count(DISTINCT r.session_id)::int FROM rating_intent_receipts r WHERE r.shop_id=$1 AND r.scope='live' AND ${clean('r.session_id')}
        AND ${pageOfVisit('r.visit_id')}=$2) feedback,
      (SELECT round(avg(e.since_open_ms))::int FROM page_events e WHERE e.shop_id=$1 AND e.scope='live' AND e.name='google_tapped' AND e.since_open_ms IS NOT NULL
        AND e.visit_id IS NOT NULL AND ${clean('e.session_id')} AND ${pageOfVisit('e.visit_id')}=$2) google_after_ms`, [shopId, page.id])).rows[0];
  return { slug: page.slug as string, label: page.label as string, publishedAt: (page.published_at as Date).toISOString(),
    opens: stats.opens as number, google: stats.google as number, feedback: stats.feedback as number, googleAfterMs: stats.google_after_ms as number | null };
}

/** The last 28 days against the 28 before them; "now" is the database's clock, like every other count. */
async function summary(db: PoolClient, shopId: string) {
  const row = (await db.query(`WITH b AS (SELECT clock_timestamp() now) SELECT
      (SELECT count(*)::int FROM page_visits v, b WHERE v.shop_id=$1 AND v.scope='live' AND ${clean('v.session_id')} AND v.opened_at>b.now-interval '28 days') opens,
      (SELECT count(*)::int FROM page_visits v, b WHERE v.shop_id=$1 AND v.scope='live' AND ${clean('v.session_id')}
        AND v.opened_at>b.now-interval '56 days' AND v.opened_at<=b.now-interval '28 days') opens_before,
      (SELECT count(*)::int FROM page_events e, b WHERE e.shop_id=$1 AND e.scope='live' AND e.name='google_tapped' AND ${clean('e.session_id')} AND e.at>b.now-interval '28 days') google,
      (SELECT count(*)::int FROM page_events e, b WHERE e.shop_id=$1 AND e.scope='live' AND e.name='google_tapped' AND ${clean('e.session_id')}
        AND e.at>b.now-interval '56 days' AND e.at<=b.now-interval '28 days') google_before,
      (SELECT count(DISTINCT r.session_id)::int FROM rating_intent_receipts r, b WHERE r.shop_id=$1 AND r.scope='live' AND ${clean('r.session_id')} AND r.applied_at>b.now-interval '28 days') feedback,
      (SELECT count(DISTINCT r.session_id)::int FROM rating_intent_receipts r, b WHERE r.shop_id=$1 AND r.scope='live' AND ${clean('r.session_id')}
        AND r.applied_at>b.now-interval '56 days' AND r.applied_at<=b.now-interval '28 days') feedback_before`, [shopId])).rows[0];
  return { opens: row.opens, opensBefore: row.opens_before, google: row.google, googleBefore: row.google_before, feedback: row.feedback, feedbackBefore: row.feedback_before };
}

async function top(db: PoolClient, shopId: string) {
  return (await db.query(`SELECT p.slug,COALESCE(NULLIF(p.label,''),pr.config_snapshot->>'name',p.slug) label,count(*)::int opens
    FROM page_visits v JOIN published_visit_contexts c ON c.visit_id=v.id JOIN page_releases r ON r.id=c.release_id JOIN pages p ON p.id=r.page_id
    LEFT JOIN page_releases pr ON pr.id=p.active_release_id
    WHERE v.shop_id=$1 AND v.scope='live' AND ${clean('v.session_id')} AND v.opened_at>clock_timestamp()-interval '48 hours'
    GROUP BY p.slug,p.label,pr.config_snapshot ORDER BY opens DESC,p.slug LIMIT 3`, [shopId])).rows as Overview['top'];
}

/** The newest three, Google's and the shop's own, mixed by time. Private feedback never carries a name: none is asked. */
async function recent(db: PoolClient, shopId: string) {
  const rows = (await db.query(`(SELECT 'google' kind,CASE WHEN is_anonymous THEN NULL ELSE reviewer_name END name,stars,comment text,created_at at
      FROM google_reviews WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 3)
    UNION ALL
    (SELECT 'private' kind,NULL name,e.rating stars,e.feedback_message text,GREATEST(e.updated_at,COALESCE(e.feedback_updated_at,e.updated_at)) at
      FROM rating_experiences e WHERE e.shop_id=$1 AND e.scope='live' AND ${clean('e.session_id')} ORDER BY at DESC LIMIT 3)
    ORDER BY at DESC LIMIT 3`, [shopId])).rows;
  return rows.map(r => ({ kind: r.kind, name: r.name, stars: r.stars, text: r.text ? String(r.text).slice(0, 280) : null, at: (r.at as Date).toISOString() })) as NonNullable<Overview['recent']>;
}

const readsFeedback = (access: OwnerAccess) => access.actor.kind === 'owner' ? access.permissions.includes('feedback') : access.actor.scope === 'feedback';

export async function shopOverview(pool: Pool, credential: OwnerCredential, slug: string): Promise<Overview> {
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'overview');
    const counts = (await db.query(`SELECT (SELECT count(*)::int FROM pages WHERE shop_id=$1 AND state IN ('active','paused')) published,
      (SELECT count(*)::int FROM tags WHERE shop_id=$1 AND state<>'disabled') cards, (SELECT count(*)::int FROM tags WHERE shop_id=$1 AND state='active') active_cards`,
      [access.shopId])).rows[0];
    const connection = (await db.query('SELECT mode,average_rating,total_reviews,last_synced_at FROM google_business_connections WHERE shop_id=$1', [access.shopId])).rows[0];
    const feedback = readsFeedback(access), figures = access.role === 'owner';
    const result: Overview = {
      latest: await latestPage(db, access.shopId),
      pages: { published: counts.published, cards: counts.cards, activeCards: counts.active_cards },
      summary: await summary(db, access.shopId), top: await top(db, access.shopId),
      google: connection ? { rating: figures && connection.average_rating !== null ? Number(connection.average_rating) : null, total: figures ? connection.total_reviews : null,
        source: connection.mode, figures, syncedAt: connection.last_synced_at?.toISOString() ?? null } : null,
      recent: feedback ? await recent(db, access.shopId) : null,
    };
    if (access.actor.kind === 'admin') await recordAdminAction(db, access.actor.adminId, { action: 'impersonation.read', shopId: access.shopId, onBehalfOf: access.userId,
      detail: { session: access.actor.sessionId, scope: access.actor.scope, view: 'overview', rows: result.recent?.length ?? 0, feedbackShown: feedback } });
    return result;
  });
}
