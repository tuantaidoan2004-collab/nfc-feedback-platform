-- Optional call-back number with private feedback (Tài, 2026-09-18). Only the shop's own team sees it; it is kept
-- with the feedback it belongs to, both in the current experience and in the immutable receipt.
ALTER TABLE rating_experiences ADD COLUMN feedback_phone text
 CHECK (feedback_phone ~ '^\+?[0-9]{8,15}$'),
 ADD CONSTRAINT rating_experiences_phone_with_feedback CHECK (feedback_phone IS NULL OR feedback_message IS NOT NULL);
ALTER TABLE rating_intent_receipts ADD COLUMN feedback_phone text
 CHECK (feedback_phone ~ '^\+?[0-9]{8,15}$'),
 ADD CONSTRAINT rating_intent_receipts_phone_with_feedback CHECK (feedback_phone IS NULL OR feedback_message IS NOT NULL);
