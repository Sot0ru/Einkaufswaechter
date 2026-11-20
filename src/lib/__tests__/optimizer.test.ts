import { describe, expect, it } from "vitest";
import { buildDemoOffersForDate } from "@/lib/providers/demo-offers";
import { SHOPPING_PRESETS } from "@/lib/rules/catalog";
import {
  type OfferRecord,
  optimizeShoppingBasket,
  resolveStoreItemPrice,
} from "@/lib/rules/optimizer";

describe("Warenkorb-Optimierer (optimizer.ts)", () => {
  it("hält gleich teure Standardartikel beim Smart-Split immer im Hauptladen (Tie-Breaking)", () => {
    const offers: OfferRecord[] = [
      {
        id: "rewe-butter",
        storeId: "rewe",
        categoryId: "butter_250g",
        title: "Kerrygold Irische Butter 250g",
        priceCents: 149,
        loyaltyPriceCents: null,
        requiresLoyaltyApp: false,
        packageAmount: 250,
        packageUnit: "g",
        validFrom: "2026-11-16",
        validTo: "2026-11-21",
      },
      {
        id: "lidl-kaffee",
        storeId: "lidl",
        categoryId: "filterkaffee_500g",
        title: "Bellarom Gold Aktion 500g",
        priceCents: 349,
        loyaltyPriceCents: null,
        requiresLoyaltyApp: false,
        packageAmount: 500,
        packageUnit: "g",
        validFrom: "2026-11-16",
        validTo: "2026-11-21",
      },
    ];

    const result = optimizeShoppingBasket({
      items: [
        { categoryId: "vollmilch_1l", quantity: 2 }, // Gleich teuer bei Lidl & Rewe (0,99 €)
        { categoryId: "pasta_500g", quantity: 2 }, // Gleich teuer bei Lidl & Rewe (0,79 €)
        { categoryId: "eier_10st", quantity: 1 }, // Gleich teuer bei Lidl & Rewe (1,99 €)
        { categoryId: "filterkaffee_500g", quantity: 2 }, // Günstiger bei Lidl
        { categoryId: "butter_250g", quantity: 4 }, // Günstiger bei Rewe
      ],
      enabledStores: ["lidl", "rewe"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-18",
      secondStoreThresholdCents: 300,
      offers,
    });

    expect(result.bestTwoStoreSplit).not.toBeNull();
    const split = result.bestTwoStoreSplit!;
    expect(split.primaryStoreId).toBe("lidl");
    expect(split.secondaryStoreId).toBe("rewe");

    // Im Zweitladen (Rewe) darf NUR die Butter landen – alle gleich teuren Artikel bleiben bei Lidl!
    expect(split.secondaryItems.map((i) => i.categoryId)).toEqual(["butter_250g"]);
    expect(split.primaryItems.map((i) => i.categoryId)).toContain("vollmilch_1l");
    expect(split.primaryItems.map((i) => i.categoryId)).toContain("pasta_500g");
    expect(split.worthSecondStore).toBe(true);
    expect( result.recommendedStrategy).toBe("split");
  });

  it("empfiehlt 1 Laden, wenn die Zusatz-Ersparnis des 2. Ladens unter dem Schwellenwert liegt", () => {
    const offers = buildDemoOffersForDate("2026-11-21");

    const highThresholdResult = optimizeShoppingBasket({
      items: SHOPPING_PRESETS[0].items,
      enabledStores: ["lidl", "rewe", "kaufland", "aldi", "edeka"],
      enabledLoyaltyApps: ["lidl", "rewe", "kaufland"],
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 2500, // 25,00 € Schwelle
      offers,
    });

    expect(highThresholdResult.bestTwoStoreSplit?.worthSecondStore).toBe(false);
    expect(highThresholdResult.recommendedStrategy).toBe("single");
  });

  it("berücksichtigt Donnerstags-Angebote erst, wenn der Einkaufstag >= Donnerstag liegt", () => {
    const offers = buildDemoOffersForDate("2026-11-18"); // Mo=16.11., Do=19.11., Sa=21.11.

    const tuesdayPrice = resolveStoreItemPrice({
      categoryId: "hackfleisch_500g",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-17", // Dienstag -> noch kein Do.-Angebot
      hasLoyaltyApp: true,
      offers,
    });

    const saturdayPrice = resolveStoreItemPrice({
      categoryId: "hackfleisch_500g",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-21", // Samstag -> Do.-Angebot (2,89 € statt 3,99 €) aktiv!
      hasLoyaltyApp: true,
      offers,
    });

    expect(tuesdayPrice.isOffer).toBe(false);
    expect(tuesdayPrice.checkoutCents).toBe(399);

    expect(saturdayPrice.isOffer).toBe(true);
    expect(saturdayPrice.checkoutCents).toBe(289);
  });

  it("rechnet App-Coupons (z. B. Lidl Plus) nur ein, wenn die Treue-App aktiviert ist", () => {
    const offers = buildDemoOffersForDate("2026-11-18");

    const withoutApp = resolveStoreItemPrice({
      categoryId: "pasta_500g",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers,
    });

    const withApp = resolveStoreItemPrice({
      categoryId: "pasta_500g",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: true,
      offers,
    });

    // Eigenmarke kostet 0,79 €, Barilla ohne Lidl Plus kostet 0,99 € -> ohne App gewinnt Eigenmarke (79 Cent)!
    expect(withoutApp.checkoutCents).toBe(79);
    expect(withoutApp.usedLoyaltyApp).toBe(false);

    // Mit Lidl Plus kostet Barilla 0,85 € vs Eigenmarke 0,79 €; bei Eiern (1,59 € mit Lidl Plus statt 1,99 €) gewinnt das App-Angebot:
    const eggsWithoutApp = resolveStoreItemPrice({
      categoryId: "eier_10st",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers,
    });
    const eggsWithApp = resolveStoreItemPrice({
      categoryId: "eier_10st",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: true,
      offers,
    });

    expect(withApp.checkoutCents).toBe(79);
    expect(eggsWithoutApp.checkoutCents).toBe(199);
    expect(eggsWithApp.checkoutCents).toBe(159);
    expect(eggsWithApp.usedLoyaltyApp).toBe(true);
  });

  it("rechnet nach echtem Kassenpreis und zeigt bei günstigeren XXL-Großpackungen den €/kg-Hinweis", () => {
    const offers = buildDemoOffersForDate("2026-11-18");

    // Bei Kaufland kostet 500g Hackfleisch regulär 3,89 € (7,78 €/kg).
    // Im Angebot ist die 800g XXL-Packung für 4,40 € (Grundpreis 5,50 €/kg).
    const resolved = resolveStoreItemPrice({
      categoryId: "hackfleisch_500g",
      quantity: 1,
      storeId: "kaufland",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: true,
      offers,
    });

    // Kassenpreis für 500g bleibt 3,89 € (weil 3,89 € < 4,40 € an der Kasse),
    // aber der Großpackungs-Hinweis macht auf den 5,50 €/kg Grundpreis aufmerksam:
    expect(resolved.checkoutCents).toBe(389);
    expect(resolved.bulkPackHint).toContain("800 g");
    expect(resolved.bulkPackHint).toContain("5,50 €/kg");
  });
});
