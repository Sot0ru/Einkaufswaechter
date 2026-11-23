import { STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import {
  type GermanStateCode,
  resolveGermanStateForZip,
} from "@/lib/rules/opening-hours";
import { resolveZipRegion } from "./zip-offer-fetcher";

export interface NearbyStoreLocation {
  storeId: StoreId;
  storeName: string;
  branchName: string;
  address: string;
  zipCode: string;
  city: string;
  lat: number;
  lon: number;
  distanceKm: number;
  walkMinutes: number;
  driveMinutes: number;
  /** Realistische Umweg-Minuten für den Smart-Split-Optimierer */
  detourMinutes: number;
  openingHours: string;
  mapsUrl: string;
  source: "osm_overpass" | "estimated_fallback";
  fetchedAt: string;
}

export interface NearbyStoresResult {
  zipCode: string;
  stateCode: GermanStateCode;
  stateName: string;
  centerLat: number;
  centerLon: number;
  osmMatchCount: number;
  source: "osm_overpass" | "estimated_fallback";
  /** Zeigt an, ob das Ergebnis aus dem 7-Tage-Datenbank-Cache geliefert wurde */
  fromCache?: boolean;
  stores: NearbyStoreLocation[];
}

/** Exakte Koordinaten beliebter deutscher Großstädte + 2-stelliger PLZ-Zentroide (01..99) */
const EXACT_ZIP_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  "10115": { lat: 52.5326, lon: 13.3847, city: "Berlin" },
  "20095": { lat: 53.5511, lon: 9.9937, city: "Hamburg" },
  "30159": { lat: 52.3759, lon: 9.732, city: "Hannover" },
  "40213": { lat: 51.2277, lon: 6.7735, city: "Düsseldorf" },
  "48143": { lat: 51.9607, lon: 7.6261, city: "Münster" },
  "50667": { lat: 50.9375, lon: 6.9603, city: "Köln" },
  "60311": { lat: 50.1109, lon: 8.6821, city: "Frankfurt am Main" },
  "70173": { lat: 48.7758, lon: 9.1829, city: "Stuttgart" },
  "80331": { lat: 48.1351, lon: 11.582, city: "München" },
  "90402": { lat: 49.4521, lon: 11.0767, city: "Nürnberg" },
  "01067": { lat: 51.0504, lon: 13.7373, city: "Dresden" },
  "04109": { lat: 51.3397, lon: 12.3731, city: "Leipzig" },
};

const PREFIX1_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  "0": { lat: 51.16, lon: 13.05, city: "Sachsen / Mitteldeutschland" },
  "1": { lat: 52.52, lon: 13.4, city: "Berlin / Brandenburg" },
  "2": { lat: 53.55, lon: 9.99, city: "Norddeutschland" },
  "3": { lat: 52.27, lon: 9.73, city: "Niedersachsen / Hessen" },
  "4": { lat: 51.45, lon: 7.01, city: "Ruhrgebiet / Niederrhein" },
  "5": { lat: 50.94, lon: 6.96, city: "Rheinland" },
  "6": { lat: 50.11, lon: 8.68, city: "Rhein-Main" },
  "7": { lat: 48.78, lon: 9.18, city: "Baden-Württemberg" },
  "8": { lat: 48.14, lon: 11.58, city: "Südbayern" },
  "9": { lat: 49.45, lon: 11.08, city: "Franken / Thüringen" },
};

const DEFAULT_CHAIN_OPENING_HOURS: Record<StoreId, string> = {
  lidl: "Mo-Sa 07:00-21:00; PH off",
  aldi: "Mo-Sa 07:00-20:00; PH off",
  rewe: "Mo-Sa 07:00-22:00; PH off",
  edeka: "Mo-Sa 07:00-21:00; PH off",
  kaufland: "Mo-Sa 07:00-22:00; PH off",
  netto: "Mo-Sa 07:00-21:00; PH off",
  penny: "Mo-Sa 07:00-21:00; PH off",
};

export const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(r * c * 100) / 100;
};

export const estimateTravelMetrics = (
  distanceKm: number,
): { walkMinutes: number; driveMinutes: number; detourMinutes: number } => {
  // Realistische Wegstrecken-Verlängerung gegenüber Luftlinie (~1,28x)
  const routeKm = distanceKm * 1.28;
  const walkMinutes = Math.max(2, Math.round((routeKm / 4.8) * 60));
  const driveMinutes = Math.max(2, Math.round((routeKm / 28) * 60 + 2));
  // Umweg inkl. Parken/Rein-Raus für den 2-Läden-Smart-Split
  const detourMinutes = Math.max(3, Math.min(45, driveMinutes + 2));
  return { walkMinutes, driveMinutes, detourMinutes };
};

