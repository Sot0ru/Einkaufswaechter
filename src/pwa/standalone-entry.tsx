import { createRoot } from "react-dom/client";
import type { CustomBasketItem } from "@/components/ShoppingListView";
import {
  MOBILE_STORAGE_KEY,
  ShoppingOptimizerApp,
} from "@/components/ShoppingOptimizerApp";
import { getWeekWindowForDate } from "@/lib/providers/demo-offers";
import type { ReceiptAliasEntry } from "@/lib/providers/receipt-importer";
import { buildRegionalOffersForZip } from "@/lib/providers/zip-offer-fetcher";
import { SHOPPING_PRESETS, type StoreId } from "@/lib/rules/catalog";
import type { BasketItemInput } from "@/lib/rules/optimizer";
import { BUILTIN_RECIPES, type RecipeDefinition } from "@/lib/rules/recipes";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import type { SavedShoppingList } from "@/lib/services/shopping-lists";

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

interface PersistedMobileState {
  activeZipCode?: string;
  basketItems?: BasketItemInput[];
  customItems?: CustomBasketItem[];
  checkedKeys?: Record<string, boolean>;
  customBasePrices?: CustomBasePricesMap;
  savedLists?: SavedShoppingList[];
  receiptAliases?: ReceiptAliasEntry[];
  storeDetourMinutes?: Partial<Record<StoreId, number>>;
  minSavingsPerDetourMinuteCents?: number;
  favoriteCategoryIds?: string[];
  customRecipes?: RecipeDefinition[];
}

const loadStoredState = (): PersistedMobileState => {
  try {
    const raw = window.localStorage.getItem(MOBILE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedMobileState;
  } catch {
    return {};
  }
};

const bootstrap = () => {
  const container = document.getElementById("root");
  if (!container) return;

  const today = todayInGermany();
  const weekWindow = getWeekWindowForDate(today);
  const stored = loadStoredState();
  const initialZip = stored.activeZipCode ?? "10115";
  const initialOffers = buildRegionalOffersForZip(initialZip, today);
  const defaultLists: SavedShoppingList[] = [
    {
      id: "default-wochen-basics",
      name: "Mein Standard-Wocheneinkauf",
      zipCode: initialZip,
      shoppingDate: weekWindow.saturday,
      secondStoreThresholdCents: 500,
      createdAt: new Date().toISOString(),
      items: SHOPPING_PRESETS[0].items.map((i) => ({
        categoryId: i.categoryId,
        quantity: i.quantity,
        checked: false,
      })),
    },
  ];

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Offline-Caching optional
      });
    });
  }

  createRoot(container).render(
    <ShoppingOptimizerApp
      initialOffers={initialOffers}
      weekWindow={weekWindow}
      initialZipCode={initialZip}
      initialBasketItems={stored.basketItems}
      initialCustomItems={stored.customItems}
      initialCheckedKeys={stored.checkedKeys}
      initialCustomBasePrices={stored.customBasePrices}
      initialReceiptAliases={stored.receiptAliases}
      initialRecipes={[...BUILTIN_RECIPES, ...(stored.customRecipes ?? [])]}
      initialFavoriteCategoryIds={stored.favoriteCategoryIds}
      initialStoreDetourMinutes={stored.storeDetourMinutes}
      initialMinSavingsPerDetourMinuteCents={stored.minSavingsPerDetourMinuteCents}
      initialSavedLists={
        stored.savedLists && stored.savedLists.length > 0 ? stored.savedLists : defaultLists
      }
    />,
  );
};

bootstrap();
