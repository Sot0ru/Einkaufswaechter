import { CATEGORY_MAP, type StoreId } from "./catalog";
import {
  type BasketItemInput,
  type OfferRecord,
  type OptimizationInput,
  optimizeShoppingBasket,
} from "./optimizer";

export interface RecipeIngredient {
  categoryId: string;
  /** Anzahl Standardpackungen der Kategorie für die Basis-Portionenzahl */
  quantity: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  servings: number;
  prepMinutes: number;
  tags: readonly string[];
  isBuiltin: boolean;
  ingredients: readonly RecipeIngredient[];
}

const builtin = (
  id: string,
  name: string,
  servings: number,
  prepMinutes: number,
  tags: readonly string[],
  ingredients: Record<string, number>,
): RecipeDefinition => ({
  id,
  name,
  servings,
  prepMinutes,
  tags,
  isBuiltin: true,
  ingredients: Object.entries(ingredients).map(([categoryId, quantity]) => ({ categoryId, quantity })),
});

/**
 * Beliebte deutsche Alltagsgerichte, offline verfügbar.
 * Mengen in Standardpackungen; Salz, Pfeffer und Gewürze setzen wir als vorhanden voraus.
 */
export const BUILTIN_RECIPES: readonly RecipeDefinition[] = [
  builtin("spaghetti_bolognese", "Spaghetti Bolognese", 4, 35, ["Pasta", "Klassiker"], {
    pasta_500g: 1,
    hackfleisch_500g: 1,
    passierte_tomaten_500g: 2,
    zwiebeln_1kg: 1,
    karotten_1kg: 1,
    parmesan_grana_150g: 1,
  }),
  builtin("kartoffel_gemuese_pfanne", "Kartoffel-Gemüse-Pfanne", 4, 30, ["Vegetarisch"], {
    kartoffeln_2kg: 1,
    paprika_mix_500g: 1,
    zucchini_500g: 1,
    zwiebeln_1kg: 1,
    schmand_200g: 1,
  }),
  builtin("linsencurry", "Rotes Linsencurry mit Reis", 4, 30, ["Vegan"], {
    rote_linsen_500g: 1,
    kokosmilch_400ml: 1,
    passierte_tomaten_500g: 1,
    zwiebeln_1kg: 1,
    knoblauch_200g: 1,
    reis_1kg: 1,
  }),
  builtin("pfannkuchen", "Pfannkuchen mit Apfelmus", 4, 25, ["Vegetarisch", "Süß"], {
    weizenmehl_1kg: 1,
    eier_10st: 1,
    vollmilch_1l: 1,
    apfelmus_700g: 1,
  }),
  builtin("kaesespaetzle", "Käsespätzle mit Röstzwiebeln", 4, 30, ["Vegetarisch"], {
    frische_spaetzle_500g: 2,
    reibekaese_200g: 2,
    zwiebeln_1kg: 1,
    butter_250g: 1,
  }),
  builtin("chili_sin_carne", "Chili sin Carne", 4, 40, ["Vegan"], {
    kichererbsen_kidneybohnen_400g: 2,
    zuckermais_dose_340g: 1,
    passierte_tomaten_500g: 2,
    paprika_mix_500g: 1,
    zwiebeln_1kg: 1,
    reis_1kg: 1,
  }),
  builtin("haehnchen_reis_bowl", "Hähnchen-Reis-Bowl", 4, 30, ["Schnell"], {
    haehnchenbrust_400g: 2,
    reis_1kg: 1,
    brokkoli_500g: 1,
    karotten_1kg: 1,
    sojasauce_250ml: 1,
  }),
  builtin("flammkuchen", "Flammkuchen mit Speck und Zwiebeln", 4, 25, ["Schnell"], {
    frischer_teig_275g: 2,
    schmand_200g: 2,
    schinkenwuerfel_250g: 1,
    zwiebeln_1kg: 1,
  }),
  builtin("ofengemuese_feta", "Ofengemüse mit Feta", 4, 40, ["Vegetarisch"], {
    suesskartoffeln_1kg: 1,
    paprika_mix_500g: 1,
    zucchini_500g: 1,
    hirtenkaese_feta_200g: 2,
    olivenoel_500ml: 1,
  }),
  builtin("lachs_brokkoli_reis", "Lachs mit Brokkoli und Reis", 4, 30, ["Fisch"], {
    frisches_lachsfilet_250g: 2,
    brokkoli_500g: 1,
    reis_1kg: 1,
    zitronen_500g: 1,
  }),
  builtin("rindergulasch", "Rindergulasch mit Kartoffeln", 4, 120, ["Klassiker"], {
    rindergulasch_500g: 2,
    zwiebeln_1kg: 1,
    paprika_mix_500g: 1,
    tomatenmark_200g: 1,
    kartoffeln_2kg: 1,
  }),
  builtin("schnitzel_kartoffelsalat", "Schnitzel mit Kartoffelsalat", 4, 35, ["Klassiker"], {
    schweineschnitzel_500g: 2,
    paniermehl_400g: 1,
    eier_10st: 1,
    kartoffelsalat_kuehl_400g: 2,
    zitronen_500g: 1,
  }),
  builtin("lasagne", "Lasagne", 6, 75, ["Pasta", "Klassiker"], {
    lasagneplatten_500g: 1,
    hackfleisch_500g: 1,
    passierte_tomaten_500g: 2,
    reibekaese_200g: 1,
    vollmilch_1l: 1,
    zwiebeln_1kg: 1,
  }),
  builtin("tortellini_sahne", "Tortellini in Schinken-Sahne-Soße", 4, 15, ["Pasta", "Schnell"], {
    frische_tortellini_250g: 3,
    schlagsahne_200g: 1,
    kochschinken_200g: 1,
    parmesan_grana_150g: 1,
  }),
  builtin("fischstaebchen_spinat", "Fischstäbchen mit Rahmspinat und Kartoffeln", 4, 30, ["Fisch", "Kinder"], {
    tk_fischstaebchen_450g: 1,
    tk_spinat_450g: 1,
    kartoffeln_2kg: 1,
  }),
  builtin("gemuese_wraps", "Gemüse-Wraps mit Hummus", 4, 20, ["Vegetarisch", "Schnell"], {
    tortilla_wraps_370g: 1,
    hummus_200g: 1,
    eisbergsalat_1st: 1,
    rispentomaten_500g: 1,
    gurke_1st: 1,
    hirtenkaese_feta_200g: 1,
  }),
  builtin("shakshuka", "Shakshuka mit Baguette", 4, 25, ["Vegetarisch"], {
    eier_10st: 1,
    passierte_tomaten_500g: 2,
    paprika_mix_500g: 1,
    zwiebeln_1kg: 1,
    hirtenkaese_feta_200g: 1,
    baguette_steinofen_250g: 1,
  }),
  builtin("porridge_beeren", "Porridge mit Beeren", 4, 10, ["Frühstück", "Vegetarisch"], {
    haferflocken_500g: 1,
    vollmilch_1l: 1,
    tk_beeren_300g: 1,
    honig_500g: 1,
  }),
  builtin("kartoffelsuppe", "Kartoffelsuppe mit Würstchen", 4, 45, ["Klassiker"], {
    kartoffeln_2kg: 1,
    karotten_1kg: 1,
    lauch_porree_1st: 1,
    wiener_wuerstchen_400g: 1,
    gemuesebruehe_pulver_200g: 1,
  }),
];

