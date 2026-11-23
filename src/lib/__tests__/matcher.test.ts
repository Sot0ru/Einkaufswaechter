import { describe, expect, it } from "vitest";
import { parseBrochureText } from "@/lib/providers/text-importer";
import { CATEGORIES, DEPARTMENTS, searchCatalogCategories, STORES } from "@/lib/rules/catalog";
import {
  computeUnitPriceCents,
  detectLoyaltyRequirement,
  matchOfferToCategory,
  parsePackageSize,
} from "@/lib/rules/matcher";

describe("Regelbasierter Angebots-Matcher (matcher.ts)", () => {
  it("umfasst mindestens 400 valide, eindeutig konfigurierte Vollsortiment-Kategorien über alle 8 Abteilungen", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(400);
    expect(CATEGORIES.length).toBeLessThanOrEqual(500);

    const seenIds = new Set<string>();
    for (const cat of CATEGORIES) {
      expect(seenIds.has(cat.id)).toBe(false);
      seenIds.add(cat.id);

      expect(cat.includeKeywords.length).toBeGreaterThan(0);
      for (const kw of cat.includeKeywords) {
        expect(kw).toBe(kw.toLowerCase());
        expect(kw.trim().length).toBeGreaterThan(0);
      }
      for (const ex of cat.excludeKeywords) {
        expect(ex).toBe(ex.toLowerCase());
        for (const inc of cat.includeKeywords) {
          expect(
            inc.includes(ex),
            `${cat.id}: includeKeyword "${inc}" darf nicht excludeKeyword "${ex}" enthalten`,
          ).toBe(false);
        }
      }

      expect(cat.minPlausiblePriceCents).toBeGreaterThan(0);
      expect(cat.maxPlausiblePriceCents).toBeGreaterThan(cat.minPlausiblePriceCents);

      for (const store of STORES) {
        const base = cat.defaultBasePrices[store.id];
        expect(base).toBeDefined();
        expect(base.productLabel.length).toBeGreaterThan(2);
        expect(base.priceCents).toBeGreaterThanOrEqual(cat.minPlausiblePriceCents);
        expect(base.priceCents).toBeLessThanOrEqual(cat.maxPlausiblePriceCents);
      }
    }

    for (const dept of DEPARTMENTS) {
      const countInDept = CATEGORIES.filter((c) => c.department === dept.id).length;
      expect(countInDept).toBeGreaterThanOrEqual(30);
    }

    // Marken-/Synonym-Suche prüfen
    expect(searchCatalogCategories("Nutella").some((c) => c.id === "nuss_nougat_creme_400g")).toBe(true);
    expect(searchCatalogCategories("Pampers").some((c) => c.id === "windeln_30st")).toBe(true);
    expect(searchCatalogCategories("Pringles").some((c) => c.id === "kartoffelchips_150g")).toBe(true);
  });

  it("ordnet für jede der 400+ Kategorien alle hinterlegten includeKeywords deterministisch der richtigen Kategorie zu", () => {
    for (const cat of CATEGORIES) {
      const unitLabel =
        cat.unit === "g" ? "g" : cat.unit === "ml" ? "ml" : "Stück";
      const offerPrice = Math.max(
        cat.minPlausiblePriceCents,
        Math.round(cat.defaultBasePrices.lidl.priceCents * 0.85),
      );

      for (const keyword of cat.includeKeywords) {
        const matched = matchOfferToCategory({
          title: `Wochenknaller ${keyword}`,
          description: `${cat.standardAmount} ${unitLabel} zum Aktionspreis`,
          priceCents: offerPrice,
        });

        expect(
          matched,
          `Kategorie ${cat.id} wurde für Keyword "${keyword}" nicht erkannt`,
        ).not.toBeNull();
        expect(
          matched?.categoryId,
          `Keyword "${keyword}" von ${cat.id} wurde fälschlich ${matched?.categoryId} zugeordnet`,
        ).toBe(cat.id);
      }
    }
  });

  it("ordnet echte Markenbutter-Angebote zuverlässig der Kategorie butter_250g zu", () => {
    const result = matchOfferToCategory({
      title: "Kerrygold Original Irische Butter",
      description: "250-g-Packung (1 kg = 6,36)",
      priceCents: 159,
    });

    expect(result).not.toBeNull();
    expect(result?.categoryId).toBe("butter_250g");
    expect(result?.packageAmount).toBe(250);
    expect(result?.packageUnit).toBe("g");
    expect(result?.unitPriceCents).toBe(636);
  });

  it("verhindert die Butterkäse-, Erdnussbutter- und Buttermilch-Falle durch excludeKeywords", () => {
    const butterkaese = matchOfferToCategory({
      title: "Kerrygold Irischer Butterkäse",
      description: "150-g-Packung",
      priceCents: 179,
    });
    expect(butterkaese?.categoryId).not.toBe("butter_250g");

    // Erdnussbutter hat jetzt ihre eigene Kategorie und landet niemals bei butter_250g
    const erdnussbutter = matchOfferToCategory({
      title: "American Erdnussbutter Creamy",
      description: "350-g-Glas",
      priceCents: 179,
    });
    expect(erdnussbutter?.categoryId).toBe("erdnussbutter_350g");

    // Buttermilch hat jetzt ihre eigene Kategorie und landet niemals bei butter_250g oder vollmilch_1l
    const buttermilch = matchOfferToCategory({
      title: "Müller Reine Buttermilch",
      description: "500-ml-Becher",
      priceCents: 69,
    });
    expect(buttermilch?.categoryId).toBe("buttermilch_500ml");
  });

  it("trennt verwandte Produktgruppen (Milch, Tomaten, Kartoffeln, Kaffee) trennscharf", () => {
    // Milch-Varianten
    expect(
      matchOfferToCategory({
        title: "Bärenmarke Frische Vollmilch 3,8 %",
        description: "1 l",
        priceCents: 99,
      })?.categoryId,
    ).toBe("vollmilch_1l");

    expect(
      matchOfferToCategory({
        title: "Milbona Haltbare Fettarme Milch 1,5 %",
        description: "1 l",
        priceCents: 89,
      })?.categoryId,
    ).toBe("fettarme_milch_1l");

    expect(
      matchOfferToCategory({
        title: "Oatly Haferdrink Barista Edition",
        description: "1 l",
        priceCents: 149,
      })?.categoryId,
    ).toBe("haferdrink_1l");

    // Tomaten-Varianten
    expect(
      matchOfferToCategory({
        title: "Spanische Rispentomaten",
        description: "500-g-Schale",
        priceCents: 111,
      })?.categoryId,
    ).toBe("rispentomaten_500g");

    expect(
      matchOfferToCategory({
        title: "Mutti Polpa Gehackte Tomaten",
        description: "400-g-Dose",
        priceCents: 99,
      })?.categoryId,
    ).toBe("passierte_tomaten_500g");

    expect(
      matchOfferToCategory({
        title: "Oro di Parma Tomatenmark 3-fach konzentriert",
        description: "200-g-Tube",
        priceCents: 119,
      })?.categoryId,
    ).toBe("tomatenmark_200g");

    expect(
      matchOfferToCategory({
        title: "Heinz Tomato Ketchup",
        description: "500-ml-Flasche",
        priceCents: 199,
      })?.categoryId,
    ).toBe("tomatenketchup_500ml");

    // Kaffee-Varianten
    expect(
      matchOfferToCategory({
        title: "Lavazza Caffè Crema Classico Ganze Bohnen",
        description: "1-kg-Packung",
        priceCents: 1199,
      })?.categoryId,
    ).toBe("kaffeebohnen_1kg");

    expect(
      matchOfferToCategory({
        title: "Senseo Classic Kaffeepads",
        description: "112-g-Beutel",
        priceCents: 179,
      })?.categoryId,
    ).toBe("kaffeepads_100g");

    expect(
      matchOfferToCategory({
        title: "Nescafé Gold Löslicher Bohnenkaffee",
        description: "200-g-Glas",
        priceCents: 549,
      })?.categoryId,
    ).toBe("loeslicher_kaffee_200g");
  });

  it("liest Packungsgrößen korrekt aus und ignoriert (1 kg = ...) sowie (100 g = ...) Referenzangaben", () => {
    expect(parsePackageSize("250-g-Pckg. (1 kg = 6,36)")).toEqual({
      amount: 250,
      unit: "g",
    });
    expect(parsePackageSize("Edel-Salami 200 g (100 g = 0,79 €)")).toEqual({
      amount: 200,
      unit: "g",
    });
    expect(parsePackageSize("Saskia Mineralwasser 6 x 1,5 l")).toEqual({
      amount: 9000,
      unit: "ml",
    });
    expect(parsePackageSize("Frische Eier 10er-Karton")).toEqual({
      amount: 10,
      unit: "stueck",
    });
    expect(parsePackageSize("Zewa Toilettenpapier 8 Rollen")).toEqual({
      amount: 8,
      unit: "stueck",
    });
    expect(parsePackageSize("Finish Powerball Geschirrspültabs 40 Tabs")).toEqual({
      amount: 40,
      unit: "stueck",
    });
    expect(parsePackageSize("Persil Vollwaschmittel 20 WL")).toEqual({
      amount: 20,
      unit: "stueck",
    });
  });

  it("erkennt Kundenkarten- und App-Bedingungen zuverlässig", () => {
    expect(detectLoyaltyRequirement("Nur 0,85 € mit Lidl Plus")).toBe(true);
    expect(detectLoyaltyRequirement("Kaufland Card Preis 4,29 €")).toBe(true);
    expect(detectLoyaltyRequirement("Normales Wochenangebot 1,59 €")).toBe(false);
  });

  it("berechnet den Grundpreis pro kg / Liter / Stück", () => {
    expect(computeUnitPriceCents(159, 250, "g")).toBe(636); // 6,36 €/kg
    expect(computeUnitPriceCents(440, 800, "g")).toBe(550); // 5,50 €/kg
    expect(computeUnitPriceCents(199, 10, "stueck")).toBe(20); // 0,20 €/Stück
  });

  it("parst mehrzeiligen Prospekt-Freitext inkl. Donnerstag-Gültigkeit und App-Preisen", () => {
    const text = [
      "Kerrygold Original Irische Butter 250-g-Packung 1,49 €",
      "Kerrygold Irischer Butterkäse 150-g-Packung 1,79 €",
      "Dallmayr Prodomo Röstkaffee 500 g 4,49 € (Mit Lidl Plus 3,99 €)",
      "Metzgerfrisch Rinderhackfleisch 500 g ab Donnerstag 2,79 €",
    ].join("\n");

    const parsed = parseBrochureText({
      text,
      storeId: "lidl",
      referenceDate: "2026-11-18", // Mittwoch -> Mo=2026-11-16, Do=2026-11-19, Sa=2026-11-21
    });

    expect(parsed).toHaveLength(4);
    expect(parsed[0].matched).toBe(true);
    expect(parsed[0].offer?.categoryId).toBe("butter_250g");
    expect(parsed[0].offer?.validFrom).toBe("2026-11-16");

    // Butterkäse wird nicht fälschlich als Butter zugeordnet
    expect(parsed[1].matched).toBe(false);

    // Kaffee mit Normal-Aktionspreis + Lidl Plus Preis
    expect(parsed[2].matched).toBe(true);
    expect(parsed[2].offer?.categoryId).toBe("filterkaffee_500g");
    expect(parsed[2].offer?.priceCents).toBe(449);
    expect(parsed[2].offer?.loyaltyPriceCents).toBe(399);

    // Hackfleisch erst ab Donnerstag gültig
    expect(parsed[3].matched).toBe(true);
    expect(parsed[3].offer?.categoryId).toBe("hackfleisch_500g");
    expect(parsed[3].offer?.validFrom).toBe("2026-11-19");
  });
});
