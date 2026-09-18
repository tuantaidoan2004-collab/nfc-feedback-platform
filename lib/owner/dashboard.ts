import type { Pool, PoolClient } from 'pg';
import { authorize, supportLevel, SUPPORT_LEVELS, transaction, OwnerError, type OwnerAccess, type OwnerCredential, type SupportLevel } from './auth';
import { recordAdminAction } from '../admin/audit';
import { cohort, effectiveStatus, encodeCursor, uuid, type Filters } from './filters';
/**
 * The last seven Ho Chi Minh days, including days with nothing, so the chart keeps its shape. Live scope only, and
 * independent of the filters above it: it answers "how has this week gone", not "what did I filter".
 */
// `day` is a keyword, so the alias needs AS.
const daySeries = `SELECT to_char(d.day,'YYYY-MM-DD') AS day,
    count(v.id)::int opens, count(DISTINCT v.session_id)::int sessions,
    (SELECT count(DISTINCT r.session_id)::int FROM rating_intent_receipts r WHERE r.shop_id=$1 AND r.scope='live'
      AND (timezone('Asia/Ho_Chi_Minh',r.applied_at))::date=d.day) private
  FROM generate_series((timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date-6,(timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date,interval '1 day') d(day)
  LEFT JOIN page_visits v ON v.shop_id=$1 AND v.scope='live' AND (timezone('Asia/Ho_Chi_Minh',v.opened_at))::date=d.day
  GROUP BY d.day`;
/**
 * Today, the last 7 and the last 30 Ho Chi Minh days. "private" counts sessions that sent the feedback card at least
 * once (stars, words or both) in the period; "messages" counts sessions whose written feedback was last sent in it.
 */
const periodTotals = `SELECT p.key,
  (SELECT count(*)::int FROM page_visits v WHERE v.shop_id=$1 AND v.scope='live' AND (timezone('Asia/Ho_Chi_Minh',v.opened_at))::date>=b.today-p.back) opens,
  (SELECT count(DISTINCT v.session_id)::int FROM page_visits v WHERE v.shop_id=$1 AND v.scope='live' AND (timezone('Asia/Ho_Chi_Minh',v.opened_at))::date>=b.today-p.back) sessions,
  (SELECT count(DISTINCT r.session_id)::int FROM rating_intent_receipts r WHERE r.shop_id=$1 AND r.scope='live' AND (timezone('Asia/Ho_Chi_Minh',r.applied_at))::date>=b.today-p.back) private,
  (SELECT count(*)::int FROM rating_experiences e WHERE e.shop_id=$1 AND e.scope='live' AND e.feedback_message IS NOT NULL AND (timezone('Asia/Ho_Chi_Minh',e.feedback_updated_at))::date>=b.today-p.back) messages
  FROM (SELECT (timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date today) b, (VALUES ('today',0),('week',6),('month',29)) p(key,back)`;
export type Period = 'today' | 'week' | 'month';
export type PeriodTotals = { opens: number; sessions: number; private: number; messages: number };
export type DayPoint = { day: string; opens: number; sessions: number; private: number };
export type SourceCount = { label: string; sessions: number };
export const utc = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const experienceSelect = `SELECT e.session_id,${utc('e.first_interaction_at')} first_rated_at,${utc('e.updated_at')} updated_at,
 e.rating,e.revision::text experience_revision,e.feedback_topic topic,e.feedback_message message,e.feedback_phone phone,
 ${effectiveStatus} status,COALESCE(c.note,'') note,COALESCE(c.revision,0) case_revision,
 ${utc('c.updated_at')} case_updated_at,s.tag_id,COALESCE(NULLIF(t.location_label,''),CASE WHEN s.entry_key='direct:shop' THEN 'Trực tiếp' WHEN s.tag_id IS NULL THEN 'Chưa rõ nguồn' ELSE 'Thẻ' END) source_label,
 s.release_id,origin.release_id origin_release_id
 FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id
 LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id
 LEFT JOIN tags t ON t.id=s.tag_id
 LEFT JOIN experience_origin_contexts o ON o.session_id=e.session_id
 LEFT JOIN published_visit_contexts origin ON origin.visit_id=o.visit_id`;
