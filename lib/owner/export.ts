import type { Pool } from 'pg';
import { OwnerAuth, OwnerError, type OwnerCredential } from './auth';
import { cohort, type Filters } from './filters';
import { experienceSelect, utc } from './dashboard';
import { recordActivity } from './activity';
export type Dataset='experiences'|'page_visits'|'receipts'|'comments';
const fields = {
 experiences:['schemaVersion','dataset','session_id','first_rated_at','updated_at','rating','experience_revision','topic','message','phone','status','note','case_revision','case_updated_at','tag_id','source_label','release_id','origin_release_id'],
 page_visits:['schemaVersion','dataset','visit_id','session_id','opened_at','navigation_kind','tag_id','release_id'],
 receipts:['schemaVersion','dataset','session_id','visit_id','revision','operation','rating','applied_at','topic','message','phone','tag_id','release_id'],
 comments:['schemaVersion','dataset','comment_id','session_id','author_kind','author_handle','body','created_at','edited_at','pinned','likes','deleted_at'],
} as const;
const descriptions:Record<string,string>={
 schemaVersion:'Export schema version, nfc-owner-export-v1.',dataset:'Row family: experiences, page_visits or receipts.',
 session_id:'Opaque 15-minute session ID, not a unique person.',visit_id:'One registered load/reload/restore event; not proof of NFC tap.',
 first_rated_at:'First customer action (rating or private feedback) of this experience.',updated_at:'Latest customer rating/feedback update.',opened_at:'Server registration time.',
 phone:'Optional call-back number the customer left with private feedback; digits with an optional leading +.',rating:'Internal 1–5 rating, null when the customer sent private feedback without a star; never Google review.',experience_revision:'Current shared customer rating/feedback revision.',revision:'Immutable applied customer revision.',
 topic:'Customer feedback topic.',message:'Private customer feedback; receipts include the snapshot at that revision.',status:'Effective case status; newer feedback reopens as new.',
 note:'Latest internal owner note.',case_revision:'Independent optimistic handling revision; 0 means no handling row.',case_updated_at:'Latest owner handling time.',
 tag_id:'Tag of matching open (experience) or source visit (event); null for direct/unattributed.',source_label:'Tag label or direct source of latest matching open.',
 release_id:'Release of latest matching open (experience) or source visit (event); null means historical attribution unknown.',
 origin_release_id:'Immutable release of the first rating or private feedback; can differ from matching open.',navigation_kind:'Client navigation classification, not verified physical tap.',
 operation:'rating or feedback.',applied_at:'DB time of applied immutable intent.',
 comment_id:'One internal reply under a customer feedback (lát F4).',author_kind:'member of the shop, or admin (platform support at switch position 3).',
 author_handle:'@handle of the author when they wrote it.',body:'Current text of the internal reply; earlier versions are kept by the platform.',
 created_at:'When the reply was written.',edited_at:'Last edit, null when never edited.',pinned:'true for the pinned reply of its thread.',
 likes:'Number of likes.',deleted_at:'When the reply was deleted and hidden, null while visible.',
};
const nullable=new Set(['rating','phone','topic','message','status','case_updated_at','tag_id','release_id','origin_release_id','edited_at','deleted_at']);
export function dictionary(dataset:Dataset){return {schemaVersion:'nfc-owner-export-v1',dataset,scope:'live',storageTimezone:'UTC',displayTimezone:'Asia/Ho_Chi_Minh',
 filterSemantics:'Inclusive Ho Chi Minh calendar start; exclusive day-after-end. Cohort = matching live opens filtered by source/release and current rating/case status. Experiences are current state of cohort sessions; receipts are complete immutable history of those sessions, including events outside the open date/release filter.',
 consistency:'Repeatable-read database snapshot per export. Authorization rechecked with fresh database state before each chunk. No credential/browser hash/proof fields.',
 fields:fields[dataset].map(name=>({name,type:['rating','case_revision','likes'].includes(name)?'integer':name==='pinned'?'boolean':name==='revision'||name==='experience_revision'?'decimal-string':name.endsWith('_at')?'timestamp':'string',
 nullable:nullable.has(name),unit:name.endsWith('_at')?'UTC ISO8601, microseconds':name==='rating'?'stars, 1–5':null,meaning:descriptions[name]}))};}
export function csvCell(value:unknown){let text=value===null||value===undefined?'':String(value);
 if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)||/^[\u0000-\u001f]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';}
