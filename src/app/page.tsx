import { Suspense } from "react";
import { connection } from "next/server";
import { ShoppingOptimizerApp } from "@/components/ShoppingOptimizerApp";
import { getDb } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { getWeekWindowForDate } from "@/lib/providers/demo-offers";
import { getCustomBasePricesMap } from "@/lib/services/base-prices";
import { getFavoriteCategoryIds } from "@/lib/services/favorites";
import { getPriceHistorySummary } from "@/lib/services/price-history";
import { listReceiptAliases } from "@/lib/services/receipts";
import { listRecipes } from "@/lib/services/recipes";
import { listSavedShoppingLists } from "@/lib/services/shopping-lists";

const todayInVienna = (): string => {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

async function OptimizerLoader() {
  await connection();
  const today = todayInVienna();
  const weekWindow = getWeekWindowForDate(today);
  const db = await getDb();
  const initialOffers = await ensureCatalogAndDemoOffers(db, today);
  const [
    initialCustomBasePrices,
    initialSavedLists,
    initialReceiptAliases,
    initialPriceHistory,
    initialRecipes,
    initialFavoriteCategoryIds,
  ] = await Promise.all([
    getCustomBasePricesMap(db),
    listSavedShoppingLists(db),
    listReceiptAliases(db),
    getPriceHistorySummary(db, today),
    listRecipes(db, today),
    getFavoriteCategoryIds(db),
  ]);

  return (
    <ShoppingOptimizerApp
      initialOffers={initialOffers}
      weekWindow={weekWindow}
      initialCustomBasePrices={initialCustomBasePrices}
      initialSavedLists={initialSavedLists}
      initialReceiptAliases={initialReceiptAliases}
      initialPriceHistory={initialPriceHistory}
      initialRecipes={initialRecipes}
      initialFavoriteCategoryIds={initialFavoriteCategoryIds}
    />
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Suspense
        fallback={
          <p className="mx-auto max-w-5xl px-4 py-12 text-center text-[15px] text-muted">
            Lade Preise und Wochenangebote der 7 Supermarkt-Ketten…
          </p>
        }
      >
        <OptimizerLoader />
      </Suspense>
    </div>
  );
}
