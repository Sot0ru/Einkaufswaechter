import { eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { CATEGORY_MAP } from "@/lib/rules/catalog";

const FAVORITES_KEY = "favorite_categories";
const MAX_FAVORITES = 120;

const sanitize = (ids: readonly unknown[]): string[] =>
  [...new Set(ids.filter((id): id is string => typeof id === "string" && CATEGORY_MAP[id] != null))].slice(
    0,
    MAX_FAVORITES,
  );

/** Stammprodukte (Kategorie-IDs) aus app_settings */
export const getFavoriteCategoryIds = async (db: Db): Promise<string[]> => {
  const rows = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, FAVORITES_KEY));
  if (rows.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? sanitize(parsed) : [];
  } catch {
    return [];
  }
};

export const saveFavoriteCategoryIds = async (db: Db, ids: readonly string[]): Promise<string[]> => {
  const favorites = sanitize(ids);
  const value = JSON.stringify(favorites);
  await db
    .insert(schema.appSettings)
    .values({ key: FAVORITES_KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  return favorites;
};