/** Zutaten auf die gewünschte Portionenzahl umrechnen (immer ganze Packungen, mindestens eine) */
export const scaleRecipeIngredients = (
  recipe: Pick<RecipeDefinition, "servings" | "ingredients">,
  servings: number,
): BasketItemInput[] => {
  const factor = servings / Math.max(1, recipe.servings);
  return recipe.ingredients
    .filter((ingredient) => CATEGORY_MAP[ingredient.categoryId] != null && ingredient.quantity > 0)
    .map((ingredient) => ({
      categoryId: ingredient.categoryId,
      quantity: Math.max(1, Math.ceil(ingredient.quantity * factor - 1e-9)),
    }));
};

/** Zutaten eines Gerichts zur Einkaufsliste addieren; vorhandene Artikel behalten ihre Präferenz */
export const addRecipeToBasket = (
  basket: readonly BasketItemInput[],
  recipe: Pick<RecipeDefinition, "servings" | "ingredients">,
  servings: number,
): BasketItemInput[] => {
  const next = basket.map((item) => ({ ...item }));
  for (const ingredient of scaleRecipeIngredients(recipe, servings)) {
    const existing = next.find((item) => item.categoryId === ingredient.categoryId);
    if (existing) {
      existing.quantity += ingredient.quantity;
    } else {
      next.push(ingredient);
    }
  }
  return next;
};

export interface RecipeScore {
  recipe: RecipeDefinition;
  servings: number;
  bestStoreId: StoreId;
  bestStoreName: string;
  checkoutCents: number;
  regularCents: number;
  savingsCents: number;
  /** Ersparnis in ganzen Prozent gegenüber Normalpreis */
  savingsPercent: number;
  offerCount: number;
  costPerServingCents: number;
}

export type RecipeScoringInput = Pick<
  OptimizationInput,
  "enabledStores" | "enabledLoyaltyApps" | "shoppingDate" | "customBasePrices"
> & {
  recipes: readonly RecipeDefinition[];
  offers: readonly OfferRecord[];
  servings?: number;
};

/**
 * „Was ist diese Woche günstig zu kochen?“: Kassenpreis jedes Gerichts im günstigsten Markt,
 * sortiert nach Ersparnis durch Wochenangebote (absolut, dann prozentual, dann Preis).
 */
export const scoreRecipesForWeek = (input: RecipeScoringInput): RecipeScore[] => {
  const scores: RecipeScore[] = [];

  for (const recipe of input.recipes) {
    const servings = input.servings ?? recipe.servings;
    const items = scaleRecipeIngredients(recipe, servings);
    if (items.length === 0) continue;

    const result = optimizeShoppingBasket({
      items,
      enabledStores: input.enabledStores,
      enabledLoyaltyApps: input.enabledLoyaltyApps,
      shoppingDate: input.shoppingDate,
      offers: input.offers,
      customBasePrices: input.customBasePrices,
    });
    const best = result.bestSingleStore;
    if (!best) continue;

    const savingsCents = Math.max(0, best.totalRegularCents - best.totalCheckoutCents);
    scores.push({
      recipe,
      servings,
      bestStoreId: best.storeId,
      bestStoreName: best.storeName,
      checkoutCents: best.totalCheckoutCents,
      regularCents: best.totalRegularCents,
      savingsCents,
      savingsPercent:
        best.totalRegularCents > 0 ? Math.round((savingsCents / best.totalRegularCents) * 100) : 0,
      offerCount: best.offerCount,
      costPerServingCents: Math.round(best.totalCheckoutCents / Math.max(1, servings)),
    });
  }

  return scores.sort(
    (a, b) =>
      b.savingsCents - a.savingsCents ||
      b.savingsPercent - a.savingsPercent ||
      a.checkoutCents - b.checkoutCents ||
      a.recipe.name.localeCompare(b.recipe.name, "de"),
  );
};