export const buildOsmMapsUrl = (lat: number, lon: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=17/${lat.toFixed(5)}/${lon.toFixed(5)}`;

/**
 * Ordnet OpenStreetMap-Tags (`brand`, `name`, `operator`) deterministisch einer unserer
 * 7 deutschen Supermarkt- & Discounter-Ketten zu.
 */
export const mapOsmTagsToStoreId = (tags: Record<string, string | undefined>): StoreId | null => {
  const haystack = `${tags.brand ?? ""} ${tags.name ?? ""} ${tags.operator ?? ""}`
    .toLowerCase()
    .trim();
  if (!haystack) return null;

  if (haystack.includes("lidl")) return "lidl";
  if (haystack.includes("aldi")) return "aldi";
  if (haystack.includes("kaufland")) return "kaufland";
  if (haystack.includes("penny")) return "penny";
  if (haystack.includes("rewe") || haystack.includes("nahkauf")) return "rewe";
  if (
    haystack.includes("edeka") ||
    haystack.includes("e-center") ||
    haystack.includes("ecenter") ||
    haystack.includes("marktkauf")
  ) {
    return "edeka";
  }
  if (haystack.includes("netto")) {
    // Netto (schwarzer Hund / Dansk Supermarked) ignorieren, falls explizit so markiert
    if (haystack.includes("salling") || haystack.includes("dansk")) return null;
    return "netto";
  }

  return null;
};

/**
 * Bestimmt die geografischen Koordinaten einer deutschen PLZ – zunächst über Nominatim
 * (sofern online erlaubt), mit schnellem deterministischem PLZ-Fallback.
 */
export const resolveZipCoordinates = async (
  zipCode: string,
  options: { fetchImpl?: typeof fetch; offlineOnly?: boolean; timeoutMs?: number } = {},
): Promise<{ lat: number; lon: number; city: string }> => {
  const cleanZip = zipCode.replace(/\D/g, "").slice(0, 5);
  const exact = EXACT_ZIP_COORDS[cleanZip];
  if (exact && options.offlineOnly) return exact;

  if (!options.offlineOnly) {
    const fetchFn = options.fetchImpl ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 4500;
    try {
      const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(cleanZip)}&country=DE&format=json&limit=1`;
      const response = await fetchFn(url, {
        headers: {
          "User-Agent":
            "Einkaufswaechter/1.0 (+https://github.com/Sot0ru/Einkaufswaechter; Filialfinder DE)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const items = (await response.json()) as Array<{
          lat?: string;
          lon?: string;
          display_name?: string;
        }>;
        const first = items[0];
        const lat = first?.lat ? Number.parseFloat(first.lat) : Number.NaN;
        const lon = first?.lon ? Number.parseFloat(first.lon) : Number.NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const cityPart = first.display_name?.split(",")[1]?.trim() || exact?.city || `PLZ ${cleanZip}`;
          return { lat, lon, city: cityPart };
        }
      }
    } catch {
      // Offline / Timeout -> Fallback
    }
  }

  if (exact) return exact;
  const fallback = PREFIX1_COORDS[cleanZip[0] ?? "1"] ?? PREFIX1_COORDS["1"];
  return { ...fallback, city: `PLZ ${cleanZip}` };
};

/**
 * Deterministischer Offline-/Fallback-Filialkatalog pro PLZ, wenn OpenStreetMap nicht
 * erreichbar ist oder die App im reinen Offline-PWA-Modus läuft.
 */
