-- Lược đồ database của Quite Sensational — một tệp duy nhất (Tài, 05/10/2026: không migration trong lúc dựng lại).
--
-- Sửa lược đồ = sửa tệp này. `node scripts/local.mjs` thấy tệp đổi thì làm lại database local từ đầu và gieo lại dữ liệu
-- mẫu. Production giữ lược đồ cũ (migration 001–032 trên `main`) tới ngày đổi khung; hôm đó database production được làm
-- sạch và nhận tệp này (hỏi lại Tài đúng hôm đó).
--
-- Không ghi tên schema: các bộ test áp tệp này vào schema riêng của mình qua search_path.
-- Gốc: pg_dump --schema-only của migration 001–033 ngày 05/10/2026.

--
-- PostgreSQL database dump
--

-- Dumped from database version 18.6 (Postgres.app)
-- Dumped by pg_dump version 18.6 (Postgres.app)

--
-- Name: admin_impersonation_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION admin_impersonation_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
  OR (to_jsonb(NEW)-'ended_at'-'end_reason') IS DISTINCT FROM (to_jsonb(OLD)-'ended_at'-'end_reason')
 THEN RAISE EXCEPTION 'IMMUTABLE'; END IF;
 RETURN NEW;
END $$;

--
-- Name: erase_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION erase_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514'; END IF;
  -- The one permitted shape: the message replaced by the marker, the number gone, nothing else touched.
  IF NEW.feedback_message = '(đã xoá theo yêu cầu)' AND NEW.feedback_phone IS NULL
     AND (to_jsonb(NEW) - 'feedback_message' - 'feedback_phone') = (to_jsonb(OLD) - 'feedback_message' - 'feedback_phone')
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514';
END $$;

--
-- Name: feedback_comment_revisions_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION feedback_comment_revisions_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
 RAISE EXCEPTION 'COMMENT_REVISIONS_APPEND_ONLY' USING ERRCODE='23514';
END $$;

--
-- Name: page_events_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION page_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'PAGE_EVENTS_APPEND_ONLY'; END $$;

--
-- Name: page_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION page_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PAGE_PERMANENT' USING ERRCODE = '23514'; END IF;
  IF NEW.id <> OLD.id OR NEW.shop_id <> OLD.shop_id OR NEW.slug <> OLD.slug OR NEW.entry_key <> OLD.entry_key
    THEN RAISE EXCEPTION 'PAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'PAGE_CLOSED' USING ERRCODE = '23514'; END IF;
  IF NEW.state <> OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('active', 'closed'))
    OR (OLD.state = 'active' AND NEW.state IN ('paused', 'closed'))
    OR (OLD.state = 'paused' AND NEW.state IN ('active', 'closed')))
    THEN RAISE EXCEPTION 'INVALID_PAGE_TRANSITION' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

--
-- Name: publishing_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION publishing_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514'; END $$;

--
-- Name: shop_activity_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION shop_activity_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
 RAISE EXCEPTION 'SHOP_ACTIVITY_APPEND_ONLY' USING ERRCODE='23514';
END $$;

--
-- Name: tag_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION tag_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
 IF NEW.shop_id<>OLD.shop_id OR NEW.public_code<>OLD.public_code OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'TAG_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='prepared' AND NEW.state IN ('tested','active','disabled')) OR (OLD.state='tested' AND NEW.state IN ('active','disabled'))
   OR (OLD.state='active' AND NEW.state='disabled') OR (OLD.state='disabled' AND NEW.state='active')) THEN RAISE EXCEPTION 'INVALID_TAG_TRANSITION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

--
-- Name: admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_audit (
    id bigint NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    shop_id uuid,
    on_behalf_of uuid,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT admin_audit_action_check CHECK ((action ~ '^[a-z][a-z0-9_.]{2,63}$'::text)),
    CONSTRAINT admin_audit_detail_check CHECK (((jsonb_typeof(detail) = 'object'::text) AND (pg_column_size(detail) <= 4096)))
);

--
-- Name: admin_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE admin_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: admin_auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_auth_sessions (
    token_hash text NOT NULL,
    admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT admin_auth_sessions_check CHECK ((isfinite(expires_at) AND (expires_at > created_at))),
    CONSTRAINT admin_auth_sessions_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: admin_backup_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_backup_codes (
    code_hash text NOT NULL,
    admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT admin_backup_codes_check CHECK ((isfinite(used_at) AND (used_at >= created_at))),
    CONSTRAINT admin_backup_codes_code_hash_check CHECK ((code_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: admin_impersonation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_impersonation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    admin_id uuid NOT NULL,
    admin_session_hash text NOT NULL,
    shop_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    scope text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    end_reason text,
    CONSTRAINT admin_impersonation_sessions_check CHECK ((isfinite(created_at) AND isfinite(expires_at) AND (expires_at > created_at) AND (expires_at <= (created_at + '00:30:00'::interval)))),
    CONSTRAINT admin_impersonation_sessions_check1 CHECK (((ended_at IS NULL) = (end_reason IS NULL))),
    CONSTRAINT admin_impersonation_sessions_end_reason_check CHECK ((end_reason = ANY (ARRAY['ended'::text, 'superseded'::text, 'expired'::text]))),
    CONSTRAINT admin_impersonation_sessions_reason_check CHECK ((((char_length(reason) >= 10) AND (char_length(reason) <= 200)) AND (reason = btrim(reason)) AND (reason !~ '[[:cntrl:]]'::text))),
    CONSTRAINT admin_impersonation_sessions_scope_check CHECK ((scope = ANY (ARRAY['overview'::text, 'feedback'::text, 'design'::text]))),
    CONSTRAINT admin_impersonation_sessions_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: admin_login_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_login_limits (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT admin_login_limits_attempts_check CHECK ((attempts > 0))
);

--
-- Name: admin_totp_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE admin_totp_steps (
    admin_id uuid NOT NULL,
    step bigint NOT NULL,
    used_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT admin_totp_steps_step_check CHECK ((step > 0))
);

--
-- Name: experience_origin_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE experience_origin_contexts (
    session_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    visit_id uuid NOT NULL
);

--
-- Name: feedback_comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE feedback_comment_likes (
    comment_id uuid NOT NULL,
    liker_kind text NOT NULL,
    liker_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT feedback_comment_likes_liker_kind_check CHECK ((liker_kind = ANY (ARRAY['member'::text, 'admin'::text])))
);

--
-- Name: feedback_comment_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE feedback_comment_revisions (
    id bigint NOT NULL,
    comment_id uuid NOT NULL,
    body text NOT NULL,
    replaced_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

--
-- Name: feedback_comment_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE feedback_comment_revisions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME feedback_comment_revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: feedback_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE feedback_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    session_id uuid NOT NULL,
    author_kind text NOT NULL,
    author_id uuid NOT NULL,
    author_handle text NOT NULL,
    body text NOT NULL,
    from_note boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    edited_at timestamp with time zone,
    pinned_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT feedback_comments_author_handle_check CHECK (((char_length(author_handle) >= 1) AND (char_length(author_handle) <= 64))),
    CONSTRAINT feedback_comments_author_kind_check CHECK ((author_kind = ANY (ARRAY['member'::text, 'admin'::text]))),
    CONSTRAINT feedback_comments_body_check CHECK ((((char_length(body) >= 1) AND (char_length(body) <= 2000)) AND (btrim(body) <> ''::text))),
    CONSTRAINT feedback_comments_check CHECK (((deleted_at IS NULL) OR (pinned_at IS NULL))),
    CONSTRAINT feedback_comments_check1 CHECK (((deleted_at IS NULL) = (deleted_by IS NULL)))
);

--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    url text NOT NULL,
    kind text NOT NULL,
    content_type text,
    size_bytes integer,
    uploaded_by text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT media_assets_check CHECK (((state = 'pending'::text) = (reviewed_at IS NULL))),
    CONSTRAINT media_assets_check1 CHECK (((state <> 'rejected'::text) OR (reason IS NOT NULL))),
    CONSTRAINT media_assets_check2 CHECK (((state = 'rejected'::text) OR (reason IS NULL))),
    CONSTRAINT media_assets_content_type_check CHECK (((content_type IS NULL) OR (content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'video/mp4'::text])))),
    CONSTRAINT media_assets_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT media_assets_reason_check CHECK (((reason IS NULL) OR (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 300)) AND (reason !~ '[[:cntrl:]<>]'::text)))),
    CONSTRAINT media_assets_size_bytes_check CHECK (((size_bytes IS NULL) OR (size_bytes > 0))),
    CONSTRAINT media_assets_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT media_assets_uploaded_by_check CHECK (((length(uploaded_by) >= 1) AND (length(uploaded_by) <= 80))),
    CONSTRAINT media_assets_url_check CHECK ((((length(url) >= 9) AND (length(url) <= 2048)) AND (url ~ '^(https://|http://(127\.0\.0\.1|localhost)(:[0-9]+)?/)'::text) AND (url !~ '[[:space:]<>]'::text)))
);

