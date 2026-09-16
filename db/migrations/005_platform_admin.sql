-- Platform administration is a separate identity space from shop owners. Sharing a table, a session or a
-- cookie with owner identities would make a single role-check mistake enough to turn a shop owner into a
-- platform administrator, so nothing here is reused from owner v2 except the KDF parameters.
ALTER TABLE shops ADD CONSTRAINT shops_gov_reserved CHECK(lower(slug)<>'gov');
CREATE TABLE platform_admins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL CHECK(username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
 password_salt text NOT NULL CHECK(password_salt ~ '^[a-f0-9]{32}$'),
 password_key text NOT NULL CHECK(password_key ~ '^[a-f0-9]{64}$'),
 password_scheme text NOT NULL DEFAULT 'scrypt-131072-8-1' CHECK(password_scheme='scrypt-131072-8-1'),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Shorter absolute lifetime than an owner session: this token reaches every shop, not one.
CREATE TABLE admin_auth_sessions (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'), admin_id uuid NOT NULL REFERENCES platform_admins(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
 CHECK(isfinite(expires_at) AND expires_at>created_at)
);
CREATE INDEX admin_auth_admin ON admin_auth_sessions(admin_id);
-- Separate from owner_login_limits so that a flood of owner login attempts cannot exhaust the buckets that
-- admin login shares, which would lock the operator out exactly when an incident needs attention.
CREATE TABLE admin_login_limits (
 bucket text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0)
);
-- Append-only record of every administrative action. on_behalf_of distinguishes work an admin did while
-- standing in for an owner from work the owner did themselves; without it the owner's own history is poisoned.
CREATE TABLE admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid NOT NULL REFERENCES platform_admins(id),
 action text NOT NULL CHECK(action ~ '^[a-z][a-z0-9_.]{2,63}$'),
 shop_id uuid REFERENCES shops(id), on_behalf_of uuid REFERENCES owner_identities_v2(id),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object' AND pg_column_size(detail)<=4096),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE INDEX admin_audit_shop ON admin_audit(shop_id,recorded_at DESC);
CREATE INDEX admin_audit_actor ON admin_audit(actor_id,recorded_at DESC);
