import { eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import type { BaseUnit, StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  type FetchZipOffersOptions,
  type ZipRegionInfo,
  fetchAndMatchOffersForZip,
  resolveZipRegion,
} from "./zip-offer-fetcher";

export interface ZipOfferSyncResult {
  zipCode: string;
  region: ZipRegionInfo;
  referenceDate: string;
  source: "remote_feed" | "regional_catalog";
  fetchedRawCount: number;
  matchedCount: number;
  upsertedCount: number;
  syncedAt: string;
  offers: OfferRecord[];
}

/**
 * Synchronisiert die Wochenangebote für eine deutsche Postleitzahl idempotent in die Datenbank
 * (`weekly_offers`) und protokolliert den Lauf in `offer_fetch_runs`.
 */
export const syncOffersForZipCode = async (
  db: Db,
  options: FetchZipOffersOptions,
): Promise<ZipOfferSyncResult> => {
  const region = resolveZipRegion(options.zipCode);
  await ensureCatalogAndDemoOffers(db, options.referenceDate);

  const fetched = await fetchAndMatchOffersForZip({
    ...options,
    zipCode: region.zipCode,
  });

  let upsertedCount = 0;
  for (const offer of fetched.offers) {
    const dbOfferId = `${offer.id}-${offer.validFrom}`;
    await db
      .insert(schema.weeklyOffers)
      .values({
        id: dbOfferId,
        storeId: offer.storeId,
        zipCode: region.zipCode,
        categoryId: offer.categoryId,
        title: offer.title,
        priceCents: offer.priceCents,
        loyaltyPriceCents: offer.loyaltyPriceCents,
        requiresLoyaltyApp: offer.requiresLoyaltyApp,
        packageAmount: offer.packageAmount,
        packageUnit: offer.packageUnit,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
      })
      .onConflictDoUpdate({
        target: schema.weeklyOffers.id,
        set: {
          title: offer.title,
          priceCents: offer.priceCents,
          loyaltyPriceCents: offer.loyaltyPriceCents,
          requiresLoyaltyApp: offer.requiresLoyaltyApp,
          packageAmount: offer.packageAmount,
          packageUnit: offer.packageUnit,
          validFrom: offer.validFrom,
          validTo: offer.validTo,
        },
      });
    upsertedCount += 1;
  }

  await db.insert(schema.offerFetchRuns).values({
    zipCode: region.zipCode,
    regionCode: region.regionCode,
    source: fetched.source,
    referenceDate: options.referenceDate,
    fetchedRawCount: fetched.fetchedRawCount,
    matchedCount: fetched.matchedCount,
    upsertedCount,
  });

  const storedRows = await db
    .select()
    .from(schema.weeklyOffers)
    .where(eq(schema.weeklyOffers.zipCode, region.zipCode));

  const offers: OfferRecord[] = storedRows.map((row) => ({
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

  return {
    zipCode: region.zipCode,
    region,
    referenceDate: options.referenceDate,
    source: fetched.source,
    fetchedRawCount: fetched.fetchedRawCount,
    matchedCount: fetched.matchedCount,
    upsertedCount,
    syncedAt: new Date().toISOString(),
    offers,
  };
};