--
-- Name: owner_auth_sessions_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_auth_sessions_v2 (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT owner_auth_sessions_v2_check CHECK ((isfinite(expires_at) AND (expires_at > created_at))),
    CONSTRAINT owner_auth_sessions_v2_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: owner_feedback_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_feedback_audit (
    id bigint NOT NULL,
    shop_id uuid NOT NULL,
    session_id uuid NOT NULL,
    revision integer NOT NULL,
    status text NOT NULL,
    note text NOT NULL,
    experience_revision bigint NOT NULL,
    actor_id uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT owner_feedback_audit_experience_revision_check CHECK ((experience_revision > 0)),
    CONSTRAINT owner_feedback_audit_note_check CHECK ((char_length(note) <= 2000)),
    CONSTRAINT owner_feedback_audit_revision_check CHECK ((revision > 0)),
    CONSTRAINT owner_feedback_audit_status_check CHECK ((status = ANY (ARRAY['new'::text, 'progress'::text, 'resolved'::text])))
);

--
-- Name: owner_feedback_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE owner_feedback_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME owner_feedback_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: owner_feedback_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_feedback_cases (
    session_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    status text NOT NULL,
    note text NOT NULL,
    revision integer NOT NULL,
    feedback_seen_at timestamp with time zone NOT NULL,
    actor_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT owner_feedback_cases_note_check CHECK ((char_length(note) <= 2000)),
    CONSTRAINT owner_feedback_cases_revision_check CHECK ((revision > 0)),
    CONSTRAINT owner_feedback_cases_scope_check CHECK ((scope = 'live'::text)),
    CONSTRAINT owner_feedback_cases_status_check CHECK ((status = ANY (ARRAY['new'::text, 'progress'::text, 'resolved'::text])))
);

--
-- Name: owner_identities_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_identities_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_salt text NOT NULL,
    password_key text NOT NULL,
    password_scheme text DEFAULT 'scrypt-131072-8-1'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    email text,
    display_name text,
    bio text,
    avatar_url text,
    cover_url text,
    google_sub text,
    CONSTRAINT owner_identities_v2_avatar_url_check CHECK (((avatar_url IS NULL) OR ((avatar_url ~ '^(https://|http://(127\.0\.0\.1|localhost)(:[0-9]+)?/)[^[:space:]]+$'::text) AND (char_length(avatar_url) <= 512)))),
    CONSTRAINT owner_identities_v2_bio_check CHECK (((bio IS NULL) OR (((char_length(bio) >= 1) AND (char_length(bio) <= 160)) AND (bio = btrim(bio)) AND (bio !~ '[[:cntrl:]<>]'::text)))),
    CONSTRAINT owner_identities_v2_cover_url_check CHECK (((cover_url IS NULL) OR ((cover_url ~ '^(https://|http://(127\.0\.0\.1|localhost)(:[0-9]+)?/)[^[:space:]]+$'::text) AND (char_length(cover_url) <= 512)))),
    CONSTRAINT owner_identities_v2_display_name_check CHECK (((display_name IS NULL) OR (((char_length(display_name) >= 1) AND (char_length(display_name) <= 60)) AND (display_name = btrim(display_name)) AND (display_name !~ '[[:cntrl:]<>]'::text)))),
    CONSTRAINT owner_identities_v2_email_check CHECK (((email IS NULL) OR ((email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text) AND (char_length(email) <= 254) AND (email = lower(email))))),
    CONSTRAINT owner_identities_v2_google_sub_check CHECK (((google_sub IS NULL) OR ((google_sub ~ '^[0-9]+$'::text) AND ((length(google_sub) >= 1) AND (length(google_sub) <= 255))))),
    CONSTRAINT owner_identities_v2_password_key_check CHECK ((password_key ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT owner_identities_v2_password_salt_check CHECK ((password_salt ~ '^[a-f0-9]{32}$'::text)),
    CONSTRAINT owner_identities_v2_password_scheme_check CHECK ((password_scheme = 'scrypt-131072-8-1'::text)),
    CONSTRAINT owner_identities_v2_username_check CHECK ((username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'::text))
);

--
-- Name: owner_login_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_login_limits (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT owner_login_limits_attempts_check CHECK ((attempts > 0))
);

--
-- Name: owner_memberships_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_memberships_v2 (
    user_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    role text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    role_id uuid,
    feedback_override boolean,
    show_badge boolean DEFAULT true NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT membership_owner_has_no_role CHECK (((role <> 'owner'::text) OR ((role_id IS NULL) AND (feedback_override IS NULL)))),
    CONSTRAINT owner_memberships_v2_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text])))
);

--
-- Name: owner_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    kind text NOT NULL,
    comment_id uuid NOT NULL,
    session_id uuid NOT NULL,
    actor_kind text NOT NULL,
    actor_handle text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT owner_notifications_actor_handle_check CHECK (((char_length(actor_handle) >= 1) AND (char_length(actor_handle) <= 64))),
    CONSTRAINT owner_notifications_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['member'::text, 'admin'::text]))),
    CONSTRAINT owner_notifications_kind_check CHECK ((kind = 'mention'::text))
);

--
-- Name: owner_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE owner_setup_tokens (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    purpose text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    superseded_at timestamp with time zone,
    CONSTRAINT owner_setup_tokens_check CHECK ((isfinite(expires_at) AND (expires_at > created_at))),
    CONSTRAINT owner_setup_tokens_purpose_check CHECK ((purpose = ANY (ARRAY['setup'::text, 'reset'::text]))),
    CONSTRAINT owner_setup_tokens_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: page_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE page_drafts (
    shop_id uuid NOT NULL,
    template_version_id uuid NOT NULL,
    config jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    page_id uuid NOT NULL,
    CONSTRAINT page_drafts_config_check CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT page_drafts_revision_check CHECK (((revision > 0) AND (revision < '9007199254740991'::bigint)))
);

--
-- Name: page_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE page_events (
    id bigint NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    session_id uuid,
    visit_id uuid,
    name text NOT NULL,
    at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    since_open_ms integer,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT page_events_at_check CHECK (isfinite(at)),
    CONSTRAINT page_events_detail_check CHECK (((jsonb_typeof(detail) = 'object'::text) AND (pg_column_size(detail) <= 512))),
    CONSTRAINT page_events_entry_key_check CHECK (((length(btrim(entry_key)) >= 1) AND (length(btrim(entry_key)) <= 128))),
    CONSTRAINT page_events_name_check CHECK ((name ~ '^[a-z][a-z0-9_]{2,31}$'::text)),
    CONSTRAINT page_events_scope_check CHECK ((scope = ANY (ARRAY['live'::text, 'test'::text]))),
    CONSTRAINT page_events_since_open_ms_check CHECK (((since_open_ms >= 0) AND (since_open_ms <= 86400000)))
);

--
-- Name: page_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE page_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME page_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: page_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE page_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    page_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    reason text NOT NULL,
    state text DEFAULT 'open'::text NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT page_incidents_check CHECK (((state = 'resolved'::text) = ((resolved_at IS NOT NULL) AND (resolved_by IS NOT NULL) AND (resolution IS NOT NULL)))),
    CONSTRAINT page_incidents_reason_check CHECK ((((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 1000)) AND (reason !~ '[<>]'::text))),
    CONSTRAINT page_incidents_resolution_check CHECK (((resolution IS NULL) OR (((length(btrim(resolution)) >= 1) AND (length(btrim(resolution)) <= 1000)) AND (resolution !~ '[<>]'::text)))),
    CONSTRAINT page_incidents_state_check CHECK ((state = ANY (ARRAY['open'::text, 'resolved'::text])))
);

--
-- Name: page_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE page_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    template_version_id uuid NOT NULL,
    config_snapshot jsonb NOT NULL,
    draft_revision bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by text NOT NULL,
    page_id uuid NOT NULL
);

--
-- Name: page_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE page_visits (
    id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    session_id uuid NOT NULL,
    load_key text NOT NULL,
    navigation_kind text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    CONSTRAINT page_visits_load_key_check CHECK ((length(btrim(load_key)) > 0)),
    CONSTRAINT page_visits_navigation_kind_check CHECK ((navigation_kind = ANY (ARRAY['load'::text, 'reload'::text, 'back_forward'::text, 'resume'::text]))),
    CONSTRAINT page_visits_opened_at_check CHECK (isfinite(opened_at))
);

