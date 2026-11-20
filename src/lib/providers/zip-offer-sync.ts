import { eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import type { BaseUnit, StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  type ChainScrapeStatus,
  scrapeChainsForZip,
} from "./chain-scrapers";
import {
  type FetchZipOffersOptions,
  type ZipRegionInfo,
  fetchAndMatchOffersForZip,
  resolveZipRegion,
} from "./zip-offer-fetcher";

export interface SyncZipOffersOptions extends FetchZipOffersOptions {
  /** Aktiviert das Live-Scraping über alle 7 öffentlichen Ketten-Angebotsseiten */
  enableLiveScraping?: boolean;
  timeoutMs?: number;
}

export interface ZipOfferSyncResult {
  zipCode: string;
  region: ZipRegionInfo;
  referenceDate: string;
  source: "live_scraped" | "remote_feed" | "regional_catalog";
  fetchedRawCount: number;
  matchedCount: number;
  upsertedCount: number;
  liveScrapedOfferCount: number;
  liveChainCount: number;
  chainStatuses: ChainScrapeStatus[];
  syncedAt: string;
  offers: OfferRecord[];
}

/**
 * Synchronisiert die Wochenangebote für eine deutsche Postleitzahl idempotent in die Datenbank
 * (`weekly_offers`) und protokolliert den Lauf in `offer_fetch_runs`.
 * Bei `enableLiveScraping: true` (oder `LIVE_SCRAPING_ENABLED=true`) werden alle 7 Ketten
 * live über JSON-LD / Embedded-JSON / HTML-Kacheln abgefragt; blockierte oder leere Ketten
 * fallen transparent auf den regionalen PLZ-Katalog zurück.
 */
export const syncOffersForZipCode = async (
  db: Db,
  options: SyncZipOffersOptions,
): Promise<ZipOfferSyncResult> => {
  const region = resolveZipRegion(options.zipCode);
  await ensureCatalogAndDemoOffers(db, options.referenceDate);

  const shouldScrapeLive =
    options.enableLiveScraping ?? process.env.LIVE_SCRAPING_ENABLED === "true";

  const fetched = await fetchAndMatchOffersForZip({
    ...options,
    zipCode: region.zipCode,
  });

  let finalOffers: OfferRecord[] = [...fetched.offers];
  let source: ZipOfferSyncResult["source"] = fetched.source;
  let fetchedRawCount = fetched.fetchedRawCount;
  let matchedCount = fetched.matchedCount;
  let liveScrapedOfferCount = 0;
  let liveChainCount = 0;
  let chainStatuses: ChainScrapeStatus[] = [];

  if (shouldScrapeLive) {
    const scraped = await scrapeChainsForZip({
      zipCode: region.zipCode,
      referenceDate: options.referenceDate,
      stores: options.stores,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });

    chainStatuses = scraped.chainStatuses;
    liveChainCount = scraped.liveChainCount;
    liveScrapedOfferCount = scraped.totalMatchedCount;
    fetchedRawCount += scraped.totalExtractedRawCount;

    if (scraped.offers.length > 0) {
      // Live gescrapte Angebote für Ketten, die echte Daten geliefert haben, bevorzugen
      // und mit Regional-Angeboten der übrigen Kategorien/Ketten kombinieren
      const liveStoreCategoryKeys = new Set(
        scraped.offers.map((o) => `${o.storeId}:${o.categoryId}`),
      );
      const fallbackRemaining = finalOffers.filter(
        (o) => !liveStoreCategoryKeys.has(`${o.storeId}:${o.categoryId}`),
      );
      finalOffers = [...scraped.offers, ...fallbackRemaining];
      matchedCount = finalOffers.length;
      source = "live_scraped";
    }
  }

  let upsertedCount = 0;
  for (const offer of finalOffers) {
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
    source,
    referenceDate: options.referenceDate,
    fetchedRawCount,
    matchedCount,
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
    source,
    fetchedRawCount,
    matchedCount,
    upsertedCount,
    liveScrapedOfferCount,
    liveChainCount,
    chainStatuses,
    syncedAt: new Date().toISOString(),
    offers,
  };
};
