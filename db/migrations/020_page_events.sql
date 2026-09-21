-- The behavioural event stream (lát mục 7, Tài chốt 21/09/2026). One append-only log; every figure the product
-- ever shows is derived from it. That is the whole of the Kappa shape, and it needs no vendor beyond this table.
--
-- Written before the first card is handed to a shop, because behaviour that is not recorded cannot be recovered:
-- a migration can add a column, it cannot add a year of what customers did.
--
-- Deliberately at its basic level (Tài's rule, 21/09): no partitioning, no rollups, no archive job. The arithmetic
-- says one table carries 139 writes a second at a thousand active shops, two orders below where anything fancier
-- starts to earn its place. Raising it is a later, separate step along the same branch.
CREATE TABLE page_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 -- No foreign key here either, and for a reason that showed up the first time a beacon outlived the page that
 -- sent it: a reference to `shops` puts this table inside `TRUNCATE shops CASCADE`, so a late write and a reset
 -- deadlock. The value is resolved by the server from the request, never taken from the browser, so the
 -- reference was buying nothing it could not already guarantee.
 shop_id uuid NOT NULL,
 scope text NOT NULL CHECK (scope IN ('live','test')),
 entry_key text NOT NULL CHECK (length(btrim(entry_key)) BETWEEN 1 AND 128),
 -- No foreign key on purpose: a log records what was true when it was written, and must not stop a session being
 -- cleaned or a card retired. Which release and which card served this visit are NOT copied here -- they are
 -- already recorded against the visit and stay fixed there, so copying them would be a second truth to keep in
 -- step, and would tie this table to migration 003 that the guest page does not otherwise need.
 session_id uuid, visit_id uuid,
 name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{2,31}$'),
 at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(at)),
 -- Milliseconds since this session first opened the page. Every interval the product cares about -- how long
 -- until a star, how long until send -- is the difference of two of these. This is the QoE signal.
 since_open_ms integer CHECK (since_open_ms BETWEEN 0 AND 86400000),
 -- Shape, never content: which star, which layout, which button. Never a message, never a phone number.
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail)='object' AND pg_column_size(detail) <= 512)
);
CREATE INDEX page_events_shop_time ON page_events(shop_id, at DESC);
CREATE INDEX page_events_time ON page_events(at);

-- Append-only, but not immutable: rows must be deletable, or the log can never be archived to cold storage and
-- trimmed. Rewriting history is what is forbidden, not forgetting it.
CREATE FUNCTION page_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PAGE_EVENTS_APPEND_ONLY'; END $$;
CREATE TRIGGER page_events_no_update BEFORE UPDATE ON page_events FOR EACH ROW EXECUTE FUNCTION page_events_append_only();