--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    slug text NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    active_release_id uuid,
    entry_key text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    paused_at timestamp with time zone,
    pause_reason text,
    closed_at timestamp with time zone,
    CONSTRAINT pages_check CHECK (((entry_key = 'direct:shop'::text) OR (entry_key = ('direct:page:'::text || (id)::text)))),
    CONSTRAINT pages_closed_consistent CHECK (((state = 'closed'::text) = (closed_at IS NOT NULL))),
    CONSTRAINT pages_label_check CHECK (((length(label) <= 60) AND (label !~ '[[:cntrl:]<>]'::text))),
    CONSTRAINT pages_live_released CHECK (((state <> ALL (ARRAY['active'::text, 'paused'::text])) OR (active_release_id IS NOT NULL))),
    CONSTRAINT pages_pause_reason_check CHECK ((pause_reason = ANY (ARRAY['emergency'::text, 'admin'::text, 'billing'::text]))),
    CONSTRAINT pages_paused_consistent CHECK (((state = 'paused'::text) = ((paused_at IS NOT NULL) AND (pause_reason IS NOT NULL)))),
    CONSTRAINT pages_slug_check CHECK (((slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$'::text) AND (lower(slug) <> ALL (ARRAY['api'::text, 'zzz'::text, 't'::text, 'demo'::text, '_next'::text, 'preview'::text, 'owner'::text, 'gov'::text, 'profile'::text, 'password'::text, 'login'::text, 'logout'::text, 'setup'::text, 'notifications'::text])))),
    CONSTRAINT pages_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'closed'::text])))
);

--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE platform_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_salt text NOT NULL,
    password_key text NOT NULL,
    password_scheme text DEFAULT 'scrypt-131072-8-1'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    handle text,
    title text,
    totp_secret text,
    totp_enrolled_at timestamp with time zone,
    CONSTRAINT platform_admins_handle_check CHECK (((handle IS NULL) OR (handle ~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,31}$'::text))),
    CONSTRAINT platform_admins_password_key_check CHECK ((password_key ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT platform_admins_password_salt_check CHECK ((password_salt ~ '^[a-f0-9]{32}$'::text)),
    CONSTRAINT platform_admins_password_scheme_check CHECK ((password_scheme = 'scrypt-131072-8-1'::text)),
    CONSTRAINT platform_admins_title_check CHECK (((title IS NULL) OR (((char_length(title) >= 1) AND (char_length(title) <= 40)) AND (title = btrim(title)) AND (title !~ '[[:cntrl:]<>]'::text)))),
    CONSTRAINT platform_admins_totp_enrolled_at_check CHECK (isfinite(totp_enrolled_at)),
    CONSTRAINT platform_admins_totp_enrolled_needs_secret CHECK (((totp_enrolled_at IS NULL) OR (totp_secret IS NOT NULL))),
    CONSTRAINT platform_admins_totp_secret_check CHECK (((totp_secret ~ '^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'::text) AND ((length(totp_secret) >= 90) AND (length(totp_secret) <= 600)))),
    CONSTRAINT platform_admins_username_check CHECK ((username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'::text))
);

--
-- Name: preview_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE preview_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    template_version_id uuid NOT NULL,
    config_snapshot jsonb NOT NULL,
    source_release_id uuid,
    source_draft_revision bigint,
    tag_id uuid,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    page_id uuid NOT NULL,
    CONSTRAINT preview_sessions_check CHECK ((expires_at > created_at)),
    CONSTRAINT preview_sessions_check1 CHECK (((source_release_id IS NULL) <> (source_draft_revision IS NULL))),
    CONSTRAINT preview_sessions_expires_at_check CHECK (isfinite(expires_at)),
    CONSTRAINT preview_sessions_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);

--
-- Name: public_request_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public_request_limits (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT public_request_limits_attempts_check CHECK ((attempts > 0)),
    CONSTRAINT public_request_limits_bucket_check CHECK (((length(btrim(bucket)) >= 1) AND (length(btrim(bucket)) <= 128))),
    CONSTRAINT public_request_limits_window_start_check CHECK (isfinite(window_start))
);

--
-- Name: published_visit_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE published_visit_contexts (
    visit_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    session_id uuid NOT NULL,
    release_id uuid,
    tag_id uuid,
    preview_id uuid,
    CONSTRAINT published_visit_contexts_check CHECK ((((scope = 'live'::text) AND (release_id IS NOT NULL) AND (preview_id IS NULL)) OR ((scope = 'test'::text) AND (preview_id IS NOT NULL))))
);

--
-- Name: rating_experiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE rating_experiences (
    feedback_topic text,
    feedback_message text,
    feedback_submitted_at timestamp with time zone,
    feedback_updated_at timestamp with time zone,
    session_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    rating smallint,
    revision bigint NOT NULL,
    first_interaction_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    feedback_phone text,
    CONSTRAINT rating_experiences_check CHECK ((((feedback_topic IS NULL) AND (feedback_message IS NULL) AND (feedback_submitted_at IS NULL) AND (feedback_updated_at IS NULL)) OR ((feedback_topic IS NOT NULL) AND (feedback_message IS NOT NULL) AND (feedback_submitted_at IS NOT NULL) AND (feedback_updated_at IS NOT NULL) AND (feedback_updated_at >= feedback_submitted_at)))),
    CONSTRAINT rating_experiences_feedback_message_check CHECK (((char_length(feedback_message) >= 1) AND (char_length(feedback_message) <= 2000))),
    CONSTRAINT rating_experiences_feedback_phone_check CHECK ((feedback_phone ~ '^\+?[0-9]{8,15}$'::text)),
    CONSTRAINT rating_experiences_feedback_submitted_at_check CHECK (isfinite(feedback_submitted_at)),
    CONSTRAINT rating_experiences_feedback_topic_check CHECK ((feedback_topic ~ '^[a-z][a-z0-9_-]{0,31}$'::text)),
    CONSTRAINT rating_experiences_feedback_updated_at_check CHECK (isfinite(feedback_updated_at)),
    CONSTRAINT rating_experiences_first_interaction_at_check CHECK (isfinite(first_interaction_at)),
    CONSTRAINT rating_experiences_phone_with_feedback CHECK (((feedback_phone IS NULL) OR (feedback_message IS NOT NULL))),
    CONSTRAINT rating_experiences_rated_or_feedback CHECK (((rating IS NOT NULL) OR (feedback_message IS NOT NULL))),
    CONSTRAINT rating_experiences_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT rating_experiences_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT rating_experiences_updated_at_check CHECK (isfinite(updated_at))
);

--
-- Name: rating_intent_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE rating_intent_receipts (
    operation text DEFAULT 'rating'::text NOT NULL,
    feedback_topic text,
    feedback_message text,
    feedback_submitted_at timestamp with time zone,
    feedback_updated_at timestamp with time zone,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    session_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    intent_id text NOT NULL,
    expected_revision bigint NOT NULL,
    score smallint,
    applied_revision bigint NOT NULL,
    first_interaction_at timestamp with time zone NOT NULL,
    applied_at timestamp with time zone NOT NULL,
    feedback_phone text,
    CONSTRAINT rating_intent_receipts_applied_at_check CHECK (isfinite(applied_at)),
    CONSTRAINT rating_intent_receipts_check CHECK ((((feedback_topic IS NULL) AND (feedback_message IS NULL) AND (feedback_submitted_at IS NULL) AND (feedback_updated_at IS NULL)) OR ((feedback_topic IS NOT NULL) AND (feedback_message IS NOT NULL) AND (feedback_submitted_at IS NOT NULL) AND (feedback_updated_at IS NOT NULL) AND (feedback_updated_at >= feedback_submitted_at)))),
    CONSTRAINT rating_intent_receipts_check1 CHECK (((operation <> 'feedback'::text) OR (feedback_topic IS NOT NULL))),
    CONSTRAINT rating_intent_receipts_check2 CHECK ((applied_revision = (expected_revision + 1))),
    CONSTRAINT rating_intent_receipts_expected_revision_check CHECK (((expected_revision >= 0) AND (expected_revision <= '9007199254740990'::bigint))),
    CONSTRAINT rating_intent_receipts_feedback_message_check CHECK (((char_length(feedback_message) >= 1) AND (char_length(feedback_message) <= 2000))),
    CONSTRAINT rating_intent_receipts_feedback_phone_check CHECK ((feedback_phone ~ '^\+?[0-9]{8,15}$'::text)),
    CONSTRAINT rating_intent_receipts_feedback_submitted_at_check CHECK (isfinite(feedback_submitted_at)),
    CONSTRAINT rating_intent_receipts_feedback_topic_check CHECK ((feedback_topic ~ '^[a-z][a-z0-9_-]{0,31}$'::text)),
    CONSTRAINT rating_intent_receipts_feedback_updated_at_check CHECK (isfinite(feedback_updated_at)),
    CONSTRAINT rating_intent_receipts_first_interaction_at_check CHECK (isfinite(first_interaction_at)),
    CONSTRAINT rating_intent_receipts_intent_id_check CHECK ((length(btrim(intent_id)) > 0)),
    CONSTRAINT rating_intent_receipts_operation_check CHECK ((operation = ANY (ARRAY['rating'::text, 'feedback'::text]))),
    CONSTRAINT rating_intent_receipts_phone_with_feedback CHECK (((feedback_phone IS NULL) OR (feedback_message IS NOT NULL))),
    CONSTRAINT rating_intent_receipts_rating_has_score CHECK (((operation <> 'rating'::text) OR (score IS NOT NULL))),
    CONSTRAINT rating_intent_receipts_score_check CHECK (((score >= 1) AND (score <= 5)))
);

--
-- Name: server_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE server_signals (
    kind text NOT NULL,
    code text NOT NULL,
    day date NOT NULL,
    count bigint NOT NULL,
    first_at timestamp with time zone NOT NULL,
    last_at timestamp with time zone NOT NULL,
    CONSTRAINT server_signals_check CHECK ((last_at >= first_at)),
    CONSTRAINT server_signals_code_check CHECK ((((length(code) >= 1) AND (length(code) <= 200)) AND (code ~ '^[A-Za-z0-9_ ?-]+$'::text))),
    CONSTRAINT server_signals_count_check CHECK ((count > 0)),
    CONSTRAINT server_signals_kind_check CHECK ((kind = ANY (ARRAY['unexpected'::text, 'csp'::text, 'guest_refused'::text])))
);

--
-- Name: session_initial_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE session_initial_contexts (
    session_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    visit_id uuid NOT NULL
);

--
-- Name: shop_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE shop_activity (
    id bigint NOT NULL,
    shop_id uuid NOT NULL,
    actor_kind text NOT NULL,
    actor_id uuid NOT NULL,
    actor_handle text NOT NULL,
    action text NOT NULL,
    target text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    search text NOT NULL,
    at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT shop_activity_action_check CHECK ((action ~ '^[a-z][a-z_.]{2,40}$'::text)),
    CONSTRAINT shop_activity_actor_handle_check CHECK (((char_length(actor_handle) >= 1) AND (char_length(actor_handle) <= 64))),
    CONSTRAINT shop_activity_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['member'::text, 'admin'::text]))),
    CONSTRAINT shop_activity_detail_check CHECK ((jsonb_typeof(detail) = 'object'::text)),
    CONSTRAINT shop_activity_search_check CHECK ((char_length(search) <= 2000)),
    CONSTRAINT shop_activity_target_check CHECK (((target IS NULL) OR (char_length(target) <= 200)))
);

--
-- Name: shop_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE shop_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME shop_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: shop_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE shop_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name text NOT NULL,
    icon text,
    color text DEFAULT '#5a6d62'::text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT shop_roles_color_check CHECK ((color ~ '^#[0-9a-f]{6}$'::text)),
    CONSTRAINT shop_roles_icon_check CHECK (((icon IS NULL) OR (((char_length(icon) >= 1) AND (char_length(icon) <= 8)) AND (icon !~ '[[:cntrl:][:space:]<>]'::text)))),
    CONSTRAINT shop_roles_name_check CHECK ((((char_length(name) >= 1) AND (char_length(name) <= 30)) AND (name = btrim(name)) AND (name !~ '[[:cntrl:]<>]'::text))),
    CONSTRAINT shop_roles_permissions_check CHECK ((permissions <@ ARRAY['feedback'::text, 'design'::text, 'cards'::text, 'members'::text, 'activity'::text, 'export'::text])),
    CONSTRAINT shop_roles_position_check CHECK ((("position" >= 0) AND ("position" <= 1000)))
);

