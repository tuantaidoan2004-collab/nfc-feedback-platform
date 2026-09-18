-- Account profiles (lát F2, Tài 2026-09-18): accounts read like a social network's. The existing username is the
-- public @handle and stays the sign-in name (sign-in also takes the account's email). Names, bios and the two images
-- are optional; an image is a link under the account's own folder on the media store, checked by the application.
ALTER TABLE owner_identities_v2
 ADD COLUMN display_name text CHECK(display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 60 AND display_name=btrim(display_name) AND display_name !~ '[[:cntrl:]<>]')),
 ADD COLUMN bio text CHECK(bio IS NULL OR (char_length(bio) BETWEEN 1 AND 160 AND bio=btrim(bio) AND bio !~ '[[:cntrl:]<>]')),
 ADD COLUMN avatar_url text CHECK(avatar_url IS NULL OR (avatar_url ~ '^https://[^[:space:]]+$' AND char_length(avatar_url)<=512)),
 ADD COLUMN cover_url text CHECK(cover_url IS NULL OR (cover_url ~ '^https://[^[:space:]]+$' AND char_length(cover_url)<=512));
-- How an administrator appears to shops: a public handle beside the verified tick, and a label. Tài chose
-- @Quitesensational and "Admin Tài" for his own account.
ALTER TABLE platform_admins
 ADD COLUMN handle text CHECK(handle IS NULL OR handle ~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,31}$'),
 ADD COLUMN title text CHECK(title IS NULL OR (char_length(title) BETWEEN 1 AND 40 AND title=btrim(title) AND title !~ '[[:cntrl:]<>]'));
CREATE UNIQUE INDEX platform_admin_handle ON platform_admins(lower(handle)) WHERE handle IS NOT NULL;
UPDATE platform_admins SET handle='Quitesensational', title='Admin Tài' WHERE username='tai' AND handle IS NULL;
-- /api/owner/v2/<name> for these names is an account route, not a shop's: a shop with such a slug would lose its API.
ALTER TABLE shops ADD CONSTRAINT shops_account_routes_reserved CHECK(lower(slug) NOT IN ('profile','password','login','logout','setup'));
