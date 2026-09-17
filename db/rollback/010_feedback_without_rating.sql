-- Run in a transaction; refuse while any feedback without a star exists, since restoring NOT NULL would need an
-- invented rating. Roll the application back instead and keep the relaxed columns.
LOCK TABLE rating_experiences, rating_intent_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM rating_experiences WHERE rating IS NULL) OR EXISTS(SELECT 1 FROM rating_intent_receipts WHERE score IS NULL) THEN
   RAISE EXCEPTION 'UNRATED_FEEDBACK_PRESENT: keep migration 010 and roll the application back instead';
 END IF;
END $$;
ALTER TABLE rating_intent_receipts DROP CONSTRAINT rating_intent_receipts_rating_has_score;
ALTER TABLE rating_intent_receipts ALTER COLUMN score SET NOT NULL;
ALTER TABLE rating_experiences DROP CONSTRAINT rating_experiences_rated_or_feedback;
ALTER TABLE rating_experiences ALTER COLUMN rating SET NOT NULL;
