-- Run in a transaction; never discard administrative identities, sessions or the audit trail.
LOCK TABLE platform_admins,admin_auth_sessions,admin_login_limits,admin_audit IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM platform_admins) OR EXISTS(SELECT 1 FROM admin_auth_sessions)
 OR EXISTS(SELECT 1 FROM admin_audit) OR EXISTS(SELECT 1 FROM admin_login_limits)
 THEN RAISE EXCEPTION 'ADMIN_DATA_EXISTS'; END IF;
END $$;
DROP TABLE admin_audit,admin_auth_sessions,admin_login_limits,platform_admins;
ALTER TABLE shops DROP CONSTRAINT shops_gov_reserved;
