-- Run in a transaction; refuse while any four-position decision or design session exists, since the old schema
-- cannot hold them. Roll the application back instead.
LOCK TABLE shop_support_grant_events, admin_impersonation_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM shop_support_grant_events WHERE permission = 'level') OR EXISTS(SELECT 1 FROM admin_impersonation_sessions WHERE scope = 'design') THEN
   RAISE EXCEPTION 'SUPPORT_LEVEL_DATA_EXISTS: keep migration 012 and roll the application back instead';
 END IF;
END $$;
ALTER TABLE admin_impersonation_sessions DROP CONSTRAINT admin_impersonation_sessions_scope_check;
ALTER TABLE admin_impersonation_sessions ADD CONSTRAINT admin_impersonation_sessions_scope_check CHECK (scope IN ('overview','feedback'));
ALTER TABLE shop_support_grant_events DROP CONSTRAINT shop_support_grant_events_level_rows;
ALTER TABLE shop_support_grant_events DROP CONSTRAINT shop_support_grant_events_permission_check;
ALTER TABLE shop_support_grant_events ADD CONSTRAINT shop_support_grant_events_permission_check CHECK (permission IN ('feedback'));
ALTER TABLE shop_support_grant_events DROP COLUMN level;
