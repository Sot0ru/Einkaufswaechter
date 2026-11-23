import { eq, like } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import type { BaseUnit, StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import type { VerifiedPriceRecord } from "@/lib/rules/price-intelligence";
import {
  type ChainScrapeStatus,
  scrapeChainsForZip,
} from "./chain-scrapers";
import {
  type OpenPricesBaseCalibration,
  fetchOpenPricesForZip,
} from "./open-prices";
import {
  type FetchZipOffersOptions,
  type ZipRegionInfo,
  fetchAndMatchOffersForZip,
  resolveZipRegion,
} from "./zip-offer-fetcher";

export interface SyncZipOffersOptions extends FetchZipOffersOptions {
  /** Aktiviert das Live-Scraping über alle 7 öffentlichen Ketten-Angebotsseiten */
  enableLiveScraping?: boolean;
  /** Aktiviert den Live-Abruf echter Community-Supermarktpreise über Open Prices (Open Food Facts) */
  enableOpenPrices?: boolean;
  timeoutMs?: number;
}

export interface ZipOfferSyncResult {
  zipCode: string;
  region: ZipRegionInfo;
  referenceDate: string;
  source: "live_scraped" | "open_prices" | "remote_feed" | "regional_catalog";
  fetchedRawCount: number;
  matchedCount: number;
  upsertedCount: number;
  liveScrapedOfferCount: number;
  liveChainCount: number;
  openPricesMatchedCount: number;
  openPricesLocalCount: number;
  openPricesOfferCount: number;
  openPricesBaseCalibrations: OpenPricesBaseCalibration[];
  openPricesVerifiedPrices: VerifiedPriceRecord[];
  chainStatuses: ChainScrapeStatus[];
  syncedAt: string;
  offers: OfferRecord[];
}

/**
 * Synchronisiert die Wochenangebote für eine deutsche Postleitzahl idempotent in die Datenbank
 * (`weekly_offers`) und protokolliert den Lauf in `offer_fetch_runs`.
 * - Bei `enableLiveScraping: true` (oder `LIVE_SCRAPING_ENABLED=true`) werden alle 7 Ketten live
 *   abgefragt UND ergänzend echte Open-Prices-Community-Preise (Open Food Facts, ODbL-1.0) geladen.
 * - Bei `enableOpenPrices: true` wird gezielt die offene Open-Prices-API abgefragt (kein Bot-Schutz).
 * - Blockierte oder leere Quellen fallen transparent auf den regionalen PLZ-Katalog zurück.
 */
export const syncOffersForZipCode = async (
  db: Db,
  options: SyncZipOffersOptions,
): Promise<ZipOfferSyncResult> => {
  const region = resolveZipRegion(options.zipCode);
  await ensureCatalogAndDemoOffers(db, options.referenceDate);

  const shouldScrapeLive =
    options.enableLiveScraping ?? process.env.LIVE_SCRAPING_ENABLED === "true";
  const shouldFetchOpenPrices = options.enableOpenPrices ?? shouldScrapeLive;

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
  let openPricesMatchedCount = 0;
  let openPricesLocalCount = 0;
  let openPricesOfferCount = 0;
  let openPricesBaseCalibrations: OpenPricesBaseCalibration[] = [];
  let openPricesVerifiedPrices: VerifiedPriceRecord[] = [];
  let chainStatuses: ChainScrapeStatus[] = [];

  const [scrapedResult, openPricesResult] = await Promise.all([
    shouldScrapeLive
      ? scrapeChainsForZip({
          zipCode: region.zipCode,
          referenceDate: options.referenceDate,
          stores: options.stores,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
        })
      : Promise.resolve(null),
    shouldFetchOpenPrices
      ? fetchOpenPricesForZip({
          zipCode: region.zipCode,
          referenceDate: options.referenceDate,
          stores: options.stores,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
        })
      : Promise.resolve(null),
  ]);

  const priorityOffers: OfferRecord[] = [];
  const coveredStoreCategories = new Set<string>();

  if (scrapedResult) {
    chainStatuses = scrapedResult.chainStatuses;
    liveChainCount = scrapedResult.liveChainCount;
    liveScrapedOfferCount = scrapedResult.totalMatchedCount;
    fetchedRawCount += scrapedResult.totalExtractedRawCount;

    for (const offer of scrapedResult.offers) {
      priorityOffers.push(offer);
      coveredStoreCategories.add(`${offer.storeId}:${offer.categoryId}`);
    }
    if (scrapedResult.offers.length > 0) {
      source = "live_scraped";
    }
  }

  if (openPricesResult && openPricesResult.source === "open_prices_live") {
    fetchedRawCount += openPricesResult.fetchedRawCount;
    openPricesMatchedCount = openPricesResult.matchedCount;
    openPricesLocalCount = openPricesResult.localMatchedCount;
    openPricesBaseCalibrations = openPricesResult.baseCalibrations;
    openPricesVerifiedPrices = openPricesResult.verifiedPrices;

    for (const offer of openPricesResult.offers) {
      const key = `${offer.storeId}:${offer.categoryId}`;
      if (!coveredStoreCategories.has(key)) {
        priorityOffers.push(offer);
        coveredStoreCategories.add(key);
        openPricesOfferCount += 1;
      }
    }

    if (source === "regional_catalog" && openPricesResult.matchedCount > 0) {
      source = "open_prices";
    }

    // Idempotent echte Open-Prices-Beobachtungen für die 90-Tage-Preishistorie speichern
    if (openPricesResult.verifiedPrices.length > 0) {
      const existingOpRows = await db
        .select({ rawLabel: schema.receiptObservations.rawLabel })
        .from(schema.receiptObservations)
        .where(like(schema.receiptObservations.rawLabel, "[OP:%"));
      const existingLabels = new Set(existingOpRows.map((row) => row.rawLabel));

      for (const obs of openPricesResult.verifiedPrices) {
        const opTag = `[OP:${obs.storeId}:${obs.categoryId}:${obs.observedDate}:${obs.priceCents}]`;
        if (existingLabels.has(opTag)) continue;
        existingLabels.add(opTag);
        await db.insert(schema.receiptObservations).values({
          storeId: obs.storeId,
          zipCode: region.zipCode,
          categoryId: obs.categoryId,
          rawLabel: opTag,
          priceCents: obs.priceCents,
          isOffer: openPricesResult.offers.some(
            (o) => o.storeId === obs.storeId && o.categoryId === obs.categoryId,
          ),
          receiptDate: obs.observedDate,
          packageAmount: obs.packageAmount,
          packageUnit: obs.packageUnit,
        });
      }
    }
  }

  if (priorityOffers.length > 0) {
    const fallbackRemaining = finalOffers.filter(
      (o) => !coveredStoreCategories.has(`${o.storeId}:${o.categoryId}`),
    );
    finalOffers = [...priorityOffers, ...fallbackRemaining];
    matchedCount = finalOffers.length;
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
    openPricesMatchedCount,
    openPricesLocalCount,
    openPricesOfferCount,
    openPricesBaseCalibrations,
    openPricesVerifiedPrices,
    chainStatuses,
    syncedAt: new Date().toISOString(),
    offers,
  };
};
