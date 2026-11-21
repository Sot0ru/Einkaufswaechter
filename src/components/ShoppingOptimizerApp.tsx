"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChainScrapeStatus } from "@/lib/providers/chain-scrapers";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import {
  SAMPLE_RECEIPT_TEXT,
  buildOfferRecordFromReceiptItem,
  normalizeReceiptLabel,
  parseReceiptText,
  type ReceiptAliasEntry,
} from "@/lib/providers/receipt-importer";
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
import {
  type BasketItemInput,
  formatEuroCents,
  type OfferRecord,
  optimizeShoppingBasket,
} from "@/lib/rules/optimizer";
import {
  buildCategoryPriceStats,
  buildVerifiedKey,
  type PriceHistorySample,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import type { SavedShoppingList } from "@/lib/services/shopping-lists";
import { type AppTab, BottomNav, LegalFooter, SiteHeader } from "./AppChrome";
import { type BarcodeSavePayload, BarcodeScannerPanel } from "./BarcodeScannerPanel";
import { CompareView } from "./CompareView";
import { formatWeekday } from "./format";
import { InStoreView } from "./InStoreView";
import { OffersView } from "./OffersView";
import type { InStoreMode } from "./plan";
import { ReceiptImportPanel } from "./ReceiptImportPanel";
import { SavedListsPanel } from "./SavedListsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ShoppingListView } from "./ShoppingListView";
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
  initialZipCode?: string;
  initialCheckedKeys?: Record<string, boolean>;
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
  initialZipCode = "10115",
  initialCheckedKeys = {},
}: ShoppingOptimizerAppProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("compare");
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [activeZipCode, setActiveZipCode] = useState(initialZipCode);
  const [zipSyncFeedback, setZipSyncFeedback] = useState<string | null>(null);
  const [isSyncingZip, setIsSyncingZip] = useState(false);
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
          checkedKeys,
          customBasePrices,
          savedLists,
          receiptAliases,
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
    checkedKeys,
    customBasePrices,
    savedLists,
    receiptAliases,
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
      }),
    [
      basketItems,
      enabledStores,
      enabledLoyaltyApps,
      shoppingDate,
      secondStoreThresholdCents,
      offers,
      customBasePrices,
    ],
  );

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
    setCheckedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
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
        if (Array.isArray(data.offers) && data.offers.length > 0) {
          setOffers(data.offers);
        }
        if (Array.isArray(data.chainStatuses)) {
          setChainScrapeStatuses(data.chainStatuses);
        }
        setActiveZipCode(candidateZip);
        setZipSyncFeedback(
          `Live-Abruf abgeschlossen: ${data.liveChainCount ?? 0} Ketten live erreicht, ${data.liveScrapedOfferCount ?? 0} Live-Treffer, insgesamt ${data.offers?.length ?? offers.length} Angebote für PLZ ${candidateZip}.`,
        );
        return;
      }
      setZipSyncFeedback(
        "Der Live-Abruf braucht den Server (/api/v1/offers/scrape). Bis dahin gilt der Regionalkatalog.",
      );
    } catch {
      setZipSyncFeedback(
        "Ohne Serververbindung ist kein Live-Abruf möglich. Der Regionalkatalog bleibt aktiv.",
      );
    } finally {
      setIsLiveScraping(false);
    }
  };

  const saveCurrentList = async (asNew: boolean) => {
    const trimmedName = listNameInput.trim();
    if (!trimmedName) {
      setListSaveFeedback("Gib der Liste einen Namen.");
      return;
    }
    if (basketItems.length === 0) {
      setListSaveFeedback("Deine Einkaufsliste ist leer, es gibt nichts zu speichern.");
      return;
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
        return;
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

  const isWeekendShopping = shoppingDate >= weekWindow.thursday;
  const busyFetching = isSyncingZip || isLiveScraping;

  return (
    <>
      <SiteHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        listCount={basketItems.length}
        activeZipCode={activeZipCode}
      />

      <main className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        {activeTab === "compare" && (
          <div className="grid items-start gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <CompareView
                optimization={optimization}
                offers={offers}
                shoppingDate={shoppingDate}
                priceHistory={priceHistory}
                customBasePrices={customBasePrices}
                weekday={formatWeekday(shoppingDate)}
                onStartRoute={startRoute}
                onLoadPreset={() => loadPreset(DEFAULT_PRESET_ID)}
                onOpenList={() => setActiveTab("list")}
              />
            </div>
            <div className="lg:col-start-1 lg:row-start-1">
              <SettingsPanel
                zipCode={zipCode}
                onZipCodeChange={(value) => changeZipCode(value, true)}
                region={currentRegion}
                isSyncingZip={busyFetching}
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
              />
            </div>
          </div>
        )}

        {activeTab === "list" && (
          <ShoppingListView
            basketItems={basketItems}
            onChangeQuantity={changeItemQuantity}
            onClear={() => setBasketItems([])}
            onLoadPreset={loadPreset}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
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
          />
        )}

        {activeTab === "offers" && (
          <div className="flex flex-col gap-14">
            <ZipOffersPanel
              zipCode={zipCode}
              onZipCodeChange={(value) => changeZipCode(value, false)}
              activeZipCode={activeZipCode}
              region={currentRegion}
              onFetchOffers={(zip) => void fetchZipOffers(zip)}
              onLiveScrape={() => void triggerLiveScrape()}
              isSyncing={isSyncingZip}
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
        listCount={basketItems.length}
      />
    </>
  );
}
