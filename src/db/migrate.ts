/**
 * Idempotente Schema-Anweisungen für Einkaufswächter.
 * Laufen einmal pro Serverprozess (geprüft über SCHEMA_VERSION in app_settings).
 * Bestehende Einträge nie ändern – neue Änderungen immer unten anhängen!
 */
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS stores (
    id text PRIMARY KEY,
    name text NOT NULL,
    short_name text NOT NULL,
    loyalty_app_name text,
    is_discounter boolean NOT NULL DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id text PRIMARY KEY,
    name text NOT NULL,
    subtitle text NOT NULL,
    department text NOT NULL,
    unit text NOT NULL,
    standard_amount integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS base_prices (
    category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    price_cents integer NOT NULL,
    product_label text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (category_id, store_id)
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_offers (
    id text PRIMARY KEY,
    store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    zip_code text NOT NULL DEFAULT '10115',
    category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    title text NOT NULL,
    price_cents integer NOT NULL,
    loyalty_price_cents integer,
    requires_loyalty_app boolean NOT NULL DEFAULT false,
    package_amount integer NOT NULL,
    package_unit text NOT NULL,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS weekly_offers_lookup_idx ON weekly_offers (valid_from, valid_to, store_id, category_id)`,
  `CREATE TABLE IF NOT EXISTS shopping_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    zip_code text NOT NULL DEFAULT '10115',
    shopping_date date NOT NULL,
    second_store_threshold_cents integer NOT NULL DEFAULT 500,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS shopping_list_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    quantity integer NOT NULL DEFAULT 1,
    checked boolean NOT NULL DEFAULT false
  )`,
];
