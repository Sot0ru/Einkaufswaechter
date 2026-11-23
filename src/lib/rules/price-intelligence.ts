import { CATEGORY_MAP, type BaseUnit, type StoreId } from "./catalog";
import { computeUnitPriceCents } from "./matcher";
import type { OfferRecord, ResolvedStoreItem } from "./optimizer";

export interface PriceHistorySample {
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  packageAmount: number;
  packageUnit: BaseUnit;
  observedDate: string; // YYYY-MM-DD
  source: "weekly_offer" | "receipt" | "barcode" | "open_prices";
  isOffer: boolean;
}

export interface CategoryPriceStats {
  categoryId: string;
  sampleCount: number;
  minUnitPriceCents: number;
  medianUnitPriceCents: number;
  maxUnitPriceCents: number;
  /** Größte beobachtete Packungsgröße der letzten 90 Tage (für Shrinkflation-Erkennung) */
  maxObservedPackageAmount: number;
  lastObservedDate: string | null;
}

export interface VerifiedPriceRecord {
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  observedDate: string; // YYYY-MM-DD
  source: "receipt" | "barcode" | "open_prices";
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
}

export interface PriceHistorySummary {
  windowDays: number;
  referenceDate: string;
  categoryStats: Record<string, CategoryPriceStats>;
  /** Schlüssel: `${categoryId}:${storeId}` */
  verifiedPrices: Record<string, VerifiedPriceRecord>;
}

export type DealRating = "top_deal" | "good_deal" | "fair" | "fake_deal";

export interface ShrinkflationWarning {
  currentAmount: number;
  referenceAmount: number;
  unit: BaseUnit;
  unitPriceIncreasePercent: number;
  message: string;
}

export interface DealAssessment {
  rating: DealRating;
  label: string;
  savingsPercentVsRegular: number;
  isHistoricLow: boolean;
  unitPriceCents: number;
  referenceUnitPriceCents: number;
  shrinkflationWarning: ShrinkflationWarning | null;
}

export type PriceConfidenceSource =
  | "live_scraped"
  | "open_prices"
  | "receipt_verified"
  | "user_calibrated"
  | "regional_offer"
  | "estimated";

export interface PriceConfidence {
  source: PriceConfidenceSource;
  level: "high" | "medium" | "estimated";
  label: string;
  daysAgo: number | null;
}

const parseIsoDayUtc = (isoDate: string): number | null => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  return Date.UTC(year, month, day);
};

