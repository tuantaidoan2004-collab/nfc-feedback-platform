-- Letting a customer erase what they wrote (lát B, Tài chốt 21/09/2026).
--
-- The receipt exists so a retry of the same intent replays instead of writing twice, and the comparison it makes
-- is against the words themselves, so the words are there for a reason -- it is not a stray copy. But it was also
-- immutable against UPDATE and DELETE alike, which meant the customer's message and phone number sat in a table
-- the database itself refused to change. A privacy page promising erasure would have been promising something
-- Postgres declined to do.
--
-- So: one edit is allowed, and only one. The words become a marker and the number goes; every other column, on
-- every table that carries this trigger, still cannot move. The marker rather than NULL because the table insists
-- the four feedback columns travel together and a feedback receipt must keep its topic -- and because a row that
-- says the words were erased on request tells the shop more than a row that looks like it never had any.
CREATE FUNCTION erase_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514'; END IF;
  -- The one permitted shape: the message replaced by the marker, the number gone, nothing else touched.
  IF NEW.feedback_message = '(đã xoá theo yêu cầu)' AND NEW.feedback_phone IS NULL
     AND (to_jsonb(NEW) - 'feedback_message' - 'feedback_phone') = (to_jsonb(OLD) - 'feedback_message' - 'feedback_phone')
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'IMMUTABLE_PUBLISHING_RECORD' USING ERRCODE='23514';
END $$;
-- IF EXISTS because the stricter trigger is created by migration 003, and the guest-page fixtures build the
-- ratings tables without publishing. What this migration states is where the table ends up, not what preceded it.
DROP TRIGGER IF EXISTS receipt_immutable ON rating_intent_receipts;
CREATE TRIGGER receipt_erase_only BEFORE UPDATE OR DELETE ON rating_intent_receipts FOR EACH ROW EXECUTE FUNCTION erase_only();