export const buildFallbackStoreLocationsForZip = (
  zipCode: string,
  center: { lat: number; lon: number; city: string },
  fetchedAt = new Date().toISOString(),
): NearbyStoreLocation[] => {
  const region = resolveZipRegion(zipCode);
  const seedNum = Number.parseInt(zipCode.replace(/\D/g, ""), 10) || 10115;

  const baseOffsetsKm: Record<StoreId, number> = {
    lidl: 0.7,
    aldi: 0.9,
    rewe: 0.6,
    edeka: 1.1,
    kaufland: 2.4,
    netto: 0.85,
    penny: 1.25,
  };

  return STORES.map((store, idx) => {
    const jitter = (((seedNum + idx * 17) % 11) - 5) * 0.08;
    const distanceKm = Math.max(0.3, Math.round((baseOffsetsKm[store.id] + jitter) * 100) / 100);
    const angle = ((idx * 51 + (seedNum % 360)) * Math.PI) / 180;
    const lat = center.lat + (distanceKm / 111) * Math.cos(angle);
    const lon = center.lon + (distanceKm / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
    const travel = estimateTravelMetrics(distanceKm);
    const displayName = store.id === "aldi" ? region.aldiVariant : store.name;

    return {
      storeId: store.id,
      storeName: displayName,
      branchName: `${displayName} (Umgebung PLZ ${zipCode})`,
      address: `${zipCode} ${center.city}`,
      zipCode,
      city: center.city,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      distanceKm,
      ...travel,
      openingHours: DEFAULT_CHAIN_OPENING_HOURS[store.id],
      mapsUrl: buildOsmMapsUrl(lat, lon),
      source: "estimated_fallback",
      fetchedAt,
    };
  });
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

/**
 * Parst eine OpenStreetMap Overpass-JSON-Antwort und wählt je Kette die nächstgelegene
 * reale Filiale rund um den PLZ-Mittelpunkt aus.
 */
export const parseOverpassSupermarkets = (params: {
  elements: readonly OverpassElement[];
  zipCode: string;
  center: { lat: number; lon: number; city: string };
  fetchedAt?: string;
}): NearbyStoreLocation[] => {
  const fetchedAt = params.fetchedAt ?? new Date().toISOString();
  const region = resolveZipRegion(params.zipCode);
  const nearestByStore = new Map<StoreId, NearbyStoreLocation>();

  for (const el of params.elements) {
    const tags = el.tags;
    if (!tags) continue;
    const storeId = mapOsmTagsToStoreId(tags);
    if (!storeId) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    const distanceKm = haversineDistanceKm(params.center.lat, params.center.lon, lat, lon);
    const existing = nearestByStore.get(storeId);
    if (existing && existing.distanceKm <= distanceKm) continue;

    const streetLine = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ").trim();
    const city = tags["addr:city"]?.trim() || params.center.city;
    const branchZip = tags["addr:postcode"]?.trim() || params.zipCode;
    const address = streetLine
      ? `${streetLine}, ${branchZip} ${city}`
      : `${branchZip} ${city}`;

    const displayName = storeId === "aldi" ? region.aldiVariant : STORE_MAP[storeId].name;
    const branchName = tags.name?.trim() || displayName;
    const travel = estimateTravelMetrics(distanceKm);

    nearestByStore.set(storeId, {
      storeId,
      storeName: displayName,
      branchName,
      address,
      zipCode: branchZip,
      city,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      distanceKm,
      ...travel,
      openingHours: tags.opening_hours?.trim() || DEFAULT_CHAIN_OPENING_HOURS[storeId],
      mapsUrl: buildOsmMapsUrl(lat, lon),
      source: "osm_overpass",
      fetchedAt,
    });
  }

  return Array.from(nearestByStore.values()).sort((a, b) => a.distanceKm - b.distanceKm);
};

export interface FetchNearbyStoresOptions {
  fetchImpl?: typeof fetch;
  offlineOnly?: boolean;
  radiusMeters?: number;
  timeoutMs?: number;
}

/**
 * Ruft echte Supermarkt-Filialen (Name, Adresse, Entfernung, OSM-Öffnungszeiten) rund um eine
 * deutsche PLZ über OpenStreetMap (Nominatim + Overpass API) ab – komplett kostenlos & legal.
 * Fehlende oder offline nicht erreichbare Ketten werden sauber über den Fallback ergänzt.
 */
export const fetchNearbyStoresForZip = async (
  rawZipCode: string,
  options: FetchNearbyStoresOptions = {},
): Promise<NearbyStoresResult> => {
  const zipCode = rawZipCode.replace(/\D/g, "").slice(0, 5) || "10115";
  const state = resolveGermanStateForZip(zipCode);
  const center = await resolveZipCoordinates(zipCode, options);
  const fetchedAt = new Date().toISOString();
  const fallbackList = buildFallbackStoreLocationsForZip(zipCode, center, fetchedAt);

  if (options.offlineOnly) {
    return {
      zipCode,
      stateCode: state.code,
      stateName: state.name,
      centerLat: center.lat,
      centerLon: center.lon,
      osmMatchCount: 0,
      source: "estimated_fallback",
      stores: fallbackList,
    };
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const radius = options.radiusMeters ?? 6500;
  const timeoutMs = options.timeoutMs ?? 8000;

  const query = `[out:json][timeout:8];
(
  node["shop"="supermarket"](around:${radius},${center.lat},${center.lon});
  way["shop"="supermarket"](around:${radius},${center.lat},${center.lon});
);
out center tags;`;

  try {
    const response = await fetchFn("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent":
          "Einkaufswaechter/1.0 (+https://github.com/Sot0ru/Einkaufswaechter; Filialfinder DE)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const json = (await response.json()) as { elements?: OverpassElement[] };
      const osmStores = parseOverpassSupermarkets({
        elements: json.elements ?? [],
        zipCode,
        center,
        fetchedAt,
      });

      if (osmStores.length > 0) {
        const byId = new Map(osmStores.map((s) => [s.storeId, s]));
        const merged = fallbackList
          .map((fb) => byId.get(fb.storeId) ?? fb)
          .sort((a, b) => a.distanceKm - b.distanceKm);

        return {
          zipCode,
          stateCode: state.code,
          stateName: state.name,
          centerLat: center.lat,
          centerLon: center.lon,
          osmMatchCount: osmStores.length,
          source: "osm_overpass",
          stores: merged,
        };
      }
    }
  } catch {
    // Offline / Timeout / Overpass-Rate-Limit -> Fallback
  }

  return {
    zipCode,
    stateCode: state.code,
    stateName: state.name,
    centerLat: center.lat,
    centerLon: center.lon,
    osmMatchCount: 0,
    source: "estimated_fallback",
    stores: fallbackList,
  };
};
