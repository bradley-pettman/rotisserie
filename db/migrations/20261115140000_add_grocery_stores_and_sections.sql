-- migrate:up
CREATE DOMAIN grocery_section AS VARCHAR(20) CHECK (
  VALUE IN (
    'produce', 'meat_seafood', 'dairy_eggs', 'bakery', 'pantry', 'frozen', 'drinks',
    'household', 'personal_care', 'baby_kids', 'pet', 'other'
  )
);

ALTER TABLE ingredients ADD COLUMN section grocery_section;

CREATE TABLE grocery_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grocery_stores_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT grocery_stores_household_id_id_key UNIQUE (household_id, id)
);

CREATE UNIQUE INDEX grocery_stores_household_id_name_key ON grocery_stores(household_id, lower(name));

ALTER TABLE grocery_items
  ADD COLUMN store_id UUID,
  ADD COLUMN section grocery_section,
  ADD CONSTRAINT grocery_items_store_in_household
    FOREIGN KEY (household_id, store_id) REFERENCES grocery_stores(household_id, id)
    ON DELETE SET NULL (store_id);

CREATE TABLE grocery_item_defaults (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  store_id UUID,
  section grocery_section,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, name),
  CONSTRAINT grocery_item_defaults_name_is_canonical CHECK (name = lower(btrim(name)) AND name <> ''),
  CONSTRAINT grocery_item_defaults_store_in_household
    FOREIGN KEY (household_id, store_id) REFERENCES grocery_stores(household_id, id)
    ON DELETE SET NULL (store_id)
);

-- migrate:down
DROP TABLE grocery_item_defaults;

ALTER TABLE grocery_items
  DROP CONSTRAINT grocery_items_store_in_household,
  DROP COLUMN section,
  DROP COLUMN store_id;

DROP TABLE grocery_stores;

ALTER TABLE ingredients DROP COLUMN section;

DROP DOMAIN grocery_section;