--
-- Name: shop_support_grant_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE shop_support_grant_events (
    id bigint NOT NULL,
    shop_id uuid NOT NULL,
    permission text NOT NULL,
    enabled boolean NOT NULL,
    actor_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    level text,
    CONSTRAINT shop_support_grant_events_level_check CHECK ((level = ANY (ARRAY['off'::text, 'view'::text, 'edit'::text, 'full'::text]))),
    CONSTRAINT shop_support_grant_events_level_rows CHECK ((((permission = 'level'::text) = (level IS NOT NULL)) AND ((permission <> 'level'::text) OR (enabled = (level <> 'off'::text))))),
    CONSTRAINT shop_support_grant_events_permission_check CHECK ((permission = ANY (ARRAY['feedback'::text, 'level'::text])))
);

--
-- Name: shop_support_grant_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE shop_support_grant_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME shop_support_grant_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE shops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    google_url text,
    publishing_state text DEFAULT 'draft'::text NOT NULL,
    is_template boolean DEFAULT false NOT NULL,
    self_signup boolean DEFAULT false NOT NULL,
    business_kind text,
    place_id text,
    google_address text,
    onboarding_template text,
    onboarding_dashboard_at timestamp with time zone,
    onboarded_at timestamp with time zone,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    plan text,
    paid_until date,
    CONSTRAINT shops_plan_check CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['basic'::text, 'events'::text, 'team'::text])))),
    CONSTRAINT shops_paid_until_needs_plan CHECK (((paid_until IS NULL) OR (plan IS NOT NULL))),
    CONSTRAINT shops_profile_check CHECK (((jsonb_typeof(profile) = 'object'::text) AND (octet_length((profile)::text) <= 8192))),
    CONSTRAINT shops_business_kind_check CHECK (((business_kind IS NULL) OR (business_kind = ANY (ARRAY['cafe'::text, 'restaurant'::text, 'tea'::text, 'beauty'::text, 'retail'::text, 'other'::text])))),
    CONSTRAINT shops_place_id_check CHECK (((place_id IS NULL) OR ((char_length(place_id) >= 10) AND (char_length(place_id) <= 300) AND (place_id ~ '^[A-Za-z0-9_-]+$'::text)))),
    CONSTRAINT shops_google_address_check CHECK (((google_address IS NULL) OR ((char_length(google_address) <= 300) AND (google_address !~ '[[:cntrl:]<>]'::text)))),
    CONSTRAINT shops_onboarding_template_check CHECK (((onboarding_template IS NULL) OR (onboarding_template = ANY (ARRAY['done'::text, 'skipped'::text])))),
    CONSTRAINT shops_account_routes_reserved CHECK ((lower(slug) <> ALL (ARRAY['profile'::text, 'password'::text, 'login'::text, 'logout'::text, 'setup'::text, 'notifications'::text]))),
    CONSTRAINT shops_gov_reserved CHECK ((lower(slug) <> 'gov'::text)),
    CONSTRAINT shops_owner_reserved CHECK ((lower(slug) <> 'owner'::text)),
    CONSTRAINT shops_preview_reserved CHECK ((lower(slug) <> 'preview'::text)),
    CONSTRAINT shops_publishing_state_check CHECK ((publishing_state = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text]))),
    CONSTRAINT shops_slug_check CHECK (((slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$'::text) AND (lower(slug) <> ALL (ARRAY['api'::text, 'zzz'::text, 't'::text, 'demo'::text, '_next'::text, 'app'::text, 'pricing'::text, 'templates'::text, 'bat-dau'::text, 'thu'::text]))))
);

--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    public_code text NOT NULL,
    state text DEFAULT 'prepared'::text NOT NULL,
    location_label text DEFAULT ''::text NOT NULL,
    page_id uuid NOT NULL,
    CONSTRAINT tags_public_code_check CHECK (((public_code ~ '^[a-zA-Z0-9_-]{5,64}$'::text) AND (lower(public_code) <> 'demo'::text))),
    CONSTRAINT tags_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'tested'::text, 'active'::text, 'disabled'::text])))
);

--
-- Name: template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE template_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    version integer NOT NULL,
    schema_version integer NOT NULL,
    renderer_version text NOT NULL,
    capabilities jsonb NOT NULL,
    CONSTRAINT template_versions_capabilities_check CHECK ((jsonb_typeof(capabilities) = 'array'::text)),
    CONSTRAINT template_versions_renderer_version_check CHECK ((renderer_version = '1'::text)),
    CONSTRAINT template_versions_schema_version_check CHECK ((schema_version = 1)),
    CONSTRAINT template_versions_version_check CHECK ((version > 0))
);

