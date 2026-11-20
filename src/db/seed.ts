import { buildDemoOffersForDate } from "@/lib/providers/demo-offers";
import { CATEGORIES, STORES, type BaseUnit, type StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import { type Db, schema } from "./index";

/**
 * Befüllt die Datenbank idempotent mit den 7 Supermarkt-Ketten, dem Standard-Kategorie-Katalog,
 * den Eigenmarken-Basispreisen und den Demo-Wochenangeboten für die angegebene Referenzwoche.
 */
export const ensureCatalogAndDemoOffers = async (
  db: Db,
  referenceDate: string,
): Promise<OfferRecord[]> => {
  // 1. Supermarkt-Ketten anlegen
  await db
    .insert(schema.stores)
    .values(
      STORES.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        loyaltyAppName: s.loyaltyAppName,
        isDiscounter: s.isDiscounter,
      })),
    )
    .onConflictDoNothing();

  // 2. Standard-Kategorien anlegen
  await db
    .insert(schema.categories)
    .values(
      CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.subtitle,
        department: c.department,
        unit: c.unit,
        standardAmount: c.standardAmount,
      })),
    )
    .onConflictDoNothing();

  // 3. Eigenmarken-Basispreise anlegen
  const basePriceRows: {
    categoryId: string;
    storeId: string;
    priceCents: number;
    productLabel: string;
  }[] = [];

  for (const cat of CATEGORIES) {
    for (const store of STORES) {
      const entry = cat.defaultBasePrices[store.id];
      basePriceRows.push({
        categoryId: cat.id,
        storeId: store.id,
        priceCents: entry.priceCents,
        productLabel: entry.productLabel,
      });
    }
  }

  await db.insert(schema.basePrices).values(basePriceRows).onConflictDoNothing();

  // 4. Demo-Wochenangebote für die aktuelle Woche sicherstellen
  const demoOffers = buildDemoOffersForDate(referenceDate);
  if (demoOffers.length > 0) {
    await db
      .insert(schema.weeklyOffers)
      .values(
        demoOffers.map((o) => ({
          id: `${o.id}-${o.validFrom}`,
          storeId: o.storeId,
          zipCode: "10115",
          categoryId: o.categoryId,
          title: o.title,
          priceCents: o.priceCents,
          loyaltyPriceCents: o.loyaltyPriceCents,
          requiresLoyaltyApp: o.requiresLoyaltyApp,
          packageAmount: o.packageAmount,
          packageUnit: o.packageUnit,
          validFrom: o.validFrom,
          validTo: o.validTo,
        })),
      )
      .onConflictDoNothing();
  }

  const storedOffers = await db.select().from(schema.weeklyOffers);
  return storedOffers.map((row) => ({
    id: row.id,
    storeId: row.storeId as StoreId,
    categoryId: row.categoryId,
    title: row.title,
    priceCents: row.priceCents,
    loyaltyPriceCents: row.loyaltyPriceCents,
    requiresLoyaltyApp: row.requiresLoyaltyApp,
    packageAmount: row.packageAmount,
    packageUnit: row.packageUnit as BaseUnit,
    validFrom: row.validFrom,
    validTo: row.validTo,
  }));
};
