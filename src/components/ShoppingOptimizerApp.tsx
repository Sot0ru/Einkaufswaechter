"use client";

import { useMemo, useState } from "react";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import { parseBrochureText } from "@/lib/providers/text-importer";
import { SHOPPING_PRESETS, STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import {
  type BasketItemInput,
  type OfferRecord,
  optimizeShoppingBasket,
} from "@/lib/rules/optimizer";
import { CompareView } from "./CompareView";
import { formatWeekday } from "./format";
import { InStoreView } from "./InStoreView";
import { OffersView } from "./OffersView";
import type { InStoreMode } from "./plan";
import { SettingsPanel } from "./SettingsPanel";
import { ShoppingListView } from "./ShoppingListView";
import { cn, RouteIcon } from "./ui";

interface ShoppingOptimizerAppProps {
  initialOffers: OfferRecord[];
  weekWindow: WeekWindow;
}

type ActiveTab = "compare" | "list" | "instore" | "offers";

const SAMPLE_BROCHURE_TEXT = `Kerrygold Original Irische Butter 250-g-Packung 1,49 €
Kerrygold Irischer Butterkäse 150-g-Packung 1,79 €
Dallmayr Prodomo Röstkaffee 500 g 4,49 € (Mit Lidl Plus 3,99 €)
Metzgerfrisch Rinderhackfleisch 500 g ab Donnerstag 2,79 €
Erdnussbutter Creamy 350 g 1,99 €`;

const DEFAULT_PRESET_ID = SHOPPING_PRESETS[0].id;

export function ShoppingOptimizerApp({ initialOffers, weekWindow }: ShoppingOptimizerAppProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("compare");
  const [zipCode, setZipCode] = useState("10115");
  // Standardmäßig Samstag, damit auch die Donnerstags-Angebote einfließen
  const [shoppingDate, setShoppingDate] = useState<string>(weekWindow.saturday);
  const [secondStoreThresholdCents, setSecondStoreThresholdCents] = useState<number>(500);
  const [enabledStores, setEnabledStores] = useState<StoreId[]>(STORES.map((store) => store.id));
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
  const [offers, setOffers] = useState<OfferRecord[]>(initialOffers);
  const [inStoreMode, setInStoreMode] = useState<InStoreMode>("recommended");

  // Prospekt-Importer
  const [importStoreId, setImportStoreId] = useState<StoreId>("lidl");
  const [brochureInput, setBrochureInput] = useState(SAMPLE_BROCHURE_TEXT);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

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
    [basketItems, enabledStores, enabledLoyaltyApps, shoppingDate, secondStoreThresholdCents, offers],
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

  const isWeekendShopping = shoppingDate >= weekWindow.thursday;

  const tabs: ReadonlyArray<{ id: ActiveTab; label: string }> = [
    { id: "compare", label: "Preisvergleich" },
    { id: "list", label: `Einkaufsliste (${basketItems.length})` },
    { id: "instore", label: "Im Laden" },
    { id: "offers", label: "Prospekte" },
  ];

  return (
    <>
      <header className="bg-sign text-sign-ink">
        <div className="mx-auto flex min-h-[68px] max-w-7xl flex-wrap items-center justify-between gap-x-8 px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5 py-2.5">
            <RouteIcon className="size-7" />
            <span className="text-[21px] font-extrabold tracking-tight">Einkaufswächter</span>
          </div>
          <nav aria-label="Ansichten" className="flex flex-wrap gap-1 pb-3 sm:py-2.5">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded px-3.5 pt-0.5 text-[15px] transition sm:px-4",
                    active ? "bg-sign-ink font-extrabold text-sign" : "font-semibold hover:bg-white/10",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        {activeTab === "compare" && (
          <div className="grid items-start gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <CompareView
                optimization={optimization}
                weekday={formatWeekday(shoppingDate)}
                onStartRoute={startRoute}
                onLoadPreset={() => loadPreset(DEFAULT_PRESET_ID)}
                onOpenList={() => setActiveTab("list")}
              />
            </div>
            <div className="lg:col-start-1 lg:row-start-1">
              <SettingsPanel
                zipCode={zipCode}
                onZipCodeChange={setZipCode}
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
          />
        )}

        {activeTab === "instore" && (
          <InStoreView
            optimization={optimization}
            mode={inStoreMode}
            onModeChange={setInStoreMode}
            checkedKeys={checkedKeys}
            onToggleChecked={toggleChecked}
          />
        )}

        {activeTab === "offers" && (
          <OffersView
            offers={offers}
            weekWindow={weekWindow}
            importStoreId={importStoreId}
            onImportStoreChange={setImportStoreId}
            brochureInput={brochureInput}
            onBrochureInputChange={setBrochureInput}
            preview={brochurePreview}
            feedback={importFeedback}
            onApplyImport={applyBrochureImport}
          />
        )}
      </main>
    </>
  );
}
