-- The template shop: the page every new shop is cloned from. Generating a shop copies the configuration of its
-- live release, never its data. At most one exists, enforced here so that two generations racing to create it
-- cannot leave two templates behind. It is an ordinary shop otherwise, so its page can be opened and checked.
ALTER TABLE shops ADD COLUMN is_template boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX shops_one_template ON shops(is_template) WHERE is_template;
