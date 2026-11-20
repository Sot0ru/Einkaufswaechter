"use client";

import { useMemo, useState } from "react";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import { parseBrochureText } from "@/lib/providers/text-importer";
import {
  POPULAR_GERMAN_ZIPS,
  buildRegionalOffersForZip,
  isValidGermanZip,
  resolveZipRegion,
} from "@/lib/providers/zip-offer-fetcher";
import {
  CATEGORIES,
  CATEGORY_MAP,
  DEPARTMENTS,
  type DepartmentId,
  SHOPPING_PRESETS,
  STORES,
  STORE_MAP,
  type StoreId,
} from "@/lib/rules/catalog";
import {
  type BasketItemInput,
  type DepartmentGroup,
  formatEuroCents,
  type OfferRecord,
  optimizeShoppingBasket,
} from "@/lib/rules/optimizer";

interface ShoppingOptimizerAppProps {
  initialOffers: OfferRecord[];
  weekWindow: WeekWindow;
}

type ActiveTab = "list" | "compare" | "instore" | "offers";

const SAMPLE_BROCHURE_TEXT = `Kerrygold Original Irische Butter 250-g-Packung 1,49 €
Kerrygold Irischer Butterkäse 150-g-Packung 1,79 €
Dallmayr Prodomo Röstkaffee 500 g 4,49 € (Mit Lidl Plus 3,99 €)
Metzgerfrisch Rinderhackfleisch 500 g ab Donnerstag 2,79 €
Erdnussbutter Creamy 350 g 1,99 €`;

