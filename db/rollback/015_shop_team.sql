-- Run in a transaction; refuse once the team or its history holds anything the old schema cannot: invited members,
-- people given or refused feedback one by one, hidden badges, or any line of activity.
LOCK TABLE owner_memberships_v2, shop_roles, shop_activity IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM shop_activity) OR EXISTS(SELECT 1 FROM owner_memberships_v2 WHERE invited_by IS NOT NULL OR feedback_override IS NOT NULL OR NOT show_badge) THEN
   RAISE EXCEPTION 'TEAM_DATA_PRESENT: keep migration 015 and roll the application back instead';
 END IF;
END $$;
DROP TABLE shop_activity;
DROP FUNCTION shop_activity_append_only();
ALTER TABLE owner_memberships_v2 DROP CONSTRAINT membership_owner_has_no_role,
 DROP COLUMN role_id, DROP COLUMN feedback_override, DROP COLUMN show_badge, DROP COLUMN invited_by, DROP COLUMN joined_at;
DROP TABLE shop_roles;
