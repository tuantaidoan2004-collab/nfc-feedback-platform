-- Owner identities gain a contact address and a way to set their own password. Tai provisions an account and
-- hands over a single-use link; the password is chosen by the shop, so the operator never knows it and cannot
-- be accused of using it. Existing rows predate the column, so it is nullable here and required by the code
-- that creates accounts from now on; the additive rule forbids backfilling 004.
ALTER TABLE owner_identities_v2 ADD COLUMN email text
 CHECK(email IS NULL OR (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND char_length(email)<=254 AND email=lower(email)));
CREATE UNIQUE INDEX owner_identity_email ON owner_identities_v2(email) WHERE email IS NOT NULL;

-- Only the hash is stored, exactly as session tokens are: a leaked database must not yield usable links.
CREATE TABLE owner_setup_tokens (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES owner_identities_v2(id),
 purpose text NOT NULL CHECK(purpose IN ('setup','reset')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 used_at timestamptz, superseded_at timestamptz,
 CHECK(isfinite(expires_at) AND expires_at>created_at)
);
CREATE INDEX owner_setup_open ON owner_setup_tokens(user_id,purpose) WHERE used_at IS NULL AND superseded_at IS NULL;
