import {
  CATEGORY_MAP,
  DEPARTMENT_MAP,
  STORE_MAP,
  type BaseUnit,
  type DepartmentId,
  type StoreId,
} from "./catalog";
import { computeUnitPriceCents } from "./matcher";

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
  /** Lohnt sich der 2. Laden gemäß eingestellter Schwelle (z. B. >= 5,00 €)? */
  worthSecondStore: boolean;
  primaryStoreTotalCents: number;
  secondaryStoreTotalCents: number;
  primaryItems: ResolvedStoreItem[];
  secondaryItems: ResolvedStoreItem[];
  primaryDepartments: DepartmentGroup[];
  secondaryDepartments: DepartmentGroup[];
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
}

export interface OptimizationOutput {
  shoppingDate: string;
  secondStoreThresholdCents: number;
  bestSingleStore: SingleStoreResult | null;
  singleStoreRankings: SingleStoreResult[];
  bestTwoStoreSplit: TwoStoreSplitResult | null;
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
}): ResolvedStoreItem => {
  const { categoryId, quantity, storeId, shoppingDate, hasLoyaltyApp, offers, customBasePrices } =
    params;
  const category = CATEGORY_MAP[categoryId];
  if (!category) {
    throw new Error(`Unbekannte Kategorie: ${categoryId}`);
  }

  const store = STORE_MAP[storeId];
  const department = DEPARTMENT_MAP[category.department];
  const baseEntry =
    customBasePrices?.[categoryId]?.[storeId] ?? category.defaultBasePrices[storeId];

  const neededTotalAmount = quantity * category.standardAmount;
  const regularCheckoutCents = quantity * baseEntry.priceCents;
  const regularUnitPriceCents = computeUnitPriceCents(
    baseEntry.priceCents,
    category.standardAmount,
    category.unit,
  );
  const uLabel = unitDisplayLabel(category.unit);

  // Alle am Einkaufstag gültigen Angebote dieser Kette für diese Kategorie prüfen
  const matchingOffers = offers.filter(
    (o) =>
      o.storeId === storeId &&
      o.categoryId === categoryId &&
      isOfferValidOnDate(o, shoppingDate),
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
    savingsCents: Math.max(0, regularCheckoutCents - bestCheckoutCents),
    unitPriceCents: bestUnitPriceCents,
    unitLabel: uLabel,
    isOffer,
    usedLoyaltyApp,
    loyaltyAppName: usedLoyaltyApp ? store.loyaltyAppName : null,
    productLabel: bestProductLabel,
    packsToBuy: bestPacksToBuy,
    bulkPackHint: bestOfferBulkNote ?? alternativeBulkHint,
  };
};

export const optimizeShoppingBasket = (input: OptimizationInput): OptimizationOutput => {
  const secondStoreThresholdCents = input.secondStoreThresholdCents ?? 500;
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

        const isBetterThanCurrentBest =
          bestSplit == null ||
          totalCheckoutCents < bestSplit.totalCheckoutCents ||
          (totalCheckoutCents === bestSplit.totalCheckoutCents &&
            secondaryItems.length < bestSplit.secondaryItems.length);

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
            worthSecondStore: extraSavingsVsBestSingleCents >= secondStoreThresholdCents,
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

  const recommendedStrategy =
    bestSplit != null && bestSplit.worthSecondStore ? "split" : "single";

  return {
    shoppingDate: input.shoppingDate,
    secondStoreThresholdCents,
    bestSingleStore,
    singleStoreRankings,
    bestTwoStoreSplit: bestSplit,
    recommendedStrategy,
  };
};
