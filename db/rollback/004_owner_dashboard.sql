-- Run in a transaction; never discard identities, permissions, sessions or handling history.
LOCK TABLE owner_identities_v2,owner_memberships_v2,owner_auth_sessions_v2,owner_login_limits,owner_feedback_cases,owner_feedback_audit IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM owner_identities_v2) OR EXISTS(SELECT 1 FROM owner_memberships_v2) OR EXISTS(SELECT 1 FROM owner_auth_sessions_v2)
 OR EXISTS(SELECT 1 FROM owner_feedback_cases) OR EXISTS(SELECT 1 FROM owner_feedback_audit) OR EXISTS(SELECT 1 FROM owner_login_limits)
 THEN RAISE EXCEPTION 'OWNER_DATA_EXISTS'; END IF;
END $$;
DROP TABLE owner_feedback_audit,owner_feedback_cases,owner_auth_sessions_v2,owner_memberships_v2,owner_identities_v2,owner_login_limits;
DROP INDEX owner_dashboard_experiences,owner_dashboard_receipts,owner_dashboard_visits_session;
ALTER TABLE shops DROP CONSTRAINT shops_owner_reserved;
