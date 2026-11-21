import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  loyaltyAppName: text("loyalty_app_name"),
  isDiscounter: boolean("is_discounter").default(false).notNull(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  department: text("department").notNull(),
  unit: text("unit").notNull(),
  standardAmount: integer("standard_amount").notNull(),
});

export const basePrices = pgTable(
  "base_prices",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    productLabel: text("product_label").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.storeId] })],
);

export const weeklyOffers = pgTable("weekly_offers", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  zipCode: text("zip_code").default("10115").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  priceCents: integer("price_cents").notNull(),
  loyaltyPriceCents: integer("loyalty_price_cents"),
  requiresLoyaltyApp: boolean("requires_loyalty_app").default(false).notNull(),
  packageAmount: integer("package_amount").notNull(),
  packageUnit: text("package_unit").notNull(),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validTo: date("valid_to", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  zipCode: text("zip_code").default("10115").notNull(),
  shoppingDate: date("shopping_date", { mode: "string" }).notNull(),
  secondStoreThresholdCents: integer("second_store_threshold_cents").default(500).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  listId: uuid("list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  quantity: integer("quantity").default(1).notNull(),
  checked: boolean("checked").default(false).notNull(),
  /** Zeitpunkt der letzten Änderung, für den Abgleich geteilter Listen (letzte Änderung gewinnt) */
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const offerFetchRuns = pgTable("offer_fetch_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  zipCode: text("zip_code").notNull(),
  regionCode: text("region_code").notNull(),
  source: text("source").notNull(),
  referenceDate: date("reference_date", { mode: "string" }).notNull(),
  fetchedRawCount: integer("fetched_raw_count").default(0).notNull(),
  matchedCount: integer("matched_count").default(0).notNull(),
  upsertedCount: integer("upserted_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receiptAliases = pgTable("receipt_aliases", {
  aliasNormalized: text("alias_normalized").primaryKey(),
  storeId: text("store_id"),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  sampleLabel: text("sample_label").notNull(),
  hitCount: integer("hit_count").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receiptObservations = pgTable("receipt_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  zipCode: text("zip_code").default("10115").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  rawLabel: text("raw_label").notNull(),
  priceCents: integer("price_cents").notNull(),
  isOffer: boolean("is_offer").default(false).notNull(),
  receiptDate: date("receipt_date", { mode: "string" }).notNull(),
  packageAmount: integer("package_amount"),
  packageUnit: text("package_unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const barcodeProducts = pgTable("barcode_products", {
  barcode: text("barcode").primaryKey(),
  productName: text("product_name").notNull(),
  brand: text("brand"),
  quantityText: text("quantity_text"),
  packageAmount: integer("package_amount"),
  packageUnit: text("package_unit"),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  source: text("source").default("open_food_facts").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recipes = pgTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  servings: integer("servings").default(4).notNull(),
  prepMinutes: integer("prep_minutes").default(30).notNull(),
  /** JSON-Array der Schlagworte, z. B. ["Vegetarisch","Schnell"] */
  tags: text("tags").default("[]").notNull(),
  isBuiltin: boolean("is_builtin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  quantity: integer("quantity").default(1).notNull(),
});

export const householdShares = pgTable("household_shares", {
  shareCode: text("share_code").primaryKey(),
  listId: uuid("list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