--
-- Name: visit_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE visit_sessions (
    id uuid NOT NULL,
    sequence bigint NOT NULL,
    shop_id uuid NOT NULL,
    scope text NOT NULL,
    entry_key text NOT NULL,
    browser_hash text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    last_activity timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    suspected_at timestamp with time zone,
    suspected_reason text,
    CONSTRAINT visit_sessions_browser_hash_check CHECK ((browser_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT visit_sessions_check CHECK ((isfinite(last_activity) AND (last_activity >= started_at))),
    CONSTRAINT visit_sessions_check1 CHECK ((isfinite(closed_at) AND (closed_at >= last_activity))),
    CONSTRAINT visit_sessions_entry_key_check CHECK (((length(btrim(entry_key)) >= 1) AND (length(btrim(entry_key)) <= 128))),
    CONSTRAINT visit_sessions_scope_check CHECK ((scope = ANY (ARRAY['live'::text, 'test'::text]))),
    CONSTRAINT visit_sessions_started_at_check CHECK (isfinite(started_at)),
    CONSTRAINT visit_sessions_suspected_at_check CHECK (isfinite(suspected_at)),
    CONSTRAINT visit_sessions_suspected_pair CHECK (((suspected_at IS NULL) = (suspected_reason IS NULL))),
    CONSTRAINT visit_sessions_suspected_reason_check CHECK ((suspected_reason ~ '^[a-z][a-z0-9_]{0,31}$'::text))
);

--
-- Name: visit_sessions_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE visit_sessions ALTER COLUMN sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME visit_sessions_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: admin_audit admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_audit
    ADD CONSTRAINT admin_audit_pkey PRIMARY KEY (id);

--
-- Name: admin_auth_sessions admin_auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_auth_sessions
    ADD CONSTRAINT admin_auth_sessions_pkey PRIMARY KEY (token_hash);

--
-- Name: admin_backup_codes admin_backup_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_backup_codes
    ADD CONSTRAINT admin_backup_codes_pkey PRIMARY KEY (code_hash);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_pkey PRIMARY KEY (id);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_token_hash_key UNIQUE (token_hash);

--
-- Name: admin_login_limits admin_login_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_login_limits
    ADD CONSTRAINT admin_login_limits_pkey PRIMARY KEY (bucket);

--
-- Name: admin_totp_steps admin_totp_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_totp_steps
    ADD CONSTRAINT admin_totp_steps_pkey PRIMARY KEY (admin_id, step);

--
-- Name: experience_origin_contexts experience_origin_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY experience_origin_contexts
    ADD CONSTRAINT experience_origin_contexts_pkey PRIMARY KEY (session_id);

--
-- Name: feedback_comment_likes feedback_comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comment_likes
    ADD CONSTRAINT feedback_comment_likes_pkey PRIMARY KEY (comment_id, liker_kind, liker_id);

--
-- Name: feedback_comment_revisions feedback_comment_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comment_revisions
    ADD CONSTRAINT feedback_comment_revisions_pkey PRIMARY KEY (id);

--
-- Name: feedback_comments feedback_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comments
    ADD CONSTRAINT feedback_comments_pkey PRIMARY KEY (id);

--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);

--
-- Name: media_assets media_assets_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_assets
    ADD CONSTRAINT media_assets_url_key UNIQUE (url);

--
-- Name: owner_auth_sessions_v2 owner_auth_sessions_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_auth_sessions_v2
    ADD CONSTRAINT owner_auth_sessions_v2_pkey PRIMARY KEY (token_hash);

--
-- Name: owner_feedback_audit owner_feedback_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_audit
    ADD CONSTRAINT owner_feedback_audit_pkey PRIMARY KEY (id);

--
-- Name: owner_feedback_audit owner_feedback_audit_shop_id_session_id_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_audit
    ADD CONSTRAINT owner_feedback_audit_shop_id_session_id_revision_key UNIQUE (shop_id, session_id, revision);

--
-- Name: owner_feedback_cases owner_feedback_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_cases
    ADD CONSTRAINT owner_feedback_cases_pkey PRIMARY KEY (session_id);

--
-- Name: owner_feedback_cases owner_feedback_cases_shop_id_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_cases
    ADD CONSTRAINT owner_feedback_cases_shop_id_session_id_key UNIQUE (shop_id, session_id);

--
-- Name: owner_identities_v2 owner_identities_v2_google_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_identities_v2
    ADD CONSTRAINT owner_identities_v2_google_sub_key UNIQUE (google_sub);

--
-- Name: owner_identities_v2 owner_identities_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_identities_v2
    ADD CONSTRAINT owner_identities_v2_pkey PRIMARY KEY (id);

--
-- Name: owner_identities_v2 owner_identities_v2_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_identities_v2
    ADD CONSTRAINT owner_identities_v2_username_key UNIQUE (username);

--
-- Name: owner_login_limits owner_login_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_login_limits
    ADD CONSTRAINT owner_login_limits_pkey PRIMARY KEY (bucket);

--
-- Name: owner_memberships_v2 owner_memberships_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_memberships_v2
    ADD CONSTRAINT owner_memberships_v2_pkey PRIMARY KEY (user_id, shop_id);

--
-- Name: owner_notifications owner_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_pkey PRIMARY KEY (id);

--
-- Name: owner_notifications owner_notifications_user_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_user_id_comment_id_key UNIQUE (user_id, comment_id);

--
-- Name: owner_setup_tokens owner_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_setup_tokens
    ADD CONSTRAINT owner_setup_tokens_pkey PRIMARY KEY (token_hash);

--
-- Name: page_drafts page_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_drafts
    ADD CONSTRAINT page_drafts_pkey PRIMARY KEY (page_id);

--
-- Name: page_events page_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_events
    ADD CONSTRAINT page_events_pkey PRIMARY KEY (id);

--
-- Name: page_incidents page_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_incidents
    ADD CONSTRAINT page_incidents_pkey PRIMARY KEY (id);

--
-- Name: page_releases page_releases_page_id_draft_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_page_id_draft_revision_key UNIQUE (page_id, draft_revision);

--
-- Name: page_releases page_releases_page_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_page_id_id_key UNIQUE (page_id, id);

--
-- Name: page_releases page_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_pkey PRIMARY KEY (id);

--
-- Name: page_releases page_releases_shop_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_shop_id_id_key UNIQUE (shop_id, id);

--
-- Name: page_visits page_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_visits
    ADD CONSTRAINT page_visits_pkey PRIMARY KEY (id);

--
-- Name: page_visits page_visits_shop_id_scope_entry_key_load_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_visits
    ADD CONSTRAINT page_visits_shop_id_scope_entry_key_load_key_key UNIQUE (shop_id, scope, entry_key, load_key);

--
-- Name: page_visits page_visits_shop_id_scope_entry_key_session_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_visits
    ADD CONSTRAINT page_visits_shop_id_scope_entry_key_session_id_id_key UNIQUE (shop_id, scope, entry_key, session_id, id);

--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);

--
-- Name: pages pages_shop_id_entry_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pages
    ADD CONSTRAINT pages_shop_id_entry_key_key UNIQUE (shop_id, entry_key);

--
-- Name: pages pages_shop_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pages
    ADD CONSTRAINT pages_shop_id_id_key UNIQUE (shop_id, id);

--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);

--
-- Name: platform_admins platform_admins_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY platform_admins
    ADD CONSTRAINT platform_admins_username_key UNIQUE (username);

--
-- Name: preview_sessions preview_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_pkey PRIMARY KEY (id);

--
-- Name: preview_sessions preview_sessions_shop_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_shop_id_id_key UNIQUE (shop_id, id);

--
-- Name: preview_sessions preview_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_token_hash_key UNIQUE (token_hash);

--
-- Name: public_request_limits public_request_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public_request_limits
    ADD CONSTRAINT public_request_limits_pkey PRIMARY KEY (bucket);

--
-- Name: published_visit_contexts published_visit_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_pkey PRIMARY KEY (visit_id);

--
-- Name: published_visit_contexts published_visit_contexts_shop_id_scope_entry_key_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_shop_id_scope_entry_key_session_id_key UNIQUE (shop_id, scope, entry_key, session_id, visit_id);

--
-- Name: rating_experiences rating_experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_experiences
    ADD CONSTRAINT rating_experiences_pkey PRIMARY KEY (session_id);

--
-- Name: rating_experiences rating_experiences_shop_id_scope_entry_key_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_experiences
    ADD CONSTRAINT rating_experiences_shop_id_scope_entry_key_session_id_key UNIQUE (shop_id, scope, entry_key, session_id);

