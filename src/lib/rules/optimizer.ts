import {
  CATEGORY_MAP,
  DEPARTMENT_MAP,
  STORE_MAP,
  type BaseUnit,
  type DepartmentId,
  type StoreId,
} from "./catalog";
import { computeUnitPriceCents } from "./matcher";
import {
  type ItemPreference,
  offerMatchesPreference,
  resolvePreferenceBasePrice,
} from "./preferences";

/** Ab diesem Rabatt gegenüber Normalpreis lohnt sich bei haltbaren Artikeln ein Vorrat */
export const STOCK_UP_MIN_DISCOUNT = 0.25;

/** Standard: Ein Umweg muss mindestens 50 ct Ersparnis pro Minute bringen */
export const DEFAULT_MIN_SAVINGS_PER_DETOUR_MINUTE_CENTS = 50;

export interface OfferRecord {
  id: string;
  storeId: StoreId;
  categoryId: string;
  title: string;
  /** Aktionspreis ohne Kundenkarte/App in Cent (falls das Angebot NUR mit App gilt, entspricht dies dem regulären Preis oder dem App-Preis mit requiresLoyaltyApp=true) */
  priceCents: number;
  /** Optionaler noch günstigerer Preis mit Treue-App (Lidl Plus, Kaufland Card, Rewe Bonus etc.) */
  loyaltyPriceCents: number | null;
  /** Gilt der Aktionspreis ausschließlich mit der Treue-App? */
  requiresLoyaltyApp: boolean;
  packageAmount: number;
  packageUnit: BaseUnit;
  validFrom: string; // YYYY-MM-DD
  validTo: string; // YYYY-MM-DD
}

export interface BasketItemInput {
  categoryId: string;
  quantity: number;
  /** Gewünschte Produktqualität, Standard: günstigste Option */
  preference?: ItemPreference;
}

export interface ResolvedStoreItem {
  categoryId: string;
  categoryName: string;
  categorySubtitle: string;
  departmentId: DepartmentId;
  departmentName: string;
  departmentIcon: string;
  departmentSortOrder: number;
  storeId: StoreId;
  storeName: string;
  requestedQuantity: number;
  /** Tatsächlicher Kassenpreis für die benötigte Menge in Cent */
  checkoutCents: number;
  /** Regulärer Eigenmarken-Kassenpreis für dieselbe Menge in Cent */
  regularCheckoutCents: number;
  /** Ersparnis an der Kasse in Cent */
  savingsCents: number;
  /** Grundpreis der gewählten Option in Cent pro kg / L / Stück */
  unitPriceCents: number;
  unitLabel: "kg" | "L" | "Stück";
  isOffer: boolean;
  usedLoyaltyApp: boolean;
  loyaltyAppName: string | null;
  /** Konkreter Griff-Hinweis fürs Regal (z. B. "Kerrygold Irische Butter 250g (Angebot)") */
  productLabel: string;
  packsToBuy: number;
  /** Optionaler Hinweis auf eine Aktions-Großpackung mit günstigerem Grundpreis (€/kg bzw. €/L) */
  bulkPackHint: string | null;
  /** Gewünschte Produktqualität, gegen deren Normalpreis bewertet wurde */
  preference: ItemPreference;
  /** Vorratstipp bei haltbaren Artikeln, die mindestens 25 % unter Normalpreis liegen */
  stockUpHint: string | null;
}

export interface DepartmentGroup {
  departmentId: DepartmentId;
  departmentName: string;
  departmentIcon: string;
  sortOrder: number;
  items: ResolvedStoreItem[];
}

export interface SingleStoreResult {
  storeId: StoreId;
  storeName: string;
  totalCheckoutCents: number;
  totalRegularCents: number;
  totalSavingsCents: number;
  offerCount: number;
  loyaltyOfferCount: number;
  items: ResolvedStoreItem[];
  departments: DepartmentGroup[];
}

export interface TwoStoreSplitResult {
  primaryStoreId: StoreId;
  primaryStoreName: string;
  secondaryStoreId: StoreId;
  secondaryStoreName: string;
  totalCheckoutCents: number;
  totalRegularCents: number;
  totalSavingsCents: number;
  /** Zusätzliche Ersparnis gegenüber dem besten einzelnen Supermarkt */
  extraSavingsVsBestSingleCents: number;
  secondStoreThresholdCents: number;
  /** Lohnt sich der 2. Laden gemäß Euro-Schwelle UND Umweg-Effizienz? */
  worthSecondStore: boolean;
  /** Persönlicher Umweg zum Zweitladen in Minuten (0 = nicht angegeben) */
  detourMinutes: number;
  /** Zusatz-Ersparnis pro Umweg-Minute in Cent, falls ein Umweg angegeben ist */
  savingsPerDetourMinuteCents: number | null;
  minSavingsPerDetourMinuteCents: number;
  /** Erfüllt der Abstecher die Mindest-Ersparnis pro Umweg-Minute? (ohne Umweg-Angabe immer true) */
  meetsDetourEfficiency: boolean;
  primaryStoreTotalCents: number;
  secondaryStoreTotalCents: number;
  primaryItems: ResolvedStoreItem[];
  secondaryItems: ResolvedStoreItem[];
  primaryDepartments: DepartmentGroup[];
  secondaryDepartments: DepartmentGroup[];
}

