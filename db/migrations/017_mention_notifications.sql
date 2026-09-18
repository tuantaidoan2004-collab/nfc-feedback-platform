-- Being @mentioned in a reply (lát F5, Tài 2026-09-19): the person gets a notification in the dashboard's bell.
-- Only members who may read the shop's feedback are notified, since the link leads into a feedback thread. One
-- notification per person per reply, so editing a reply notifies only people it newly mentions.
CREATE TABLE owner_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES owner_identities_v2(id),
 shop_id uuid NOT NULL REFERENCES shops(id),
 kind text NOT NULL CHECK(kind IN ('mention')),
 comment_id uuid NOT NULL REFERENCES feedback_comments(id),
 session_id uuid NOT NULL REFERENCES rating_experiences(session_id),
 actor_kind text NOT NULL CHECK(actor_kind IN ('member','admin')),
 actor_handle text NOT NULL CHECK(char_length(actor_handle) BETWEEN 1 AND 64),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 read_at timestamptz,
 UNIQUE(user_id, comment_id)
);
CREATE INDEX owner_notifications_inbox ON owner_notifications(user_id, created_at DESC);
-- /api/owner/v2/notifications is the bell's route, so no shop may take that slug.
ALTER TABLE shops DROP CONSTRAINT shops_account_routes_reserved;
ALTER TABLE shops ADD CONSTRAINT shops_account_routes_reserved CHECK(lower(slug) NOT IN ('profile','password','login','logout','setup','notifications'));