--
-- Name: rating_intent_receipts rating_intent_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_intent_receipts
    ADD CONSTRAINT rating_intent_receipts_pkey PRIMARY KEY (shop_id, scope, entry_key, session_id, intent_id);

--
-- Name: rating_intent_receipts rating_intent_receipts_shop_id_scope_entry_key_session_id_a_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_intent_receipts
    ADD CONSTRAINT rating_intent_receipts_shop_id_scope_entry_key_session_id_a_key UNIQUE (shop_id, scope, entry_key, session_id, applied_revision);

--
-- Name: server_signals server_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY server_signals
    ADD CONSTRAINT server_signals_pkey PRIMARY KEY (kind, code, day);

--
-- Name: session_initial_contexts session_initial_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY session_initial_contexts
    ADD CONSTRAINT session_initial_contexts_pkey PRIMARY KEY (session_id);

--
-- Name: shop_activity shop_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_activity
    ADD CONSTRAINT shop_activity_pkey PRIMARY KEY (id);

--
-- Name: shop_roles shop_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_roles
    ADD CONSTRAINT shop_roles_pkey PRIMARY KEY (id);

--
-- Name: shop_support_grant_events shop_support_grant_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_support_grant_events
    ADD CONSTRAINT shop_support_grant_events_pkey PRIMARY KEY (id);

--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);

--
-- Name: shops shops_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shops
    ADD CONSTRAINT shops_slug_key UNIQUE (slug);

--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

--
-- Name: tags tags_public_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_public_code_key UNIQUE (public_code);

--
-- Name: tags tags_shop_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_shop_id_id_key UNIQUE (shop_id, id);

--
-- Name: template_versions template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY template_versions
    ADD CONSTRAINT template_versions_pkey PRIMARY KEY (id);

--
-- Name: template_versions template_versions_template_key_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY template_versions
    ADD CONSTRAINT template_versions_template_key_version_key UNIQUE (template_key, version);

--
-- Name: visit_sessions visit_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY visit_sessions
    ADD CONSTRAINT visit_sessions_pkey PRIMARY KEY (id);

--
-- Name: visit_sessions visit_sessions_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY visit_sessions
    ADD CONSTRAINT visit_sessions_sequence_key UNIQUE (sequence);

--
-- Name: visit_sessions visit_sessions_shop_id_scope_entry_key_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY visit_sessions
    ADD CONSTRAINT visit_sessions_shop_id_scope_entry_key_id_key UNIQUE (shop_id, scope, entry_key, id);

--
-- Name: admin_audit_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_actor ON admin_audit USING btree (actor_id, recorded_at DESC);

--
-- Name: admin_audit_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_shop ON admin_audit USING btree (shop_id, recorded_at DESC);

--
-- Name: admin_auth_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_auth_admin ON admin_auth_sessions USING btree (admin_id);

--
-- Name: admin_backup_codes_unused; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_backup_codes_unused ON admin_backup_codes USING btree (admin_id) WHERE (used_at IS NULL);

--
-- Name: admin_impersonation_one_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX admin_impersonation_one_live ON admin_impersonation_sessions USING btree (admin_id) WHERE (ended_at IS NULL);

--
-- Name: admin_impersonation_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_impersonation_shop ON admin_impersonation_sessions USING btree (shop_id, created_at DESC);

--
-- Name: feedback_comments_one_pin; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX feedback_comments_one_pin ON feedback_comments USING btree (session_id) WHERE ((pinned_at IS NOT NULL) AND (deleted_at IS NULL));

--
-- Name: feedback_comments_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_comments_thread ON feedback_comments USING btree (session_id, created_at);

--
-- Name: media_assets_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_pending ON media_assets USING btree (created_at) WHERE (state = 'pending'::text);

--
-- Name: media_assets_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_shop ON media_assets USING btree (shop_id, created_at DESC);

--
-- Name: owner_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_auth_user ON owner_auth_sessions_v2 USING btree (user_id);

--
-- Name: owner_dashboard_experiences; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_dashboard_experiences ON rating_experiences USING btree (shop_id, scope, first_interaction_at DESC, session_id DESC);

--
-- Name: owner_dashboard_receipts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_dashboard_receipts ON rating_intent_receipts USING btree (shop_id, scope, applied_at, session_id, applied_revision);

--
-- Name: owner_dashboard_visits_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_dashboard_visits_session ON page_visits USING btree (shop_id, scope, session_id);

--
-- Name: owner_identity_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX owner_identity_email ON owner_identities_v2 USING btree (email) WHERE (email IS NOT NULL);

--
-- Name: owner_notifications_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_notifications_inbox ON owner_notifications USING btree (user_id, created_at DESC);

--
-- Name: owner_setup_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_setup_open ON owner_setup_tokens USING btree (user_id, purpose) WHERE ((used_at IS NULL) AND (superseded_at IS NULL));

--
-- Name: page_events_shop_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_events_shop_time ON page_events USING btree (shop_id, at DESC);

--
-- Name: page_events_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_events_time ON page_events USING btree (at);

--
-- Name: page_incidents_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_incidents_open ON page_incidents USING btree (created_at) WHERE (state = 'open'::text);

--
-- Name: page_incidents_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_incidents_page ON page_incidents USING btree (page_id, created_at DESC);

--
-- Name: page_visits_shop_scope_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_visits_shop_scope_time ON page_visits USING btree (shop_id, scope, opened_at DESC, id);

--
-- Name: pages_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_shop ON pages USING btree (shop_id, created_at, id);

--
-- Name: pages_slug_folded; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pages_slug_folded ON pages USING btree (lower(slug));

--
-- Name: platform_admin_handle; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_admin_handle ON platform_admins USING btree (lower(handle)) WHERE (handle IS NOT NULL);

--
-- Name: server_signals_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX server_signals_day ON server_signals USING btree (day);

--
-- Name: shop_activity_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_activity_actor ON shop_activity USING btree (shop_id, actor_id, at DESC);

--
-- Name: shop_activity_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_activity_recent ON shop_activity USING btree (shop_id, at DESC, id DESC);

--
-- Name: shop_role_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shop_role_name ON shop_roles USING btree (shop_id, lower(name));

--
-- Name: shop_role_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_role_shop ON shop_roles USING btree (shop_id, "position");

--
-- Name: shop_support_grant_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_support_grant_latest ON shop_support_grant_events USING btree (shop_id, permission, id DESC);

--
-- Name: shops_one_template; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shops_one_template ON shops USING btree (is_template) WHERE is_template;

--
-- Name: shops_slug_folded; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shops_slug_folded ON shops USING btree (lower(slug));

--
-- Name: tags_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_page ON tags USING btree (page_id);

--
-- Name: visit_sessions_browser_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_sessions_browser_latest ON visit_sessions USING btree (shop_id, scope, entry_key, browser_hash, sequence DESC);

--
-- Name: visit_sessions_one_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visit_sessions_one_current ON visit_sessions USING btree (shop_id, scope, entry_key, browser_hash) WHERE (closed_at IS NULL);

--
-- Name: visit_sessions_suspected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_sessions_suspected ON visit_sessions USING btree (shop_id, scope) WHERE (suspected_at IS NOT NULL);

--
-- Name: admin_audit admin_audit_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_audit_immutable BEFORE DELETE OR UPDATE ON admin_audit FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: admin_impersonation_sessions admin_impersonation_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_impersonation_immutable BEFORE DELETE OR UPDATE ON admin_impersonation_sessions FOR EACH ROW EXECUTE FUNCTION admin_impersonation_guard();

--
-- Name: experience_origin_contexts experience_context_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER experience_context_immutable BEFORE DELETE OR UPDATE ON experience_origin_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: feedback_comment_revisions feedback_comment_revisions_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER feedback_comment_revisions_append_only BEFORE DELETE OR UPDATE ON feedback_comment_revisions FOR EACH ROW EXECUTE FUNCTION feedback_comment_revisions_append_only();

--
-- Name: owner_feedback_audit owner_audit_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER owner_audit_immutable BEFORE DELETE OR UPDATE ON owner_feedback_audit FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: page_events page_events_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER page_events_no_update BEFORE UPDATE ON page_events FOR EACH ROW EXECUTE FUNCTION page_events_append_only();

--
-- Name: pages pages_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pages_identity BEFORE DELETE OR UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION page_identity();

--
-- Name: preview_sessions preview_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER preview_immutable BEFORE DELETE OR UPDATE ON preview_sessions FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: rating_intent_receipts receipt_erase_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receipt_erase_only BEFORE DELETE OR UPDATE ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION erase_only();

