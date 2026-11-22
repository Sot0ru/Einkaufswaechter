import { eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import {
  buildOsmMapsUrl,
  fetchNearbyStoresForZip,
  type FetchNearbyStoresOptions,
  type NearbyStoreLocation,
  type NearbyStoresResult,
  resolveZipCoordinates,
} from "@/lib/providers/store-locator";
import type { StoreId } from "@/lib/rules/catalog";
import { resolveGermanStateForZip } from "@/lib/rules/opening-hours";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage Cache je PLZ

export interface GetNearbyStoresOptions extends FetchNearbyStoresOptions {
  forceRefresh?: boolean;
}

/**
 * Lädt die nächsten echten Filialen je Kette für eine deutsche PLZ.
 * Nutzt einen 7-Tage-Datenbank-Cache (`store_locations`), um OpenStreetMap/Overpass
 * zu schonen und Folgeabrufe sofort auszuliefern.
 */
export const getNearbyStoresForZip = async (
  db: Db,
  rawZipCode: string,
  options: GetNearbyStoresOptions = {},
): Promise<NearbyStoresResult> => {
  const zipCode = rawZipCode.replace(/\D/g, "").slice(0, 5) || "10115";
  const state = resolveGermanStateForZip(zipCode);

  if (!options.forceRefresh) {
    const cachedRows = await db
      .select()
      .from(schema.storeLocations)
      .where(eq(schema.storeLocations.zipCode, zipCode));

    if (cachedRows.length > 0) {
      const freshest = cachedRows.reduce(
        (latest, row) => Math.max(latest, row.fetchedAt.getTime()),
        0,
      );
      if (Date.now() - freshest < CACHE_TTL_MS) {
        const center = await resolveZipCoordinates(zipCode, { offlineOnly: true });
        const stores: NearbyStoreLocation[] = cachedRows
          .map((row) => {
            const lat = Number.parseFloat(row.lat);
            const lon = Number.parseFloat(row.lon);
            return {
              storeId: row.storeId as StoreId,
              storeName: row.storeName,
              branchName: row.branchName,
              address: row.address,
              zipCode: row.zipCode,
              city: row.city,
              lat: Number.isFinite(lat) ? lat : center.lat,
              lon: Number.isFinite(lon) ? lon : center.lon,
              distanceKm: Math.round((row.distanceMeters / 1000) * 100) / 100,
              walkMinutes: row.walkMinutes,
              driveMinutes: row.driveMinutes,
              detourMinutes: row.detourMinutes,
              openingHours: row.openingHours,
              mapsUrl: buildOsmMapsUrl(
                Number.isFinite(lat) ? lat : center.lat,
                Number.isFinite(lon) ? lon : center.lon,
              ),
              source: "db_cache" as const,
              fetchedAt: row.fetchedAt.toISOString(),
            };
          })
          .sort((a, b) => a.distanceKm - b.distanceKm);

        return {
          zipCode,
          stateCode: state.code,
          stateName: state.name,
          centerLat: center.lat,
          centerLon: center.lon,
          osmMatchCount: cachedRows.filter((r) => r.source === "osm_overpass").length,
          source: "db_cache",
          stores,
        };
      }
    }
  }

  const fetched = await fetchNearbyStoresForZip(zipCode, options);

  // Nur echte OSM-Treffer (oder gezielt angeforderte Daten) dauerhaft im Cache sichern
  if (fetched.osmMatchCount > 0) {
    await ensureCatalogAndDemoOffers(db, new Date().toISOString().slice(0, 10));
    const now = new Date();
    for (const store of fetched.stores) {
      await db
        .insert(schema.storeLocations)
        .values({
          zipCode,
          storeId: store.storeId,
          storeName: store.storeName,
          branchName: store.branchName,
          address: store.address,
          city: store.city,
          lat: String(store.lat),
          lon: String(store.lon),
          distanceMeters: Math.round(store.distanceKm * 1000),
          walkMinutes: store.walkMinutes,
          driveMinutes: store.driveMinutes,
          detourMinutes: store.detourMinutes,
          openingHours: store.openingHours,
          source: store.source,
          fetchedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.storeLocations.zipCode, schema.storeLocations.storeId],
          set: {
            storeName: store.storeName,
            branchName: store.branchName,
            address: store.address,
            city: store.city,
            lat: String(store.lat),
            lon: String(store.lon),
            distanceMeters: Math.round(store.distanceKm * 1000),
            walkMinutes: store.walkMinutes,
            driveMinutes: store.driveMinutes,
            detourMinutes: store.detourMinutes,
            openingHours: store.openingHours,
            source: store.source,
            fetchedAt: now,
          },
        });
    }
  }

  return fetched;
};
