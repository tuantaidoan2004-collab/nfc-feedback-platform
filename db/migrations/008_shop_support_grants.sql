-- What the shop owner allows platform support to do. After handover the operator helps within what the shop
-- grants: an administrator may always see the overview, but reads private feedback only while the owner has this
-- switched on. A plain on/off switch with no expiry, as Tai chose; support asks the shop to switch it off after.
-- Append-only: the current state is the newest row, so the history the owner sees and the state that decides
-- access can never disagree.
CREATE TABLE shop_support_grant_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id uuid NOT NULL REFERENCES shops(id),
 permission text NOT NULL CHECK(permission IN ('feedback')),
 enabled boolean NOT NULL,
 actor_id uuid NOT NULL REFERENCES owner_identities_v2(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX shop_support_grant_latest ON shop_support_grant_events(shop_id,permission,id DESC);
CREATE TRIGGER shop_support_grant_immutable BEFORE UPDATE OR DELETE ON shop_support_grant_events
 FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
