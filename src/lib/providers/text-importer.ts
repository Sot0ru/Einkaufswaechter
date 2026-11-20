import type { StoreId } from "@/lib/rules/catalog";
import { detectLoyaltyRequirement, matchOfferToCategory } from "@/lib/rules/matcher";
import type { OfferRecord } from "@/lib/rules/optimizer";
import { getWeekWindowForDate } from "./demo-offers";

export interface BrochureLineParseResult {
  rawLine: string;
  matched: boolean;
  offer: OfferRecord | null;
  reasonIfSkipped: string | null;
}

/**
 * Liest mehrzeiligen Prospekt-Freitext ein (z. B. aus einem PDF oder einer Webseite kopiert)
 * und ordnet jede Zeile deterministisch über den Regel-Matcher einer Standard-Kategorie zu.
 *
 * Beispiel-Zeilen:
 * - "Kerrygold Original Irische Butter 250g 1,59 €"
 * - "Dallmayr Prodomo 500 g 4,69 € (Mit Kaufland Card 4,29 €)"
 * - "Metzgerfrisch Hackfleisch gemischt 500g ab Donnerstag 2,89 €"
 * - "Kerrygold Butterkäse 150g 1,79 €" -> wird durch excludeKeywords sauber abgelehnt!
 */
export const parseBrochureText = (params: {
  text: string;
  storeId: StoreId;
  referenceDate: string;
}): BrochureLineParseResult[] => {
  const { text, storeId, referenceDate } = params;
  const week = getWeekWindowForDate(referenceDate);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((rawLine, index) => {
    // Grundpreis-Klammern wie "(1 kg = 6,36)" vor der Preis-Extraktion ausblenden
    const lineWithoutUnitPrice = rawLine
      .replace(/\(?\b1\s*(?:kg|l|liter)\s*=\s*\d+[,.]\d+\s*€?\)?/gi, " ")
      .replace(/\bje\s+1\s*(?:kg|l)\s*=\s*\d+[,.]\d+/gi, " ");

    // Alle Preis-Angaben wie "1,59 €", "1.59€" oder am Zeilenende "1,59" finden
    const priceMatches = Array.from(
      lineWithoutUnitPrice.matchAll(/\b(\d{1,2})[,.](\d{2})\s*€?/g),
    );

    if (priceMatches.length === 0) {
      return {
        rawLine,
        matched: false,
        offer: null,
        reasonIfSkipped: "Kein Preis in der Zeile erkannt (z. B. 1,59 €).",
      };
    }

    const parsedPricesCents = priceMatches
      .map((m) => Number.parseInt(m[1], 10) * 100 + Number.parseInt(m[2], 10))
      .filter((c) => c >= 25 && c <= 3000);

    if (parsedPricesCents.length === 0) {
      return {
        rawLine,
        matched: false,
        offer: null,
        reasonIfSkipped: "Preis außerhalb des Lebensmittel-Bereichs.",
      };
    }

    const hasLoyaltyHint = detectLoyaltyRequirement(rawLine);
    let priceCents = parsedPricesCents[0];
    let loyaltyPriceCents: number | null = null;
    let requiresLoyaltyApp = false;

    if (parsedPricesCents.length >= 2 && hasLoyaltyHint) {
      const sorted = [...parsedPricesCents].sort((a, b) => b - a);
      priceCents = sorted[0];
      loyaltyPriceCents = sorted[sorted.length - 1];
    } else if (hasLoyaltyHint) {
      loyaltyPriceCents = priceCents;
      requiresLoyaltyApp = true;
    }

    const match = matchOfferToCategory({
      title: rawLine,
      priceCents,
      loyaltyPriceCents,
    });

    if (!match) {
      return {
        rawLine,
        matched: false,
        offer: null,
        reasonIfSkipped:
          "Keine passende Standard-Kategorie oder durch Ausschlussregel (z. B. Butterkäse) gefiltert.",
      };
    }

    const isFromThursday = /\bab\s+(?:do\b|donnerstag)/i.test(rawLine);
    const cleanTitle = lineWithoutUnitPrice
      .replace(/\b(\d{1,2})[,.](\d{2})\s*€?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const offer: OfferRecord = {
      id: `import-${storeId}-${index}-${match.categoryId}`,
      storeId,
      categoryId: match.categoryId,
      title: cleanTitle || rawLine,
      priceCents,
      loyaltyPriceCents,
      requiresLoyaltyApp,
      packageAmount: match.packageAmount,
      packageUnit: match.packageUnit,
      validFrom: isFromThursday ? week.thursday : week.monday,
      validTo: week.saturday,
    };

    return {
      rawLine,
      matched: true,
      offer,
      reasonIfSkipped: null,
    };
  });
};