--
-- Name: page_releases release_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER release_immutable BEFORE DELETE OR UPDATE ON page_releases FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: session_initial_contexts session_context_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_context_immutable BEFORE DELETE OR UPDATE ON session_initial_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: shop_activity shop_activity_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shop_activity_append_only BEFORE DELETE OR UPDATE ON shop_activity FOR EACH ROW EXECUTE FUNCTION shop_activity_append_only();

--
-- Name: shop_support_grant_events shop_support_grant_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shop_support_grant_immutable BEFORE DELETE OR UPDATE ON shop_support_grant_events FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: tags tags_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tags_transition BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION tag_transition();

--
-- Name: template_versions template_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER template_immutable BEFORE DELETE OR UPDATE ON template_versions FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: published_visit_contexts visit_context_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visit_context_immutable BEFORE DELETE OR UPDATE ON published_visit_contexts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();

--
-- Name: admin_audit admin_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_audit
    ADD CONSTRAINT admin_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES platform_admins(id);

--
-- Name: admin_audit admin_audit_on_behalf_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_audit
    ADD CONSTRAINT admin_audit_on_behalf_of_fkey FOREIGN KEY (on_behalf_of) REFERENCES owner_identities_v2(id);

--
-- Name: admin_audit admin_audit_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_audit
    ADD CONSTRAINT admin_audit_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: admin_auth_sessions admin_auth_sessions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_auth_sessions
    ADD CONSTRAINT admin_auth_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id);

--
-- Name: admin_backup_codes admin_backup_codes_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_backup_codes
    ADD CONSTRAINT admin_backup_codes_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_admin_session_hash_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_admin_session_hash_fkey FOREIGN KEY (admin_session_hash) REFERENCES admin_auth_sessions(token_hash);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES owner_identities_v2(id);

--
-- Name: admin_impersonation_sessions admin_impersonation_sessions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_impersonation_sessions
    ADD CONSTRAINT admin_impersonation_sessions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: admin_totp_steps admin_totp_steps_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY admin_totp_steps
    ADD CONSTRAINT admin_totp_steps_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id);

--
-- Name: experience_origin_contexts experience_origin_contexts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY experience_origin_contexts
    ADD CONSTRAINT experience_origin_contexts_session_id_fkey FOREIGN KEY (session_id) REFERENCES rating_experiences(session_id);

--
-- Name: experience_origin_contexts experience_origin_contexts_shop_id_scope_entry_key_session_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY experience_origin_contexts
    ADD CONSTRAINT experience_origin_contexts_shop_id_scope_entry_key_session_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id, visit_id) REFERENCES published_visit_contexts(shop_id, scope, entry_key, session_id, visit_id);

--
-- Name: feedback_comment_likes feedback_comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comment_likes
    ADD CONSTRAINT feedback_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES feedback_comments(id);

--
-- Name: feedback_comment_revisions feedback_comment_revisions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comment_revisions
    ADD CONSTRAINT feedback_comment_revisions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES feedback_comments(id);

--
-- Name: feedback_comments feedback_comments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comments
    ADD CONSTRAINT feedback_comments_session_id_fkey FOREIGN KEY (session_id) REFERENCES rating_experiences(session_id);

--
-- Name: feedback_comments feedback_comments_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedback_comments
    ADD CONSTRAINT feedback_comments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: media_assets media_assets_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_assets
    ADD CONSTRAINT media_assets_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: owner_auth_sessions_v2 owner_auth_sessions_v2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_auth_sessions_v2
    ADD CONSTRAINT owner_auth_sessions_v2_user_id_fkey FOREIGN KEY (user_id) REFERENCES owner_identities_v2(id);

--
-- Name: owner_feedback_audit owner_feedback_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_audit
    ADD CONSTRAINT owner_feedback_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES owner_identities_v2(id);

--
-- Name: owner_feedback_audit owner_feedback_audit_shop_id_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_audit
    ADD CONSTRAINT owner_feedback_audit_shop_id_session_id_fkey FOREIGN KEY (shop_id, session_id) REFERENCES owner_feedback_cases(shop_id, session_id);

--
-- Name: owner_feedback_cases owner_feedback_cases_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_cases
    ADD CONSTRAINT owner_feedback_cases_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES owner_identities_v2(id);

--
-- Name: owner_feedback_cases owner_feedback_cases_shop_id_scope_entry_key_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_feedback_cases
    ADD CONSTRAINT owner_feedback_cases_shop_id_scope_entry_key_session_id_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id) REFERENCES rating_experiences(shop_id, scope, entry_key, session_id);

--
-- Name: owner_memberships_v2 owner_memberships_v2_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_memberships_v2
    ADD CONSTRAINT owner_memberships_v2_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES owner_identities_v2(id);

--
-- Name: owner_memberships_v2 owner_memberships_v2_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_memberships_v2
    ADD CONSTRAINT owner_memberships_v2_role_id_fkey FOREIGN KEY (role_id) REFERENCES shop_roles(id);

--
-- Name: owner_memberships_v2 owner_memberships_v2_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_memberships_v2
    ADD CONSTRAINT owner_memberships_v2_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: owner_memberships_v2 owner_memberships_v2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_memberships_v2
    ADD CONSTRAINT owner_memberships_v2_user_id_fkey FOREIGN KEY (user_id) REFERENCES owner_identities_v2(id);

--
-- Name: owner_notifications owner_notifications_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES feedback_comments(id);

--
-- Name: owner_notifications owner_notifications_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_session_id_fkey FOREIGN KEY (session_id) REFERENCES rating_experiences(session_id);

--
-- Name: owner_notifications owner_notifications_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: owner_notifications owner_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_notifications
    ADD CONSTRAINT owner_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES owner_identities_v2(id);

--
-- Name: owner_setup_tokens owner_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY owner_setup_tokens
    ADD CONSTRAINT owner_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES owner_identities_v2(id);

--
-- Name: page_drafts page_drafts_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_drafts
    ADD CONSTRAINT page_drafts_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: page_drafts page_drafts_shop_id_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_drafts
    ADD CONSTRAINT page_drafts_shop_id_page_id_fkey FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id);

--
-- Name: page_drafts page_drafts_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_drafts
    ADD CONSTRAINT page_drafts_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES template_versions(id);

--
-- Name: page_incidents page_incidents_shop_id_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_incidents
    ADD CONSTRAINT page_incidents_shop_id_page_id_fkey FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id);

--
-- Name: page_releases page_releases_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: page_releases page_releases_shop_id_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_shop_id_page_id_fkey FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id);

--
-- Name: page_releases page_releases_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_releases
    ADD CONSTRAINT page_releases_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES template_versions(id);

--
-- Name: page_visits page_visits_shop_id_scope_entry_key_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY page_visits
    ADD CONSTRAINT page_visits_shop_id_scope_entry_key_session_id_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id) REFERENCES visit_sessions(shop_id, scope, entry_key, id);

--
-- Name: pages pages_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pages
    ADD CONSTRAINT pages_release_fk FOREIGN KEY (id, active_release_id) REFERENCES page_releases(page_id, id);

--
-- Name: pages pages_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pages
    ADD CONSTRAINT pages_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: preview_sessions preview_sessions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: preview_sessions preview_sessions_shop_id_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_shop_id_page_id_fkey FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id);

--
-- Name: preview_sessions preview_sessions_shop_id_source_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_shop_id_source_release_id_fkey FOREIGN KEY (shop_id, source_release_id) REFERENCES page_releases(shop_id, id);

--
-- Name: preview_sessions preview_sessions_shop_id_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_shop_id_tag_id_fkey FOREIGN KEY (shop_id, tag_id) REFERENCES tags(shop_id, id);

--
-- Name: preview_sessions preview_sessions_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY preview_sessions
    ADD CONSTRAINT preview_sessions_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES template_versions(id);

--
-- Name: published_visit_contexts published_visit_contexts_shop_id_preview_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_shop_id_preview_id_fkey FOREIGN KEY (shop_id, preview_id) REFERENCES preview_sessions(shop_id, id);

--
-- Name: published_visit_contexts published_visit_contexts_shop_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_shop_id_release_id_fkey FOREIGN KEY (shop_id, release_id) REFERENCES page_releases(shop_id, id);

--
-- Name: published_visit_contexts published_visit_contexts_shop_id_scope_entry_key_session_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_shop_id_scope_entry_key_session_i_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id, visit_id) REFERENCES page_visits(shop_id, scope, entry_key, session_id, id);

--
-- Name: published_visit_contexts published_visit_contexts_shop_id_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY published_visit_contexts
    ADD CONSTRAINT published_visit_contexts_shop_id_tag_id_fkey FOREIGN KEY (shop_id, tag_id) REFERENCES tags(shop_id, id);

