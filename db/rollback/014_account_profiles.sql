-- Run in a transaction; refuse while any owner has filled in a profile, since dropping the columns would erase it.
-- The administrators' handle and label were set by the migration itself and go with it.
LOCK TABLE owner_identities_v2, platform_admins IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM owner_identities_v2 WHERE display_name IS NOT NULL OR bio IS NOT NULL OR avatar_url IS NOT NULL OR cover_url IS NOT NULL) THEN
   RAISE EXCEPTION 'PROFILES_PRESENT: keep migration 014 and roll the application back instead';
 END IF;
END $$;
ALTER TABLE shops DROP CONSTRAINT shops_account_routes_reserved;
DROP INDEX platform_admin_handle;
ALTER TABLE platform_admins DROP COLUMN handle, DROP COLUMN title;
ALTER TABLE owner_identities_v2 DROP COLUMN display_name, DROP COLUMN bio, DROP COLUMN avatar_url, DROP COLUMN cover_url;
