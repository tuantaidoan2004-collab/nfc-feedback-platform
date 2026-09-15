-- Execute in a transaction. Refuse any publishing history; never erase attributed data.
LOCK TABLE shops,template_versions,page_drafts,page_releases,tags,preview_sessions,published_visit_contexts,session_initial_contexts,experience_origin_contexts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM template_versions) OR EXISTS(SELECT 1 FROM page_drafts) OR EXISTS(SELECT 1 FROM page_releases)
 OR EXISTS(SELECT 1 FROM tags) OR EXISTS(SELECT 1 FROM preview_sessions) OR EXISTS(SELECT 1 FROM published_visit_contexts)
 OR EXISTS(SELECT 1 FROM session_initial_contexts) OR EXISTS(SELECT 1 FROM experience_origin_contexts)
 OR EXISTS(SELECT 1 FROM shops WHERE active_release_id IS NOT NULL OR publishing_state<>'draft')
 THEN RAISE EXCEPTION 'PUBLISHING_DATA_EXISTS'; END IF;
END $$;
DROP TRIGGER receipt_immutable ON rating_intent_receipts;
DROP TABLE experience_origin_contexts,session_initial_contexts,published_visit_contexts;
ALTER TABLE shops DROP CONSTRAINT shops_preview_reserved, DROP CONSTRAINT shops_release_fk, DROP CONSTRAINT active_shop_release;
ALTER TABLE shops DROP COLUMN active_release_id, DROP COLUMN publishing_state;
DROP TABLE preview_sessions,tags,page_releases,page_drafts,template_versions;
DROP FUNCTION tag_transition();
DROP FUNCTION publishing_immutable();