export function ShoppingOptimizerApp({
  initialOffers,
  weekWindow,
}: ShoppingOptimizerAppProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("compare");
  const [zipCode, setZipCode] = useState("10115");
  const [activeZipCode, setActiveZipCode] = useState("10115");
  const [zipSyncFeedback, setZipSyncFeedback] = useState<string | null>(null);
  const [isSyncingZip, setIsSyncingZip] = useState(false);
  // Standardmäßig Samstag ausgewählt, damit auch Donnerstags-Angebote sichtbar sind
  const [shoppingDate, setShoppingDate] = useState<string>(weekWindow.saturday);
  const [secondStoreThresholdCents, setSecondStoreThresholdCents] = useState<number>(500);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>([
    "lidl",
    "aldi",
    "rewe",
    "edeka",
    "kaufland",
    "netto",
    "penny",
  ]);
  const [enabledLoyaltyApps, setEnabledLoyaltyApps] = useState<StoreId[]>([
    "lidl",
    "kaufland",
    "rewe",
  ]);
  const [basketItems, setBasketItems] = useState<BasketItemInput[]>([
    ...SHOPPING_PRESETS[0].items,
  ]);
  const [checkedKeys, setCheckedKeys] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentId | "all">("all");
  const [offers, setOffers] = useState<OfferRecord[]>(initialOffers);

  // Für den Prospekt-Tester
  const [importStoreId, setImportStoreId] = useState<StoreId>("lidl");
  const [brochureInput, setBrochureInput] = useState(SAMPLE_BROCHURE_TEXT);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Im-Laden-Ansicht: "recommended" folgt der Empfehlung (Split oder Einzelmarkt), oder ein spezifischer Markt
  const [inStoreMode, setInStoreMode] = useState<"recommended" | "split" | StoreId>(
    "recommended",
  );

  const optimization = useMemo(
    () =>
      optimizeShoppingBasket({
        items: basketItems,
        enabledStores,
        enabledLoyaltyApps,
        shoppingDate,
        secondStoreThresholdCents,
        offers,
      }),
    [
      basketItems,
      enabledStores,
      enabledLoyaltyApps,
      shoppingDate,
      secondStoreThresholdCents,
      offers,
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

  const setItemQuantity = (categoryId: string, delta: number) => {
    setBasketItems((prev) => {
      const existing = prev.find((i) => i.categoryId === categoryId);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { categoryId, quantity: delta }];
      }
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((i) => i.categoryId !== categoryId);
      }
      return prev.map((i) => (i.categoryId === categoryId ? { ...i, quantity: nextQty } : i));
    });
  };

  const loadPreset = (presetId: string) => {
    const preset = SHOPPING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setBasketItems([...preset.items]);
    setCheckedKeys({});
  };

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApplyBrochureImport = () => {
    const matched = brochurePreview
      .filter((r) => r.matched && r.offer != null)
      .map((r) => r.offer!);
    if (matched.length === 0) {
      setImportFeedback("Keine zuordenbaren Angebote im Text gefunden.");
      return;
    }
    setOffers((prev) => {
      const filtered = prev.filter(
        (existing) =>
          !matched.some(
            (m) => m.storeId === existing.storeId && m.categoryId === existing.categoryId,
          ),
      );
      return [...filtered, ...matched];
    });
    setImportFeedback(
      `${matched.length} Angebot(e) für ${STORE_MAP[importStoreId].shortName} übernommen und live in die Preis-Optimierung eingerechnet!`,
    );
  };

  const handleFetchZipOffers = async (targetZipRaw?: string) => {
    const candidateZip = (targetZipRaw ?? zipCode).trim();
    if (!isValidGermanZip(candidateZip)) {
      setZipSyncFeedback("Bitte eine gültige 5-stellige deutsche Postleitzahl eingeben.");
      return;
    }

    setZipCode(candidateZip);
    setActiveZipCode(candidateZip);
    const region = resolveZipRegion(candidateZip);

    // 1. Sofortige deterministische Aktualisierung für verzögerungsfreie UI
    const regionalOffers = buildRegionalOffersForZip(candidateZip, shoppingDate);
    setOffers(regionalOffers);
    setIsSyncingZip(true);

    // 2. Hintergrund-Synchronisation mit der Datenbank über /api/v1/offers
    try {
      const res = await fetch(
        `/api/v1/offers?zipCode=${encodeURIComponent(candidateZip)}&date=${encodeURIComponent(shoppingDate)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.offers) && data.offers.length > 0) {
          setOffers(data.offers);
        }
      }
      setZipSyncFeedback(
        `${regionalOffers.length} Wochenangebote für PLZ ${candidateZip} (${region.regionLabel} · ${region.aldiVariant}) synchronisiert.`,
      );
    } catch {
      setZipSyncFeedback(
        `${regionalOffers.length} regionale Wochenangebote für PLZ ${candidateZip} (${region.regionLabel} · ${region.aldiVariant}) geladen.`,
      );
    } finally {
      setIsSyncingZip(false);
    }
  };

  const currentRegion = useMemo(() => resolveZipRegion(activeZipCode), [activeZipCode]);
  const totalItemCount = basketItems.reduce((sum, i) => sum + i.quantity, 0);
  const split = optimization.bestTwoStoreSplit;
  const bestSingle = optimization.bestSingleStore;

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.includeKeywords.some((k) => k.includes(q)),
    );
  }, [searchQuery]);

  const isWeekendShopping = shoppingDate >= weekWindow.thursday;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Kopfbereich */}
      <header className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good">
                Wocheneinkaufs-Optimierer
              </span>
              <span className="text-xs text-muted">
                PLZ {activeZipCode} · {currentRegion.aldiVariant}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Einkaufswächter
            </h1>
            <p className="mt-1 text-sm text-muted">
              Allgemeine Einkaufsliste erstellen → günstigsten Einzelmarkt oder Smart-Split auf
              maximal 2 Läden finden.
            </p>
          </div>

          {/* Live-Zusammenfassung rechts oben */}
          {bestSingle && (
            <div className="rounded-xl border border-line bg-paper px-4 py-3 text-right">
              <div className="text-xs font-medium text-muted">
                {optimization.recommendedStrategy === "split" && split
                  ? `Empfehlung: ${split.primaryStoreName} + ${split.secondaryStoreName}`
                  : `Empfehlung: Alles bei ${bestSingle.storeName}`}
              </div>
              <div className="text-2xl font-bold text-good">
                {formatEuroCents(
                  optimization.recommendedStrategy === "split" && split
                    ? split.totalCheckoutCents
                    : bestSingle.totalCheckoutCents,
                )}
              </div>
              <div className="text-xs text-muted">
                Ersparnis:{" "}
                <span className="font-semibold text-good">
                  {formatEuroCents(
                    optimization.recommendedStrategy === "split" && split
                      ? split.totalSavingsCents
                      : bestSingle.totalSavingsCents,
                  )}
                </span>{" "}
                ggü. Normalpreis
              </div>
            </div>
          )}
        </div>

        {/* Einstellungs-Leiste: PLZ, Einkaufstag, Schwelle, Märkte & Treue-Apps */}
        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          {/* 1. PLZ & Geplanter Einkaufstag */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              1. Wann & Wo kaufst du ein?
            </label>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                value={zipCode}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setZipCode(next);
                  if (next.length === 5) {
                    void handleFetchZipOffers(next);
                  }
                }}
                maxLength={5}
                aria-label="Postleitzahl"
                placeholder="PLZ"
                className="w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-sm"
              />
              <div className="flex flex-1 rounded-lg border border-line bg-paper p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setShoppingDate(weekWindow.monday)}
                  className={`flex-1 rounded-md px-2 py-1 font-medium transition ${
                    !isWeekendShopping
                      ? "bg-accent text-accent-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Mo–Mi
                </button>
                <button
                  type="button"
                  onClick={() => setShoppingDate(weekWindow.saturday)}
                  className={`flex-1 rounded-md px-2 py-1 font-medium transition ${
                    isWeekendShopping
                      ? "bg-accent text-accent-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Do–Sa (+Ab Do.)
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              {currentRegion.regionLabel} ·{" "}
              {isWeekendShopping ? "inkl. Do.-Angebote" : "nur Mo.–Mi.-Angebote"}
            </p>
          </div>

          {/* 2. Schwellenwert für 2. Laden */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              2. Ab wann lohnt sich ein 2. Laden?
            </label>
            <div className="mt-2 flex rounded-lg border border-line bg-paper p-0.5 text-xs">
              {[250, 500, 750, 1000].map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setSecondStoreThresholdCents(cents)}
                  className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                    secondStoreThresholdCents === cents
                      ? "bg-accent text-accent-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  ab {formatEuroCents(cents)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Schickt dich nur bei ≥ {formatEuroCents(secondStoreThresholdCents)} Extra-Ersparnis
              zu Markt Nr. 2.
            </p>
          </div>

          {/* 3. Treue-Apps */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              3. Genutzte Kundenkarten / Apps
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STORES.filter((s) => s.loyaltyAppName != null).map((store) => {
                const active = enabledLoyaltyApps.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => toggleLoyaltyApp(store.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-good bg-good-soft text-good"
                        : "border-line bg-paper text-muted hover:text-ink"
                    }`}
                  >
                    {active ? "✓ " : ""}
                    {store.loyaltyAppName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Supermärkte in der Nähe */}
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Märkte in deiner Nähe ({enabledStores.length}/7):
            </span>
            {STORES.map((store) => {
              const active = enabledStores.includes(store.id);
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => toggleStore(store.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line bg-paper text-muted opacity-60 hover:opacity-100"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {store.shortName}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Haupt-Navigation (4 Reiter) */}
      <nav className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Ansichten">
        <button
          type="button"
          onClick={() => setActiveTab("compare")}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${
            activeTab === "compare"
              ? "border-accent bg-card font-semibold shadow-xs"
              : "border-line bg-paper text-muted hover:bg-card hover:text-ink"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted">Schritt 1</div>
          <div className="text-sm">Preis-Optimierung</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${
            activeTab === "list"
              ? "border-accent bg-card font-semibold shadow-xs"
              : "border-line bg-paper text-muted hover:bg-card hover:text-ink"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted">
            Einkaufsliste ({totalItemCount})
          </div>
          <div className="text-sm">Artikel & Vorlagen</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("instore")}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${
            activeTab === "instore"
              ? "border-accent bg-card font-semibold shadow-xs"
              : "border-line bg-paper text-muted hover:bg-card hover:text-ink"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted">Im Supermarkt</div>
          <div className="text-sm">Abhak-Liste (Laufroute)</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("offers")}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${
            activeTab === "offers"
              ? "border-accent bg-card font-semibold shadow-xs"
              : "border-line bg-paper text-muted hover:bg-card hover:text-ink"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted">
            Daten & Matcher ({offers.length})
          </div>
          <div className="text-sm">Prospekt-Importer</div>
        </button>
      </nav>

      {/* TAB 1: PREIS-OPTIMIERUNG (1 LADEN VS. SMART-SPLIT) */}
      {activeTab === "compare" && (
        <div className="space-y-6">
          {!bestSingle ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center">
              <p className="text-base font-medium">Deine Einkaufsliste ist noch leer.</p>
              <button
                type="button"
                onClick={() => loadPreset("wochen_basics")}
                className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
              >
                Typischen Wocheneinkauf (12 Artikel) laden
              </button>
            </div>
          ) : (
            <>
              {/* Gegenüberstellung: Alles in 1 Laden vs. Smart-Split auf 2 Läden */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* KARTE 1: Alles in 1 Laden */}
                <section className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-xs">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-semibold">
                        Option A · Alles in 1 Laden
                      </span>
                      {optimization.recommendedStrategy === "single" && (
                        <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-bold text-good">
                          ★ Empfohlen (kein 2. Weg nötig)
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <h2 className="text-xl font-bold">
                          Kompletter Einkauf bei {bestSingle.storeName}
                        </h2>
                        <p className="text-xs text-muted">
                          {bestSingle.items.length} Positionen · {bestSingle.offerCount} aktuelle
                          Wochenangebote dabei
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {formatEuroCents(bestSingle.totalCheckoutCents)}
                        </div>
                        <div className="text-xs text-good">
                          −{formatEuroCents(bestSingle.totalSavingsCents)} ggü. Normalpreis (
                          {formatEuroCents(bestSingle.totalRegularCents)})
                        </div>
                      </div>
                    </div>

                    {/* Ranking aller aktivierten Einzelmärkte */}
                    <div className="mt-4 space-y-2 border-t border-line pt-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Alle gewählten Märkte im Einzelvergleich
                      </div>
                      {optimization.singleStoreRankings.map((ranking, idx) => {
                        const diffToBest =
                          ranking.totalCheckoutCents - bestSingle.totalCheckoutCents;
                        return (
                          <div
                            key={ranking.storeId}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                              idx === 0
                                ? "border-good bg-good-soft/40 font-semibold"
                                : "border-line bg-paper"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted">#{idx + 1}</span>
                              <span>{ranking.storeName}</span>
                              <span className="rounded-md border border-line bg-card px-1.5 py-0.5 text-xs text-muted">
                                {ranking.offerCount} Angebote
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {diffToBest > 0 && (
                                <span className="text-xs text-muted">
                                  +{formatEuroCents(diffToBest)}
                                </span>
                              )}
                              <span className="font-mono font-semibold">
                                {formatEuroCents(ranking.totalCheckoutCents)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setInStoreMode(bestSingle.storeId);
                      setActiveTab("instore");
                    }}
                    className="mt-5 w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm font-semibold transition hover:border-accent"
                  >
                    Abhak-Liste für {bestSingle.storeName} öffnen →
                  </button>
                </section>

                {/* KARTE 2: Smart-Split (Max. 2 Läden) */}
                <section className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-xs">
                  {split ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-semibold">
                            Option B · Smart-Split (max. 2 Läden)
                          </span>
                          {split.worthSecondStore ? (
                            <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-bold text-good">
                              ★ Lohnt sich! (+{formatEuroCents(split.extraSavingsVsBestSingleCents)}{" "}
                              extra gespart)
                            </span>
                          ) : (
                            <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-ink">
                              Unter {formatEuroCents(secondStoreThresholdCents)}-Schwelle (+
                              {formatEuroCents(split.extraSavingsVsBestSingleCents)})
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-baseline justify-between">
                          <div>
                            <h2 className="text-xl font-bold">
                              1. {split.primaryStoreName} + 2. {split.secondaryStoreName}
                            </h2>
                            <p className="text-xs text-muted">
                              Hauptladen ({split.primaryItems.length} Artikel) + kurzer Abstecher
                              für {split.secondaryItems.length} Aktions-Artikel
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-good">
                              {formatEuroCents(split.totalCheckoutCents)}
                            </div>
                            <div className="text-xs text-good">
                              Gesamtersparnis: −{formatEuroCents(split.totalSavingsCents)}
                            </div>
                          </div>
                        </div>

                        {/* Aufteilung Hauptladen vs. Zweitladen */}
                        <div className="mt-4 space-y-3 border-t border-line pt-4">
                          <div className="rounded-xl border border-line bg-paper p-3">
                            <div className="flex items-center justify-between text-sm font-semibold">
                              <span>
                                🏪 Hauptladen: {split.primaryStoreName} (
                                {split.primaryItems.length} Positionen)
                              </span>
                              <span className="font-mono">
                                {formatEuroCents(split.primaryStoreTotalCents)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              Alle Basis-Artikel + Angebote von {split.primaryStoreName}. Gleich
                              teure Artikel bleiben automatisch hier.
                            </p>
                          </div>

                          <div className="rounded-xl border border-good/50 bg-good-soft/30 p-3">
                            <div className="flex items-center justify-between text-sm font-semibold">
                              <span>
                                🎯 Zweitladen: {split.secondaryStoreName} (nur{" "}
                                {split.secondaryItems.length} Schnäppchen)
                              </span>
                              <span className="font-mono">
                                {formatEuroCents(split.secondaryStoreTotalCents)}
                              </span>
                            </div>
                            <ul className="mt-2 space-y-1.5 text-xs">
                              {split.secondaryItems.map((item) => (
                                <li
                                  key={item.categoryId}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span>
                                    <strong>
                                      {item.requestedQuantity}× {item.categoryName}:
                                    </strong>{" "}
                                    {item.productLabel}
                                    {item.loyaltyAppName && (
                                      <span className="ml-1 rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-good">
                                        {item.loyaltyAppName}
                                      </span>
                                    )}
                                  </span>
                                  <span className="whitespace-nowrap font-mono font-semibold text-good">
                                    {formatEuroCents(item.checkoutCents)}{" "}
                                    <span className="text-muted line-through">
                                      {formatEuroCents(item.regularCheckoutCents)}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setInStoreMode("split");
                          setActiveTab("instore");
                        }}
                        className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-95"
                      >
                        Getrennte Abhak-Listen für {split.primaryStoreName} &{" "}
                        {split.secondaryStoreName} öffnen →
                      </button>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-muted">
                      Wähle oben mindestens 2 Supermärkte aus, um den Smart-Split auf 2 Läden zu
                      berechnen.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: EINKAUFSLISTE & VORLAGEN */}
      {activeTab === "list" && (
        <div className="space-y-6">
          {/* 1-Klick-Vorlagen */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Schnellstart-Vorlagen (1 Klick)
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {SHOPPING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadPreset(preset.id)}
                  className="rounded-xl border border-line bg-paper p-3 text-left transition hover:border-accent"
                >
                  <div className="text-sm font-semibold">{preset.name}</div>
                  <div className="mt-1 text-xs text-muted">{preset.description}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Aktuelle Einkaufsliste + Katalog */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Links: Aktuelle Liste */}
            <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:col-span-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  Deine Einkaufsliste ({basketItems.length} Kategorien)
                </h2>
                {basketItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBasketItems([])}
                    className="text-xs text-muted underline hover:text-ink"
                  >
                    Liste leeren
                  </button>
                )}
              </div>

              {basketItems.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  Noch keine Artikel ausgewählt. Rechts anklicken oder oben eine Vorlage wählen.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {basketItems.map((item) => {
                    const cat = CATEGORY_MAP[item.categoryId];
                    if (!cat) return null;
                    return (
                      <li
                        key={item.categoryId}
                        className="flex items-center justify-between gap-2 py-2.5"
                      >
                        <div>
                          <div className="text-sm font-medium">{cat.name}</div>
                          <div className="text-xs text-muted">{cat.subtitle}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setItemQuantity(item.categoryId, -1)}
                            aria-label={`${cat.name} reduzieren`}
                            className="h-7 w-7 rounded-lg border border-line bg-paper font-mono text-sm font-bold hover:border-accent"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-mono text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setItemQuantity(item.categoryId, 1)}
                            aria-label={`${cat.name} erhöhen`}
                            className="h-7 w-7 rounded-lg border border-line bg-paper font-mono text-sm font-bold hover:border-accent"
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Rechts: Allgemeine Produktkategorien hinzufügen */}
            <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:col-span-7">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-lg font-bold">
                  Standard-Kategorien ({CATEGORIES.length})
                </h2>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Kategorie suchen (z. B. Butter, Milch, Kaffee)…"
                  className="rounded-xl border border-line bg-paper px-3 py-1.5 text-sm sm:w-64"
                />
              </div>

              {/* Abteilungs-Schnellfilter */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDepartment("all")}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    selectedDepartment === "all"
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line bg-paper text-muted hover:text-ink"
                  }`}
                >
                  Alle ({filteredCatalog.length})
                </button>
                {DEPARTMENTS.map((dept) => {
                  const count = filteredCatalog.filter((c) => c.department === dept.id).length;
                  if (count === 0) return null;
                  const active = selectedDepartment === dept.id;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => setSelectedDepartment(dept.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line bg-paper text-muted hover:text-ink"
                      }`}
                    >
                      {dept.icon} {dept.name} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-4">
                {DEPARTMENTS.filter(
                  (dept) => selectedDepartment === "all" || selectedDepartment === dept.id,
                ).map((dept) => {
                  const deptCategories = filteredCatalog.filter((c) => c.department === dept.id);
                  if (deptCategories.length === 0) return null;
                  return (
                    <div key={dept.id}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                        {dept.icon} {dept.name} ({deptCategories.length})
                      </h3>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {deptCategories.map((cat) => {
                          const inBasket = basketItems.find((i) => i.categoryId === cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setItemQuantity(cat.id, 1)}
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                                inBasket
                                  ? "border-good bg-good-soft/30"
                                  : "border-line bg-paper hover:border-accent"
                              }`}
                            >
                              <div>
                                <div className="font-medium">{cat.name}</div>
                                <div className="text-xs text-muted">
                                  {cat.subtitle} · Basis ab{" "}
                                  {formatEuroCents(cat.defaultBasePrices.lidl.priceCents)}
                                </div>
                              </div>
                              <span className="ml-2 rounded-lg bg-card px-2 py-1 font-mono text-xs font-bold">
                                {inBasket ? `${inBasket.quantity}×` : "+"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 3: ABHAK-MODUS IM SUPERMARKT (SORTIERT NACH ABTEILUNGS-LAUFROUTE) */}
      {activeTab === "instore" && (
        <div className="space-y-6">
          {/* Modus-Umschalter */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-xs">
            <div className="text-sm font-semibold">Welchen Einkaufsplan möchtest du abhaken?</div>
            <div className="flex flex-wrap gap-1.5">
              {split && (
                <button
                  type="button"
                  onClick={() => setInStoreMode("split")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    inStoreMode === "split" ||
                    (inStoreMode === "recommended" &&
                      optimization.recommendedStrategy === "split")
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line bg-paper text-muted"
                  }`}
                >
                  Smart-Split ({split.primaryStoreName} + {split.secondaryStoreName})
                </button>
              )}
              {optimization.singleStoreRankings.map((r) => {
                const isSelected =
                  inStoreMode === r.storeId ||
                  (inStoreMode === "recommended" &&
                    optimization.recommendedStrategy === "single" &&
                    bestSingle?.storeId === r.storeId);
                return (
                  <button
                    key={r.storeId}
                    type="button"
                    onClick={() => setInStoreMode(r.storeId)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line bg-paper text-muted"
                    }`}
                  >
                    Nur {r.storeName} ({formatEuroCents(r.totalCheckoutCents)})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Darstellung der Abhak-Listen */}
          {(() => {
            const showSplit =
              split != null &&
              (inStoreMode === "split" ||
                (inStoreMode === "recommended" &&
                  optimization.recommendedStrategy === "split"));

            if (showSplit && split) {
              return (
                <div className="grid gap-6 lg:grid-cols-2">
                  <StoreChecklistCard
                    title={`1. Hauptladen: ${split.primaryStoreName}`}
                    subtitle={`${split.primaryItems.length} Positionen · Sortiert nach Laufroute im Markt`}
                    totalCents={split.primaryStoreTotalCents}
                    departments={split.primaryDepartments}
                    checkedKeys={checkedKeys}
                    onToggleChecked={toggleChecked}
                  />
                  <StoreChecklistCard
                    title={`2. Zweitladen: ${split.secondaryStoreName} (Nur Angebote)`}
                    subtitle={`${split.secondaryItems.length} Aktions-Schnäppchen · Spart extra ${formatEuroCents(split.extraSavingsVsBestSingleCents)}`}
                    totalCents={split.secondaryStoreTotalCents}
                    departments={split.secondaryDepartments}
                    checkedKeys={checkedKeys}
                    onToggleChecked={toggleChecked}
                  />
                </div>
              );
            }

            const targetStoreId =
              inStoreMode !== "recommended" && inStoreMode !== "split"
                ? inStoreMode
                : bestSingle?.storeId;
            const single =
              optimization.singleStoreRankings.find((r) => r.storeId === targetStoreId) ??
              bestSingle;

            if (!single) return null;

            return (
              <StoreChecklistCard
                title={`Kompletter Einkauf bei ${single.storeName}`}
                subtitle={`${single.items.length} Positionen · Sortiert nach Abteilungs-Laufroute`}
                totalCents={single.totalCheckoutCents}
                departments={single.departments}
                checkedKeys={checkedKeys}
                onToggleChecked={toggleChecked}
              />
            );
          })()}
        </div>
      )}

      {/* TAB 4: WOCHENANGEBOTE & PROSPEKT-IMPORTER */}
      {activeTab === "offers" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Oben: Automatischer Hintergrund-Fetcher nach Postleitzahl */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:col-span-12">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good">
                    Automatischer PLZ-Fetcher
                  </span>
                  <span className="font-mono text-xs text-muted">/api/cron/fetch-offers</span>
                </div>
                <h2 className="mt-1 text-lg font-bold">
                  Regionale Wochenangebote nach Postleitzahl ({activeZipCode} ·{" "}
                  {currentRegion.aldiVariant})
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Erkennt automatisch die deutsche Handelsregion ({currentRegion.regionLabel}) inkl.
                  Aldi-Äquator (Aldi Nord vs. Aldi Süd) und ordnet alle Angebote über den
                  regelbasierten Matcher den {CATEGORIES.length} Standard-Kategorien zu.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  maxLength={5}
                  placeholder="5-stellige PLZ"
                  className="w-28 rounded-xl border border-line bg-paper px-3 py-2 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleFetchZipOffers(zipCode)}
                  disabled={isSyncingZip}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-95 disabled:opacity-50"
                >
                  {isSyncingZip ? "Synchronisiere…" : "PLZ-Angebote abrufen"}
                </button>
              </div>
            </div>

            {/* Schnellwahl für die 5 deutschen Handelsregionen */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Handelsregion testen:
              </span>
              {POPULAR_GERMAN_ZIPS.map((item) => {
                const isActive = activeZipCode === item.zipCode;
                const info = resolveZipRegion(item.zipCode);
                return (
                  <button
                    key={item.zipCode}
                    type="button"
                    onClick={() => void handleFetchZipOffers(item.zipCode)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      isActive
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line bg-paper text-muted hover:text-ink"
                    }`}
                  >
                    {item.zipCode} {item.city} ({info.aldiVariant})
                  </button>
                );
              })}
            </div>

            {zipSyncFeedback && (
              <p className="mt-2.5 text-xs font-medium text-good">✓ {zipSyncFeedback}</p>
            )}
          </section>

          {/* Links: Regelbasierter Prospekt-Text-Tester */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:col-span-6">
            <h2 className="text-lg font-bold">Prospekt-Zeilen testen & importieren</h2>
            <p className="mt-1 text-xs text-muted">
              Kopiere Zeilen aus einem Wochenprospekt hinein. Unser deterministischer Regel-Matcher
              erkennt Kategorie, Packungsgröße, Grundpreis, „ab Donnerstag“-Gültigkeit und filtert
              Fallen wie <em>„Butterkäse“</em> oder <em>„Erdnussbutter“</em> automatisch heraus.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">Supermarkt:</label>
              <select
                value={importStoreId}
                onChange={(e) => setImportStoreId(e.target.value as StoreId)}
                className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm font-medium"
              >
                {STORES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={brochureInput}
              onChange={(e) => setBrochureInput(e.target.value)}
              rows={6}
              className="mt-3 w-full rounded-xl border border-line bg-paper p-3 font-mono text-xs"
              placeholder="Beispiel: Kerrygold Irische Butter 250g 1,49 €"
            />

            {/* Live-Vorschau des Regel-Matchers */}
            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                Live-Ergebnis des Regel-Matchers ({brochurePreview.filter((r) => r.matched).length}/
                {brochurePreview.length} erkannt)
              </div>
              {brochurePreview.map((res, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-2.5 text-xs ${
                    res.matched
                      ? "border-good/50 bg-good-soft/30"
                      : "border-line bg-paper text-muted"
                  }`}
                >
                  <div className="font-mono">{res.rawLine}</div>
                  {res.matched && res.offer ? (
                    <div className="mt-1 font-semibold text-good">
                      ✓ Zugeordnet zu „{CATEGORY_MAP[res.offer.categoryId]?.name}“ ·{" "}
                      {formatEuroCents(res.offer.priceCents)}
                      {res.offer.loyaltyPriceCents != null &&
                        ` (mit App: ${formatEuroCents(res.offer.loyaltyPriceCents)})`}{" "}
                      · Gültig {res.offer.validFrom} bis {res.offer.validTo}
                    </div>
                  ) : (
                    <div className="mt-1 text-warn-ink">✕ Ignoriert: {res.reasonIfSkipped}</div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleApplyBrochureImport}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink"
            >
              Erkannte Angebote in den Preisvergleich übernehmen
            </button>
            {importFeedback && (
              <p className="mt-2 text-xs font-medium text-good">{importFeedback}</p>
            )}
          </section>

          {/* Rechts: Aktive Wochenangebote in der Datenbank */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:col-span-6">
            <h2 className="text-lg font-bold">
              Hinterlegte Wochenangebote ({offers.length} Aktionen)
            </h2>
            <p className="mt-1 text-xs text-muted">
              Woche vom {weekWindow.monday} (Mo.) bis {weekWindow.saturday} (Sa.). Angebote „ab{" "}
              {weekWindow.thursday}“ greifen nur, wenn du oben „Do–Sa“ als Einkaufstag wählst.
            </p>

            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {offers.map((offer) => {
                const store = STORE_MAP[offer.storeId];
                const cat = CATEGORY_MAP[offer.categoryId];
                const isThursdayOffer = offer.validFrom >= weekWindow.thursday;
                return (
                  <div
                    key={offer.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{store.shortName}</span>
                        <span className="text-muted">→ {cat?.name ?? offer.categoryId}</span>
                        {isThursdayOffer && (
                          <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn-ink">
                            Ab Donnerstag
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-medium">{offer.title}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-good">
                        {formatEuroCents(offer.priceCents)}
                      </div>
                      {offer.loyaltyPriceCents != null && (
                        <div className="text-[11px] text-good">
                          App: {formatEuroCents(offer.loyaltyPriceCents)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StoreChecklistCard({
  title,
  subtitle,
  totalCents,
  departments,
  checkedKeys,
  onToggleChecked,
}: {
  title: string;
  subtitle: string;
  totalCents: number;
  departments: DepartmentGroup[];
  checkedKeys: Record<string, boolean>;
  onToggleChecked: (key: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-xs">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Summe an der Kasse</div>
          <div className="font-mono text-xl font-bold text-good">
            {formatEuroCents(totalCents)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {departments.map((dept) => (
          <div key={dept.departmentId}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {dept.departmentIcon} {dept.sortOrder}. {dept.departmentName}
            </h3>
            <ul className="mt-2 space-y-2">
              {dept.items.map((item) => {
                const checkKey = `${item.storeId}:${item.categoryId}`;
                const isChecked = Boolean(checkedKeys[checkKey]);
                return (
                  <li
                    key={checkKey}
                    className={`rounded-xl border p-3 transition ${
                      isChecked
                        ? "border-line bg-paper opacity-55"
                        : item.isOffer
                          ? "border-good/60 bg-good-soft/25"
                          : "border-line bg-paper"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleChecked(checkKey)}
                          className="mt-1 h-4 w-4 rounded accent-accent"
                        />
                        <div>
                          <div className={`text-sm font-semibold ${isChecked ? "line-through" : ""}`}>
                            {item.requestedQuantity}× {item.categoryName}{" "}
                            <span className="font-normal text-muted">
                              ({item.categorySubtitle})
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs">
                            {item.isOffer ? (
                              <span className="font-medium text-good">
                                🎯 Im Regal greifen: <strong>{item.productLabel}</strong> (
                                {item.packsToBuy} Packung{item.packsToBuy > 1 ? "en" : ""})
                              </span>
                            ) : (
                              <span className="text-muted">
                                Eigenmarke greifen: {item.productLabel}
                              </span>
                            )}
                            {item.loyaltyAppName && (
                              <span className="ml-1.5 inline-block rounded bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good">
                                {item.loyaltyAppName} scannen!
                              </span>
                            )}
                          </div>
                          {item.bulkPackHint && (
                            <div className="mt-1.5 rounded-lg bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn-ink">
                              💡 {item.bulkPackHint}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-sm font-bold">
                          {formatEuroCents(item.checkoutCents)}
                        </div>
                        {item.savingsCents > 0 && (
                          <div className="text-[11px] text-muted line-through">
                            {formatEuroCents(item.regularCheckoutCents)}
                          </div>
                        )}
                        <div className="text-[10px] text-muted">
                          {formatEuroCents(item.unitPriceCents)}/{item.unitLabel}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
