import { CATEGORIES, type BaseUnit, type CategoryDefinition } from "./catalog";

export interface ParsedPackageSize {
  amount: number;
  unit: BaseUnit;
}

export interface RawOfferCandidate {
  title: string;
  description?: string;
  priceCents: number;
  loyaltyPriceCents?: number | null;
}

export interface MatchedOfferResult {
  categoryId: string;
  categoryName: string;
  matchedKeyword: string;
  packageAmount: number;
  packageUnit: BaseUnit;
  /** Grundpreis in Cent pro 1 kg, 1 Liter oder 1 Stück */
  unitPriceCents: number;
  /** Ist die Aktionspackung größer als die Standardpackung? (z. B. 800g statt 500g) */
  isBulkPack: boolean;
  requiresLoyaltyApp: boolean;
}

const LOYALTY_PATTERNS = [
  "lidl plus",
  "kaufland card",
  "kaufland-card",
  "rewe bonus",
  "edeka app",
  "netto app",
  "penny app",
  "nur mit app",
  "app-preis",
] as const;

export const detectLoyaltyRequirement = (text: string): boolean => {
  const lower = text.toLowerCase();
  return LOYALTY_PATTERNS.some((pattern) => lower.includes(pattern));
};

/**
 * Liest Packungsgrößen aus deutschen Prospekt-Zeilen aus:
 * - "6 x 1,5 l" -> { amount: 9000, unit: "ml" }
 * - "250-g-Pckg." -> { amount: 250, unit: "g" }
 * - "0,75 l" -> { amount: 750, unit: "ml" }
 * - "10er-Pack" / "8 Rollen" -> { amount: 10 / 8, unit: "stueck" }
 */
export const parsePackageSize = (text: string): ParsedPackageSize | null => {
  // Grundpreis-Klammern wie "(1 kg = 6,36)" oder "1 l = 1.98" vorher entfernen,
  // damit nicht "1 kg" aus dem Referenzpreis als Packungsgröße gelesen wird.
  const cleaned = text
    .toLowerCase()
    .replace(/\(?\b1\s*(?:kg|l|liter)\s*=\s*\d+[,.]\d+\s*€?\)?/g, " ")
    .replace(/\bje\s+1\s*(?:kg|l)\s*=\s*\d+[,.]\d+/g, " ");

  // 1. Multipack wie "6 x 1,5 l" oder "2x 250 g"
  const multiMatch = cleaned.match(
    /\b(\d+)\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(kg|g|gramm|l|liter|ml)\b/,
  );
  if (multiMatch) {
    const count = Number.parseInt(multiMatch[1], 10);
    const singleValue = Number.parseFloat(multiMatch[2].replace(",", "."));
    const rawUnit = multiMatch[3];
    return normalizeUnitAndAmount(count * singleValue, rawUnit);
  }

  // 2. Einzelgewicht / Volumen wie "250-g-Packung", "500 g", "1,5 l", "750 ml"
  const singleMatch = cleaned.match(
    /\b(\d+(?:[,.]\d+)?)\s*[-\s]?\s*(kg|g|gramm|l|liter|ml)(?:\b|-)/,
  );
  if (singleMatch) {
    const value = Number.parseFloat(singleMatch[1].replace(",", "."));
    const rawUnit = singleMatch[2];
    return normalizeUnitAndAmount(value, rawUnit);
  }

  // 3. Stückzahl wie "10er", "8 Rollen", "6 Stück"
  const pieceMatch = cleaned.match(/\b(\d+)\s*(?:er[-\s]?(?:pack|pckg|karton)?|stück|st\.|rollen)\b/);
  if (pieceMatch) {
    const count = Number.parseInt(pieceMatch[1], 10);
    if (count > 0 && count <= 100) {
      return { amount: count, unit: "stueck" };
    }
  }

  return null;
};

