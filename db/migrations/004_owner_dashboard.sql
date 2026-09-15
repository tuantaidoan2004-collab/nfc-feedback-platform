-- Additive owner v2; legacy identities/memberships/sessions are not silently trusted or migrated.
ALTER TABLE shops ADD CONSTRAINT shops_owner_reserved CHECK(lower(slug)<>'owner');
CREATE TABLE owner_identities_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL CHECK(username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
 password_salt text NOT NULL CHECK(password_salt ~ '^[a-f0-9]{32}$'),
 password_key text NOT NULL CHECK(password_key ~ '^[a-f0-9]{64}$'),
 password_scheme text NOT NULL DEFAULT 'scrypt-131072-8-1' CHECK(password_scheme='scrypt-131072-8-1'),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE owner_memberships_v2 (
 user_id uuid REFERENCES owner_identities_v2(id), shop_id uuid REFERENCES shops(id),
 role text NOT NULL CHECK(role IN ('owner','manager')), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(user_id,shop_id)
);
CREATE TABLE owner_auth_sessions_v2 (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'), user_id uuid NOT NULL REFERENCES owner_identities_v2(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
 CHECK(isfinite(expires_at) AND expires_at>created_at)
);
CREATE INDEX owner_auth_user ON owner_auth_sessions_v2(user_id);
CREATE TABLE owner_login_limits (
 bucket text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0)
);
CREATE TABLE owner_feedback_cases (
 session_id uuid PRIMARY KEY, shop_id uuid NOT NULL, scope text NOT NULL CHECK(scope='live'), entry_key text NOT NULL,
 status text NOT NULL CHECK(status IN ('new','progress','resolved')), note text NOT NULL CHECK(char_length(note)<=2000),
 revision integer NOT NULL CHECK(revision>0), feedback_seen_at timestamptz NOT NULL,
 actor_id uuid NOT NULL REFERENCES owner_identities_v2(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,session_id),
 FOREIGN KEY(shop_id,scope,entry_key,session_id) REFERENCES rating_experiences(shop_id,scope,entry_key,session_id)
);
CREATE TABLE owner_feedback_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shop_id uuid NOT NULL, session_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('new','progress','resolved')), note text NOT NULL CHECK(char_length(note)<=2000), experience_revision bigint NOT NULL CHECK(experience_revision>0),
 actor_id uuid NOT NULL REFERENCES owner_identities_v2(id), changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,session_id,revision), FOREIGN KEY(shop_id,session_id) REFERENCES owner_feedback_cases(shop_id,session_id)
);
CREATE TRIGGER owner_audit_immutable BEFORE UPDATE OR DELETE ON owner_feedback_audit FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE INDEX owner_dashboard_experiences ON rating_experiences(shop_id,scope,first_interaction_at DESC,session_id DESC);
CREATE INDEX owner_dashboard_receipts ON rating_intent_receipts(shop_id,scope,applied_at,session_id,applied_revision);
CREATE INDEX owner_dashboard_visits_session ON page_visits(shop_id,scope,session_id);
