-- Run in a transaction; refuse while any administrator has a second factor, since dropping the columns would
-- silently take it away and leave the account on a password alone.
LOCK TABLE platform_admins IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM platform_admins WHERE totp_enrolled_at IS NOT NULL) THEN
   RAISE EXCEPTION 'ADMIN_TWO_FACTOR_ENROLLED: keep migration 019 and roll the application back instead';
 END IF;
END $$;
DROP TABLE admin_totp_steps;
DROP TABLE admin_backup_codes;
ALTER TABLE platform_admins DROP CONSTRAINT platform_admins_totp_enrolled_needs_secret,
 DROP COLUMN totp_enrolled_at, DROP COLUMN totp_secret;
