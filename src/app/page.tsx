import { Suspense } from "react";
import { connection } from "next/server";
import { ShoppingOptimizerApp } from "@/components/ShoppingOptimizerApp";
import { getDb } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { getWeekWindowForDate } from "@/lib/providers/demo-offers";

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

  return <ShoppingOptimizerApp initialOffers={initialOffers} weekWindow={weekWindow} />;
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
