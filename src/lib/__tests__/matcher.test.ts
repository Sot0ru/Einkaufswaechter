import { describe, expect, it } from "vitest";
import { parseBrochureText } from "@/lib/providers/text-importer";
import {
  computeUnitPriceCents,
  detectLoyaltyRequirement,
  matchOfferToCategory,
  parsePackageSize,
} from "@/lib/rules/matcher";

describe("Regelbasierter Angebots-Matcher (matcher.ts)", () => {
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

    const erdnussbutter = matchOfferToCategory({
      title: "American Erdnussbutter Creamy",
      description: "250-g-Glas",
      priceCents: 179,
    });
    expect(erdnussbutter).toBeNull();

    const buttermilch = matchOfferToCategory({
      title: "Müller Reine Buttermilch",
      description: "500-ml-Becher",
      priceCents: 79,
    });
    expect(buttermilch).toBeNull();
  });

  it("liest Packungsgrößen korrekt aus und ignoriert (1 kg = ...) Referenzangaben", () => {
    expect(parsePackageSize("250-g-Pckg. (1 kg = 6,36)")).toEqual({
      amount: 250,
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
