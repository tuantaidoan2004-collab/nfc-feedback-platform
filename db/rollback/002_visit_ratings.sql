-- Run transactionally. Refuse destructive rollback once v2 has any data.
-- rating_intent_receipts now includes BOTH rating/private-feedback; the same guard protects both.
-- Feedback columns disappear only with these empty aggregate tables; 001/legacy are untouched.
LOCK TABLE visit_sessions, page_visits, rating_experiences, rating_intent_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM visit_sessions) OR EXISTS (SELECT 1 FROM page_visits) OR EXISTS (SELECT 1 FROM rating_experiences)
    OR EXISTS (SELECT 1 FROM rating_intent_receipts) THEN
   RAISE EXCEPTION 'V2_DATA_PRESENT: keep additive tables and roll application back instead';
 END IF;
END $$;
DROP TABLE rating_intent_receipts;
DROP TABLE rating_experiences;
DROP TABLE page_visits;
DROP TABLE visit_sessions;
