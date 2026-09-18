-- A shop's team (lát F3, Tài 2026-09-18): several people run one shop, each with their own account. Roles work like
-- Discord's: a role is a name, an icon, a colour and a set of switches the owner turns on or off. The owner holds
-- every permission and needs no role; everyone else has one. Every member may see the overview figures, so it is
-- not a switch. Only the owner activates cards and moves the support switch, as before.
CREATE TABLE shop_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shop_id uuid NOT NULL REFERENCES shops(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 30 AND name=btrim(name) AND name !~ '[[:cntrl:]<>]'),
 icon text CHECK(icon IS NULL OR (char_length(icon) BETWEEN 1 AND 8 AND icon !~ '[[:cntrl:][:space:]<>]')),
 color text NOT NULL DEFAULT '#5a6d62' CHECK(color ~ '^#[0-9a-f]{6}$'),
 permissions text[] NOT NULL DEFAULT '{}' CHECK(permissions <@ ARRAY['feedback','design','cards','members','activity','export']::text[]),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX shop_role_name ON shop_roles(shop_id, lower(name));
CREATE INDEX shop_role_shop ON shop_roles(shop_id, position);

-- The old role column now says only whether a member is the owner; what everyone else may do comes from role_id.
-- feedback_override lets the owner open (or close) customer feedback for one person regardless of the role.
ALTER TABLE owner_memberships_v2
 ADD COLUMN role_id uuid REFERENCES shop_roles(id),
 ADD COLUMN feedback_override boolean,
 ADD COLUMN show_badge boolean NOT NULL DEFAULT true,
 ADD COLUMN invited_by uuid REFERENCES owner_identities_v2(id),
 ADD COLUMN joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD CONSTRAINT membership_owner_has_no_role CHECK(role<>'owner' OR (role_id IS NULL AND feedback_override IS NULL));

-- Every shop starts with the two roles Tài named. Shops made later get them the first time their team is opened.
INSERT INTO shop_roles(shop_id,name,icon,color,permissions,position)
 SELECT id,'Quản lý','👑','#d69a2d',ARRAY['feedback','design','cards','members','activity'],1 FROM shops;
INSERT INTO shop_roles(shop_id,name,icon,color,permissions,position)
 SELECT id,'Nhân viên',NULL,'#5a6d62','{}',2 FROM shops;
UPDATE owner_memberships_v2 m SET role_id=r.id FROM shop_roles r WHERE r.shop_id=m.shop_id AND r.name='Quản lý' AND m.role='manager';

-- What people did in the shop, newest first, never edited. actor_handle is the name at the time, so a later rename
-- does not rewrite history. search holds the row's words lowercased without accents, written by the application.
CREATE TABLE shop_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id uuid NOT NULL REFERENCES shops(id),
 actor_kind text NOT NULL CHECK(actor_kind IN ('member','admin')),
 actor_id uuid NOT NULL,
 actor_handle text NOT NULL CHECK(char_length(actor_handle) BETWEEN 1 AND 64),
 action text NOT NULL CHECK(action ~ '^[a-z][a-z_.]{2,40}$'),
 target text CHECK(target IS NULL OR char_length(target)<=200),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),
 search text NOT NULL CHECK(char_length(search)<=2000),
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX shop_activity_recent ON shop_activity(shop_id, at DESC, id DESC);
CREATE INDEX shop_activity_actor ON shop_activity(shop_id, actor_id, at DESC);
CREATE FUNCTION shop_activity_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'SHOP_ACTIVITY_APPEND_ONLY' USING ERRCODE='23514';
END $$;
CREATE TRIGGER shop_activity_append_only BEFORE UPDATE OR DELETE ON shop_activity FOR EACH ROW EXECUTE FUNCTION shop_activity_append_only();
