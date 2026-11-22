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

describe("Paket 6: Produkt-Präferenz, Vorratstipp und Umweg-Gewichtung", () => {
  const offer = (
    id: string,
    storeId: OfferRecord["storeId"],
    categoryId: string,
    title: string,
    priceCents: number,
    packageAmount: number,
  ): OfferRecord => ({
    id,
    storeId,
    categoryId,
    title,
    priceCents,
    loyaltyPriceCents: null,
    requiresLoyaltyApp: false,
    packageAmount,
    packageUnit: "g",
    validFrom: "2026-11-16",
    validTo: "2026-11-21",
  });

  const butterOffers = [
    offer("lidl-eigenmarke", "lidl", "butter_250g", "Milbona Deutsche Markenbutter 250 g", 149, 250),
    offer("lidl-bio", "lidl", "butter_250g", "Bio Butter Bioland 250 g", 299, 250),
    offer("lidl-marke", "lidl", "butter_250g", "Kerrygold Original Irische Butter 250 g", 229, 250),
  ];

  const resolveButter = (preference?: "cheapest" | "bio" | "brand") =>
    resolveStoreItemPrice({
      categoryId: "butter_250g",
      quantity: 1,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers: butterOffers,
      preference,
    });

  it("nimmt ohne Präferenz unverändert das günstigste Angebot", () => {
    const resolved = resolveButter();
    expect(resolved.preference).toBe("cheapest");
    expect(resolved.checkoutCents).toBe(149);
    expect(resolved.regularCheckoutCents).toBe(239);
  });

  it("wertet bei Bio nur Bio-Angebote und rechnet gegen einen Bio-Normalpreis", () => {
    const resolved = resolveButter("bio");
    expect(resolved.productLabel).toBe("Bio Butter Bioland 250 g");
    expect(resolved.checkoutCents).toBe(299);
    // 2,39 € × 1,6 = 3,82 € → Regalpreis 3,79 €
    expect(resolved.regularCheckoutCents).toBe(379);
    expect(resolved.savingsCents).toBe(80);
  });

  it("ignoriert bei Marke die Eigenmarken-Angebote und bewertet gegen einen Marken-Referenzpreis", () => {
    const resolved = resolveButter("brand");
    expect(resolved.productLabel).toBe("Kerrygold Original Irische Butter 250 g");
    expect(resolved.checkoutCents).toBe(229);
    // 2,39 € × 1,8 = 4,30 € → Regalpreis 4,29 €
    expect(resolved.regularCheckoutCents).toBe(429);
  });

  it("schlägt bei Bio-Kategorien keinen zusätzlichen Bio-Aufschlag auf", () => {
    const plain = resolveStoreItemPrice({
      categoryId: "bio_vollmilch_1l",
      quantity: 1,
      storeId: "rewe",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers: [],
    });
    const bio = resolveStoreItemPrice({
      categoryId: "bio_vollmilch_1l",
      quantity: 1,
      storeId: "rewe",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers: [],
      preference: "bio",
    });
    expect(bio.regularCheckoutCents).toBe(plain.regularCheckoutCents);
  });

  it("gibt einen Vorratstipp nur bei haltbaren Artikeln mit mindestens 25 % Rabatt", () => {
    const offers = [
      offer("kaffee", "lidl", "filterkaffee_500g", "Bellarom Gold Aktion 500 g", 349, 500),
      offer("pasta", "lidl", "pasta_500g", "Combino Spaghetti 500 g", 69, 500),
      offer("butter", "lidl", "butter_250g", "Kerrygold Irische Butter 250 g", 149, 250),
    ];
    const resolve = (categoryId: string, quantity: number) =>
      resolveStoreItemPrice({
        categoryId,
        quantity,
        storeId: "lidl",
        shoppingDate: "2026-11-18",
        hasLoyaltyApp: false,
        offers,
      });

    // Kaffee: 3,49 € statt 4,99 € (−30 %) → Tipp mit der Ersparnis einer weiteren Menge
    expect(resolve("filterkaffee_500g", 2).stockUpHint).toBe(
      "Vorratstipp: 4× statt 2× mitnehmen spart zusätzlich 3,00 € gegenüber Normalpreis.",
    );
    // Pasta: nur −13 %
    expect(resolve("pasta_500g", 1).stockUpHint).toBeNull();
    // Butter ist nicht lange haltbar, trotz −38 %
    expect(resolve("butter_250g", 1).stockUpHint).toBeNull();
  });

  describe("Umweg-Gewichtung im Smart-Split", () => {
    const splitOffers = [
      offer("rewe-butter", "rewe", "butter_250g", "Kerrygold Irische Butter 250 g", 149, 250),
      offer("lidl-kaffee", "lidl", "filterkaffee_500g", "Bellarom Gold Aktion 500 g", 349, 500),
    ];
    const baseInput = {
      items: [
        { categoryId: "vollmilch_1l", quantity: 2 },
        { categoryId: "pasta_500g", quantity: 2 },
        { categoryId: "eier_10st", quantity: 1 },
        { categoryId: "filterkaffee_500g", quantity: 2 },
        { categoryId: "butter_250g", quantity: 4 },
      ],
      enabledStores: ["lidl", "rewe"] as OfferRecord["storeId"][],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-18",
      secondStoreThresholdCents: 250,
      offers: splitOffers,
    };

    it("verhält sich ohne Umweg-Angaben wie bisher", () => {
      const result = optimizeShoppingBasket(baseInput);
      const split = result.bestTwoStoreSplit!;
      expect(split.extraSavingsVsBestSingleCents).toBe(360);
      expect(split.detourMinutes).toBe(0);
      expect(split.savingsPerDetourMinuteCents).toBeNull();
      expect(split.meetsDetourEfficiency).toBe(true);
      expect(result.recommendedStrategy).toBe("split");
    });

    it("empfiehlt keinen Abstecher, wenn er pro Minute zu wenig spart", () => {
      // 3,60 € Zusatz-Ersparnis bei 10 Minuten Umweg = 36 ct/Min. < 50 ct/Min.
      const result = optimizeShoppingBasket({
        ...baseInput,
        storeDetourMinutes: { lidl: 10, rewe: 10 },
      });
      const split = result.bestTwoStoreSplit!;
      expect(split.detourMinutes).toBe(10);
      expect(split.savingsPerDetourMinuteCents).toBe(36);
      expect(split.meetsDetourEfficiency).toBe(false);
      expect(split.worthSecondStore).toBe(false);
      expect(result.recommendedStrategy).toBe("single");
    });

    it("macht den nahen Markt zum Abstecher, wenn sich nur dieser Umweg lohnt", () => {
      const result = optimizeShoppingBasket({
        ...baseInput,
        storeDetourMinutes: { lidl: 2, rewe: 10 },
      });
      const split = result.bestTwoStoreSplit!;
      expect(split.secondaryStoreId).toBe("lidl");
      expect(split.primaryStoreId).toBe("rewe");
      expect(split.savingsPerDetourMinuteCents).toBe(180);
      expect(split.worthSecondStore).toBe(true);
      expect(result.recommendedStrategy).toBe("split");
    });

    it("berücksichtigt eine eigene Mindest-Ersparnis pro Minute", () => {
      const result = optimizeShoppingBasket({
        ...baseInput,
        storeDetourMinutes: { lidl: 10, rewe: 10 },
        minSavingsPerDetourMinuteCents: 30,
      });
      expect(result.bestTwoStoreSplit!.worthSecondStore).toBe(true);
      expect(result.recommendedStrategy).toBe("split");
    });
  });
});
