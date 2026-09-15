-- Unreleased additive foundation. Execute transactionally; 001/legacy stay untouched.
CREATE TABLE visit_sessions (
 id uuid PRIMARY KEY,
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 shop_id uuid NOT NULL REFERENCES shops(id),
 scope text NOT NULL CHECK (scope IN ('live','test')),
 entry_key text NOT NULL CHECK (length(btrim(entry_key)) BETWEEN 1 AND 128),
 browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
 started_at timestamptz NOT NULL CHECK (isfinite(started_at)),
 last_activity timestamptz NOT NULL CHECK (isfinite(last_activity) AND last_activity >= started_at),
 closed_at timestamptz CHECK (isfinite(closed_at) AND closed_at >= last_activity),
 UNIQUE (shop_id,scope,entry_key,id)
);
CREATE INDEX visit_sessions_browser_latest ON visit_sessions(shop_id,scope,entry_key,browser_hash,sequence DESC);
CREATE UNIQUE INDEX visit_sessions_one_current ON visit_sessions(shop_id,scope,entry_key,browser_hash) WHERE closed_at IS NULL;
CREATE TABLE page_visits (
 id uuid PRIMARY KEY,
 shop_id uuid NOT NULL,
 scope text NOT NULL,
 entry_key text NOT NULL,
 session_id uuid NOT NULL,
 load_key text NOT NULL CHECK (length(btrim(load_key)) > 0),
 navigation_kind text NOT NULL CHECK (navigation_kind IN ('load','reload','back_forward','resume')),
 opened_at timestamptz NOT NULL CHECK (isfinite(opened_at)),
 UNIQUE (shop_id,scope,entry_key,load_key),
 UNIQUE (shop_id,scope,entry_key,session_id,id),
 FOREIGN KEY (shop_id,scope,entry_key,session_id) REFERENCES visit_sessions(shop_id,scope,entry_key,id)
);
CREATE INDEX page_visits_shop_scope_time ON page_visits(shop_id,scope,opened_at DESC,id);
CREATE TABLE rating_experiences (
 feedback_topic text CHECK (feedback_topic ~ '^[a-z][a-z0-9_-]{0,31}$'),
 feedback_message text CHECK (char_length(feedback_message) BETWEEN 1 AND 2000),
 feedback_submitted_at timestamptz CHECK (isfinite(feedback_submitted_at)),
 feedback_updated_at timestamptz CHECK (isfinite(feedback_updated_at)),
 CHECK ((feedback_topic IS NULL AND feedback_message IS NULL AND feedback_submitted_at IS NULL AND feedback_updated_at IS NULL)
     OR (feedback_topic IS NOT NULL AND feedback_message IS NOT NULL AND feedback_submitted_at IS NOT NULL AND feedback_updated_at IS NOT NULL
         AND feedback_updated_at >= feedback_submitted_at)),
 session_id uuid PRIMARY KEY,
 shop_id uuid NOT NULL,
 scope text NOT NULL,
 entry_key text NOT NULL,
 rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 first_interaction_at timestamptz NOT NULL CHECK (isfinite(first_interaction_at)),
 updated_at timestamptz NOT NULL CHECK (isfinite(updated_at)),
 UNIQUE (shop_id,scope,entry_key,session_id),
 FOREIGN KEY (shop_id,scope,entry_key,session_id) REFERENCES visit_sessions(shop_id,scope,entry_key,id)
);
-- Shared rating/feedback intent namespace. Historical table name retained; source and snapshot immutable.
CREATE TABLE rating_intent_receipts (
 operation text NOT NULL DEFAULT 'rating' CHECK (operation IN ('rating','feedback')),
 feedback_topic text CHECK (feedback_topic ~ '^[a-z][a-z0-9_-]{0,31}$'),
 feedback_message text CHECK (char_length(feedback_message) BETWEEN 1 AND 2000),
 feedback_submitted_at timestamptz CHECK (isfinite(feedback_submitted_at)),
 feedback_updated_at timestamptz CHECK (isfinite(feedback_updated_at)),
 CHECK ((feedback_topic IS NULL AND feedback_message IS NULL AND feedback_submitted_at IS NULL AND feedback_updated_at IS NULL)
     OR (feedback_topic IS NOT NULL AND feedback_message IS NOT NULL AND feedback_submitted_at IS NOT NULL AND feedback_updated_at IS NOT NULL
         AND feedback_updated_at >= feedback_submitted_at)),
 CHECK (operation <> 'feedback' OR feedback_topic IS NOT NULL),
 shop_id uuid NOT NULL,
 scope text NOT NULL,
 entry_key text NOT NULL,
 session_id uuid NOT NULL,
 visit_id uuid NOT NULL,
 intent_id text NOT NULL CHECK (length(btrim(intent_id)) > 0),
 expected_revision bigint NOT NULL CHECK (expected_revision BETWEEN 0 AND 9007199254740990),
 score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
 applied_revision bigint NOT NULL CHECK (applied_revision = expected_revision + 1),
 first_interaction_at timestamptz NOT NULL CHECK (isfinite(first_interaction_at)),
 applied_at timestamptz NOT NULL CHECK (isfinite(applied_at)),
 PRIMARY KEY (shop_id,scope,entry_key,session_id,intent_id),
 UNIQUE (shop_id,scope,entry_key,session_id,applied_revision),
 FOREIGN KEY (shop_id,scope,entry_key,session_id) REFERENCES rating_experiences(shop_id,scope,entry_key,session_id),
 FOREIGN KEY (shop_id,scope,entry_key,session_id,visit_id) REFERENCES page_visits(shop_id,scope,entry_key,session_id,id)
);
