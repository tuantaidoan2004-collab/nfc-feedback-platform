-- Run in a transaction; refuse while any code is shorter than the old minimum of eight, since the old check
-- would reject it. Cards switched back on stay as they are; only future transitions return to the old rules.
LOCK TABLE tags IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM tags WHERE length(public_code) < 8) THEN RAISE EXCEPTION 'SHORT_CARD_CODES_EXIST: keep migration 013 and roll the application back instead'; END IF;
END $$;
ALTER TABLE tags DROP CONSTRAINT tags_public_code_check;
ALTER TABLE tags ADD CONSTRAINT tags_public_code_check CHECK (public_code ~ '^[a-zA-Z0-9_-]{8,64}$' AND lower(public_code) <> 'demo');
CREATE OR REPLACE FUNCTION tag_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.shop_id<>OLD.shop_id OR NEW.public_code<>OLD.public_code OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'TAG_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='prepared' AND NEW.state IN ('tested','disabled')) OR (OLD.state='tested' AND NEW.state IN ('active','disabled')) OR (OLD.state='active' AND NEW.state='disabled')) THEN RAISE EXCEPTION 'INVALID_TAG_TRANSITION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
