import type { PoolClient } from 'pg';
import { VisitAccessDenied, type VisitPolicy } from '../repositories/visit-ratings';
import type { RenderContext } from './proof';
import { previewHash } from './repository';
function deny(code: string): never { throw new VisitAccessDenied(code); }
/** Binding supplied only after proof verification. State locks linearize disable vs new writes. */
export function publishingVisitPolicy(c: RenderContext, previewToken?: string): VisitPolicy {
  async function sameVisit(db: PoolClient, visitId: string) {
    const row = (await db.query('SELECT release_id,tag_id,preview_id FROM published_visit_contexts WHERE visit_id=$1 AND shop_id=$2 AND scope=$3 AND entry_key=$4', [visitId, c.shopId, c.scope, c.entryKey])).rows[0];
    if (!row || row.release_id !== c.releaseId || row.tag_id !== c.tagId || row.preview_id !== c.previewId) deny('RENDER_CONTEXT_MISMATCH');
  }
  return {
    async guard(db, context) {
      if (context.shopId !== c.shopId || context.scope !== c.scope || context.entryKey !== c.entryKey) deny('RENDER_CONTEXT_MISMATCH');
      const shop = (await db.query('SELECT publishing_state FROM shops WHERE id=$1 FOR SHARE', [c.shopId])).rows[0];
      if (!shop || (c.scope === 'live' ? shop.publishing_state !== 'active' : shop.publishing_state === 'suspended')) deny('PAGE_UNAVAILABLE');
      if (c.tagId) {
        const tag = (await db.query('SELECT state FROM tags WHERE shop_id=$1 AND id=$2 FOR SHARE', [c.shopId, c.tagId])).rows[0];
        if (!tag || (c.scope === 'live' ? tag.state !== 'active' : tag.state === 'disabled')) deny('TAG_UNAVAILABLE');
      }
      if (c.releaseId && !(await db.query('SELECT 1 FROM page_releases WHERE shop_id=$1 AND id=$2', [c.shopId, c.releaseId])).rowCount) deny('RENDER_CONTEXT_MISMATCH');
      let deadline: Date | undefined;
      if (c.previewId) {
        if (!previewToken || !/^[a-f0-9]{64}$/.test(previewToken)) deny('PREVIEW_UNAVAILABLE');
        const preview = (await db.query('SELECT expires_at,source_release_id,tag_id FROM preview_sessions WHERE shop_id=$1 AND id=$2 AND token_hash=$3', [c.shopId, c.previewId, previewHash(previewToken)])).rows[0];
        if (!preview || preview.source_release_id !== c.releaseId || preview.tag_id !== c.tagId) deny('PREVIEW_UNAVAILABLE');
        deadline = preview.expires_at;
      }
      if ('visitId' in context) await sameVisit(db, String(context.visitId));
      return deadline;
    },
    async registered(db, visit, fresh) {
      if (!fresh) { await sameVisit(db, visit.visitId); return; }
      const keys = [visit.sessionId, c.shopId, c.scope, c.entryKey, visit.visitId];
      await db.query(`INSERT INTO published_visit_contexts(session_id,shop_id,scope,entry_key,visit_id,release_id,tag_id,preview_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [...keys, c.releaseId, c.tagId, c.previewId]);
      // Pre-publishing history stays unattributed. Never invent a release for an older first visit.
      await db.query(`INSERT INTO session_initial_contexts(session_id,shop_id,scope,entry_key,visit_id)
        SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM page_visits WHERE session_id=$1 AND id<>$5)`, keys);
    },
    async applied(db, visit, firstWrite) {
      if (firstWrite) await db.query('INSERT INTO experience_origin_contexts(session_id,shop_id,scope,entry_key,visit_id) VALUES($1,$2,$3,$4,$5)', [visit.sessionId, c.shopId, c.scope, c.entryKey, visit.visitId]);
    },
  };
}
