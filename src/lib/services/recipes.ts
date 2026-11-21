import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { CATEGORY_MAP } from "@/lib/rules/catalog";
import { BUILTIN_RECIPES, type RecipeDefinition } from "@/lib/rules/recipes";

export interface SaveRecipeInput {
  name: string;
  servings: number;
  prepMinutes?: number;
  tags?: readonly string[];
  ingredients: readonly { categoryId: string; quantity: number }[];
}

const parseTags = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
};

/** Legt fehlende Standard-Rezepte idempotent an (Kategorien müssen bereits existieren). */
export const ensureBuiltinRecipes = async (db: Db): Promise<void> => {
  const existing = await db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(eq(schema.recipes.isBuiltin, true));
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = BUILTIN_RECIPES.filter((recipe) => !existingIds.has(recipe.id));
  if (missing.length === 0) return;

  await db
    .insert(schema.recipes)
    .values(
      missing.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        servings: recipe.servings,
        prepMinutes: recipe.prepMinutes,
        tags: JSON.stringify(recipe.tags),
        isBuiltin: true,
      })),
    )
    .onConflictDoNothing();
  await db.insert(schema.recipeIngredients).values(
    missing.flatMap((recipe) =>
      recipe.ingredients.map((ingredient) => ({
        recipeId: recipe.id,
        categoryId: ingredient.categoryId,
        quantity: ingredient.quantity,
      })),
    ),
  );
};

/** Alle Gerichte (Standard und eigene) inklusive Zutaten */
export const listRecipes = async (db: Db, referenceDate: string): Promise<RecipeDefinition[]> => {
  await ensureCatalogAndDemoOffers(db, referenceDate);
  await ensureBuiltinRecipes(db);

  const rows = await db.select().from(schema.recipes).orderBy(asc(schema.recipes.createdAt));
  if (rows.length === 0) return [];
  const ingredientRows = await db
    .select()
    .from(schema.recipeIngredients)
    .where(
      inArray(
        schema.recipeIngredients.recipeId,
        rows.map((row) => row.id),
      ),
    );

  const ingredientsByRecipe = new Map<string, { categoryId: string; quantity: number }[]>();
  for (const row of ingredientRows) {
    const group = ingredientsByRecipe.get(row.recipeId) ?? [];
    group.push({ categoryId: row.categoryId, quantity: row.quantity });
    ingredientsByRecipe.set(row.recipeId, group);
  }

  const builtinOrder = new Map(BUILTIN_RECIPES.map((recipe, index) => [recipe.id, index]));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      servings: row.servings,
      prepMinutes: row.prepMinutes,
      tags: parseTags(row.tags),
      isBuiltin: row.isBuiltin,
      ingredients: ingredientsByRecipe.get(row.id) ?? [],
    }))
    .sort(
      (a, b) =>
        Number(b.isBuiltin) - Number(a.isBuiltin) ||
        (builtinOrder.get(a.id) ?? 0) - (builtinOrder.get(b.id) ?? 0),
    );
};

/** Speichert ein eigenes Gericht. Unbekannte Kategorien werden verworfen. */
export const saveRecipe = async (
  db: Db,
  input: SaveRecipeInput,
  referenceDate: string,
): Promise<RecipeDefinition> => {
  const name = input.name.trim();
  if (!name) throw new Error("Gib dem Gericht einen Namen.");

  const ingredients = input.ingredients.filter(
    (ingredient) => ingredient.quantity > 0 && CATEGORY_MAP[ingredient.categoryId] != null,
  );
  if (ingredients.length === 0) {
    throw new Error("Ein Gericht braucht mindestens eine Zutat aus dem Sortiment.");
  }

  await ensureCatalogAndDemoOffers(db, referenceDate);

  const recipe: RecipeDefinition = {
    id: `eigen-${randomUUID()}`,
    name,
    servings: Math.max(1, Math.round(input.servings)),
    prepMinutes: Math.max(0, Math.round(input.prepMinutes ?? 30)),
    tags: input.tags ?? [],
    isBuiltin: false,
    ingredients,
  };

  await db.insert(schema.recipes).values({
    id: recipe.id,
    name: recipe.name,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    tags: JSON.stringify(recipe.tags),
    isBuiltin: false,
  });
  await db.insert(schema.recipeIngredients).values(
    ingredients.map((ingredient) => ({
      recipeId: recipe.id,
      categoryId: ingredient.categoryId,
      quantity: ingredient.quantity,
    })),
  );
  return recipe;
};

/** Löscht ein eigenes Gericht. Standard-Rezepte bleiben erhalten. */
export const deleteRecipe = async (db: Db, recipeId: string): Promise<boolean> => {
  const deleted = await db
    .delete(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.isBuiltin, false)))
    .returning({ id: schema.recipes.id });
  return deleted.length > 0;
};