export type ExperienceRow = {session_id:string;first_rated_at:string;updated_at:string;rating:number|null;experience_revision:string;topic:string|null;message:string|null;phone:string|null;status:string|null;note:string;case_revision:number;case_updated_at:string|null;tag_id:string|null;source_label:string;release_id:string|null;origin_release_id:string|null};
export type AdminVisit = {id:string;admin:string;admin_title:string|null;scope:'overview'|'feedback';reason:string;started_at:string;expires_at:string;ended_at:string|null;end_reason:string|null;reads:number};
export type SupportChange = {level:SupportLevel;by:string;at:string};
/**
 * Every administrator session on this shop, shown to whoever runs the shop. It protects both sides: a shop that
 * suspects its feedback was read has a record to check, and the operator has one to point to.
 */
async function adminVisits(db: PoolClient, shopId: string) {
  return (await db.query(`SELECT i.id,COALESCE(a.handle,a.username) admin,a.title admin_title,i.scope,i.reason,${utc('i.created_at')} started_at,${utc('i.expires_at')} expires_at,
    ${utc('i.ended_at')} ended_at,i.end_reason,
    (SELECT count(*)::int FROM admin_audit x WHERE x.shop_id=i.shop_id AND x.action='impersonation.read' AND x.detail->>'session'=i.id::text) reads
    FROM admin_impersonation_sessions i JOIN platform_admins a ON a.id=i.admin_id
    WHERE i.shop_id=$1 ORDER BY i.created_at DESC,i.id LIMIT 20`, [shopId])).rows as AdminVisit[];
}
/** The switch as it stands and who moved it, newest first. The shop sees its own decisions next to support's visits. */
async function support(db: PoolClient, shopId: string) {
  // Older on/off rows read as the positions they meant: on = 1 (view), off = off.
  const history = (await db.query(`SELECT CASE WHEN g.permission='level' THEN g.level WHEN g.enabled THEN 'view' ELSE 'off' END "level",
    u.username "by",${utc('g.recorded_at')} "at" FROM shop_support_grant_events g
    JOIN owner_identities_v2 u ON u.id=g.actor_id WHERE g.shop_id=$1 AND g.permission IN ('feedback','level') ORDER BY g.id DESC LIMIT 20`, [shopId])).rows as SupportChange[];
  const level = await supportLevel(db, shopId);
  return { level, feedback: level === 'view' || level === 'full', history };
}
/**
 * The shops this account may switch between. An administrator standing in for the owner sees only the shop the
 * impersonation names: the owner's other shops are not part of that permission.
 */
async function accessibleShops(db: PoolClient, access: OwnerAccess) {
  if (access.actor.kind === 'admin') return [{ slug: access.slug, name: access.name }];
  return (await db.query(`SELECT s.slug,s.name FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id
    WHERE m.user_id=$1 AND m.active ORDER BY s.name,s.slug LIMIT 50`, [access.userId])).rows as { slug: string; name: string }[];
}
const viewer = (access: OwnerAccess) => access.actor.kind === 'owner' ? { kind: 'owner' as const, role: access.role }
  : { kind: 'admin' as const, admin: access.actor.adminUsername, scope: access.actor.scope, reason: access.actor.reason, expiresAt: access.actor.expiresAt };
