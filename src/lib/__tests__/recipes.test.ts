import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { CATEGORY_MAP } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  addRecipeToBasket,
  BUILTIN_RECIPES,
  scaleRecipeIngredients,
  scoreRecipesForWeek,
} from "@/lib/rules/recipes";
import { deleteRecipe, ensureBuiltinRecipes, listRecipes, saveRecipe } from "@/lib/services/recipes";

const bolognese = BUILTIN_RECIPES.find((recipe) => recipe.id === "spaghetti_bolognese")!;

describe("Gerichte-Baukasten (Paket 6)", () => {
  it("liefert 15 bis 20 Standard-Gerichte, die nur bekannte Kategorien verwenden", () => {
    expect(BUILTIN_RECIPES.length).toBeGreaterThanOrEqual(15);
    expect(BUILTIN_RECIPES.length).toBeLessThanOrEqual(20);
    expect(new Set(BUILTIN_RECIPES.map((recipe) => recipe.id)).size).toBe(BUILTIN_RECIPES.length);
    for (const recipe of BUILTIN_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      for (const ingredient of recipe.ingredients) {
        expect(CATEGORY_MAP[ingredient.categoryId], `${recipe.id}: ${ingredient.categoryId}`).toBeDefined();
      }
    }
  });

  it("rechnet Zutaten auf Portionen um und kauft immer ganze Packungen", () => {
    const forTwo = scaleRecipeIngredients(bolognese, 2);
    expect(forTwo.find((item) => item.categoryId === "passierte_tomaten_500g")?.quantity).toBe(1);
    expect(forTwo.find((item) => item.categoryId === "pasta_500g")?.quantity).toBe(1);

    const forSix = scaleRecipeIngredients(bolognese, 6);
    expect(forSix.find((item) => item.categoryId === "passierte_tomaten_500g")?.quantity).toBe(3);
    expect(forSix.find((item) => item.categoryId === "pasta_500g")?.quantity).toBe(2);
  });

  it("addiert die Zutaten zur bestehenden Liste und behält Präferenzen", () => {
    const basket = addRecipeToBasket(
      [{ categoryId: "pasta_500g", quantity: 1, preference: "bio" }],
      bolognese,
      4,
    );
    expect(basket.find((item) => item.categoryId === "pasta_500g")).toEqual({
      categoryId: "pasta_500g",
      quantity: 2,
      preference: "bio",
    });
    expect(basket.find((item) => item.categoryId === "hackfleisch_500g")?.quantity).toBe(1);
  });

  it("sortiert Gerichte nach der Ersparnis durch Wochenangebote", () => {
    const offers: OfferRecord[] = [
      {
        id: "lidl-hack",
        storeId: "lidl",
        categoryId: "hackfleisch_500g",
        title: "Metzgerfrisch Hackfleisch gemischt 500 g",
        priceCents: 289,
        loyaltyPriceCents: null,
        requiresLoyaltyApp: false,
        packageAmount: 500,
        packageUnit: "g",
        validFrom: "2026-11-16",
        validTo: "2026-11-21",
      },
    ];
    const scores = scoreRecipesForWeek({
      recipes: BUILTIN_RECIPES,
      offers,
      enabledStores: ["lidl", "rewe"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-18",
    });

    expect(scores[0].recipe.id).toMatch(/spaghetti_bolognese|lasagne/);
    expect(scores[0].bestStoreId).toBe("lidl");
    expect(scores[0].savingsCents).toBeGreaterThan(0);
    expect(scores[0].offerCount).toBe(1);

    const withoutOffer = scores.find((score) => score.recipe.id === "porridge_beeren")!;
    expect(withoutOffer.savingsCents).toBe(0);
    expect(withoutOffer.costPerServingCents).toBe(
      Math.round(withoutOffer.checkoutCents / withoutOffer.servings),
    );
  });

  describe("Datenbank", () => {
    beforeEach(() => {
      resetDbForTests();
    });

    it("legt Standard-Gerichte idempotent an und verwaltet eigene Gerichte", async () => {
      const db = await getDb();
      const first = await listRecipes(db, "2026-11-21");
      await ensureBuiltinRecipes(db);
      const second = await listRecipes(db, "2026-11-21");
      expect(second.filter((recipe) => recipe.isBuiltin)).toHaveLength(BUILTIN_RECIPES.length);
      expect(second.map((recipe) => recipe.id)).toEqual(first.map((recipe) => recipe.id));
      expect(second[0].ingredients.length).toBeGreaterThan(0);

      const custom = await saveRecipe(
        db,
        {
          name: "Omas Nudelauflauf",
          servings: 3,
          tags: ["Familie"],
          ingredients: [
            { categoryId: "pasta_500g", quantity: 1 },
            { categoryId: "reibekaese_200g", quantity: 1 },
            { categoryId: "gibt_es_nicht", quantity: 2 },
          ],
        },
        "2026-11-21",
      );
      expect(custom.isBuiltin).toBe(false);
      expect(custom.ingredients).toHaveLength(2);

      const withCustom = await listRecipes(db, "2026-11-21");
      const stored = withCustom.find((recipe) => recipe.id === custom.id)!;
      expect(stored.name).toBe("Omas Nudelauflauf");
      expect(stored.tags).toEqual(["Familie"]);
      expect(stored.servings).toBe(3);

      expect(await deleteRecipe(db, "spaghetti_bolognese")).toBe(false);
      expect(await deleteRecipe(db, custom.id)).toBe(true);
      const afterDelete = await listRecipes(db, "2026-11-21");
      expect(afterDelete).toHaveLength(BUILTIN_RECIPES.length);
    });

    it("lehnt Gerichte ohne Namen oder ohne gültige Zutaten ab", async () => {
      const db = await getDb();
      await expect(
        saveRecipe(db, { name: " ", servings: 2, ingredients: [{ categoryId: "pasta_500g", quantity: 1 }] }, "2026-11-21"),
      ).rejects.toThrow("Namen");
      await expect(
        saveRecipe(db, { name: "Leer", servings: 2, ingredients: [{ categoryId: "x", quantity: 1 }] }, "2026-11-21"),
      ).rejects.toThrow("Zutat");
    });
  });
});
