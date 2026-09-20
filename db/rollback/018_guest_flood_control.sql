-- Run in a transaction; refuse while any session is marked, since dropping the columns would erase the shop's
-- record of what was filtered out of its numbers.
LOCK TABLE visit_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM visit_sessions WHERE suspected_at IS NOT NULL) THEN
   RAISE EXCEPTION 'SUSPECTED_SESSIONS_PRESENT: keep migration 018 and roll the application back instead';
 END IF;
END $$;
DROP INDEX visit_sessions_suspected;
ALTER TABLE visit_sessions DROP CONSTRAINT visit_sessions_suspected_pair,
 DROP COLUMN suspected_reason, DROP COLUMN suspected_at;
DROP TABLE public_request_limits;