export interface CustomStoreComboLeg {
  storeId: StoreId;
  storeName: string;
  role: "main" | "detour";
  totalCheckoutCents: number;
  totalRegularCents: number;
  totalSavingsCents: number;
  offerCount: number;
  detourMinutes: number;
  items: ResolvedStoreItem[];
  departments: DepartmentGroup[];
}

export interface CustomStoreComboResult {
  selectedStoreIds: StoreId[];
  primaryStoreId: StoreId;
  primaryStoreName: string;
  /** Gewählte Märkte mit mindestens einem Artikel, Hauptladen zuerst */
  legs: CustomStoreComboLeg[];
  /** Gewählte Märkte ohne günstigeren Artikel gegenüber dem Hauptladen */
  unusedStoreIds: StoreId[];
  totalCheckoutCents: number;
  totalRegularCents: number;
  totalSavingsCents: number;
  /** Günstigster Einzelmarkt innerhalb genau dieser gewählten Kombination */
  bestSingleInComboStoreId: StoreId;
  bestSingleInComboStoreName: string;
  bestSingleInComboTotalCents: number;
  /** Ersparnis gegenüber dem besten Einzelmarkt innerhalb dieser Kombination */
  savingsVsBestSingleInComboCents: number;
  /** Ersparnis (oder Mehrkosten bei negativem Wert) gegenüber dem insgesamt günstigsten Einzelmarkt */
  savingsVsOverallBestSingleCents: number;
  /** Summe der persönlichen Umweg-Minuten für alle Nebenläden (Abstecher) */
  totalDetourMinutes: number;
}

export interface OptimizationInput {
  items: readonly BasketItemInput[];
  enabledStores: readonly StoreId[];
  enabledLoyaltyApps: readonly StoreId[];
  /** Geplanter Einkaufstag im Format YYYY-MM-DD */
  shoppingDate: string;
  /** Mindest-Ersparnis in Cent, ab der ein 2. Supermarkt empfohlen wird (Standard: 500 = 5,00 €) */
  secondStoreThresholdCents?: number;
  offers: readonly OfferRecord[];
  customBasePrices?: Record<string, Partial<Record<StoreId, { priceCents: number; productLabel: string }>>>;
  /** Persönlicher Umweg je Markt in Minuten, z. B. { lidl: 3, kaufland: 15 } */
  storeDetourMinutes?: Partial<Record<StoreId, number>>;
  /** Mindest-Zusatzersparnis pro Umweg-Minute in Cent (Standard: 50) */
  minSavingsPerDetourMinuteCents?: number;
  /** Optional: 2 oder mehr frei kombinierte Supermärkte (z. B. ["lidl", "rewe"]) */
  customComboStores?: readonly StoreId[];
}

export interface OptimizationOutput {
  shoppingDate: string;
  secondStoreThresholdCents: number;
  bestSingleStore: SingleStoreResult | null;
  singleStoreRankings: SingleStoreResult[];
  bestTwoStoreSplit: TwoStoreSplitResult | null;
  customStoreCombo: CustomStoreComboResult | null;
  recommendedStrategy: "single" | "split";
}

export const formatEuroCents = (cents: number): string => {
  const euros = (cents / 100).toFixed(2).replace(".", ",");
  return `${euros} €`;
};

const unitDisplayLabel = (unit: BaseUnit): "kg" | "L" | "Stück" => {
  if (unit === "g") return "kg";
  if (unit === "ml") return "L";
  return "Stück";
};

const formatAmount = (amount: number, unit: BaseUnit): string => {
  if (unit === "g") {
    return amount >= 1000 ? `${(amount / 1000).toString().replace(".", ",")} kg` : `${amount} g`;
  }
  if (unit === "ml") {
    return amount >= 1000 ? `${(amount / 1000).toString().replace(".", ",")} L` : `${amount} ml`;
  }
  return `${amount} Stück`;
};

export const isOfferValidOnDate = (offer: OfferRecord, shoppingDate: string): boolean => {
  return offer.validFrom <= shoppingDate && shoppingDate <= offer.validTo;
};

