-- Customer feedback as a comment thread (lát F4, Tài 2026-09-18/19): the customer's words are the comment, and the
-- shop's internal notes become replies under it, like YouTube. Many replies per feedback instead of one note that
-- each save overwrote. A reply keeps who wrote it (a member of the shop, or support at switch position 3), can be
-- liked, pinned (one per thread), edited — the earlier text is kept — and deleted, which hides it but keeps the row.
-- The processing status is gone from the product; owner_feedback_cases stays as it was, untouched, for exports
-- and for rolling this migration back.
CREATE TABLE feedback_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shop_id uuid NOT NULL REFERENCES shops(id),
 session_id uuid NOT NULL REFERENCES rating_experiences(session_id),
 author_kind text NOT NULL CHECK(author_kind IN ('member','admin')),
 author_id uuid NOT NULL,
 author_handle text NOT NULL CHECK(char_length(author_handle) BETWEEN 1 AND 64),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000 AND btrim(body)<>''),
 from_note boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 edited_at timestamptz,
 pinned_at timestamptz,
 deleted_at timestamptz,
 deleted_by uuid,
 CHECK(deleted_at IS NULL OR pinned_at IS NULL),
 CHECK((deleted_at IS NULL)=(deleted_by IS NULL))
);
CREATE INDEX feedback_comments_thread ON feedback_comments(session_id, created_at);
CREATE UNIQUE INDEX feedback_comments_one_pin ON feedback_comments(session_id) WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;

-- The text a reply had before each edit. Never changed afterwards.
CREATE TABLE feedback_comment_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 comment_id uuid NOT NULL REFERENCES feedback_comments(id),
 body text NOT NULL,
 replaced_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION feedback_comment_revisions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'COMMENT_REVISIONS_APPEND_ONLY' USING ERRCODE='23514';
END $$;
CREATE TRIGGER feedback_comment_revisions_append_only BEFORE UPDATE OR DELETE ON feedback_comment_revisions
 FOR EACH ROW EXECUTE FUNCTION feedback_comment_revisions_append_only();

CREATE TABLE feedback_comment_likes (
 comment_id uuid NOT NULL REFERENCES feedback_comments(id),
 liker_kind text NOT NULL CHECK(liker_kind IN ('member','admin')),
 liker_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(comment_id, liker_kind, liker_id)
);

-- Every note written so far becomes the first reply of its thread, under the account that last saved it.
INSERT INTO feedback_comments(shop_id,session_id,author_kind,author_id,author_handle,body,from_note,created_at)
 SELECT c.shop_id,c.session_id,'member',c.actor_id,u.username,left(c.note,2000),true,c.updated_at
 FROM owner_feedback_cases c JOIN owner_identities_v2 u ON u.id=c.actor_id WHERE btrim(c.note)<>'';
