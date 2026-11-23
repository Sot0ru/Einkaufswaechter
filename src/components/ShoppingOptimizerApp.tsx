"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChainScrapeStatus } from "@/lib/providers/chain-scrapers";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import {
  fetchOpenPricesForZip,
  type OpenPricesBaseCalibration,
} from "@/lib/providers/open-prices";
import {
  SAMPLE_RECEIPT_TEXT,
  buildOfferRecordFromReceiptItem,
  normalizeReceiptLabel,
  parseReceiptText,
  type ReceiptAliasEntry,
} from "@/lib/providers/receipt-importer";
import {
  fetchNearbyStoresForZip,
  type NearbyStoresResult,
} from "@/lib/providers/store-locator";
import { parseBrochureText } from "@/lib/providers/text-importer";
import {
  buildRegionalOffersForZip,
  isValidGermanZip,
  resolveZipRegion,
} from "@/lib/providers/zip-offer-fetcher";
import {
  CATEGORY_MAP,
  SHOPPING_PRESETS,
  STORE_MAP,
  STORES,
  type StoreId,
} from "@/lib/rules/catalog";
import { buildFavoritesReminderIcs, evaluateFavoriteAlerts } from "@/lib/rules/favorites";
import {
  type BasketItemInput,
  DEFAULT_MIN_SAVINGS_PER_DETOUR_MINUTE_CENTS,
  formatEuroCents,
  type OfferRecord,
  optimizeShoppingBasket,
} from "@/lib/rules/optimizer";
import type { ItemPreference } from "@/lib/rules/preferences";
import { reconcileReceiptWithBasket, type ReconciliationResult } from "@/lib/rules/receipt-reconciliation";
import {
  addRecipeToBasket,
  BUILTIN_RECIPES,
  type RecipeDefinition,
  scoreRecipesForWeek,
} from "@/lib/rules/recipes";
import {
  buildCategoryPriceStats,
  buildVerifiedKey,
  type PriceHistorySample,
  type PriceHistorySummary,
  type VerifiedPriceRecord,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import type { SavedShoppingList } from "@/lib/services/shopping-lists";
import { type AppTab, BottomNav, LegalFooter, SiteHeader } from "./AppChrome";
import { type BarcodeSavePayload, BarcodeScannerPanel } from "./BarcodeScannerPanel";
import { CompareView } from "./CompareView";
import { FavoriteAlertsCard } from "./FavoriteAlertsCard";
import { formatWeekday } from "./format";
import { InStoreView } from "./InStoreView";
import { OffersView } from "./OffersView";
import { type InStoreMode, resolvePlan } from "./plan";
import { ReceiptImportPanel } from "./ReceiptImportPanel";
import type { ReconciliationView } from "./ReceiptReconciliation";
import { RecipesPanel } from "./RecipesPanel";
import { SavedListsPanel } from "./SavedListsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { type CustomBasketItem, ShoppingListView } from "./ShoppingListView";
import { useHouseholdShare } from "./useHouseholdShare";
import { ZipOffersPanel } from "./ZipOffersPanel";

export const MOBILE_STORAGE_KEY = "einkaufswaechter_mobile_v1";

export interface ShoppingOptimizerAppProps {
  initialOffers: OfferRecord[];
  weekWindow: WeekWindow;
  initialCustomBasePrices?: CustomBasePricesMap;
  initialSavedLists?: SavedShoppingList[];
  initialReceiptAliases?: ReceiptAliasEntry[];
  initialPriceHistory?: PriceHistorySummary;
  initialBasketItems?: BasketItemInput[];
  initialCustomItems?: CustomBasketItem[];
  initialZipCode?: string;
  initialCheckedKeys?: Record<string, boolean>;
  initialRecipes?: RecipeDefinition[];
  initialFavoriteCategoryIds?: string[];
  initialStoreDetourMinutes?: Partial<Record<StoreId, number>>;
  initialMinSavingsPerDetourMinuteCents?: number;
}

/** Abgehakt-Status gilt pro Kategorie, egal in welchem Markt sie auf der Route liegt */
const applyCategoryChecks = (
  previous: Record<string, boolean>,
  checks: Record<string, boolean>,
): Record<string, boolean> => {
  const next = { ...previous };
  for (const [categoryId, checked] of Object.entries(checks)) {
    for (const store of STORES) next[`${store.id}:${categoryId}`] = checked;
  }
  return next;
};

interface ReconciliationState {
  storeId: StoreId;
  result: ReconciliationResult;
  weighedCategoryIds: string[];
}

const SAMPLE_BROCHURE_TEXT = `Kerrygold Original Irische Butter 250-g-Packung 1,49 €
Kerrygold Irischer Butterkäse 150-g-Packung 1,79 €
Dallmayr Prodomo Röstkaffee 500 g 4,49 € (Mit Lidl Plus 3,99 €)
Metzgerfrisch Rinderhackfleisch 500 g ab Donnerstag 2,79 €
Erdnussbutter Creamy 350 g 1,99 €`;

const DEFAULT_PRESET_ID = SHOPPING_PRESETS[0].id;
const INVALID_ZIP_MESSAGE = "Gib eine gültige 5-stellige Postleitzahl ein.";

export function ShoppingOptimizerApp({
  initialOffers,
  weekWindow,
  initialCustomBasePrices = {},
  initialSavedLists = [],
  initialReceiptAliases = [],
  initialPriceHistory,
  initialBasketItems,
  initialCustomItems = [],
  initialZipCode = "10115",
  initialCheckedKeys = {},
  initialRecipes,
  initialFavoriteCategoryIds = [],
  initialStoreDetourMinutes = {},
  initialMinSavingsPerDetourMinuteCents = DEFAULT_MIN_SAVINGS_PER_DETOUR_MINUTE_CENTS,
}: ShoppingOptimizerAppProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("compare");
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [activeZipCode, setActiveZipCode] = useState(initialZipCode);
  const [zipSyncFeedback, setZipSyncFeedback] = useState<string | null>(null);
  const [isSyncingZip, setIsSyncingZip] = useState(false);
  const [isFetchingOpenPrices, setIsFetchingOpenPrices] = useState(false);
  const [isLiveScraping, setIsLiveScraping] = useState(false);
  const [chainScrapeStatuses, setChainScrapeStatuses] = useState<ChainScrapeStatus[]>([]);
  // Standardmäßig Samstag, damit auch die Donnerstags-Angebote einfließen
  const [shoppingDate, setShoppingDate] = useState<string>(weekWindow.saturday);
  const [secondStoreThresholdCents, setSecondStoreThresholdCents] = useState<number>(500);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>(STORES.map((store) => store.id));
  const [enabledLoyaltyApps, setEnabledLoyaltyApps] = useState<StoreId[]>([
    "lidl",
    "kaufland",
    "rewe",
  ]);
  const [basketItems, setBasketItems] = useState<BasketItemInput[]>(
    initialBasketItems ?? [...SHOPPING_PRESETS[0].items],
  );
  const [customItems, setCustomItems] = useState<CustomBasketItem[]>(initialCustomItems);
  const [checkedKeys, setCheckedKeys] = useState<Record<string, boolean>>(initialCheckedKeys);
  const [searchQuery, setSearchQuery] = useState("");
  const [offers, setOffers] = useState<OfferRecord[]>(initialOffers);
  const [customBasePrices, setCustomBasePrices] =
    useState<CustomBasePricesMap>(initialCustomBasePrices);
  const [priceHistory, setPriceHistory] = useState<PriceHistorySummary>(
    () =>
      initialPriceHistory ?? {
        windowDays: 90,
        referenceDate: weekWindow.saturday,
        categoryStats: buildCategoryPriceStats(
          initialOffers.map(
            (o): PriceHistorySample => ({
              categoryId: o.categoryId,
              storeId: o.storeId,
              priceCents: o.loyaltyPriceCents ?? o.priceCents,
              packageAmount: o.packageAmount,
              packageUnit: o.packageUnit,
              observedDate: o.validFrom,
              source: "weekly_offer",
              isOffer: true,
            }),
          ),
          weekWindow.saturday,
        ),
        verifiedPrices: {},
      },
  );
  const [priceEditFeedback, setPriceEditFeedback] = useState<string | null>(null);
  const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);
  const [inStoreMode, setInStoreMode] = useState<InStoreMode>("recommended");

  // Paket 9: Echte Filial-Entfernungen & Öffnungszeiten (nur nach explizitem Abruf)
  const [nearbyStores, setNearbyStores] = useState<NearbyStoresResult | null>(null);
  const [isLoadingNearbyStores, setIsLoadingNearbyStores] = useState(false);
  const [nearbyStoresFeedback, setNearbyStoresFeedback] = useState<string | null>(null);

  // Paket 6: Umweg-Gewichtung und Gerichte
  const [storeDetourMinutes, setStoreDetourMinutes] =
    useState<Partial<Record<StoreId, number>>>(initialStoreDetourMinutes);
  const [minSavingsPerDetourMinuteCents, setMinSavingsPerDetourMinuteCents] = useState(
    initialMinSavingsPerDetourMinuteCents,
  );
  const [recipes, setRecipes] = useState<RecipeDefinition[]>(
    () => initialRecipes ?? [...BUILTIN_RECIPES],
  );
  const [recipeServings, setRecipeServings] = useState(4);
  const [recipeFeedback, setRecipeFeedback] = useState<string | null>(null);

  // Paket 7: Stammprodukte und Kassenzettel-Gegencheck
  const [favoriteCategoryIds, setFavoriteCategoryIds] = useState<string[]>(initialFavoriteCategoryIds);
  const [reconciliationState, setReconciliationState] = useState<ReconciliationState | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  // Gespeicherte Einkaufslisten
  const [savedLists, setSavedLists] = useState<SavedShoppingList[]>(initialSavedLists);
  const [activeListId, setActiveListId] = useState<string | undefined>(undefined);
  const [listNameInput, setListNameInput] = useState("Mein Wocheneinkauf");
  const [listSaveFeedback, setListSaveFeedback] = useState<string | null>(null);

  // Kassenbon-Import mit lernendem Kürzel-Wörterbuch
  const [receiptAliases, setReceiptAliases] =
    useState<ReceiptAliasEntry[]>(initialReceiptAliases);
  const [receiptInput, setReceiptInput] = useState(SAMPLE_RECEIPT_TEXT);
  const [receiptFallbackStoreId, setReceiptFallbackStoreId] = useState<StoreId>("lidl");
  const [manualReceiptAssignments, setManualReceiptAssignments] = useState<
    Record<string, string>
  >({});
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null);
  const [isImportingReceipt, setIsImportingReceipt] = useState(false);

  // Prospekt-Importer
  const [importStoreId, setImportStoreId] = useState<StoreId>("lidl");
  const [brochureInput, setBrochureInput] = useState(SAMPLE_BROCHURE_TEXT);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MOBILE_STORAGE_KEY,
        JSON.stringify({
          activeZipCode,
          secondStoreThresholdCents,
          enabledStores,
          enabledLoyaltyApps,
          basketItems,
          customItems,
          checkedKeys,
          customBasePrices,
          savedLists,
          receiptAliases,
          storeDetourMinutes,
          minSavingsPerDetourMinuteCents,
          favoriteCategoryIds,
          customRecipes: recipes.filter((recipe) => !recipe.isBuiltin),
        }),
      );
    } catch {
      // localStorage kann im Privatmodus blockiert sein
    }
  }, [
    activeZipCode,
    secondStoreThresholdCents,
    enabledStores,
    enabledLoyaltyApps,
    basketItems,
    customItems,
    checkedKeys,
    customBasePrices,
    savedLists,
    receiptAliases,
    storeDetourMinutes,
    minSavingsPerDetourMinuteCents,
    favoriteCategoryIds,
    recipes,
  ]);

  const optimization = useMemo(
    () =>
      optimizeShoppingBasket({
        items: basketItems,
        enabledStores,
        enabledLoyaltyApps,
        shoppingDate,
        secondStoreThresholdCents,
        offers,
        customBasePrices,
        storeDetourMinutes,
        minSavingsPerDetourMinuteCents,
      }),
    [
      basketItems,
      enabledStores,
      enabledLoyaltyApps,
      shoppingDate,
      secondStoreThresholdCents,
      offers,
      customBasePrices,
      storeDetourMinutes,
      minSavingsPerDetourMinuteCents,
    ],
  );

  const recipeScores = useMemo(
    () =>
      scoreRecipesForWeek({
        recipes,
        servings: recipeServings,
        offers,
        enabledStores,
        enabledLoyaltyApps,
        shoppingDate,
        customBasePrices,
      }),
    [recipes, recipeServings, offers, enabledStores, enabledLoyaltyApps, shoppingDate, customBasePrices],
  );

  const favoriteSet = useMemo(() => new Set(favoriteCategoryIds), [favoriteCategoryIds]);
  const favoriteSummary = useMemo(
    () =>
      evaluateFavoriteAlerts({
        favoriteCategoryIds,
        offers,
        enabledStores,
        enabledLoyaltyApps,
        shoppingDate,
        customBasePrices,
      }),
    [favoriteCategoryIds, offers, enabledStores, enabledLoyaltyApps, shoppingDate, customBasePrices],
  );
  const basketCategoryIds = useMemo(
    () => new Set(basketItems.map((item) => item.categoryId)),
    [basketItems],
  );

  const household = useHouseholdShare({
    onListLoaded: (list) => {
      setBasketItems(list.items);
      setListNameInput(list.name);
      setActiveListId(list.listId ?? undefined);
      setCheckedKeys(applyCategoryChecks({}, Object.fromEntries(list.checkedCategoryIds.map((id) => [id, true]))));
      setActiveTab(list.listId ? "instore" : "list");
    },
    onRemoteChecks: (checks) => setCheckedKeys((previous) => applyCategoryChecks(previous, checks)),
  });
  const isShareActive = household.shareStatus != null;

  useEffect(() => {
    if (!isShareActive) return;
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [isShareActive]);

  const brochurePreview = useMemo(
    () =>
      parseBrochureText({
        text: brochureInput,
        storeId: importStoreId,
        referenceDate: shoppingDate,
      }),
    [brochureInput, importStoreId, shoppingDate],
  );

  const receiptPreview = useMemo(
    () =>
      parseReceiptText({
        text: receiptInput,
        fallbackStoreId: receiptFallbackStoreId,
        learnedAliases: receiptAliases,
      }),
    [receiptInput, receiptFallbackStoreId, receiptAliases],
  );

  const currentRegion = useMemo(() => resolveZipRegion(activeZipCode), [activeZipCode]);

  const toggleStore = (storeId: StoreId) => {
    setEnabledStores((prev) => {
      if (prev.includes(storeId)) {
        return prev.length > 1 ? prev.filter((id) => id !== storeId) : prev;
      }
      return [...prev, storeId];
    });
  };

  const toggleLoyaltyApp = (storeId: StoreId) => {
    setEnabledLoyaltyApps((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId],
    );
  };

  const changeItemQuantity = (categoryId: string, delta: number) => {
    setBasketItems((prev) => {
      const existing = prev.find((item) => item.categoryId === categoryId);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { categoryId, quantity: delta }];
      }
      const nextQuantity = existing.quantity + delta;
      if (nextQuantity <= 0) {
        return prev.filter((item) => item.categoryId !== categoryId);
      }
      return prev.map((item) =>
        item.categoryId === categoryId ? { ...item, quantity: nextQuantity } : item,
      );
    });
  };

  const loadPreset = (presetId: string) => {
    const preset = SHOPPING_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    setBasketItems([...preset.items]);
    setCheckedKeys({});
  };

  const toggleChecked = (key: string) => {
    const nextChecked = !checkedKeys[key];
    if (key.startsWith("custom:")) {
      setCheckedKeys((previous) => ({ ...previous, [key]: nextChecked }));
      return;
    }
    const categoryId = key.slice(key.indexOf(":") + 1);
    setCheckedKeys((previous) => applyCategoryChecks(previous, { [categoryId]: nextChecked }));
    household.pushCheckChange(categoryId, nextChecked);
  };

  const changeItemPreference = (categoryId: string, preference: ItemPreference) => {
    setBasketItems((previous) =>
      previous.map((item) =>
        item.categoryId === categoryId
          ? { ...item, preference: preference === "cheapest" ? undefined : preference }
          : item,
      ),
    );
  };

  const changeDetourMinutes = (storeId: StoreId, minutes: number) => {
    setStoreDetourMinutes((previous) => {
      const next = { ...previous };
      if (minutes > 0) next[storeId] = minutes;
      else delete next[storeId];
      return next;
    });
  };

  const toggleFavorite = (categoryId: string) => {
    const next = favoriteSet.has(categoryId)
      ? favoriteCategoryIds.filter((id) => id !== categoryId)
      : [...favoriteCategoryIds, categoryId];
    setFavoriteCategoryIds(next);
    void fetch("/api/v1/favorites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryIds: next }),
    }).catch(() => undefined);
  };

  const addFavoriteAlertsToBasket = () => {
    setBasketItems((previous) => [
      ...previous,
      ...favoriteSummary.alerts
        .filter((alert) => !previous.some((item) => item.categoryId === alert.categoryId))
        .map((alert) => ({ categoryId: alert.categoryId, quantity: 1 })),
    ]);
  };

  const downloadFavoritesReminder = () => {
    const ics = buildFavoritesReminderIcs({
      now: new Date(),
      appUrl: `${window.location.origin}${window.location.pathname}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "einkaufswaechter-wochen-radar.ics";
    link.click();
    URL.revokeObjectURL(url);
  };

  const addRecipe = (recipe: RecipeDefinition) => {
    setBasketItems((previous) => addRecipeToBasket(previous, recipe, recipeServings));
    setRecipeFeedback(
      `Zutaten für ${recipe.name} (${recipeServings} Portionen) stehen jetzt auf deiner Liste.`,
    );
  };

  const saveBasketAsRecipe = async (name: string, servings: number) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setRecipeFeedback("Gib dem Gericht einen Namen.");
      return;
    }
    const ingredients = basketItems.map(({ categoryId, quantity }) => ({ categoryId, quantity }));
    if (ingredients.length === 0) {
      setRecipeFeedback("Leg zuerst die Zutaten auf deine Einkaufsliste.");
      return;
    }
    try {
      const response = await fetch("/api/v1/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, servings, ingredients }),
      });
      if (response.ok) {
        const data = (await response.json()) as { recipes: RecipeDefinition[] };
        setRecipes((previous) => [
          ...data.recipes,
          ...previous.filter((recipe) => recipe.id.startsWith("lokal-")),
        ]);
        setRecipeFeedback(`Gericht „${trimmedName}“ gespeichert.`);
        return;
      }
    } catch {
      // Ohne Server lokal speichern, siehe unten
    }
    setRecipes((previous) => [
      ...previous,
      {
        id: `lokal-${Date.now()}`,
        name: trimmedName,
        servings,
        prepMinutes: 30,
        tags: [],
        isBuiltin: false,
        ingredients,
      },
    ]);
    setRecipeFeedback(`Gericht „${trimmedName}“ auf diesem Gerät gespeichert.`);
  };

  const deleteRecipe = (recipeId: string) => {
    const recipe = recipes.find((candidate) => candidate.id === recipeId);
    setRecipes((previous) => previous.filter((candidate) => candidate.id !== recipeId));
    if (recipe) setRecipeFeedback(`Gericht „${recipe.name}“ gelöscht.`);
    if (!recipeId.startsWith("lokal-")) {
      void fetch(`/api/v1/recipes?id=${encodeURIComponent(recipeId)}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  };

  const startRoute = (mode: InStoreMode) => {
    setInStoreMode(mode);
    setActiveTab("instore");
  };

  const applyBrochureImport = () => {
    const matched = brochurePreview.flatMap((result) =>
      result.matched && result.offer != null ? [result.offer] : [],
    );
    if (matched.length === 0) {
      setImportFeedback("Keine Zeile passt zu einer Kategorie. Prüf Produktname und Preis.");
      return;
    }
    setOffers((prev) => [
      ...prev.filter(
        (existing) =>
          !matched.some(
            (offer) => offer.storeId === existing.storeId && offer.categoryId === existing.categoryId,
          ),
      ),
      ...matched,
    ]);
    setImportFeedback(
      `${matched.length} ${matched.length === 1 ? "Angebot" : "Angebote"} für ${STORE_MAP[importStoreId].shortName} übernommen. Der Preisvergleich ist aktualisiert.`,
    );
  };

  const applyReceiptImport = async () => {
    const storeId = receiptPreview.detectedStoreId ?? receiptFallbackStoreId;
    const effectiveZip =
      receiptPreview.detectedZipCode && isValidGermanZip(receiptPreview.detectedZipCode)
        ? receiptPreview.detectedZipCode
        : activeZipCode;
    const effectiveDate = receiptPreview.detectedDate ?? shoppingDate;

    const confirmedItems = receiptPreview.items.flatMap((item) => {
      const manualCategoryId = manualReceiptAssignments[item.aliasNormalized];
      const categoryId = manualCategoryId || item.categoryId;
      if (!categoryId || !CATEGORY_MAP[categoryId]) return [];
      return [
        {
          rawLabel: item.rawLabel,
          categoryId,
          regularPriceCents: item.regularPriceCents,
          effectivePriceCents: item.effectivePriceCents,
          isOffer: item.isOffer,
          usedLoyaltyApp: item.usedLoyaltyApp,
          updateBasePrice: item.suggestBasePriceUpdate || (item.isStoreBrand && !item.isOffer),
          learnAlias: Boolean(manualCategoryId) || !item.matched,
          packageAmount: item.packageAmount,
          packageUnit: item.packageUnit,
        },
      ];
    });

    if (confirmedItems.length === 0) {
      setReceiptFeedback(
        "Keine Position ist einer Kategorie zugeordnet. Wähle für unbekannte Kürzel eine Kategorie aus.",
      );
      return;
    }

    setIsImportingReceipt(true);

    // Gegencheck: geplante (abgehakte) Artikel dieses Markts gegen den echten Bon
    const plan = resolvePlan(optimization, inStoreMode);
    const leg = plan?.legs.find((candidate) => candidate.storeId === storeId);
    const storeItems = leg
      ? leg.departments.flatMap((department) => department.items)
      : (optimization.singleStoreRankings.find((ranking) => ranking.storeId === storeId)?.items ?? []);
    const checkedStoreItems = storeItems.filter((item) => checkedKeys[`${item.storeId}:${item.categoryId}`]);
    const plannedItems = checkedStoreItems.length > 0 ? checkedStoreItems : storeItems;
    const assignedReceiptItems = receiptPreview.items.flatMap((item) => {
      const categoryId = manualReceiptAssignments[item.aliasNormalized] || item.categoryId;
      return categoryId && CATEGORY_MAP[categoryId] ? [{ ...item, categoryId }] : [];
    });
    setReconciliationState({
      storeId,
      result: reconcileReceiptWithBasket({
        planned: plannedItems.map((item) => ({
          categoryId: item.categoryId,
          quantity: item.requestedQuantity,
          plannedCents: item.checkoutCents,
        })),
        receipt: assignedReceiptItems.map((item) => ({
          categoryId: item.categoryId,
          quantity: item.quantity,
          actualCents: item.effectivePriceCents * item.quantity,
          isOffer: item.isOffer,
        })),
      }),
      weighedCategoryIds: assignedReceiptItems
        .filter((item) => item.isWeighedItem)
        .map((item) => item.categoryId),
    });

    // 1. Sofort im Client übernehmen, damit es auch offline in der PWA funktioniert
    let localBaseUpdates = 0;
    const localNewOffers: OfferRecord[] = [];
    const localNewAliases: ReceiptAliasEntry[] = [];

    setCustomBasePrices((prev) => {
      const next: CustomBasePricesMap = { ...prev };
      for (const item of confirmedItems) {
        if (!item.updateBasePrice) continue;
        const category = CATEGORY_MAP[item.categoryId];
        if (!category) continue;
        next[item.categoryId] = {
          ...(next[item.categoryId] ?? {}),
          [storeId]: {
            priceCents: item.regularPriceCents,
            productLabel: category.defaultBasePrices[storeId].productLabel,
          },
        };
        localBaseUpdates += 1;
      }
      return next;
    });

    for (const item of confirmedItems) {
      if (item.isOffer) {
        const offer = buildOfferRecordFromReceiptItem({
          storeId,
          categoryId: item.categoryId,
          rawLabel: item.rawLabel,
          regularPriceCents: item.regularPriceCents,
          effectivePriceCents: item.effectivePriceCents,
          usedLoyaltyApp: item.usedLoyaltyApp,
          packageAmount: item.packageAmount,
          packageUnit: item.packageUnit,
          receiptDate: effectiveDate,
        });
        if (offer) localNewOffers.push(offer);
      }

      if (item.learnAlias) {
        const normalized = normalizeReceiptLabel(item.rawLabel);
        if (normalized.length >= 3) {
          localNewAliases.push({
            aliasNormalized: normalized,
            storeId,
            categoryId: item.categoryId,
            sampleLabel: item.rawLabel,
            hitCount: 1,
          });
        }
      }
    }

    if (localNewOffers.length > 0) {
      setOffers((prev) => [
        ...prev.filter(
          (existing) =>
            !localNewOffers.some(
              (offer) =>
                offer.storeId === existing.storeId && offer.categoryId === existing.categoryId,
            ),
        ),
        ...localNewOffers,
      ]);
    }

    if (localNewAliases.length > 0) {
      setReceiptAliases((prev) => {
        const byAlias = new Map(prev.map((alias) => [alias.aliasNormalized, alias]));
        for (const alias of localNewAliases) {
          const existing = byAlias.get(alias.aliasNormalized);
          byAlias.set(alias.aliasNormalized, {
            ...alias,
            hitCount: (existing?.hitCount ?? 0) + 1,
          });
        }
        return Array.from(byAlias.values());
      });
      setManualReceiptAssignments({});
    }

    setPriceHistory((prev) => {
      const nextVerified = { ...prev.verifiedPrices };
      for (const item of confirmedItems) {
        nextVerified[buildVerifiedKey(item.categoryId, storeId)] = {
          categoryId: item.categoryId,
          storeId,
          priceCents: item.effectivePriceCents,
          observedDate: effectiveDate,
          source: "receipt",
          packageAmount: item.packageAmount ?? null,
          packageUnit: item.packageUnit ?? null,
        };
      }
      return { ...prev, verifiedPrices: nextVerified };
    });

    const storeName = STORE_MAP[storeId].shortName;

    // 2. Im Hintergrund dauerhaft speichern
    try {
      const response = await fetch("/api/v1/receipts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          zipCode: effectiveZip,
          receiptDate: effectiveDate,
          items: confirmedItems,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.customBasePrices) setCustomBasePrices(data.customBasePrices);
        if (Array.isArray(data.aliases)) setReceiptAliases(data.aliases);
        setReceiptFeedback(
          `Bon von ${storeName} (PLZ ${effectiveZip}) gespeichert: ${data.observationsInserted} Positionen geprüft, ${data.basePricesUpdated} Normalpreise aktualisiert, ${data.offersUpserted} Angebote übernommen, ${data.aliasesLearned} Kürzel gelernt.`,
        );
        return;
      }
    } catch {
      // Offline bzw. PWA: lokale Übernahme oben gilt
    } finally {
      setIsImportingReceipt(false);
    }

    setReceiptFeedback(
      `Bon von ${storeName} (PLZ ${effectiveZip}) übernommen: ${confirmedItems.length} Positionen geprüft, ${localBaseUpdates} Normalpreise aktualisiert, ${localNewOffers.length} Angebote aktiv, ${localNewAliases.length} Kürzel gelernt.`,
    );
  };

  const fetchZipOffers = async (targetZipRaw?: string) => {
    const candidateZip = (targetZipRaw ?? zipCode).trim();
    if (!isValidGermanZip(candidateZip)) {
      setZipSyncFeedback(INVALID_ZIP_MESSAGE);
      return;
    }

    setZipCode(candidateZip);
    if (candidateZip !== activeZipCode) {
      setNearbyStores(null);
      setNearbyStoresFeedback(null);
    }
    setActiveZipCode(candidateZip);
    const region = resolveZipRegion(candidateZip);
    const regionText = `${region.regionLabel}, ${region.aldiVariant}`;

    // 1. Sofort deterministisch aktualisieren, damit die Oberfläche nicht wartet
    const regionalOffers = buildRegionalOffersForZip(candidateZip, shoppingDate);
    setOffers(regionalOffers);
    setIsSyncingZip(true);

    // 2. Im Hintergrund mit der Datenbank abgleichen
    try {
      const response = await fetch(
        `/api/v1/offers?zipCode=${encodeURIComponent(candidateZip)}&date=${encodeURIComponent(shoppingDate)}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.offers) && data.offers.length > 0) {
          setOffers(data.offers);
        }
      }
      setZipSyncFeedback(
        `${regionalOffers.length} Wochenangebote für PLZ ${candidateZip} geladen. ${regionText}.`,
      );
    } catch {
      setZipSyncFeedback(
        `${regionalOffers.length} regionale Wochenangebote für PLZ ${candidateZip} geladen. ${regionText}.`,
      );
    } finally {
      setIsSyncingZip(false);
    }
  };

  const changeZipCode = (rawValue: string, autoFetch: boolean) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 5);
    setZipCode(digits);
    if (autoFetch && digits.length === 5) {
      void fetchZipOffers(digits);
    }
  };

  const applyOpenPricesClientData = (params: {
    newOffers?: readonly OfferRecord[];
    baseCalibrations?: readonly OpenPricesBaseCalibration[];
    verifiedPrices?: readonly VerifiedPriceRecord[];
    replaceAllOffers?: readonly OfferRecord[];
  }) => {
    if (params.replaceAllOffers && params.replaceAllOffers.length > 0) {
      setOffers([...params.replaceAllOffers]);
    } else if (params.newOffers && params.newOffers.length > 0) {
      const incoming = params.newOffers;
      setOffers((prev) => [
        ...incoming,
        ...prev.filter(
          (existing) =>
            !incoming.some(
              (o) => o.storeId === existing.storeId && o.categoryId === existing.categoryId,
            ),
        ),
      ]);
    }

    if (params.baseCalibrations && params.baseCalibrations.length > 0) {
      const calibrations = params.baseCalibrations;
      setCustomBasePrices((prev) => {
        const next: CustomBasePricesMap = { ...prev };
        for (const cal of calibrations) {
          const existing = next[cal.categoryId]?.[cal.storeId];
          // Eigene manuelle Nutzer-Preisanpassungen niemals überschreiben
          if (existing && !existing.productLabel.includes("(Open Prices")) continue;
          next[cal.categoryId] = {
            ...(next[cal.categoryId] ?? {}),
            [cal.storeId]: {
              priceCents: cal.priceCents,
              productLabel: cal.productLabel,
            },
          };
        }
        return next;
      });
    }

    if (params.verifiedPrices && params.verifiedPrices.length > 0) {
      const verified = params.verifiedPrices;
      setPriceHistory((prev) => {
        const nextVerified = { ...prev.verifiedPrices };
        for (const record of verified) {
          const key = buildVerifiedKey(record.categoryId, record.storeId);
          const existing = nextVerified[key];
          // Frischere eigene Bon-/Barcode-Scans bleiben immer erhalten
          if (
            existing &&
            existing.source !== "open_prices" &&
            existing.observedDate >= record.observedDate
          ) {
            continue;
          }
          nextVerified[key] = record;
        }
        return { ...prev, verifiedPrices: nextVerified };
      });
    }
  };

  const triggerOpenPricesFetch = async () => {
    const candidateZip = zipCode.trim();
    if (!isValidGermanZip(candidateZip)) {
      setZipSyncFeedback(INVALID_ZIP_MESSAGE);
      return;
    }

    setIsFetchingOpenPrices(true);
    setZipSyncFeedback("Echte Community-Preise werden über Open Prices (Open Food Facts) geladen…");

    if (candidateZip !== activeZipCode) {
      setNearbyStores(null);
      setNearbyStoresFeedback(null);
    }
    setActiveZipCode(candidateZip);

    // 1. Server-Sync versuchen (inkl. DB-Speicherung & Preishistorie)
    try {
      const response = await fetch(
        `/api/v1/offers/open-prices?zipCode=${encodeURIComponent(candidateZip)}&date=${encodeURIComponent(shoppingDate)}`,
      );
      if (response.ok) {
        const data = await response.json();
        applyOpenPricesClientData({
          replaceAllOffers: Array.isArray(data.offers) ? data.offers : undefined,
          baseCalibrations: Array.isArray(data.openPricesBaseCalibrations)
            ? data.openPricesBaseCalibrations
            : undefined,
          verifiedPrices: Array.isArray(data.openPricesVerifiedPrices)
            ? data.openPricesVerifiedPrices
            : undefined,
        });
        if (data.priceHistory) {
          setPriceHistory(data.priceHistory);
        }
        const matched = Number(data.openPricesMatchedCount ?? 0);
        const localCount = Number(data.openPricesLocalCount ?? 0);
        const offerCount = Number(data.openPricesOfferCount ?? 0);
        const calCount = Array.isArray(data.openPricesBaseCalibrations)
          ? data.openPricesBaseCalibrations.length
          : 0;
        setZipSyncFeedback(
          matched > 0
            ? `Open Prices geladen (PLZ ${candidateZip}): ${matched} echte Marktpreise zugeordnet (${localCount} lokal, ${offerCount} Angebote, ${calCount} Basispreis-Kalibrierungen).`
            : `Open Prices für PLZ ${candidateZip} abgefragt, aktuell keine passenden neuen Einträge – Regionalkatalog bleibt aktiv.`,
        );
        return;
      }
    } catch {
      // Statische PWA / kein Server -> direkter CORS-Abruf im Browser
    } finally {
      setIsFetchingOpenPrices(false);
    }

    // 2. Direkter Browser-Abruf (CORS-fähig – funktioniert auch auf GitHub Pages!)
    setIsFetchingOpenPrices(true);
    try {
      const live = await fetchOpenPricesForZip({
        zipCode: candidateZip,
        referenceDate: shoppingDate,
        stores: enabledStores,
      });
      if (live.source === "open_prices_live") {
        applyOpenPricesClientData({
          newOffers: live.offers,
          baseCalibrations: live.baseCalibrations,
          verifiedPrices: live.verifiedPrices,
        });
        setZipSyncFeedback(
          live.matchedCount > 0
            ? `Open Prices direkt im Browser geladen (PLZ ${candidateZip}): ${live.matchedCount} echte Marktpreise (${live.localMatchedCount} lokal, ${live.offers.length} Angebote, ${live.baseCalibrations.length} Basispreis-Updates).`
            : `Open Prices für PLZ ${candidateZip} erreicht (${live.fetchedRawCount} Einträge geprüft), keine neuen Kategorietreffer – Regionalkatalog bleibt aktiv.`,
        );
      } else {
        setZipSyncFeedback(
          "Open Prices ist derzeit offline nicht erreichbar. Der deterministische Regionalkatalog bleibt aktiv.",
        );
      }
    } finally {
      setIsFetchingOpenPrices(false);
    }
  };

  const triggerLiveScrape = async () => {
    const candidateZip = zipCode.trim();
    if (!isValidGermanZip(candidateZip)) {
      setZipSyncFeedback(INVALID_ZIP_MESSAGE);
      return;
    }

    setIsLiveScraping(true);
    setZipSyncFeedback(null);
    try {
      const response = await fetch("/api/v1/offers/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "live_chains",
          zipCode: candidateZip,
          referenceDate: shoppingDate,
          stores: enabledStores,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        applyOpenPricesClientData({
          replaceAllOffers: Array.isArray(data.offers) ? data.offers : undefined,
          baseCalibrations: Array.isArray(data.openPricesBaseCalibrations)
            ? data.openPricesBaseCalibrations
            : undefined,
          verifiedPrices: Array.isArray(data.openPricesVerifiedPrices)
            ? data.openPricesVerifiedPrices
            : undefined,
        });
        if (Array.isArray(data.chainStatuses)) {
          setChainScrapeStatuses(data.chainStatuses);
        }
        if (candidateZip !== activeZipCode) {
          setNearbyStores(null);
          setNearbyStoresFeedback(null);
        }
        setActiveZipCode(candidateZip);
        const opCount = Number(data.openPricesMatchedCount ?? 0);
        const opSuffix =
          opCount > 0 ? ` + ${opCount} echte Open-Prices-Beobachtungen` : "";
        setZipSyncFeedback(
          `Live-Abruf abgeschlossen: ${data.liveChainCount ?? 0} Ketten live erreicht, ${data.liveScrapedOfferCount ?? 0} Live-Treffer${opSuffix}, insgesamt ${data.offers?.length ?? offers.length} Angebote für PLZ ${candidateZip}.`,
        );
        return;
      }
    } catch {
      // Ohne Serververbindung: Fallback auf CORS-fähiges Open Prices direkt im Browser
    } finally {
      setIsLiveScraping(false);
    }

    // Statische PWA ohne Backend-Server: automatisch Open Prices direkt im Browser abrufen
    await triggerOpenPricesFetch();
  };

  /** Speichert die Liste; liefert die Server-ID oder null, wenn nur lokal gespeichert wurde */
  const saveCurrentList = async (asNew: boolean): Promise<string | null> => {
    const trimmedName = listNameInput.trim();
    if (!trimmedName) {
      setListSaveFeedback("Gib der Liste einen Namen.");
      return null;
    }
    if (basketItems.length === 0) {
      setListSaveFeedback("Deine Einkaufsliste ist leer, es gibt nichts zu speichern.");
      return null;
    }

    const payload = {
      id: asNew ? undefined : activeListId,
      name: trimmedName,
      zipCode: activeZipCode,
      shoppingDate,
      secondStoreThresholdCents,
      items: basketItems.map((item) => ({
        categoryId: item.categoryId,
        quantity: item.quantity,
        checked: false,
      })),
    };

    try {
      const response = await fetch("/api/v1/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.lists)) setSavedLists(data.lists);
        if (data.list?.id) setActiveListId(data.list.id);
        setListSaveFeedback(`Liste „${trimmedName}“ gespeichert.`);
        return typeof data.list?.id === "string" ? data.list.id : null;
      }
    } catch {
      // Lokal speichern, siehe unten
    }

    const fallbackId = (!asNew && activeListId) || `local-${Date.now()}`;
    const localEntry: SavedShoppingList = {
      id: fallbackId,
      name: trimmedName,
      zipCode: activeZipCode,
      shoppingDate,
      secondStoreThresholdCents,
      createdAt: new Date().toISOString(),
      items: payload.items,
    };
    setSavedLists((prev) => [localEntry, ...prev.filter((list) => list.id !== fallbackId)]);
    setActiveListId(fallbackId);
    setListSaveFeedback(`Liste „${trimmedName}“ auf diesem Gerät gespeichert.`);
    return null;
  };

  const shareCurrentList = async () => {
    if (basketItems.length === 0) {
      setListSaveFeedback("Deine Einkaufsliste ist leer, es gibt nichts zu teilen.");
      return;
    }
    const listId = await saveCurrentList(false);
    await household.createShare({
      listId,
      name: listNameInput.trim() || "Einkaufsliste",
      items: basketItems.map(({ categoryId, quantity }) => ({ categoryId, quantity })),
    });
  };

  const loadSavedList = (list: SavedShoppingList) => {
    setBasketItems(list.items.map((item) => ({ categoryId: item.categoryId, quantity: item.quantity })));
    setActiveListId(list.id);
    setListNameInput(list.name);
    setSecondStoreThresholdCents(list.secondStoreThresholdCents);
    setCheckedKeys({});
    if (list.zipCode && list.zipCode !== activeZipCode) {
      void fetchZipOffers(list.zipCode);
    }
    setListSaveFeedback(`Liste „${list.name}“ geladen.`);
  };

  const deleteSavedList = async (listId: string) => {
    setSavedLists((prev) => prev.filter((list) => list.id !== listId));
    if (activeListId === listId) setActiveListId(undefined);
    try {
      await fetch(`/api/v1/lists?id=${encodeURIComponent(listId)}`, { method: "DELETE" });
    } catch {
      // Lokal bereits entfernt
    }
  };

  const adjustBasePrice = async (categoryId: string, storeId: StoreId, deltaCents: number) => {
    const category = CATEGORY_MAP[categoryId];
    if (!category) return;
    const currentEntry =
      customBasePrices[categoryId]?.[storeId] ?? category.defaultBasePrices[storeId];
    const nextPriceCents = Math.max(10, currentEntry.priceCents + deltaCents);

    setCustomBasePrices((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? {}),
        [storeId]: { priceCents: nextPriceCents, productLabel: currentEntry.productLabel },
      },
    }));
    setPriceEditFeedback(
      `Normalpreis für ${category.name} bei ${STORE_MAP[storeId].shortName}: jetzt ${formatEuroCents(nextPriceCents)}.`,
    );

    try {
      await fetch("/api/v1/base-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          storeId,
          priceCents: nextPriceCents,
          productLabel: currentEntry.productLabel,
        }),
      });
    } catch {
      // Lokale Änderung gilt bereits
    }
  };

  const resetBasePrice = async (categoryId: string, storeId: StoreId) => {
    const category = CATEGORY_MAP[categoryId];
    if (!category) return;
    const defaultEntry = category.defaultBasePrices[storeId];

    setCustomBasePrices((prev) => {
      const nextCategory = { ...(prev[categoryId] ?? {}) };
      delete nextCategory[storeId];
      const nextMap = { ...prev };
      if (Object.keys(nextCategory).length === 0) {
        delete nextMap[categoryId];
      } else {
        nextMap[categoryId] = nextCategory;
      }
      return nextMap;
    });
    setPriceEditFeedback(
      `Normalpreis für ${category.name} bei ${STORE_MAP[storeId].shortName} wieder auf Standard (${formatEuroCents(defaultEntry.priceCents)}).`,
    );

    try {
      await fetch("/api/v1/base-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, storeId, resetToDefault: true }),
      });
    } catch {
      // Lokale Änderung gilt bereits
    }
  };

  const saveBarcodePrice = async (payload: BarcodeSavePayload) => {
    const category = CATEGORY_MAP[payload.categoryId];
    if (!category) return;

    const packageAmount = payload.packageAmount ?? category.standardAmount;
    const packageUnit = payload.packageUnit ?? category.unit;

    // 1. Sofort lokal übernehmen (funktioniert auch offline in der PWA)
    if (payload.isOffer) {
      const offerId = `barcode-${payload.storeId}-${category.id}-${activeZipCode}-${weekWindow.monday}`;
      const title = [payload.brand, payload.productName].filter(Boolean).join(" ").trim();
      const localOffer: OfferRecord = {
        id: offerId,
        storeId: payload.storeId,
        categoryId: category.id,
        title,
        priceCents: payload.priceCents,
        loyaltyPriceCents: null,
        requiresLoyaltyApp: false,
        packageAmount,
        packageUnit,
        validFrom: weekWindow.monday,
        validTo: weekWindow.saturday,
      };
      setOffers((prev) => [
        ...prev.filter(
          (o) => !(o.storeId === payload.storeId && o.categoryId === category.id),
        ),
        localOffer,
      ]);
    } else {
      setCustomBasePrices((prev) => ({
        ...prev,
        [category.id]: {
          ...(prev[category.id] ?? {}),
          [payload.storeId]: {
            priceCents: payload.priceCents,
            productLabel: category.defaultBasePrices[payload.storeId].productLabel,
          },
        },
      }));
    }

    setPriceHistory((prev) => ({
      ...prev,
      verifiedPrices: {
        ...prev.verifiedPrices,
        [buildVerifiedKey(category.id, payload.storeId)]: {
          categoryId: category.id,
          storeId: payload.storeId,
          priceCents: payload.priceCents,
          observedDate: shoppingDate,
          source: "barcode",
          packageAmount,
          packageUnit,
        },
      },
    }));

    const storeShort = STORE_MAP[payload.storeId].shortName;

    // 2. Im Hintergrund dauerhaft in der Datenbank speichern
    try {
      const response = await fetch("/api/v1/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          zipCode: activeZipCode,
          observedDate: shoppingDate,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.customBasePrices) setCustomBasePrices(data.customBasePrices);
        if (data.priceHistory) setPriceHistory(data.priceHistory);
        setBarcodeFeedback(
          `${payload.productName} (${formatEuroCents(payload.priceCents)}) bei ${storeShort} dauerhaft gespeichert${data.shrinkflationWarning ? ` – ${data.shrinkflationWarning.message}` : ""}.`,
        );
        return;
      }
    } catch {
      // Offline / PWA: lokale Übernahme gilt bereits
    }

    setBarcodeFeedback(
      `${payload.productName} (${formatEuroCents(payload.priceCents)}) bei ${storeShort} als ${payload.isOffer ? "Wochenangebot" : "Normalpreis"} übernommen.`,
    );
  };

  const reconciliationUpdates = useMemo(() => {
    if (!reconciliationState) return [];
    const { storeId, result, weighedCategoryIds } = reconciliationState;
    return result.lines.flatMap((line) => {
      const category = CATEGORY_MAP[line.categoryId];
      if (
        !category ||
        line.status !== "price_changed" ||
        line.actualWasOffer ||
        line.actualUnitCents == null ||
        weighedCategoryIds.includes(line.categoryId)
      ) {
        return [];
      }
      const current = customBasePrices[line.categoryId]?.[storeId] ?? category.defaultBasePrices[storeId];
      return current.priceCents === line.actualUnitCents
        ? []
        : [{ categoryId: line.categoryId, priceCents: line.actualUnitCents, productLabel: current.productLabel }];
    });
  }, [reconciliationState, customBasePrices]);

  const reconciliationView: ReconciliationView | null = reconciliationState
    ? {
        storeName: STORE_MAP[reconciliationState.storeId].shortName,
        result: reconciliationState.result,
        pendingPriceUpdates: reconciliationUpdates.length,
      }
    : null;

  const applyReconciledPrices = () => {
    if (!reconciliationState || reconciliationUpdates.length === 0) return;
    const { storeId } = reconciliationState;
    setCustomBasePrices((previous) => {
      const next = { ...previous };
      for (const update of reconciliationUpdates) {
        next[update.categoryId] = {
          ...(next[update.categoryId] ?? {}),
          [storeId]: { priceCents: update.priceCents, productLabel: update.productLabel },
        };
      }
      return next;
    });
    for (const update of reconciliationUpdates) {
      void fetch("/api/v1/base-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...update }),
      }).catch(() => undefined);
    }
    const count = reconciliationUpdates.length;
    setReceiptFeedback(
      `${count === 1 ? "Ein Normalpreis" : `${count} Normalpreise`} bei ${STORE_MAP[storeId].shortName} aktualisiert.`,
    );
  };

  const renderFavoritesCard = (showEmptyStates: boolean) => (
    <FavoriteAlertsCard
      summary={favoriteSummary}
      favoriteCount={favoriteCategoryIds.length}
      basketCategoryIds={basketCategoryIds}
      onAddAll={addFavoriteAlertsToBasket}
      onDownloadReminder={downloadFavoritesReminder}
      showEmptyStates={showEmptyStates}
    />
  );

  const addCustomItem = (item: Omit<CustomBasketItem, "id" | "quantity">) => {
    const normalized = item.name.trim().toLowerCase();
    setCustomItems((prev) => {
      const existing = prev.find((c) => c.name.trim().toLowerCase() === normalized);
      if (existing) {
        return prev.map((c) => (c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: item.name.trim(),
          department: item.department,
          quantity: 1,
          estimatedPriceCents: item.estimatedPriceCents,
        },
      ];
    });
  };

  const changeCustomItemQuantity = (id: string, delta: number) => {
    setCustomItems((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) return prev.filter((c) => c.id !== id);
      return prev.map((c) => (c.id === id ? { ...c, quantity: nextQty } : c));
    });
  };

  const applyNearbyDetoursFromResult = (result: NearbyStoresResult) => {
    const osmDetours: Partial<Record<StoreId, number>> = {};
    for (const loc of result.stores) {
      if (loc.source === "osm_overpass") {
        osmDetours[loc.storeId] = loc.detourMinutes;
      }
    }
    if (Object.keys(osmDetours).length === 0) return;
    setStoreDetourMinutes((previous) => ({ ...previous, ...osmDetours }));
  };

  const fetchNearbyStores = async () => {
    const candidateZip = zipCode.trim();
    if (!isValidGermanZip(candidateZip)) {
      setNearbyStoresFeedback(INVALID_ZIP_MESSAGE);
      return;
    }

    setIsLoadingNearbyStores(true);
    setNearbyStoresFeedback(null);

    try {
      try {
        const response = await fetch(
          `/api/v1/stores/nearby?zipCode=${encodeURIComponent(candidateZip)}&date=${encodeURIComponent(shoppingDate)}`,
        );
        if (response.ok) {
          const data = (await response.json()) as NearbyStoresResult;
          if (Array.isArray(data.stores) && data.stores.length > 0) {
            if (data.osmMatchCount > 0) {
              setNearbyStores(data);
              applyNearbyDetoursFromResult(data);
              setNearbyStoresFeedback(
                `${data.osmMatchCount} echte Filialen via OpenStreetMap für PLZ ${candidateZip} geladen${data.fromCache ? " (Cache)" : ""} & Wegzeiten übernommen.`,
              );
            } else {
              setNearbyStores(null);
              setNearbyStoresFeedback(
                `Keine echten Filialen über OpenStreetMap für PLZ ${candidateZip} erreichbar. Deine Umweg-Eingaben bleiben unverändert.`,
              );
            }
            return;
          }
        }
      } catch {
        // Statische PWA / kein Backend: direkt im Browser gegen OpenStreetMap abfragen
      }

      const directResult = await fetchNearbyStoresForZip(candidateZip);
      if (directResult.osmMatchCount > 0) {
        setNearbyStores(directResult);
        applyNearbyDetoursFromResult(directResult);
        setNearbyStoresFeedback(
          `${directResult.osmMatchCount} echte Filialen direkt via OpenStreetMap für PLZ ${candidateZip} geladen & Wegzeiten übernommen.`,
        );
      } else {
        setNearbyStores(null);
        setNearbyStoresFeedback(
          `OpenStreetMap derzeit nicht erreichbar (offline). Deine Umweg-Eingaben bleiben unverändert.`,
        );
      }
    } finally {
      setIsLoadingNearbyStores(false);
    }
  };

  const isWeekendShopping = shoppingDate >= weekWindow.thursday;
  const busyFetching = isSyncingZip || isLiveScraping;
  const totalListCount = basketItems.length + customItems.length;

  return (
    <>
      <SiteHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        listCount={totalListCount}
        activeZipCode={activeZipCode}
      />

      <main className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        {household.shareNotice && (
          <div
            role="status"
            className="mb-8 flex items-start justify-between gap-3 rounded-md border-2 border-route px-4 py-3 text-[15px]"
          >
            <span className="pt-2.5">{household.shareNotice}</span>
            <button
              type="button"
              onClick={household.dismissShareNotice}
              aria-label="Hinweis schließen"
              className="flex size-11 flex-none items-center justify-center rounded text-xl hover:bg-panel"
            >
              ×
            </button>
          </div>
        )}
        {activeTab === "compare" && (
          <div className="grid items-start gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <CompareView
                optimization={optimization}
                offers={offers}
                shoppingDate={shoppingDate}
                priceHistory={priceHistory}
                customBasePrices={customBasePrices}
                nearbyStores={nearbyStores}
                weekday={formatWeekday(shoppingDate)}
                onStartRoute={startRoute}
                onLoadPreset={() => loadPreset(DEFAULT_PRESET_ID)}
                onOpenList={() => setActiveTab("list")}
                favoritesCard={renderFavoritesCard(false)}
              />
            </div>
            <div className="lg:col-start-1 lg:row-start-1">
              <SettingsPanel
                zipCode={zipCode}
                onZipCodeChange={(value) => changeZipCode(value, true)}
                region={currentRegion}
                isSyncingZip={busyFetching}
                shoppingDate={shoppingDate}
                isWeekendShopping={isWeekendShopping}
                onShoppingDayChange={(day) =>
                  setShoppingDate(day === "weekend" ? weekWindow.saturday : weekWindow.monday)
                }
                thresholdCents={secondStoreThresholdCents}
                onThresholdChange={setSecondStoreThresholdCents}
                enabledStores={enabledStores}
                onToggleStore={toggleStore}
                enabledLoyaltyApps={enabledLoyaltyApps}
                onToggleLoyaltyApp={toggleLoyaltyApp}
                storeDetourMinutes={storeDetourMinutes}
                onDetourMinutesChange={changeDetourMinutes}
                minSavingsPerDetourMinuteCents={minSavingsPerDetourMinuteCents}
                onMinSavingsPerDetourMinuteChange={setMinSavingsPerDetourMinuteCents}
                nearbyStores={nearbyStores}
                isLoadingNearbyStores={isLoadingNearbyStores}
                nearbyStoresFeedback={nearbyStoresFeedback}
                onFetchNearbyStores={() => void fetchNearbyStores()}
                onApplyNearbyDetours={() => {
                  if (!nearbyStores) return;
                  applyNearbyDetoursFromResult(nearbyStores);
                  setNearbyStoresFeedback("Ermittelte OSM-Wegzeiten als Umwege übernommen.");
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "list" && (
          <ShoppingListView
            basketItems={basketItems}
            customItems={customItems}
            onAddCustomItem={addCustomItem}
            onChangeCustomItemQuantity={changeCustomItemQuantity}
            onChangeQuantity={changeItemQuantity}
            onClear={() => {
              setBasketItems([]);
              setCustomItems([]);
            }}
            onLoadPreset={loadPreset}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onChangePreference={changeItemPreference}
            favoriteIds={favoriteSet}
            onToggleFavorite={toggleFavorite}
            recipesPanel={
              <RecipesPanel
                scores={recipeScores}
                servings={recipeServings}
                onServingsChange={setRecipeServings}
                onAddRecipe={addRecipe}
                onDeleteRecipe={deleteRecipe}
                canSaveBasket={basketItems.length > 0}
                onSaveBasketAsRecipe={(name, servings) => void saveBasketAsRecipe(name, servings)}
                feedback={recipeFeedback}
              />
            }
            savedListsPanel={
              <SavedListsPanel
                savedLists={savedLists}
                activeListId={activeListId}
                listName={listNameInput}
                onListNameChange={setListNameInput}
                onSave={(asNew) => void saveCurrentList(asNew)}
                onLoad={loadSavedList}
                onDelete={(listId) => void deleteSavedList(listId)}
                feedback={listSaveFeedback}
                canShare={basketItems.length > 0}
                onShare={() => void shareCurrentList()}
                isSharing={household.isSharing}
                shareLink={household.shareLink}
                onStopSharing={household.stopSharing}
              />
            }
          />
        )}

        {activeTab === "instore" && (
          <InStoreView
            optimization={optimization}
            offers={offers}
            shoppingDate={shoppingDate}
            priceHistory={priceHistory}
            nearbyStores={nearbyStores}
            customItems={customItems}
            mode={inStoreMode}
            onModeChange={setInStoreMode}
            checkedKeys={checkedKeys}
            onToggleChecked={toggleChecked}
            customBasePrices={customBasePrices}
            onAdjustBasePrice={(categoryId, storeId, deltaCents) =>
              void adjustBasePrice(categoryId, storeId, deltaCents)
            }
            onResetBasePrice={(categoryId, storeId) => void resetBasePrice(categoryId, storeId)}
            priceEditFeedback={priceEditFeedback}
            shareStatus={household.shareStatus}
            now={clock}
          />
        )}

        {activeTab === "offers" && (
          <div className="flex flex-col gap-14">
            {renderFavoritesCard(true)}
            <ZipOffersPanel
              zipCode={zipCode}
              onZipCodeChange={(value) => changeZipCode(value, false)}
              activeZipCode={activeZipCode}
              region={currentRegion}
              onFetchOffers={(zip) => void fetchZipOffers(zip)}
              onFetchOpenPrices={() => void triggerOpenPricesFetch()}
              onLiveScrape={() => void triggerLiveScrape()}
              isSyncing={isSyncingZip}
              isFetchingOpenPrices={isFetchingOpenPrices}
              isLiveScraping={isLiveScraping}
              feedback={zipSyncFeedback}
              chainStatuses={chainScrapeStatuses}
            />
            <BarcodeScannerPanel
              defaultStoreId={receiptFallbackStoreId}
              activeZipCode={activeZipCode}
              onSaveBarcodePrice={saveBarcodePrice}
              feedback={barcodeFeedback}
            />
            <ReceiptImportPanel
              receiptInput={receiptInput}
              onReceiptInputChange={setReceiptInput}
              preview={receiptPreview}
              fallbackStoreId={receiptFallbackStoreId}
              onFallbackStoreChange={setReceiptFallbackStoreId}
              activeZipCode={activeZipCode}
              shoppingDate={shoppingDate}
              manualAssignments={manualReceiptAssignments}
              onAssign={(alias, categoryId) =>
                setManualReceiptAssignments((prev) => ({ ...prev, [alias]: categoryId }))
              }
              learnedAliasCount={receiptAliases.length}
              isImporting={isImportingReceipt}
              onImport={() => void applyReceiptImport()}
              feedback={receiptFeedback}
              reconciliation={reconciliationView}
              onApplyReconciledPrices={applyReconciledPrices}
            />
            <OffersView
              offers={offers}
              weekWindow={weekWindow}
              shoppingDate={shoppingDate}
              priceHistory={priceHistory}
              customBasePrices={customBasePrices}
              importStoreId={importStoreId}
              onImportStoreChange={setImportStoreId}
              brochureInput={brochureInput}
              onBrochureInputChange={setBrochureInput}
              preview={brochurePreview}
              feedback={importFeedback}
              onApplyImport={applyBrochureImport}
            />
          </div>
        )}
      </main>

      <LegalFooter />
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        listCount={totalListCount}
      />
    </>
  );
}