const normalizeUnitAndAmount = (value: number, rawUnit: string): ParsedPackageSize | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (rawUnit === "kg") {
    return { amount: Math.round(value * 1000), unit: "g" };
  }
  if (rawUnit === "g" || rawUnit === "gramm") {
    return { amount: Math.round(value), unit: "g" };
  }
  if (rawUnit === "l" || rawUnit === "liter") {
    return { amount: Math.round(value * 1000), unit: "ml" };
  }
  if (rawUnit === "ml") {
    return { amount: Math.round(value), unit: "ml" };
  }
  return null;
};

/**
 * Berechnet den Grundpreis in Cent pro 1 kg (bei 'g'), 1 Liter (bei 'ml') oder 1 Stück (bei 'stueck').
 */
export const computeUnitPriceCents = (
  priceCents: number,
  amount: number,
  unit: BaseUnit,
): number => {
  if (amount <= 0) return priceCents;
  if (unit === "g" || unit === "ml") {
    return Math.round((priceCents / amount) * 1000);
  }
  return Math.round(priceCents / amount);
};

/**
 * Prüft deterministisch, ob ein Angebotstitel zu einer unserer Standard-Kategorien passt.
 * Schützt durch `excludeKeywords` und Preis-Plausibilitäts-Korridore vor Fehlzuordnungen
 * wie der "Butterkäse-Falle".
 */
export const matchOfferToCategory = (
  candidate: RawOfferCandidate,
  categories: readonly CategoryDefinition[] = CATEGORIES,
): MatchedOfferResult | null => {
  const fullText = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
  const parsedSize = parsePackageSize(fullText);
  const requiresLoyalty =
    candidate.loyaltyPriceCents != null || detectLoyaltyRequirement(fullText);

  let bestCategory: CategoryDefinition | null = null;
  let bestKeyword = "";
  let bestScore = -1;

  for (const category of categories) {
    // 1. Ausschluss-Keywords zuerst prüfen (z. B. "butterkäse" schließt Kategorie "butter_250g" sofort aus)
    const isExcluded = category.excludeKeywords.some((ex) => fullText.includes(ex));
    if (isExcluded) continue;

    // 2. Include-Keywords prüfen
    const matchingKeywords = category.includeKeywords.filter((inc) => fullText.includes(inc));
    if (matchingKeywords.length === 0) continue;

    // Längstes gematchtes Keyword bevorzugen (spezifischer Treffer schlägt kurzen Teilbegriff)
    const longestKeyword = matchingKeywords.reduce((a, b) => (b.length > a.length ? b : a));

    // 3. Wenn eine Einheit erkannt wurde, muss sie zur Kategorie-Einheit passen
    if (parsedSize && parsedSize.unit !== category.unit) {
      continue;
    }

    const effectiveAmount = parsedSize ? parsedSize.amount : category.standardAmount;
    const effectivePriceCents =
      candidate.loyaltyPriceCents != null && candidate.loyaltyPriceCents > 0
        ? Math.min(candidate.priceCents, candidate.loyaltyPriceCents)
        : candidate.priceCents;

    // 4. Preis-Plausibilität auf Standardmenge normiert prüfen
    const normalizedPriceForStandardAmount = Math.round(
      (effectivePriceCents / effectiveAmount) * category.standardAmount,
    );

    if (
      normalizedPriceForStandardAmount < category.minPlausiblePriceCents ||
      normalizedPriceForStandardAmount > category.maxPlausiblePriceCents
    ) {
      continue;
    }

    const score = longestKeyword.length * 10 + (parsedSize ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
      bestKeyword = longestKeyword;
    }
  }

  if (!bestCategory) return null;

  const packageAmount = parsedSize ? parsedSize.amount : bestCategory.standardAmount;
  const packageUnit = bestCategory.unit;
  const unitPriceCents = computeUnitPriceCents(candidate.priceCents, packageAmount, packageUnit);
  const isBulkPack = packageAmount > bestCategory.standardAmount * 1.25;

  return {
    categoryId: bestCategory.id,
    categoryName: bestCategory.name,
    matchedKeyword: bestKeyword,
    packageAmount,
    packageUnit,
    unitPriceCents,
    isBulkPack,
    requiresLoyaltyApp: requiresLoyalty,
  };
};
