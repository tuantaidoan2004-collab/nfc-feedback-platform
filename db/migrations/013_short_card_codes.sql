-- Cards (lát E, Tài 2026-09-18). Codes may be as short as five characters: they sit in the URL written to the NFC
-- chip, and new codes start at five and grow to six only when five keeps colliding. A shop now activates a card
-- straight from prepared (it proves the write by tapping it) and can switch a stored card back on; the old
-- prepared -> tested -> active path stays valid.
ALTER TABLE tags DROP CONSTRAINT tags_public_code_check;
ALTER TABLE tags ADD CONSTRAINT tags_public_code_check CHECK (public_code ~ '^[a-zA-Z0-9_-]{5,64}$' AND lower(public_code) <> 'demo');
CREATE OR REPLACE FUNCTION tag_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.shop_id<>OLD.shop_id OR NEW.public_code<>OLD.public_code OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'TAG_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='prepared' AND NEW.state IN ('tested','active','disabled')) OR (OLD.state='tested' AND NEW.state IN ('active','disabled'))
   OR (OLD.state='active' AND NEW.state='disabled') OR (OLD.state='disabled' AND NEW.state='active')) THEN RAISE EXCEPTION 'INVALID_TAG_TRANSITION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
