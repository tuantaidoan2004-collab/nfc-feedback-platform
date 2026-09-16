-- Run in a transaction; never discard what a shop allowed or withdrew.
LOCK TABLE shop_support_grant_events IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM shop_support_grant_events) THEN RAISE EXCEPTION 'SUPPORT_GRANT_DATA_EXISTS'; END IF;
END $$;
DROP TABLE shop_support_grant_events;