export class OwnerDashboard {
  constructor(private pool: Pool) {}
  async read(credential: OwnerCredential, slug: string, f: Filters) {
    return transaction(this.pool, async db => {
      const access = await authorize(db,credential,slug,'overview'), q=cohort(access.shopId,f);
      // One SQL statement gives KPI and rows a consistent READ COMMITTED statement snapshot.
      const values=[...q.values]; let pageWhere='';
      if(f.cursor){values.push(f.cursor.time,f.cursor.id);pageWhere=`WHERE (e.first_interaction_at,e.session_id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`;}
      const result=(await db.query(`${q.sql}, page AS (${experienceSelect} ${pageWhere} ORDER BY e.first_interaction_at DESC,e.session_id DESC LIMIT 51)
        SELECT (SELECT count(*)::text FROM matched) opens,(SELECT count(*)::text FROM selected) sessions,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id WHERE e.rating IS NOT NULL) rated,
        (SELECT round(avg(e.rating),2)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id) average,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id WHERE e.feedback_message IS NOT NULL) feedback,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id WHERE ${effectiveStatus}<>'resolved') unresolved,
        COALESCE((SELECT jsonb_agg(tags) FROM (SELECT id,COALESCE(NULLIF(location_label,''),public_code) label FROM tags WHERE shop_id=$1 ORDER BY public_code LIMIT 100) tags),'[]') tags,
        COALESCE((SELECT jsonb_agg(releases) FROM (SELECT id,created_at FROM page_releases WHERE shop_id=$1 ORDER BY created_at DESC,id LIMIT 100) releases),'[]') releases,
        COALESCE((SELECT jsonb_agg(sources ORDER BY sessions DESC,label) FROM (SELECT COALESCE(NULLIF(t.location_label,''),
          CASE WHEN s.entry_key='direct:shop' THEN 'Trực tiếp' WHEN s.tag_id IS NULL THEN 'Chưa rõ nguồn' ELSE 'Thẻ' END) label,
          count(*)::int sessions FROM selected s LEFT JOIN tags t ON t.id=s.tag_id GROUP BY 1 LIMIT 50) sources),'[]') sources,
        COALESCE((SELECT jsonb_agg(page ORDER BY first_rated_at DESC,session_id DESC) FROM page),'[]') records`,values)).rows[0];
      const rows=result.records as ExperienceRow[], tags=result.tags as {id:string;label:string}[], releases=result.releases as {id:string;created_at:string}[];
      const sources=result.sources as SourceCount[];
      delete result.records;delete result.tags;delete result.releases;delete result.sources;
      const actor=access.actor, hidden=actor.kind==='admin'&&actor.scope==='overview';
      // Removed here, before the response exists, so an overview session never carries feedback text to the browser.
      const records=rows.slice(0,50).map(row=>hidden?{...row,topic:null,message:null,phone:null,note:''}:row);
      if(actor.kind==='admin')await recordAdminAction(db,actor.adminId,{action:'impersonation.read',shopId:access.shopId,onBehalfOf:access.userId,
        detail:{session:actor.sessionId,scope:actor.scope,rows:records.length,feedbackShown:records.some(row=>row.message!==null)}});
      return {shop:{slug:access.slug,name:access.name},sources,viewer:viewer(access),tags,releases,metrics:result,records,nextCursor:rows.length>50?encodeCursor(records[49]):null};
    });
  }
  /**
   * The light first view: period totals, seven days and the account around it, but no feedback rows, so opening the
   * dashboard stays fast however much data the shop has. Rows load only when the Data view asks for them.
   */
  async summary(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'overview');
      const totals = Object.fromEntries((await db.query(periodTotals, [access.shopId])).rows.map(({ key, ...rest }) => [key, rest])) as Record<Period, PeriodTotals>;
      const daily = (await db.query(`SELECT * FROM (${daySeries}) days ORDER BY day`, [access.shopId])).rows as DayPoint[];
      const unresolved = (await db.query(`SELECT count(*)::int n FROM rating_experiences e LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id
        WHERE e.shop_id=$1 AND e.scope='live' AND ${effectiveStatus}<>'resolved'`, [access.shopId])).rows[0].n as number;
      const actor = access.actor;
      const account = actor.kind === 'admin' ? actor.adminUsername
        : (await db.query('SELECT username FROM owner_identities_v2 WHERE id=$1', [access.userId])).rows[0].username as string;
      if (actor.kind === 'admin') await recordAdminAction(db, actor.adminId, { action: 'impersonation.read', shopId: access.shopId, onBehalfOf: access.userId,
        detail: { session: actor.sessionId, scope: actor.scope, view: 'summary', rows: 0, feedbackShown: false } });
      return { shop: { slug: access.slug, name: access.name }, account, shops: await accessibleShops(db, access), viewer: viewer(access),
        totals, daily, unresolved, adminVisits: await adminVisits(db, access.shopId), support: await support(db, access.shopId) };
    });
  }
  /**
   * The owner's switch for support. Only the account holding the owner role may move it, and never through an
   * impersonation: the write need refuses support before the role is even looked at. A request that repeats the
   * current state writes nothing, so the history holds changes only.
   */
  async setSupport(credential: OwnerCredential, slug: string, input: unknown) {
    const data = input as Record<string, unknown>;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(data).join() !== 'level'
      || !SUPPORT_LEVELS.includes(data.level as SupportLevel)) throw new OwnerError(400, 'INVALID_SUPPORT');
    const level = data.level as SupportLevel;
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write');
      if (access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      // Two switches at once are applied one after the other, so the newest row is always the last decision.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-support-grant:'||$1,0))", [access.shopId]);
      if (await supportLevel(db, access.shopId) !== level)
        await db.query("INSERT INTO shop_support_grant_events(shop_id,permission,enabled,level,actor_id)VALUES($1,'level',$2,$3,$4)",
          [access.shopId, level !== 'off', level, access.userId]);
      return { level };
    });
  }
  async update(credential: OwnerCredential, slug:string, input: unknown) {
    if(!input || typeof input!=='object' || Array.isArray(input))throw new OwnerError(400,'INVALID_CASE');
    const data=input as Record<string,unknown>;
    if(Object.keys(data).sort().join()!=='expectedCaseRevision,expectedExperienceRevision,note,sessionId,status' || typeof data.sessionId!=='string' || !uuid(data.sessionId) ||
      !Number.isSafeInteger(data.expectedCaseRevision) || Number(data.expectedCaseRevision)<0 || Number(data.expectedCaseRevision)>=2147483647 ||
      typeof data.expectedExperienceRevision!=='string' || !/^[1-9][0-9]{0,15}$/.test(data.expectedExperienceRevision) ||
      !['new','progress','resolved'].includes(String(data.status)) || typeof data.note!=='string' || [...data.note].length>2000 || /\u0000/.test(data.note))throw new OwnerError(400,'INVALID_CASE');
    return transaction(this.pool,async db=>{
      const access=await authorize(db,credential,slug,'write');
      const e=(await db.query("SELECT * FROM rating_experiences WHERE shop_id=$1 AND scope='live' AND session_id=$2 FOR UPDATE",[access.shopId,data.sessionId])).rows[0];
      if(!e?.feedback_message)throw new OwnerError(404,'NOT_FOUND');
      const current=(await db.query('SELECT revision FROM owner_feedback_cases WHERE session_id=$1',[data.sessionId])).rows[0];
      if(String(e.revision)!==data.expectedExperienceRevision || (current?.revision??0)!==data.expectedCaseRevision)throw new OwnerError(409,'CASE_CONFLICT');
      const result=(await db.query(`INSERT INTO owner_feedback_cases(session_id,shop_id,scope,entry_key,status,note,revision,feedback_seen_at,actor_id)
        VALUES($1,$2,'live',$3,$4,$5,1,$6,$7) ON CONFLICT(session_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,revision=owner_feedback_cases.revision+1,
        feedback_seen_at=EXCLUDED.feedback_seen_at,actor_id=EXCLUDED.actor_id,updated_at=clock_timestamp() RETURNING revision`,[data.sessionId,access.shopId,e.entry_key,data.status,data.note,e.feedback_updated_at,access.userId])).rows[0];
      await db.query('INSERT INTO owner_feedback_audit(shop_id,session_id,revision,status,note,experience_revision,actor_id)VALUES($1,$2,$3,$4,$5,$6,$7)',[access.shopId,data.sessionId,result.revision,data.status,data.note,e.revision,access.userId]);
      return {saved:true,revision:result.revision};
    });
  }
}
