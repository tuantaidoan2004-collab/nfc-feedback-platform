-- Run in a transaction; refuse while the log holds anything, since dropping it would erase behaviour that cannot
-- be collected again.
LOCK TABLE page_events IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM page_events) THEN
   RAISE EXCEPTION 'PAGE_EVENTS_PRESENT: archive the log before rolling migration 020 back';
 END IF;
END $$;
DROP TRIGGER page_events_no_update ON page_events;
DROP FUNCTION page_events_append_only();
DROP TABLE page_events;
