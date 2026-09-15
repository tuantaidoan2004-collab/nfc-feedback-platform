-- Reserved by the capability preview route; fail safely if an existing shop conflicts.
ALTER TABLE shops ADD CONSTRAINT shops_preview_reserved CHECK (lower(slug)<>'preview');
-- Additive; no rewrite/backfill of foundation002 or fabricated release history.
CREATE TABLE template_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_key text NOT NULL, version integer NOT NULL CHECK(version>0),
 schema_version integer NOT NULL CHECK(schema_version=1), renderer_version text NOT NULL CHECK(renderer_version='1'),
 capabilities jsonb NOT NULL CHECK(jsonb_typeof(capabilities)='array'), UNIQUE(template_key,version)
);
CREATE TABLE page_drafts (
 shop_id uuid PRIMARY KEY REFERENCES shops(id), template_version_id uuid NOT NULL REFERENCES template_versions(id),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0 AND revision<9007199254740991)
);
CREATE TABLE page_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
 template_version_id uuid NOT NULL REFERENCES template_versions(id), config_snapshot jsonb NOT NULL,
 draft_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by text NOT NULL,
 UNIQUE(shop_id,id), UNIQUE(shop_id,draft_revision)
);
ALTER TABLE shops ADD COLUMN publishing_state text NOT NULL DEFAULT 'draft' CHECK(publishing_state IN ('draft','active','suspended'));
ALTER TABLE shops ADD COLUMN active_release_id uuid;
ALTER TABLE shops ADD CONSTRAINT shops_release_fk FOREIGN KEY(id,active_release_id) REFERENCES page_releases(shop_id,id);
ALTER TABLE shops ADD CONSTRAINT active_shop_release CHECK(publishing_state<>'active' OR active_release_id IS NOT NULL);
CREATE TABLE tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
 public_code text UNIQUE NOT NULL CHECK(public_code ~ '^[a-zA-Z0-9_-]{8,64}$' AND lower(public_code)<>'demo'),
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','tested','active','disabled')),
 location_label text NOT NULL DEFAULT '', UNIQUE(shop_id,id)
);
CREATE TABLE preview_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
 template_version_id uuid NOT NULL REFERENCES template_versions(id), config_snapshot jsonb NOT NULL,
 source_release_id uuid, source_draft_revision bigint, tag_id uuid, token_hash text UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>created_at), CHECK((source_release_id IS NULL)<>(source_draft_revision IS NULL)),
 UNIQUE(shop_id,id), FOREIGN KEY(shop_id,tag_id) REFERENCES tags(shop_id,id), FOREIGN KEY(shop_id,source_release_id) REFERENCES page_releases(shop_id,id)
);
CREATE TABLE published_visit_contexts (
 visit_id uuid PRIMARY KEY, shop_id uuid NOT NULL, scope text NOT NULL, entry_key text NOT NULL, session_id uuid NOT NULL,
 release_id uuid, tag_id uuid, preview_id uuid,
 CHECK((scope='live' AND release_id IS NOT NULL AND preview_id IS NULL) OR (scope='test' AND preview_id IS NOT NULL)),
 FOREIGN KEY(shop_id,scope,entry_key,session_id,visit_id) REFERENCES page_visits(shop_id,scope,entry_key,session_id,id),
 FOREIGN KEY(shop_id,release_id) REFERENCES page_releases(shop_id,id),
 FOREIGN KEY(shop_id,tag_id) REFERENCES tags(shop_id,id), FOREIGN KEY(shop_id,preview_id) REFERENCES preview_sessions(shop_id,id),
 UNIQUE(shop_id,scope,entry_key,session_id,visit_id)
);
CREATE TABLE session_initial_contexts (
 session_id uuid PRIMARY KEY REFERENCES visit_sessions(id), shop_id uuid NOT NULL, scope text NOT NULL, entry_key text NOT NULL, visit_id uuid NOT NULL,
 FOREIGN KEY(shop_id,scope,entry_key,session_id,visit_id) REFERENCES published_visit_contexts(shop_id,scope,entry_key,session_id,visit_id)
);
CREATE TABLE experience_origin_contexts (
 session_id uuid PRIMARY KEY REFERENCES rating_experiences(session_id), shop_id uuid NOT NULL, scope text NOT NULL, entry_key text NOT NULL, visit_id uuid NOT NULL,
 FOREIGN KEY(shop_id,scope,entry_key,session_id,visit_id) REFERENCES published_visit_contexts(shop_id,scope,entry_key,session_id,visit_id)
);
CREATE FUNCTION publishing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514'; END $$;
CREATE TRIGGER template_immutable BEFORE UPDATE OR DELETE ON template_versions FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE TRIGGER release_immutable BEFORE UPDATE OR DELETE ON page_releases FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE TRIGGER preview_immutable BEFORE UPDATE OR DELETE ON preview_sessions FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE TRIGGER visit_context_immutable BEFORE UPDATE OR DELETE ON published_visit_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE TRIGGER session_context_immutable BEFORE UPDATE OR DELETE ON session_initial_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE TRIGGER experience_context_immutable BEFORE UPDATE OR DELETE ON experience_origin_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
-- Foundation receipts already carry source visit. Preserve that immutable join to release attribution.
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
CREATE FUNCTION tag_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.shop_id<>OLD.shop_id OR NEW.public_code<>OLD.public_code OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'TAG_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='prepared' AND NEW.state IN ('tested','disabled')) OR (OLD.state='tested' AND NEW.state IN ('active','disabled')) OR (OLD.state='active' AND NEW.state='disabled')) THEN RAISE EXCEPTION 'INVALID_TAG_TRANSITION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tags_transition BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION tag_transition();
