import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { CATEGORIES, STORES } from "@/lib/rules/catalog";

describe("Datenbank-Initialisierung & Seeding (PGlite)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("legt alle Tabellen idempotent an und befüllt Ketten, Kategorien, Basispreise und Angebote", async () => {
    const db = await getDb();
    const offersFirstRun = await ensureCatalogAndDemoOffers(db, "2026-11-19");
    const offersSecondRun = await ensureCatalogAndDemoOffers(db, "2026-11-19");

    const storeRows = await db.select().from(schema.stores);
    const categoryRows = await db.select().from(schema.categories);
    const basePriceRows = await db.select().from(schema.basePrices);

    expect(storeRows).toHaveLength(STORES.length);
    expect(categoryRows).toHaveLength(CATEGORIES.length);
    expect(basePriceRows).toHaveLength(STORES.length * CATEGORIES.length);
    expect(offersFirstRun.length).toBeGreaterThan(15);
    expect(offersSecondRun.length).toBe(offersFirstRun.length);
  });
});
