-- An administrator standing in for a shop owner. A session is short, read-only, tied to the administrative
-- session that opened it, and scoped either to the overview or to the overview plus private feedback, which is
-- the most sensitive data on the platform: customers wrote it for the shop, not for the operator.
-- The owner sees every row, including the reason verbatim, so the reason cannot be edited after the fact.
CREATE TABLE admin_impersonation_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 admin_id uuid NOT NULL REFERENCES platform_admins(id),
 -- Signing out of administration, or that session expiring, ends every impersonation it opened.
 admin_session_hash text NOT NULL REFERENCES admin_auth_sessions(token_hash),
 shop_id uuid NOT NULL REFERENCES shops(id),
 owner_user_id uuid NOT NULL REFERENCES owner_identities_v2(id),
 scope text NOT NULL CHECK(scope IN ('overview','feedback')),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 200 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 end_reason text CHECK(end_reason IN ('ended','superseded','expired')),
 CHECK(isfinite(created_at) AND isfinite(expires_at) AND expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
 CHECK((ended_at IS NULL)=(end_reason IS NULL))
);
-- One live session per administrator, enforced here rather than trusted to the code: two open sessions would
-- make the 30-minute limit meaningless. Expired rows count as live until closed, and opening a new session
-- closes them first.
CREATE UNIQUE INDEX admin_impersonation_one_live ON admin_impersonation_sessions(admin_id) WHERE ended_at IS NULL;
CREATE INDEX admin_impersonation_shop ON admin_impersonation_sessions(shop_id,created_at DESC);

-- A row may be closed once and never otherwise changed or removed.
CREATE FUNCTION admin_impersonation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
  OR (to_jsonb(NEW)-'ended_at'-'end_reason') IS DISTINCT FROM (to_jsonb(OLD)-'ended_at'-'end_reason')
 THEN RAISE EXCEPTION 'IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admin_impersonation_immutable BEFORE UPDATE OR DELETE ON admin_impersonation_sessions
 FOR EACH ROW EXECUTE FUNCTION admin_impersonation_guard();