export const diffDaysIso = (earlierIso: string, laterIso: string): number | null => {
  const a = parseIsoDayUtc(earlierIso);
  const b = parseIsoDayUtc(laterIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
};

export const formatRelativeDaysDe = (
  observedDate: string,
  referenceDate: string,
): { text: string; daysAgo: number | null } => {
  const days = diffDaysIso(observedDate, referenceDate);
  if (days == null) return { text: "", daysAgo: null };
  if (days <= 0) return { text: "heute", daysAgo: 0 };
  if (days === 1) return { text: "gestern", daysAgo: 1 };
  return { text: `vor ${days} Tagen`, daysAgo: days };
};

const formatAmountDe = (amount: number, unit: BaseUnit): string => {
  if (unit === "g" && amount >= 1000 && amount % 100 === 0) {
    const kg = amount / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace(".", ",")} kg`;
  }
  if (unit === "ml" && amount >= 1000 && amount % 100 === 0) {
    const liters = amount / 1000;
    return `${Number.isInteger(liters) ? liters : liters.toFixed(1).replace(".", ",")} L`;
  }
  if (unit === "stueck") return `${amount} Stk.`;
  return `${amount} ${unit}`;
};

const computeMedian = (sorted: readonly number[]): number => {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/**
 * Aggregiert historische Preisbeobachtungen (z. B. aus 90 Tagen `weekly_offers` und
 * `receipt_observations`) je Kategorie in Min-, Median- und Max-Grundpreise sowie
 * die größte beobachtete Packungsgröße für den Shrinkflation-Wächter.
 */
export const buildCategoryPriceStats = (
  samples: readonly PriceHistorySample[],
  referenceDate: string,
  windowDays = 90,
): Record<string, CategoryPriceStats> => {
  const byCategory = new Map<
    string,
    { unitPrices: number[]; maxPackageAmount: number; lastDate: string | null }
  >();

  for (const sample of samples) {
    if (sample.priceCents <= 0 || sample.packageAmount <= 0) continue;
    const age = diffDaysIso(sample.observedDate, referenceDate);
    if (age != null && age > windowDays) continue;

    const unitPrice = computeUnitPriceCents(
      sample.priceCents,
      sample.packageAmount,
      sample.packageUnit,
    );
    const bucket = byCategory.get(sample.categoryId) ?? {
      unitPrices: [],
      maxPackageAmount: sample.packageAmount,
      lastDate: null,
    };
    bucket.unitPrices.push(unitPrice);
    if (sample.packageAmount > bucket.maxPackageAmount) {
      bucket.maxPackageAmount = sample.packageAmount;
    }
    if (!bucket.lastDate || sample.observedDate > bucket.lastDate) {
      bucket.lastDate = sample.observedDate;
    }
    byCategory.set(sample.categoryId, bucket);
  }

  const result: Record<string, CategoryPriceStats> = {};
  for (const [categoryId, bucket] of byCategory.entries()) {
    const sorted = [...bucket.unitPrices].sort((a, b) => a - b);
    result[categoryId] = {
      categoryId,
      sampleCount: sorted.length,
      minUnitPriceCents: sorted[0],
      medianUnitPriceCents: computeMedian(sorted),
      maxUnitPriceCents: sorted[sorted.length - 1],
      maxObservedPackageAmount: bucket.maxPackageAmount,
      lastObservedDate: bucket.lastDate,
    };
  }

  return result;
};

/**
 * Prüft auf Shrinkflation (versteckte Preiserhöhung durch verkleinerte Packung bei
 * gleichzeitig spürbar höherem Grundpreis €/kg bzw. €/L).
 */
export const detectShrinkflation = (params: {
  categoryId: string;
  packageAmount: number;
  packageUnit: BaseUnit;
  priceCents: number;
  referencePriceCents: number;
  historicalMaxPackageAmount?: number;
}): ShrinkflationWarning | null => {
  const category = CATEGORY_MAP[params.categoryId];
  if (!category || params.packageUnit !== category.unit) return null;
  if (params.packageAmount <= 0 || params.priceCents <= 0 || params.referencePriceCents <= 0) {
    return null;
  }

  // Referenz-Packungsgröße ist die Normgröße (oder eine größere historische Packung bis max. 1,5x Norm,
  // damit reguläre Großpackungen/Familienpackungen keinen Fehlalarm auslösen).
  const cappedHistorical =
    params.historicalMaxPackageAmount != null &&
    params.historicalMaxPackageAmount <= Math.round(category.standardAmount * 1.35)
      ? params.historicalMaxPackageAmount
      : category.standardAmount;
  const referenceAmount = Math.max(category.standardAmount, cappedHistorical);

  // Mindestens 8 % kleiner als die Referenz-Packungsgröße, aber noch im typischen Packungsbereich
  // (nicht z. B. eine 100g-Mini-Probierpackung gegen 1kg)
  const shrinkRatio = params.packageAmount / referenceAmount;
  if (shrinkRatio >= 0.92 || shrinkRatio < 0.5) {
    return null;
  }

  const currentUnitPrice = computeUnitPriceCents(
    params.priceCents,
    params.packageAmount,
    params.packageUnit,
  );
  const referenceUnitPrice = computeUnitPriceCents(
    params.referencePriceCents,
    category.standardAmount,
    category.unit,
  );
  if (referenceUnitPrice <= 0) return null;

  const increasePercent = Math.round(
    ((currentUnitPrice - referenceUnitPrice) / referenceUnitPrice) * 100,
  );

  // Nur warnen, wenn der Grundpreis tatsächlich um mindestens 8 % über der Referenz liegt
  if (increasePercent < 8) return null;

  return {
    currentAmount: params.packageAmount,
    referenceAmount,
    unit: params.packageUnit,
    unitPriceIncreasePercent: increasePercent,
    message: `Shrinkflation-Hinweis: ${formatAmountDe(params.packageAmount, params.packageUnit)} statt ${formatAmountDe(referenceAmount, params.packageUnit)} (+${increasePercent} % Grundpreis)`,
  };
};

/**
 * Bewertet ein Wochenangebot deterministisch nach der Schnäppchen-Ampel
 * („Echter Tiefstpreis“, „Gutes Angebot“, „Üblicher Preis“, „Schein-Angebot“)
 * inklusive Shrinkflation-Wächter.
 */
export const evaluateOfferDeal = (
  offer: OfferRecord,
  stats?: CategoryPriceStats,
  customBasePrices?: Record<
    string,
    Partial<Record<StoreId, { priceCents: number; productLabel: string }>>
  >,
): DealAssessment => {
  const category = CATEGORY_MAP[offer.categoryId];
  const effectivePriceCents =
    offer.loyaltyPriceCents != null && offer.loyaltyPriceCents < offer.priceCents
      ? offer.loyaltyPriceCents
      : offer.priceCents;

  const unitPriceCents = computeUnitPriceCents(
    effectivePriceCents,
    offer.packageAmount,
    offer.packageUnit,
  );

  if (!category) {
    return {
      rating: "fair",
      label: "Üblicher Preis",
      savingsPercentVsRegular: 0,
      isHistoricLow: false,
      unitPriceCents,
      referenceUnitPriceCents: unitPriceCents,
      shrinkflationWarning: null,
    };
  }

  const regularPackCents =
    customBasePrices?.[offer.categoryId]?.[offer.storeId]?.priceCents ??
    category.defaultBasePrices[offer.storeId].priceCents;

  const referenceUnitPriceCents = computeUnitPriceCents(
    regularPackCents,
    category.standardAmount,
    category.unit,
  );

  const savingsPercentVsRegular =
    referenceUnitPriceCents > 0
      ? Math.round(((referenceUnitPriceCents - unitPriceCents) / referenceUnitPriceCents) * 100)
      : 0;

  const isHistoricLow =
    stats != null && stats.sampleCount >= 2 && unitPriceCents <= stats.minUnitPriceCents;

  const shrinkflationWarning = detectShrinkflation({
    categoryId: offer.categoryId,
    packageAmount: offer.packageAmount,
    packageUnit: offer.packageUnit,
    priceCents: effectivePriceCents,
    referencePriceCents: regularPackCents,
    historicalMaxPackageAmount: stats?.maxObservedPackageAmount,
  });

  if (savingsPercentVsRegular <= 0 || shrinkflationWarning != null) {
    return {
      rating: "fake_deal",
      label:
        shrinkflationWarning != null
          ? "Schein-Angebot (kleinere Packung)"
          : "Schein-Angebot (nicht günstiger als Normalpreis)",
      savingsPercentVsRegular,
      isHistoricLow: false,
      unitPriceCents,
      referenceUnitPriceCents,
      shrinkflationWarning,
    };
  }

  if (savingsPercentVsRegular >= 20 || (isHistoricLow && savingsPercentVsRegular >= 12)) {
    return {
      rating: "top_deal",
      label: isHistoricLow
        ? `Echter Tiefstpreis (-${savingsPercentVsRegular} %)`
        : `Top-Deal (-${savingsPercentVsRegular} %)`,
      savingsPercentVsRegular,
      isHistoricLow,
      unitPriceCents,
      referenceUnitPriceCents,
      shrinkflationWarning: null,
    };
  }

  if (savingsPercentVsRegular >= 8) {
    return {
      rating: "good_deal",
      label: `Gutes Angebot (-${savingsPercentVsRegular} %)`,
      savingsPercentVsRegular,
      isHistoricLow,
      unitPriceCents,
      referenceUnitPriceCents,
      shrinkflationWarning: null,
    };
  }

  return {
    rating: "fair",
    label: `Leicht reduziert (-${savingsPercentVsRegular} %)`,
    savingsPercentVsRegular,
    isHistoricLow,
    unitPriceCents,
    referenceUnitPriceCents,
    shrinkflationWarning: null,
  };
};

/**
 * Ermittelt die Preiskonfidenz eines einzelnen Wochenangebots.
 */
export const assessOfferConfidence = (
  offer: OfferRecord,
  referenceDate: string,
  verifiedRecord?: VerifiedPriceRecord,
): PriceConfidence => {
  if (offer.id.startsWith("live-")) {
    return {
      source: "live_scraped",
      level: "high",
      label: "Live-Angebot",
      daysAgo: 0,
    };
  }
  if (offer.id.startsWith("openprices-")) {
    const rel = verifiedRecord
      ? formatRelativeDaysDe(verifiedRecord.observedDate, referenceDate)
      : formatRelativeDaysDe(offer.validFrom, referenceDate);
    return {
      source: "open_prices",
      level: rel.daysAgo != null && rel.daysAgo <= 30 ? "high" : "medium",
      label: rel.text ? `Open Prices (${rel.text})` : "Open Prices (Community)",
      daysAgo: rel.daysAgo,
    };
  }
  if (offer.id.startsWith("receipt-") || offer.id.startsWith("barcode-")) {
    const rel = formatRelativeDaysDe(offer.validFrom, referenceDate);
    return {
      source: "receipt_verified",
      level: "high",
      label: rel.text ? `Per Bon/Scan geprüft (${rel.text})` : "Per Bon/Scan geprüft",
      daysAgo: rel.daysAgo,
    };
  }
  if (verifiedRecord) {
    const rel = formatRelativeDaysDe(verifiedRecord.observedDate, referenceDate);
    if (verifiedRecord.source === "open_prices" && rel.daysAgo != null && rel.daysAgo <= 30) {
      return {
        source: "open_prices",
        level: "high",
        label: rel.text ? `Open Prices (${rel.text})` : "Open Prices",
        daysAgo: rel.daysAgo,
      };
    }
    if (rel.daysAgo != null && rel.daysAgo <= 14) {
      return {
        source: "receipt_verified",
        level: "high",
        label:
          verifiedRecord.source === "barcode"
            ? `Per Scan geprüft (${rel.text})`
            : `Per Bon geprüft (${rel.text})`,
        daysAgo: rel.daysAgo,
      };
    }
  }
  if (offer.id.startsWith("manual-")) {
    return {
      source: "user_calibrated",
      level: "high",
      label: "Manuell importiert",
      daysAgo: 0,
    };
  }
  return {
    source: "regional_offer",
    level: "medium",
    label: "Wochenangebot",
    daysAgo: null,
  };
};

/**
 * Ermittelt die Preiskonfidenz einer Position im berechneten Warenkorb / in der Abhakliste.
 */
export const assessResolvedItemConfidence = (params: {
  item: ResolvedStoreItem;
  matchingOffer?: OfferRecord;
  isUserCustomized: boolean;
  verifiedRecord?: VerifiedPriceRecord;
  referenceDate: string;
}): PriceConfidence => {
  const { item, matchingOffer, isUserCustomized, verifiedRecord, referenceDate } = params;

  if (item.isOffer && matchingOffer) {
    return assessOfferConfidence(matchingOffer, referenceDate, verifiedRecord);
  }

  if (verifiedRecord) {
    const rel = formatRelativeDaysDe(verifiedRecord.observedDate, referenceDate);
    if (verifiedRecord.source === "open_prices") {
      return {
        source: "open_prices",
        level: rel.daysAgo != null && rel.daysAgo <= 30 ? "high" : "medium",
        label: rel.text ? `Open Prices (${rel.text})` : "Open Prices (Community)",
        daysAgo: rel.daysAgo,
      };
    }
    return {
      source: "receipt_verified",
      level: rel.daysAgo != null && rel.daysAgo <= 30 ? "high" : "medium",
      label:
        verifiedRecord.source === "barcode"
          ? `Per Scan geprüft (${rel.text})`
          : `Per Bon geprüft (${rel.text})`,
      daysAgo: rel.daysAgo,
    };
  }

  if (isUserCustomized) {
    return {
      source: "user_calibrated",
      level: "high",
      label: "Von dir angepasst",
      daysAgo: null,
    };
  }

  return {
    source: "estimated",
    level: "estimated",
    label: "Richtpreis",
    daysAgo: null,
  };
};

export const buildVerifiedKey = (categoryId: string, storeId: StoreId): string =>
  `${categoryId}:${storeId}`;