export function exportSelect(dataset:Dataset){
 if(dataset==='experiences')return `${experienceSelect} ORDER BY e.first_interaction_at DESC,e.session_id DESC`;
 if(dataset==='comments')return `SELECT c.id comment_id,c.session_id,c.author_kind,c.author_handle,c.body,${utc('c.created_at')} created_at,${utc('c.edited_at')} edited_at,
 c.pinned_at IS NOT NULL pinned,(SELECT count(*)::int FROM feedback_comment_likes l WHERE l.comment_id=c.id) likes,${utc('c.deleted_at')} deleted_at
 FROM selected s JOIN feedback_comments c ON c.session_id=s.session_id ORDER BY c.created_at,c.id`;
 if(dataset==='page_visits')return `SELECT m.id visit_id,m.session_id,${utc('m.opened_at')} opened_at,m.navigation_kind,m.tag_id,m.release_id FROM matched m ORDER BY m.opened_at,m.id`;
 return `SELECT r.session_id,r.visit_id,r.applied_revision::text revision,r.operation,r.score rating,${utc('r.applied_at')} applied_at,r.feedback_topic topic,r.feedback_message message,r.feedback_phone phone,p.tag_id,p.release_id
 FROM selected s JOIN rating_intent_receipts r ON r.session_id=s.session_id AND r.scope='live'
 LEFT JOIN published_visit_contexts p ON p.visit_id=r.visit_id ORDER BY r.applied_at,r.session_id,r.applied_revision`;
}
export const exportHeaders=(format:'csv'|'jsonl'|'dictionary',dataset:Dataset)=>({
 'Content-Type':format==='csv'?'text/csv; charset=utf-8':format==='jsonl'?'application/x-ndjson; charset=utf-8':'application/json; charset=utf-8',
 'Content-Disposition':`attachment; filename="nfc-v1-${dataset}.${format==='dictionary'?'dictionary.json':format}"`,
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
 'X-NFC-Export-Version':'nfc-owner-export-v1',
});
/** Fixed 256-row database cursor; backpressure + cancel/abort/idle timeout release the connection. */
export async function exportStream(pool:Pool, credential:OwnerCredential, slug:string, f:Filters, dataset:Dataset, format:'csv'|'jsonl', signal:AbortSignal, cursorPool:Pool=pool){
 const auth=new OwnerAuth(pool),access=await auth.access(credential,slug,'export'),q=cohort(access.shopId,{...f,cursor:undefined});
 await recordActivity(pool,access,'export.download',dataset,{format});
 const db=await cursorPool.connect();let closed=false;let timer:ReturnType<typeof setTimeout>|undefined;let control:ReadableStreamDefaultController<Uint8Array>|undefined;
 const finish=()=>{if(closed)return;closed=true;clearTimeout(timer);signal.removeEventListener('abort',abort);db.removeListener('error',abort);db.release(true);};
 const abort=()=>{if(closed)return;finish();control?.error(new Error('Export interrupted'));};
 signal.addEventListener('abort',abort,{once:true});db.on('error',abort);
 try{
  if(signal.aborted)throw new Error('Export interrupted');
  // At most one active export per owner. A slow reader cannot occupy the whole pool on its own. Support never gets
  // here: authorize refuses export to every impersonation.
  if(!(await db.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) locked',[`owner-export:${access.userId}`])).rows[0].locked)throw new OwnerError(409,'EXPORT_BUSY');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL idle_in_transaction_session_timeout='65s'");
  await db.query(`DECLARE owner_export NO SCROLL CURSOR FOR ${q.sql} ${exportSelect(dataset)}`,q.values);
 }catch(error){finish();throw error;}
 const encoder=new TextEncoder();let header=true;
 return new ReadableStream<Uint8Array>({
  start(controller){control=controller;timer=setTimeout(abort,60000);},
  async pull(controller){
   if(closed)return;
   clearTimeout(timer);
   try{
    await auth.access(credential,slug,'export'); if(closed)return;
    const rows=(await db.query('FETCH FORWARD 256 FROM owner_export')).rows;
    if(closed)return;
    if(rows.length===0){if(header && format==='csv')controller.enqueue(encoder.encode('\uFEFF'+fields[dataset].map(csvCell).join(',')+'\r\n'));finish();controller.close();return;}
    // This buffer is one bounded chunk, never the entire dataset.
    const lines=rows.map(row=>{const record={...row,schemaVersion:'nfc-owner-export-v1',dataset};return format==='csv'?fields[dataset].map(field=>csvCell(record[field])).join(','):JSON.stringify(Object.fromEntries(fields[dataset].map(field=>[field,record[field]])));});
    const prefix=header&&format==='csv'?'\uFEFF'+fields[dataset].map(csvCell).join(',')+'\r\n':'';header=false;
    controller.enqueue(encoder.encode(prefix+lines.join(format==='csv'?'\r\n':'\n')+(format==='csv'?'\r\n':'\n')));
    timer=setTimeout(abort,60000);
   }catch{if(!closed){finish();controller.error(new Error('Export interrupted; discard partial file and retry.'));}}
  },
  cancel(){finish();},
 },{highWaterMark:0});
}
