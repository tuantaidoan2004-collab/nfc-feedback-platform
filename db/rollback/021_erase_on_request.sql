-- Run in a transaction; refuse while anything has been erased, since restoring the stricter trigger would make
-- the record unchangeable again while leaving the markers in place with no way to explain them.
LOCK TABLE rating_intent_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM rating_intent_receipts WHERE feedback_message = '(đã xoá theo yêu cầu)') THEN
   RAISE EXCEPTION 'ERASURE_PRESENT: keep migration 021 and roll the application back instead';
 END IF;
END $$;
DROP TRIGGER receipt_erase_only ON rating_intent_receipts;
-- Only where migration 003 supplied it; without publishing there was no such trigger to restore.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='publishing_immutable') THEN
   CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
 END IF;
END $$;
DROP FUNCTION erase_only();
