-- Private feedback no longer waits for a star (Tài, 2026-09-17): an experience may hold feedback with no rating yet.
-- Existing rows keep their values; a rating receipt must still carry a star, a feedback receipt records the rating
-- current when it was applied, which may be none.
ALTER TABLE rating_experiences ALTER COLUMN rating DROP NOT NULL;
ALTER TABLE rating_experiences ADD CONSTRAINT rating_experiences_rated_or_feedback
 CHECK (rating IS NOT NULL OR feedback_message IS NOT NULL);
ALTER TABLE rating_intent_receipts ALTER COLUMN score DROP NOT NULL;
ALTER TABLE rating_intent_receipts ADD CONSTRAINT rating_intent_receipts_rating_has_score
 CHECK (operation <> 'rating' OR score IS NOT NULL);
