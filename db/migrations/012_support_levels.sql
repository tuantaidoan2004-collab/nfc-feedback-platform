-- The owner's support switch grows from on/off to four positions (Tài, 2026-09-17): off, 1 view (read feedback),
-- 2 edit (change the page, see no data at all), 3 full. Additive: the old on/off rows stay as history and keep
-- their meaning (on = view, off = off); new decisions are rows with permission 'level'. The newest row of either
-- kind is the current position. Impersonation gains a 'design' scope for editing on the owner's behalf.
ALTER TABLE shop_support_grant_events ADD COLUMN level text CHECK (level IN ('off','view','edit','full'));
ALTER TABLE shop_support_grant_events DROP CONSTRAINT shop_support_grant_events_permission_check;
ALTER TABLE shop_support_grant_events ADD CONSTRAINT shop_support_grant_events_permission_check CHECK (permission IN ('feedback','level'));
ALTER TABLE shop_support_grant_events ADD CONSTRAINT shop_support_grant_events_level_rows
 CHECK ((permission = 'level') = (level IS NOT NULL) AND (permission <> 'level' OR enabled = (level <> 'off')));
ALTER TABLE admin_impersonation_sessions DROP CONSTRAINT admin_impersonation_sessions_scope_check;
ALTER TABLE admin_impersonation_sessions ADD CONSTRAINT admin_impersonation_sessions_scope_check CHECK (scope IN ('overview','feedback','design'));
