-- Run in a transaction; never discard a record of an administrator standing in for a shop owner.
LOCK TABLE admin_impersonation_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM admin_impersonation_sessions) THEN RAISE EXCEPTION 'IMPERSONATION_DATA_EXISTS'; END IF;
END $$;
DROP TABLE admin_impersonation_sessions;
DROP FUNCTION admin_impersonation_guard();