--
-- Name: rating_experiences rating_experiences_shop_id_scope_entry_key_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_experiences
    ADD CONSTRAINT rating_experiences_shop_id_scope_entry_key_session_id_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id) REFERENCES visit_sessions(shop_id, scope, entry_key, id);

--
-- Name: rating_intent_receipts rating_intent_receipts_shop_id_scope_entry_key_session_id__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_intent_receipts
    ADD CONSTRAINT rating_intent_receipts_shop_id_scope_entry_key_session_id__fkey FOREIGN KEY (shop_id, scope, entry_key, session_id, visit_id) REFERENCES page_visits(shop_id, scope, entry_key, session_id, id);

--
-- Name: rating_intent_receipts rating_intent_receipts_shop_id_scope_entry_key_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY rating_intent_receipts
    ADD CONSTRAINT rating_intent_receipts_shop_id_scope_entry_key_session_id_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id) REFERENCES rating_experiences(shop_id, scope, entry_key, session_id);

--
-- Name: session_initial_contexts session_initial_contexts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY session_initial_contexts
    ADD CONSTRAINT session_initial_contexts_session_id_fkey FOREIGN KEY (session_id) REFERENCES visit_sessions(id);

--
-- Name: session_initial_contexts session_initial_contexts_shop_id_scope_entry_key_session_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY session_initial_contexts
    ADD CONSTRAINT session_initial_contexts_shop_id_scope_entry_key_session_i_fkey FOREIGN KEY (shop_id, scope, entry_key, session_id, visit_id) REFERENCES published_visit_contexts(shop_id, scope, entry_key, session_id, visit_id);

--
-- Name: shop_activity shop_activity_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_activity
    ADD CONSTRAINT shop_activity_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: shop_roles shop_roles_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_roles
    ADD CONSTRAINT shop_roles_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: shop_support_grant_events shop_support_grant_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_support_grant_events
    ADD CONSTRAINT shop_support_grant_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES owner_identities_v2(id);

--
-- Name: shop_support_grant_events shop_support_grant_events_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY shop_support_grant_events
    ADD CONSTRAINT shop_support_grant_events_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: tags tags_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- Name: tags tags_shop_id_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_shop_id_page_id_fkey FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id);

--
-- Name: visit_sessions visit_sessions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY visit_sessions
    ADD CONSTRAINT visit_sessions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);

--
-- PostgreSQL database dump complete
--

--
-- Đợt ① (05/10/2026): kết nối Google Business của quán và đánh giá Google đã đồng bộ (rieng/google-api.md).
-- `mode='google'`: Business Profile APIs (khi Google cấp quyền). `mode='maps'`: quán tự dán link Google Maps của mình
-- (`maps_url`); tool theo dõi đánh giá chạy trên máy Tài hỏi máy chủ quán nào cần đọc (`requested_at` chủ quán yêu cầu,
-- `handed_at` đã giao cho tool) rồi gửi đánh giá về. Thay bản giả lập từ 05/10 (lib/google/business.ts).
--

CREATE TABLE google_business_connections (
    shop_id uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
    mode text NOT NULL CHECK (mode = ANY (ARRAY['google'::text, 'maps'::text])),
    google_email text CHECK (google_email IS NULL OR char_length(google_email) <= 254),
    account_name text CHECK (account_name IS NULL OR account_name ~ '^accounts/[0-9]{1,40}$'::text),
    location_name text CHECK (location_name IS NULL OR location_name ~ '^locations/[0-9]{1,40}$'::text),
    location_title text CHECK (location_title IS NULL OR char_length(location_title) <= 200),
    place_id text CHECK (place_id IS NULL OR (char_length(place_id) BETWEEN 10 AND 300 AND place_id ~ '^[A-Za-z0-9_-]+$'::text)),
    new_review_uri text CHECK (new_review_uri IS NULL OR (new_review_uri ~ '^https://'::text AND char_length(new_review_uri) <= 500)),
    refresh_token_sealed text CHECK (refresh_token_sealed IS NULL OR char_length(refresh_token_sealed) <= 2000),
    average_rating numeric(3,2),
    total_reviews integer CHECK (total_reviews IS NULL OR total_reviews >= 0),
    connected_by uuid REFERENCES owner_identities_v2(id),
    connected_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    last_synced_at timestamp with time zone,
    last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
    maps_url text,
    requested_at timestamp with time zone,
    handed_at timestamp with time zone,
    CHECK ((mode = 'google'::text) = (refresh_token_sealed IS NOT NULL)),
    CONSTRAINT google_business_connections_maps_url_check CHECK (maps_url IS NULL OR (maps_url ~ '^https://[^[:space:]]+$'::text AND char_length(maps_url) <= 2000)),
    CONSTRAINT google_business_connections_maps_mode_check CHECK ((mode = 'maps'::text) = (maps_url IS NOT NULL))
);

-- Từng đánh giá Google, cùng cách xử lý của quán (05/10 tối, như trang "Đánh giá" của tool): `status` Mới/Đã xem/Đã xử lý
-- (lần đọc đầu của một kết nối vào thẳng "Đã xem", sau đó đánh giá mới vào "Mới"), `note` ghi chú nội bộ, `removed_at` khi
-- Google Maps không còn hiện đánh giá đó (hiện lại thì xoá dấu), `first_seen_at` lần đầu hệ thống thấy nó.
CREATE TABLE google_reviews (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    review_id text NOT NULL CHECK (char_length(review_id) BETWEEN 1 AND 300),
    reviewer_name text CHECK (reviewer_name IS NULL OR char_length(reviewer_name) <= 200),
    reviewer_photo text CHECK (reviewer_photo IS NULL OR (reviewer_photo ~ '^https://'::text AND char_length(reviewer_photo) <= 1000)),
    is_anonymous boolean DEFAULT false NOT NULL,
    stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment text CHECK (comment IS NULL OR char_length(comment) <= 10000),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    reply_comment text CHECK (reply_comment IS NULL OR char_length(reply_comment) <= 4096),
    reply_updated_at timestamp with time zone,
    synced_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    first_seen_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    removed_at timestamp with time zone,
    status text DEFAULT 'new'::text NOT NULL CHECK (status = ANY (ARRAY['new'::text, 'seen'::text, 'handled'::text])),
    note text CHECK (note IS NULL OR char_length(note) <= 2000),
    PRIMARY KEY (shop_id, review_id)
);
CREATE INDEX google_reviews_recent ON google_reviews (shop_id, created_at DESC);

--
-- 06/10/2026 (Tài: "shop chọn template… mọi thứ như link, chữ trên hitbox phải đồng bộ với shop"): chủ quán chọn mẫu và để
-- lại số Zalo; Tài nhắn Zalo lấy thông tin quán và điều muốn sửa, agent dựng và phát hành (scripts/sua-trang.mjs), yêu cầu
-- đóng theo. Mọi trang đều qua tay admin, nên không còn bước duyệt lần phát hành đầu (bảng publish_reviews đã bỏ).
-- `template_key`: mẫu khách chọn (trống khi chỉ nhờ chỉnh trang đang có) · `contact`: số Zalo của chủ quán, chỉ admin đọc ·
-- `contacted_at`: Tài đã nhắn (hoặc agent đã lấy trang ra sửa) · `outcome`: phát hành, hay đóng tay ở /gov.
-- Một yêu cầu đang chờ mỗi trang; gửi lại thì cập nhật mẫu, số Zalo và nối thêm ghi chú.
--

CREATE TABLE edit_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    page_id uuid NOT NULL,
    requested_by uuid NOT NULL REFERENCES owner_identities_v2(id),
    template_key text CHECK (template_key IS NULL OR template_key ~ '^[a-z0-9][a-z0-9-]{0,39}$'::text),
    contact text NOT NULL CHECK (contact ~ '^0[0-9]{9}$'::text),
    message text CHECK (message IS NULL OR (char_length(message) <= 2000 AND message !~ '[<>]'::text)),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    contacted_at timestamp with time zone,
    handled_at timestamp with time zone,
    handled_by text CHECK (handled_by IS NULL OR handled_by ~ '^(admin:[0-9a-f-]{36}|agent)$'::text),
    outcome text CHECK (outcome IS NULL OR outcome = ANY (ARRAY['published'::text, 'closed'::text])),
    FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id) ON DELETE CASCADE,
    CHECK ((handled_at IS NULL) = (handled_by IS NULL)),
    CHECK ((handled_at IS NULL) = (outcome IS NULL))
);
CREATE UNIQUE INDEX edit_requests_one_open ON edit_requests (page_id) WHERE handled_at IS NULL;
