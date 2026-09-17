-- Run in a transaction; refuse while any call-back number is stored, since dropping the column would erase it.
LOCK TABLE rating_experiences, rating_intent_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM rating_experiences WHERE feedback_phone IS NOT NULL) OR EXISTS(SELECT 1 FROM rating_intent_receipts WHERE feedback_phone IS NOT NULL) THEN
   RAISE EXCEPTION 'FEEDBACK_PHONE_PRESENT: keep migration 011 and roll the application back instead';
 END IF;
END $$;
ALTER TABLE rating_intent_receipts DROP COLUMN feedback_phone;
ALTER TABLE rating_experiences DROP COLUMN feedback_phone;
