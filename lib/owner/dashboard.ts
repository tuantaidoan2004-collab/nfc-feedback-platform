import type { Pool } from 'pg';
import { authorize, transaction, OwnerError } from './auth';
import { cohort, effectiveStatus, encodeCursor, uuid, type Filters } from './filters';
export const utc = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const experienceSelect = `SELECT e.session_id,${utc('e.first_interaction_at')} first_rated_at,${utc('e.updated_at')} updated_at,
 e.rating,e.revision::text experience_revision,e.feedback_topic topic,e.feedback_message message,
 ${effectiveStatus} status,COALESCE(c.note,'') note,COALESCE(c.revision,0) case_revision,
 ${utc('c.updated_at')} case_updated_at,s.tag_id,COALESCE(NULLIF(t.location_label,''),CASE WHEN s.entry_key='direct:shop' THEN 'Trực tiếp' WHEN s.tag_id IS NULL THEN 'Chưa rõ nguồn' ELSE 'Thẻ' END) source_label,
 s.release_id,origin.release_id origin_release_id
 FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id
 LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id
 LEFT JOIN tags t ON t.id=s.tag_id
 LEFT JOIN experience_origin_contexts o ON o.session_id=e.session_id
 LEFT JOIN published_visit_contexts origin ON origin.visit_id=o.visit_id`;
export type ExperienceRow = {session_id:string;first_rated_at:string;updated_at:string;rating:number;experience_revision:string;topic:string|null;message:string|null;status:string|null;note:string;case_revision:number;case_updated_at:string|null;tag_id:string|null;source_label:string;release_id:string|null;origin_release_id:string|null};
export class OwnerDashboard {
  constructor(private pool: Pool) {}
  async read(token: string | undefined, slug: string, f: Filters) {
    return transaction(this.pool, async db => {
      const access = await authorize(db,token,slug), q=cohort(access.shopId,f);
      // One SQL statement gives KPI and rows a consistent READ COMMITTED statement snapshot.
      const values=[...q.values]; let pageWhere='';
      if(f.cursor){values.push(f.cursor.time,f.cursor.id);pageWhere=`WHERE (e.first_interaction_at,e.session_id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`;}
      const result=(await db.query(`${q.sql}, page AS (${experienceSelect} ${pageWhere} ORDER BY e.first_interaction_at DESC,e.session_id DESC LIMIT 51)
        SELECT (SELECT count(*)::text FROM matched) opens,(SELECT count(*)::text FROM selected) sessions,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id) rated,
        (SELECT round(avg(e.rating),2)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id) average,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id WHERE e.feedback_message IS NOT NULL) feedback,
        (SELECT count(*)::text FROM selected s JOIN rating_experiences e ON e.session_id=s.session_id LEFT JOIN owner_feedback_cases c ON c.session_id=e.session_id WHERE ${effectiveStatus}<>'resolved') unresolved,
        COALESCE((SELECT jsonb_agg(tags) FROM (SELECT id,COALESCE(NULLIF(location_label,''),public_code) label FROM tags WHERE shop_id=$1 ORDER BY public_code LIMIT 100) tags),'[]') tags,
        COALESCE((SELECT jsonb_agg(releases) FROM (SELECT id,created_at FROM page_releases WHERE shop_id=$1 ORDER BY created_at DESC,id LIMIT 100) releases),'[]') releases,
        COALESCE((SELECT jsonb_agg(page ORDER BY first_rated_at DESC,session_id DESC) FROM page),'[]') records`,values)).rows[0];
      const rows=result.records as ExperienceRow[], tags=result.tags as {id:string;label:string}[], releases=result.releases as {id:string;created_at:string}[];delete result.records;delete result.tags;delete result.releases;
      const records=rows.slice(0,50);
      return {shop:{slug:access.slug,name:access.name},tags,releases,metrics:result,records,nextCursor:rows.length>50?encodeCursor(records[49]):null};
    });
  }
  async update(token: string|undefined, slug:string, input: unknown) {
    if(!input || typeof input!=='object' || Array.isArray(input))throw new OwnerError(400,'INVALID_CASE');
    const data=input as Record<string,unknown>;
    if(Object.keys(data).sort().join()!=='expectedCaseRevision,expectedExperienceRevision,note,sessionId,status' || typeof data.sessionId!=='string' || !uuid(data.sessionId) ||
      !Number.isSafeInteger(data.expectedCaseRevision) || Number(data.expectedCaseRevision)<0 || Number(data.expectedCaseRevision)>=2147483647 ||
      typeof data.expectedExperienceRevision!=='string' || !/^[1-9][0-9]{0,15}$/.test(data.expectedExperienceRevision) ||
      !['new','progress','resolved'].includes(String(data.status)) || typeof data.note!=='string' || [...data.note].length>2000 || /\u0000/.test(data.note))throw new OwnerError(400,'INVALID_CASE');
    return transaction(this.pool,async db=>{
      const access=await authorize(db,token,slug);
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