export const groupItemsByDepartment = (items: readonly ResolvedStoreItem[]): DepartmentGroup[] => {
  const map = new Map<DepartmentId, DepartmentGroup>();
  for (const item of items) {
    let group = map.get(item.departmentId);
    if (!group) {
      group = {
        departmentId: item.departmentId,
        departmentName: item.departmentName,
        departmentIcon: item.departmentIcon,
        sortOrder: item.departmentSortOrder,
        items: [],
      };
      map.set(item.departmentId, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
};

/**
 * Ermittelt für einen Artikel (Kategorie + Menge) in einem bestimmten Markt am geplanten Einkaufstag
 * den günstigsten Kassenpreis sowie eventuelle Großpackungs-Hinweise (€/kg bzw. €/L).
 */
export const resolveStoreItemPrice = (params: {
  categoryId: string;
  quantity: number;
  storeId: StoreId;
  shoppingDate: string;
  hasLoyaltyApp: boolean;
  offers: readonly OfferRecord[];
  customBasePrices?: OptimizationInput["customBasePrices"];
  preference?: ItemPreference;
}): ResolvedStoreItem => {
  const { categoryId, quantity, storeId, shoppingDate, hasLoyaltyApp, offers, customBasePrices } =
    params;
  const preference = params.preference ?? "cheapest";
  const category = CATEGORY_MAP[categoryId];
  if (!category) {
    throw new Error(`Unbekannte Kategorie: ${categoryId}`);
  }

  const store = STORE_MAP[storeId];
  const department = DEPARTMENT_MAP[category.department];
  const baseEntry = resolvePreferenceBasePrice({
    category,
    storeBaseEntry: customBasePrices?.[categoryId]?.[storeId] ?? category.defaultBasePrices[storeId],
    preference,
  });

  const neededTotalAmount = quantity * category.standardAmount;
  const regularCheckoutCents = quantity * baseEntry.priceCents;
  const regularUnitPriceCents = computeUnitPriceCents(
    baseEntry.priceCents,
    category.standardAmount,
    category.unit,
  );
  const uLabel = unitDisplayLabel(category.unit);

  // Alle am Einkaufstag gültigen Angebote dieser Kette für diese Kategorie prüfen,
  // die zur gewünschten Produktqualität passen (Bio, Marke oder beliebig)
  const matchingOffers = offers.filter(
    (o) =>
      o.storeId === storeId &&
      o.categoryId === categoryId &&
      isOfferValidOnDate(o, shoppingDate) &&
      offerMatchesPreference({ offerTitle: o.title, category, storeId, preference }),
  );

  let bestCheckoutCents = regularCheckoutCents;
  let bestUnitPriceCents = regularUnitPriceCents;
  let bestProductLabel = baseEntry.productLabel;
  let bestPacksToBuy = quantity;
  let isOffer = false;
  let usedLoyaltyApp = false;
  let bestOfferBulkNote: string | null = null;
  let alternativeBulkHint: string | null = null;

  for (const offer of matchingOffers) {
    // Welcher Packungspreis gilt für diesen Nutzer?
    let effectivePackPriceCents: number | null = null;
    let offerUsesLoyalty = false;

    if (hasLoyaltyApp && offer.loyaltyPriceCents != null && offer.loyaltyPriceCents > 0) {
      effectivePackPriceCents = offer.loyaltyPriceCents;
      offerUsesLoyalty = true;
    } else if (!offer.requiresLoyaltyApp) {
      effectivePackPriceCents = offer.priceCents;
      offerUsesLoyalty = false;
    } else if (hasLoyaltyApp) {
      effectivePackPriceCents = offer.priceCents;
      offerUsesLoyalty = true;
    }

    if (effectivePackPriceCents == null) {
      continue;
    }

    const offerAmount = offer.packageAmount > 0 ? offer.packageAmount : category.standardAmount;
    const packsNeeded = Math.max(1, Math.ceil(neededTotalAmount / offerAmount));
    const offerCheckoutCents = packsNeeded * effectivePackPriceCents;
    const offerUnitPriceCents = computeUnitPriceCents(
      effectivePackPriceCents,
      offerAmount,
      category.unit,
    );
    const totalOfferAmount = packsNeeded * offerAmount;

    if (
      offerCheckoutCents < bestCheckoutCents ||
      (offerCheckoutCents === bestCheckoutCents && offerUnitPriceCents < bestUnitPriceCents)
    ) {
      bestCheckoutCents = offerCheckoutCents;
      bestUnitPriceCents = offerUnitPriceCents;
      bestProductLabel = offer.title;
      bestPacksToBuy = packsNeeded;
      isOffer = true;
      usedLoyaltyApp = offerUsesLoyalty;

      if (totalOfferAmount > neededTotalAmount) {
        bestOfferBulkNote = `Aktions-Packung liefert ${formatAmount(totalOfferAmount, category.unit)} statt ${formatAmount(neededTotalAmount, category.unit)} (Grundpreis ${formatEuroCents(offerUnitPriceCents)}/${uLabel} statt ${formatEuroCents(regularUnitPriceCents)}/${uLabel}) – und ist selbst an der Kasse günstiger!`;
      } else {
        bestOfferBulkNote = null;
      }
    } else if (
      offerAmount > neededTotalAmount &&
      offerUnitPriceCents < Math.round(regularUnitPriceCents * 0.85)
    ) {
      // Die Großpackung kostet an der Kasse zwar mehr als die kleine Bedarfsmenge,
      // ist aber pro kg / Liter mindestens 15 % günstiger als der Normalpreis.
      alternativeBulkHint = `Großpackung im Angebot: ${offer.title} (${formatAmount(offerAmount, category.unit)}) für ${formatEuroCents(effectivePackPriceCents)} – Grundpreis nur ${formatEuroCents(offerUnitPriceCents)}/${uLabel} statt ${formatEuroCents(regularUnitPriceCents)}/${uLabel}.`;
    }
  }

  const savingsCents = Math.max(0, regularCheckoutCents - bestCheckoutCents);
  const stockUpHint =
    category.isPantryStaple &&
    isOffer &&
    bestCheckoutCents <= Math.round(regularCheckoutCents * (1 - STOCK_UP_MIN_DISCOUNT))
      ? `Vorratstipp: ${quantity * 2}× statt ${quantity}× mitnehmen spart zusätzlich ${formatEuroCents(savingsCents)} gegenüber Normalpreis.`
      : null;

  return {
    categoryId: category.id,
    categoryName: category.name,
    categorySubtitle: category.subtitle,
    departmentId: department.id,
    departmentName: department.name,
    departmentIcon: department.icon,
    departmentSortOrder: department.sortOrder,
    storeId: store.id,
    storeName: store.shortName,
    requestedQuantity: quantity,
    checkoutCents: bestCheckoutCents,
    regularCheckoutCents,
    savingsCents,
    unitPriceCents: bestUnitPriceCents,
    unitLabel: uLabel,
    isOffer,
    usedLoyaltyApp,
    loyaltyAppName: usedLoyaltyApp ? store.loyaltyAppName : null,
    productLabel: bestProductLabel,
    packsToBuy: bestPacksToBuy,
    bulkPackHint: bestOfferBulkNote ?? alternativeBulkHint,
    preference,
    stockUpHint,
  };
};

export interface CustomStoreComboInput {
  items: readonly BasketItemInput[];
  selectedStoreIds: readonly StoreId[];
  enabledLoyaltyApps: readonly StoreId[];
  shoppingDate: string;
  offers: readonly OfferRecord[];
  customBasePrices?: OptimizationInput["customBasePrices"];
  storeDetourMinutes?: Partial<Record<StoreId, number>>;
  /** Optionaler Gesamtpreis des insgesamt günstigsten Einzelmarkts (als Vergleichsreferenz) */
  overallBestSingleTotalCents?: number;
}

const computeCustomStoreComboFromResolved = (params: {
  activeItems: readonly BasketItemInput[];
  selectedStoreIds: readonly StoreId[];
  resolvedByStore: ReadonlyMap<StoreId, ReadonlyMap<string, ResolvedStoreItem>>;
  storeDetourMinutes?: Partial<Record<StoreId, number>>;
  overallBestSingleTotalCents?: number;
}): CustomStoreComboResult | null => {
  const uniqueStoreIds: StoreId[] = [];
  for (const storeId of params.selectedStoreIds) {
    if (STORE_MAP[storeId] && !uniqueStoreIds.includes(storeId)) {
      uniqueStoreIds.push(storeId);
    }
  }
  if (uniqueStoreIds.length < 2 || params.activeItems.length === 0) {
    return null;
  }

  const orderIndex = new Map<StoreId, number>(uniqueStoreIds.map((id, idx) => [id, idx]));
  const detourOf = (storeId: StoreId): number =>
    Math.max(0, params.storeDetourMinutes?.[storeId] ?? 0);

  // Einzelmarkt-Summen innerhalb der gewählten Kombi
  const singleTotals = new Map<StoreId, { totalCents: number; offerCount: number }>();
  for (const storeId of uniqueStoreIds) {
    const storeMap = params.resolvedByStore.get(storeId)!;
    let totalCents = 0;
    let offerCount = 0;
    for (const item of params.activeItems) {
      const resolved = storeMap.get(item.categoryId)!;
      totalCents += resolved.checkoutCents;
      if (resolved.isOffer) offerCount += 1;
    }
    singleTotals.set(storeId, { totalCents, offerCount });
  }

  const bestSingleInComboStoreId = [...uniqueStoreIds].sort((a, b) => {
    const ta = singleTotals.get(a)!;
    const tb = singleTotals.get(b)!;
    if (ta.totalCents !== tb.totalCents) return ta.totalCents - tb.totalCents;
    if (ta.offerCount !== tb.offerCount) return tb.offerCount - ta.offerCount;
    return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
  })[0];
  const bestSingleInComboTotalCents = singleTotals.get(bestSingleInComboStoreId)!.totalCents;

  // Pro Artikel Minimalpreis über genau die gewählten Märkte ermitteln
  const itemMinPrices = params.activeItems.map((item) => {
    let minCents = Number.POSITIVE_INFINITY;
    for (const storeId of uniqueStoreIds) {
      const price = params.resolvedByStore.get(storeId)!.get(item.categoryId)!.checkoutCents;
      if (price < minCents) minCents = price;
    }
    return minCents;
  });

  // Hauptladen wählen: der Markt, der mit Hauptladen-Tie-Breaking die meisten Artikel abdeckt
  const minPriceHits = new Map<StoreId, number>(uniqueStoreIds.map((id) => [id, 0]));
  params.activeItems.forEach((item, index) => {
    const minCents = itemMinPrices[index];
    for (const storeId of uniqueStoreIds) {
      const price = params.resolvedByStore.get(storeId)!.get(item.categoryId)!.checkoutCents;
      if (price === minCents) {
        minPriceHits.set(storeId, (minPriceHits.get(storeId) ?? 0) + 1);
      }
    }
  });

  const primaryStoreId = [...uniqueStoreIds].sort((a, b) => {
    const hitsDiff = (minPriceHits.get(b) ?? 0) - (minPriceHits.get(a) ?? 0);
    if (hitsDiff !== 0) return hitsDiff;
    const totalDiff = singleTotals.get(a)!.totalCents - singleTotals.get(b)!.totalCents;
    if (totalDiff !== 0) return totalDiff;
    const detourDiff = detourOf(a) - detourOf(b);
    if (detourDiff !== 0) return detourDiff;
    return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
  })[0];

  const secondaryStoreIds = uniqueStoreIds.filter((id) => id !== primaryStoreId);

  // Für Gleichstände zwischen Nebenläden (bei 3+ Märkten): Läden bevorzugen, die ohnehin
  // exklusive Schnäppchen haben, um unnötige Zusatz-Stopps zu vermeiden.
  const uniqueSecondaryWins = new Map<StoreId, number>(secondaryStoreIds.map((id) => [id, 0]));
  const totalSecondaryWins = new Map<StoreId, number>(secondaryStoreIds.map((id) => [id, 0]));
  params.activeItems.forEach((item, index) => {
    const minCents = itemMinPrices[index];
    const primaryPrice = params.resolvedByStore
      .get(primaryStoreId)!
      .get(item.categoryId)!.checkoutCents;
    if (primaryPrice === minCents) return;

    const winners = secondaryStoreIds.filter(
      (storeId) =>
        params.resolvedByStore.get(storeId)!.get(item.categoryId)!.checkoutCents === minCents,
    );
    for (const winner of winners) {
      totalSecondaryWins.set(winner, (totalSecondaryWins.get(winner) ?? 0) + 1);
    }
    if (winners.length === 1) {
      uniqueSecondaryWins.set(winners[0], (uniqueSecondaryWins.get(winners[0]) ?? 0) + 1);
    }
  });

  const secondaryPriorityRank = new Map<StoreId, number>(
    [...secondaryStoreIds]
      .sort((a, b) => {
        const uniqDiff = (uniqueSecondaryWins.get(b) ?? 0) - (uniqueSecondaryWins.get(a) ?? 0);
        if (uniqDiff !== 0) return uniqDiff;
        const winDiff = (totalSecondaryWins.get(b) ?? 0) - (totalSecondaryWins.get(a) ?? 0);
        if (winDiff !== 0) return winDiff;
        const totalDiff = singleTotals.get(a)!.totalCents - singleTotals.get(b)!.totalCents;
        if (totalDiff !== 0) return totalDiff;
        const detourDiff = detourOf(a) - detourOf(b);
        if (detourDiff !== 0) return detourDiff;
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      })
      .map((id, idx) => [id, idx]),
  );

  const itemsByStore = new Map<StoreId, ResolvedStoreItem[]>(uniqueStoreIds.map((id) => [id, []]));

  params.activeItems.forEach((item, index) => {
    const minCents = itemMinPrices[index];
    const primaryItem = params.resolvedByStore.get(primaryStoreId)!.get(item.categoryId)!;

    // Hauptladen-Tie-Breaking: Gleich teure Artikel bleiben immer beim Hauptladen
    if (primaryItem.checkoutCents === minCents) {
      itemsByStore.get(primaryStoreId)!.push(primaryItem);
      return;
    }

    const bestSecondaryId = secondaryStoreIds
      .filter(
        (storeId) =>
          params.resolvedByStore.get(storeId)!.get(item.categoryId)!.checkoutCents === minCents,
      )
      .sort((a, b) => (secondaryPriorityRank.get(a) ?? 0) - (secondaryPriorityRank.get(b) ?? 0))[0];

    itemsByStore
      .get(bestSecondaryId)!
      .push(params.resolvedByStore.get(bestSecondaryId)!.get(item.categoryId)!);
  });

  const buildLeg = (storeId: StoreId, role: "main" | "detour"): CustomStoreComboLeg => {
    const items = itemsByStore.get(storeId)!;
    const totalCheckoutCents = items.reduce((sum, i) => sum + i.checkoutCents, 0);
    const totalRegularCents = items.reduce((sum, i) => sum + i.regularCheckoutCents, 0);
    return {
      storeId,
      storeName: STORE_MAP[storeId].shortName,
      role,
      totalCheckoutCents,
      totalRegularCents,
      totalSavingsCents: Math.max(0, totalRegularCents - totalCheckoutCents),
      offerCount: items.filter((i) => i.isOffer).length,
      detourMinutes: detourOf(storeId),
      items,
      departments: groupItemsByDepartment(items),
    };
  };

  const primaryLeg = buildLeg(primaryStoreId, "main");
  const secondaryLegs = secondaryStoreIds
    .filter((storeId) => itemsByStore.get(storeId)!.length > 0)
    .map((storeId) => buildLeg(storeId, "detour"))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      if (b.totalCheckoutCents !== a.totalCheckoutCents) {
        return b.totalCheckoutCents - a.totalCheckoutCents;
      }
      if (a.detourMinutes !== b.detourMinutes) return a.detourMinutes - b.detourMinutes;
      return (orderIndex.get(a.storeId) ?? 0) - (orderIndex.get(b.storeId) ?? 0);
    });

  const legs: CustomStoreComboLeg[] = [primaryLeg, ...secondaryLegs];
  const unusedStoreIds = uniqueStoreIds.filter((storeId) => itemsByStore.get(storeId)!.length === 0);

  const totalCheckoutCents = legs.reduce((sum, leg) => sum + leg.totalCheckoutCents, 0);
  const totalRegularCents = legs.reduce((sum, leg) => sum + leg.totalRegularCents, 0);
  const totalSavingsCents = Math.max(0, totalRegularCents - totalCheckoutCents);
  const savingsVsBestSingleInComboCents = Math.max(
    0,
    bestSingleInComboTotalCents - totalCheckoutCents,
  );
  const overallRefCents = params.overallBestSingleTotalCents ?? bestSingleInComboTotalCents;
  const savingsVsOverallBestSingleCents = overallRefCents - totalCheckoutCents;
  const totalDetourMinutes = secondaryLegs.reduce((sum, leg) => sum + leg.detourMinutes, 0);

  return {
    selectedStoreIds: uniqueStoreIds,
    primaryStoreId,
    primaryStoreName: STORE_MAP[primaryStoreId].shortName,
    legs,
    unusedStoreIds,
    totalCheckoutCents,
    totalRegularCents,
    totalSavingsCents,
    bestSingleInComboStoreId,
    bestSingleInComboStoreName: STORE_MAP[bestSingleInComboStoreId].shortName,
    bestSingleInComboTotalCents,
    savingsVsBestSingleInComboCents,
    savingsVsOverallBestSingleCents,
    totalDetourMinutes,
  };
};

/**
 * Berechnet für eine vom Nutzer frei gewählte Kombination aus 2 oder mehr Supermärkten
 * die optimale Artikel-Aufteilung mit striktem Hauptladen-Tie-Breaking.
 */
export const optimizeCustomStoreCombo = (
  input: CustomStoreComboInput,
): CustomStoreComboResult | null => {
  const activeItems = input.items.filter(
    (item) => item.quantity > 0 && CATEGORY_MAP[item.categoryId] != null,
  );
  if (activeItems.length === 0) return null;

  const uniqueStoreIds = Array.from(
    new Set(input.selectedStoreIds.filter((storeId) => STORE_MAP[storeId] != null)),
  );
  if (uniqueStoreIds.length < 2) return null;

  const loyaltySet = new Set<StoreId>(input.enabledLoyaltyApps);
  const resolvedByStore = new Map<StoreId, Map<string, ResolvedStoreItem>>();

  for (const storeId of uniqueStoreIds) {
    const catMap = new Map<string, ResolvedStoreItem>();
    for (const item of activeItems) {
      catMap.set(
        item.categoryId,
        resolveStoreItemPrice({
          categoryId: item.categoryId,
          quantity: item.quantity,
          storeId,
          shoppingDate: input.shoppingDate,
          hasLoyaltyApp: loyaltySet.has(storeId),
          offers: input.offers,
          customBasePrices: input.customBasePrices,
          preference: item.preference,
        }),
      );
    }
    resolvedByStore.set(storeId, catMap);
  }

  return computeCustomStoreComboFromResolved({
    activeItems,
    selectedStoreIds: uniqueStoreIds,
    resolvedByStore,
    storeDetourMinutes: input.storeDetourMinutes,
    overallBestSingleTotalCents: input.overallBestSingleTotalCents,
  });
};

export const optimizeShoppingBasket = (input: OptimizationInput): OptimizationOutput => {
  const secondStoreThresholdCents = input.secondStoreThresholdCents ?? 500;
  const minSavingsPerDetourMinuteCents =
    input.minSavingsPerDetourMinuteCents ?? DEFAULT_MIN_SAVINGS_PER_DETOUR_MINUTE_CENTS;
  const activeItems = input.items.filter(
    (item) => item.quantity > 0 && CATEGORY_MAP[item.categoryId] != null,
  );
  const enabledStores = input.enabledStores.length > 0 ? input.enabledStores : (["lidl"] as const);
  const loyaltySet = new Set<StoreId>(input.enabledLoyaltyApps);

  if (activeItems.length === 0) {
    return {
      shoppingDate: input.shoppingDate,
      secondStoreThresholdCents,
      bestSingleStore: null,
      singleStoreRankings: [],
      bestTwoStoreSplit: null,
      customStoreCombo: null,
      recommendedStrategy: "single",
    };
  }

  // 1. Einzelmarkt-Ergebnisse für jeden aktivierten Supermarkt berechnen
  const singleStoreRankings: SingleStoreResult[] = enabledStores.map((storeId) => {
    const store = STORE_MAP[storeId];
    const resolvedItems = activeItems.map((item) =>
      resolveStoreItemPrice({
        categoryId: item.categoryId,
        quantity: item.quantity,
        storeId,
        shoppingDate: input.shoppingDate,
        hasLoyaltyApp: loyaltySet.has(storeId),
        offers: input.offers,
        customBasePrices: input.customBasePrices,
        preference: item.preference,
      }),
    );

    const totalCheckoutCents = resolvedItems.reduce((sum, i) => sum + i.checkoutCents, 0);
    const totalRegularCents = resolvedItems.reduce((sum, i) => sum + i.regularCheckoutCents, 0);
    const totalSavingsCents = resolvedItems.reduce((sum, i) => sum + i.savingsCents, 0);
    const offerCount = resolvedItems.filter((i) => i.isOffer).length;
    const loyaltyOfferCount = resolvedItems.filter((i) => i.usedLoyaltyApp).length;

    return {
      storeId,
      storeName: store.shortName,
      totalCheckoutCents,
      totalRegularCents,
      totalSavingsCents,
      offerCount,
      loyaltyOfferCount,
      items: resolvedItems,
      departments: groupItemsByDepartment(resolvedItems),
    };
  });

  singleStoreRankings.sort((a, b) => {
    if (a.totalCheckoutCents !== b.totalCheckoutCents) {
      return a.totalCheckoutCents - b.totalCheckoutCents;
    }
    return b.offerCount - a.offerCount;
  });

  const bestSingleStore = singleStoreRankings[0] ?? null;

  // Lookup-Tabelle: resolvedItemByStore[storeId][categoryId]
  const resolvedByStore = new Map<StoreId, Map<string, ResolvedStoreItem>>();
  for (const ranking of singleStoreRankings) {
    const catMap = new Map<string, ResolvedStoreItem>();
    for (const item of ranking.items) {
      catMap.set(item.categoryId, item);
    }
    resolvedByStore.set(ranking.storeId, catMap);
  }

  // 2. Smart-Split für alle geordneten Markt-Paare (Hauptladen, Zweitladen) prüfen
  let bestSplit: TwoStoreSplitResult | null = null;

  if (enabledStores.length >= 2 && bestSingleStore) {
    for (const primaryStoreId of enabledStores) {
      for (const secondaryStoreId of enabledStores) {
        if (primaryStoreId === secondaryStoreId) continue;

        const primaryMap = resolvedByStore.get(primaryStoreId)!;
        const secondaryMap = resolvedByStore.get(secondaryStoreId)!;

        const primaryItems: ResolvedStoreItem[] = [];
        const secondaryItems: ResolvedStoreItem[] = [];

        for (const item of activeItems) {
          const pItem = primaryMap.get(item.categoryId)!;
          const sItem = secondaryMap.get(item.categoryId)!;

          // Hauptladen-Tie-Breaking: Nur wenn der Zweitladen ECHT günstiger ist,
          // wandert der Artikel auf die Zweitladen-Liste!
          if (sItem.checkoutCents < pItem.checkoutCents) {
            secondaryItems.push(sItem);
          } else {
            primaryItems.push(pItem);
          }
        }

        // Der Hauptladen sollte mindestens so viele Artikel haben wie der Zweitladen
        if (secondaryItems.length === 0 || primaryItems.length < secondaryItems.length) {
          continue;
        }

        const primaryStoreTotalCents = primaryItems.reduce((sum, i) => sum + i.checkoutCents, 0);
        const secondaryStoreTotalCents = secondaryItems.reduce(
          (sum, i) => sum + i.checkoutCents,
          0,
        );
        const totalCheckoutCents = primaryStoreTotalCents + secondaryStoreTotalCents;
        const totalRegularCents =
          primaryItems.reduce((sum, i) => sum + i.regularCheckoutCents, 0) +
          secondaryItems.reduce((sum, i) => sum + i.regularCheckoutCents, 0);
        const totalSavingsCents = Math.max(0, totalRegularCents - totalCheckoutCents);
        const extraSavingsVsBestSingleCents = Math.max(
          0,
          bestSingleStore.totalCheckoutCents - totalCheckoutCents,
        );

        // Umweg-Gewichtung: Der Abstecher muss pro Minute genug Zusatz-Ersparnis bringen
        const detourMinutes = Math.max(0, input.storeDetourMinutes?.[secondaryStoreId] ?? 0);
        const meetsDetourEfficiency =
          detourMinutes === 0 ||
          extraSavingsVsBestSingleCents >= detourMinutes * minSavingsPerDetourMinuteCents;
        const worthSecondStore =
          extraSavingsVsBestSingleCents >= secondStoreThresholdCents && meetsDetourEfficiency;

        // Lohnende Abstecher gehen vor; danach zählt der Kassenpreis, dann weniger Zweitladen-Artikel
        const isBetterThanCurrentBest =
          bestSplit == null ||
          (worthSecondStore && !bestSplit.worthSecondStore) ||
          (worthSecondStore === bestSplit.worthSecondStore &&
            (totalCheckoutCents < bestSplit.totalCheckoutCents ||
              (totalCheckoutCents === bestSplit.totalCheckoutCents &&
                secondaryItems.length < bestSplit.secondaryItems.length)));

        if (isBetterThanCurrentBest) {
          bestSplit = {
            primaryStoreId,
            primaryStoreName: STORE_MAP[primaryStoreId].shortName,
            secondaryStoreId,
            secondaryStoreName: STORE_MAP[secondaryStoreId].shortName,
            totalCheckoutCents,
            totalRegularCents,
            totalSavingsCents,
            extraSavingsVsBestSingleCents,
            secondStoreThresholdCents,
            worthSecondStore,
            detourMinutes,
            savingsPerDetourMinuteCents:
              detourMinutes > 0 ? Math.floor(extraSavingsVsBestSingleCents / detourMinutes) : null,
            minSavingsPerDetourMinuteCents,
            meetsDetourEfficiency,
            primaryStoreTotalCents,
            secondaryStoreTotalCents,
            primaryItems,
            secondaryItems,
            primaryDepartments: groupItemsByDepartment(primaryItems),
            secondaryDepartments: groupItemsByDepartment(secondaryItems),
          };
        }
      }
    }
  }

  // 3. Optional: Frei gewählte Supermarkt-Kombination (2+ Märkte) berechnen
  let customStoreCombo: CustomStoreComboResult | null = null;
  if (input.customComboStores && input.customComboStores.length >= 2) {
    for (const storeId of input.customComboStores) {
      if (!STORE_MAP[storeId] || resolvedByStore.has(storeId)) continue;
      const catMap = new Map<string, ResolvedStoreItem>();
      for (const item of activeItems) {
        catMap.set(
          item.categoryId,
          resolveStoreItemPrice({
            categoryId: item.categoryId,
            quantity: item.quantity,
            storeId,
            shoppingDate: input.shoppingDate,
            hasLoyaltyApp: loyaltySet.has(storeId),
            offers: input.offers,
            customBasePrices: input.customBasePrices,
            preference: item.preference,
          }),
        );
      }
      resolvedByStore.set(storeId, catMap);
    }
    customStoreCombo = computeCustomStoreComboFromResolved({
      activeItems,
      selectedStoreIds: input.customComboStores,
      resolvedByStore,
      storeDetourMinutes: input.storeDetourMinutes,
      overallBestSingleTotalCents: bestSingleStore?.totalCheckoutCents,
    });
  }

  const recommendedStrategy =
    bestSplit != null && bestSplit.worthSecondStore ? "split" : "single";

  return {
    shoppingDate: input.shoppingDate,
    secondStoreThresholdCents,
    bestSingleStore,
    singleStoreRankings,
    bestTwoStoreSplit: bestSplit,
    customStoreCombo,
    recommendedStrategy,
  };
};
