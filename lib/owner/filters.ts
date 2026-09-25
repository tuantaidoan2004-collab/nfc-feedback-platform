import { OwnerError } from './auth';
export type Filters = { from: string; to: string; source?: string; release?: string; rating?: number; status?: string; suspected?: 'show' | 'only'; cursor?: { time: string; id: string } };
export const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function day(value: string) {
  if (!Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new OwnerError(400,'INVALID_FILTER');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) throw new OwnerError(400,'INVALID_FILTER');
  return Date.parse(`${value}T00:00:00+07:00`);
}
/** Calendar date inputs are Ho Chi Minh time. from inclusive, to calendar day inclusive → exclusive UTC end. */
export function parseFilters(params: URLSearchParams, now = new Date()): Filters {
  const allowed = ['from','to','source','release','rating','status','suspected','cursor','format','dataset'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new OwnerError(400,'INVALID_FILTER');
  const today = new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
  const from = params.get('from') || new Date(now.getTime()+7*3600000-29*86400000).toISOString().slice(0,10), to = params.get('to') || today;
  const start=day(from), end=day(to)+86400000;
  if (end<=start) throw new OwnerError(400,'INVALID_FILTER');
  const f: Filters = { from:new Date(start).toISOString(), to:new Date(end).toISOString() };
  const source=params.get('source'), release=params.get('release'), rating=params.get('rating'), status=params.get('status'), cursor=params.get('cursor');
  if(source){if(source!=='direct' && source!=='unknown' && !uuid(source)) throw new OwnerError(400,'INVALID_FILTER');f.source=source;}
  if(release){if(release!=='unknown' && !uuid(release))throw new OwnerError(400,'INVALID_FILTER');f.release=release;}
  if(rating){if(!/^[1-5]$/.test(rating))throw new OwnerError(400,'INVALID_FILTER');f.rating=Number(rating);}
  if(status){if(!['new','progress','resolved'].includes(status))throw new OwnerError(400,'INVALID_FILTER');f.status=status;}
  // Absent means the shop sees its real customers only; the marked ones are there when it asks for them (lát A1).
  const suspected=params.get('suspected');
  if(suspected){if(suspected!=='show'&&suspected!=='only')throw new OwnerError(400,'INVALID_FILTER');f.suspected=suspected;}
  if(cursor){try{if(cursor.length>300)throw Error();const c=JSON.parse(Buffer.from(cursor,'base64url').toString());
    if(Object.keys(c).sort().join()!=='id,time' || !uuid(c.id) || typeof c.time!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(c.time) || !Number.isFinite(Date.parse(c.time)))throw Error(); f.cursor=c;
  }catch{throw new OwnerError(400,'INVALID_CURSOR');}}
  return f;
}
export const encodeCursor = (row: { first_rated_at: string; session_id: string }) => Buffer.from(JSON.stringify({time:row.first_rated_at,id:row.session_id})).toString('base64url');
export const effectiveStatus = "CASE WHEN e.feedback_message IS NULL THEN NULL WHEN c.session_id IS NULL OR e.feedback_updated_at>c.feedback_seen_at THEN 'new' ELSE c.status END";
/** One cohort: matching live opens, then current experiences/complete receipts for those sessions. */
export function cohort(shop: string, f: Filters) {
  const values: unknown[] = [shop,f.from,f.to];
  const conditions = ["v.shop_id=$1", "v.scope='live'", 'v.opened_at >= $2::timestamptz', 'v.opened_at < $3::timestamptz'];
  const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace('?',`$${values.length}`)); };
  if(f.source==='direct')conditions.push("v.entry_key LIKE 'direct:%'");
  else if(f.source==='unknown')conditions.push("p.visit_id IS NULL AND v.entry_key NOT LIKE 'direct:%'");
  else if(f.source)add('p.tag_id=?',f.source);
  if(f.release==='unknown')conditions.push('p.release_id IS NULL'); else if(f.release)add('p.release_id=?',f.release);
  if(f.rating)add('e.rating=?',f.rating);
  if(f.status)add(`${effectiveStatus}=?`,f.status);
  // One mark on the session takes its touches, its stars and its words out together (lát A1, migration 018).
  if(f.suspected==='only')conditions.push('vs.suspected_at IS NOT NULL');
  else if(!f.suspected)conditions.push('vs.suspected_at IS NULL');
  return { values, sql:`WITH matched AS (SELECT v.id,v.session_id,v.opened_at,v.navigation_kind,v.entry_key,p.release_id,p.tag_id,
    vs.suspected_at,vs.suspected_reason
    FROM page_visits v JOIN visit_sessions vs ON vs.id=v.session_id
    LEFT JOIN published_visit_contexts p ON p.visit_id=v.id
    LEFT JOIN rating_experiences e ON e.session_id=v.session_id
    LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id WHERE ${conditions.join(' AND ')}),
    selected AS (SELECT DISTINCT ON(session_id) * FROM matched ORDER BY session_id,opened_at DESC,id DESC)` };
}
