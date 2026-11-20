import { z } from "zod";
import { STORES, type StoreId } from "@/lib/rules/catalog";
import { matchOfferToCategory } from "@/lib/rules/matcher";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  DEMO_OFFER_SEEDS,
  getWeekWindowForDate,
  type RawDemoOfferSeed,
} from "./demo-offers";

export type ZipRegionCode = "ost" | "nord" | "west" | "suedwest" | "sued";

export interface ZipRegionInfo {
  zipCode: string;
  regionCode: ZipRegionCode;
  regionLabel: string;
  aldiVariant: "Aldi Nord" | "Aldi Süd";
}

export const POPULAR_GERMAN_ZIPS: readonly {
  zipCode: string;
  city: string;
  regionCode: ZipRegionCode;
}[] = [
  { zipCode: "10115", city: "Berlin", regionCode: "ost" },
  { zipCode: "20095", city: "Hamburg", regionCode: "nord" },
  { zipCode: "50667", city: "Köln", regionCode: "west" },
  { zipCode: "60311", city: "Frankfurt", regionCode: "suedwest" },
  { zipCode: "80331", city: "München", regionCode: "sued" },
] as const;

export const isValidGermanZip = (zipCode: string): boolean => /^\d{5}$/.test(zipCode.trim());

/**
 * Ordnet eine 5-stellige deutsche Postleitzahl deterministisch einer Handelsregion
 * sowie dem Aldi-Äquator (Aldi Nord vs. Aldi Süd) zu.
 */
export const resolveZipRegion = (rawZipCode: string): ZipRegionInfo => {
  const cleaned = rawZipCode.trim();
  const zipCode = isValidGermanZip(cleaned) ? cleaned : "10115";
  const prefix2 = Number.parseInt(zipCode.slice(0, 2), 10);
  const firstDigit = zipCode[0];

  // Aldi-Äquator: 00-39 sowie 48-49 (Münsterland/Osnabrück) und 58-59 (Teile Westfalens) -> Aldi Nord
  const isAldiNord =
    firstDigit === "0" ||
    firstDigit === "1" ||
    firstDigit === "2" ||
    firstDigit === "3" ||
    prefix2 === 48 ||
    prefix2 === 49;

  const aldiVariant: "Aldi Nord" | "Aldi Süd" = isAldiNord ? "Aldi Nord" : "Aldi Süd";

  if (firstDigit === "0" || firstDigit === "1") {
    return {
      zipCode,
      regionCode: "ost",
      regionLabel: "Region Ost (Berlin / Brandenburg / Sachsen)",
      aldiVariant,
    };
  }
  if (firstDigit === "2" || firstDigit === "3") {
    return {
      zipCode,
      regionCode: "nord",
      regionLabel: "Region Nord (Hamburg / Niedersachsen / SH)",
      aldiVariant,
    };
  }
  if (firstDigit === "4" || firstDigit === "5") {
    return {
      zipCode,
      regionCode: "west",
      regionLabel: "Region West (NRW / Rheinland)",
      aldiVariant,
    };
  }
  if (firstDigit === "6" || firstDigit === "7") {
    return {
      zipCode,
      regionCode: "suedwest",
      regionLabel: "Region Südwest (Hessen / Baden-Württemberg)",
      aldiVariant,
    };
  }
  return {
    zipCode,
    regionCode: "sued",
    regionLabel: "Region Süd (Bayern / Franken)",
    aldiVariant,
  };
};

/**
 * Regionale Prospekt-Angebote je Handelsregion (ergänzen bzw. überschreiben das Basis-Sortiment
 * für die jeweilige PLZ-Region und bilden regionale Prospekt-Unterschiede inkl. Aldi Nord/Süd ab).
 */
export const REGIONAL_OFFER_SEEDS: Record<ZipRegionCode, readonly RawDemoOfferSeed[]> = {
  ost: [
    {
      id: "reg-ost-lidl-frischkaese",
      storeId: "lidl",
      title: "Philadelphia Frischkäse Doppelrahmstufe",
      description: "175-g-Becher, mit Lidl Plus",
      priceCents: 111,
      loyaltyPriceCents: 99,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-ost-aldi-paprika",
      storeId: "aldi",
      title: "Aldi Nord Paprika-Mix rot/gelb/grün",
      description: "500-g-Packung",
      priceCents: 119,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-ost-kaufland-pommes",
      storeId: "kaufland",
      title: "McCain 1-2-3 Frites Original Backofen-Pommes",
      description: "750-g-Beutel, mit Kaufland Card",
      priceCents: 179,
      loyaltyPriceCents: 149,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-ost-netto-spueltabs-do",
      storeId: "netto",
      title: "Finish Powerball Spülmaschinentabs All-in-1",
      description: "40 Tabs Packung – Ab Donnerstag",
      priceCents: 299,
      loyaltyPriceCents: 279,
      validityWindow: "do_sa",
    },
    {
      id: "reg-ost-penny-haferdrink",
      storeId: "penny",
      title: "Oatly Haferdrink Barista Edition",
      description: "1-l-Packung",
      priceCents: 149,
      loyaltyPriceCents: 139,
      validityWindow: "mo_sa",
    },
  ],
  nord: [
    {
      id: "reg-nord-aldi-butter",
      storeId: "aldi",
      title: "Aldi Nord Milsani Deutsche Markenbutter Kracher",
      description: "250-g-Packung",
      priceCents: 139,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-nord-aldi-kaffee",
      storeId: "aldi",
      title: "Aldi Nord Moreno Röstkaffee Gold",
      description: "500-g-Packung",
      priceCents: 369,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-nord-edeka-lachs",
      storeId: "edeka",
      title: "Norwegischer Räucherlachs in Scheiben",
      description: "200-g-Packung, mit Edeka App",
      priceCents: 299,
      loyaltyPriceCents: 269,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-nord-rewe-aepfel",
      storeId: "rewe",
      title: "Altes Land Deutsche Tafeläpfel Elstar",
      description: "1-kg-Schale",
      priceCents: 149,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-nord-penny-hack-do",
      storeId: "penny",
      title: "Mühlenhof Rinderhackfleisch / Hackfleisch gemischt",
      description: "500-g-Packung – Ab Donnerstag",
      priceCents: 279,
      loyaltyPriceCents: 259,
      validityWindow: "do_sa",
    },
    {
      id: "reg-nord-lidl-fischstaebchen",
      storeId: "lidl",
      title: "Iglo Fischstäbchen 15er Pack",
      description: "450-g-Packung, mit Lidl Plus",
      priceCents: 222,
      loyaltyPriceCents: 199,
      validityWindow: "mo_sa",
    },
  ],
  west: [
    {
      id: "reg-west-kaufland-butter",
      storeId: "kaufland",
      title: "Kerrygold Original Irische Butter NRW-Knaller",
      description: "250-g-Packung, mit Kaufland Card",
      priceCents: 145,
      loyaltyPriceCents: 135,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-west-kaufland-pasta",
      storeId: "kaufland",
      title: "Barilla Spaghetti Nr. 5 Aktionswoche",
      description: "500-g-Packung",
      priceCents: 77,
      loyaltyPriceCents: 69,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-west-aldi-sued-haehnchen",
      storeId: "aldi",
      title: "Aldi Süd Meine Metzgerei Hähnchenbrustfilet",
      description: "400-g-Packung",
      priceCents: 319,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-west-rewe-frischkaese",
      storeId: "rewe",
      title: "Exquisa Frischkäse Natur / Kräuter",
      description: "200-g-Becher, mit Rewe Bonus",
      priceCents: 99,
      loyaltyPriceCents: 88,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-west-edeka-waschmittel-do",
      storeId: "edeka",
      title: "Persil Vollwaschmittel / Colorwaschmittel",
      description: "20 WL Flasche – Ab Donnerstag",
      priceCents: 329,
      loyaltyPriceCents: null,
      validityWindow: "do_sa",
    },
  ],
  suedwest: [
    {
      id: "reg-sw-edeka-kaffee",
      storeId: "edeka",
      title: "Melitta Auslese Filterkaffee Südwest-Aktion",
      description: "500-g-Packung, mit Edeka App",
      priceCents: 389,
      loyaltyPriceCents: 349,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sw-edeka-butter",
      storeId: "edeka",
      title: "Landliebe Deutsche Markenbutter",
      description: "250-g-Packung",
      priceCents: 149,
      loyaltyPriceCents: 139,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sw-aldi-sued-spaetzle",
      storeId: "aldi",
      title: "Aldi Süd Cucina Frische Eierspätzle",
      description: "500-g-Packung",
      priceCents: 99,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sw-rewe-mozzarella",
      storeId: "rewe",
      title: "Galbani Mozzarella Classic",
      description: "125-g-Beutel",
      priceCents: 79,
      loyaltyPriceCents: 69,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sw-lidl-trauben-do",
      storeId: "lidl",
      title: "Weintrauben kernlos hell",
      description: "500-g-Schale – Ab Donnerstag",
      priceCents: 129,
      loyaltyPriceCents: 111,
      validityWindow: "do_sa",
    },
  ],
  sued: [
    {
      id: "reg-sued-aldi-butter",
      storeId: "aldi",
      title: "Aldi Süd Milsani Alpenmarkenbutter",
      description: "250-g-Packung",
      priceCents: 139,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sued-aldi-gouda",
      storeId: "aldi",
      title: "Aldi Süd Milsani Gouda jung in Scheiben",
      description: "400-g-Packung",
      priceCents: 189,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sued-aldi-hack",
      storeId: "aldi",
      title: "Aldi Süd Meine Metzgerei Rinderhackfleisch",
      description: "500-g-Packung",
      priceCents: 279,
      loyaltyPriceCents: null,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sued-rewe-brezeln",
      storeId: "rewe",
      title: "Bayerische Laugenbrezeln zum Aufbacken",
      description: "4er-Packung",
      priceCents: 119,
      loyaltyPriceCents: 99,
      validityWindow: "mo_sa",
    },
    {
      id: "reg-sued-kaufland-schnitzel-do",
      storeId: "kaufland",
      title: "K-Purland Schweineschnitzel zart",
      description: "500-g-Packung – Ab Donnerstag",
      priceCents: 319,
      loyaltyPriceCents: 299,
      validityWindow: "do_sa",
    },
    {
      id: "reg-sued-netto-kaffee",
      storeId: "netto",
      title: "Dallmayr Prodomo Röstkaffee München-Woche",
      description: "500-g-Packung, mit Netto App",
      priceCents: 399,
      loyaltyPriceCents: 369,
      validityWindow: "mo_sa",
    },
  ],
};

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

export const ExternalRawOfferSchema = z.object({
  id: z.string().min(1).optional(),
  storeId: z.enum(validStoreIds),
  title: z.string().min(2),
  description: z.string().optional().default(""),
  priceCents: z.number().int().positive(),
  loyaltyPriceCents: z.number().int().positive().nullable().optional(),
  validityWindow: z.enum(["mo_sa", "do_sa"]).optional().default("mo_sa"),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ExternalRawOffer = z.infer<typeof ExternalRawOfferSchema>;

export interface ZipOfferFetchResult {
  zipCode: string;
  region: ZipRegionInfo;
  referenceDate: string;
  source: "remote_feed" | "regional_catalog";
  fetchedRawCount: number;
  matchedCount: number;
  offers: OfferRecord[];
}

/**
 * Baut das regionale Roh-Angebots-Array für eine PLZ zusammen (Kombination aus bundesweiten
 * Basis-Wochenangeboten und den regionalen Prospekt-Angeboten der jeweiligen Handelsregion).
 */
export const buildRegionalRawOfferSeedsForZip = (zipCode: string): RawDemoOfferSeed[] => {
  const region = resolveZipRegion(zipCode);
  const regionalSeeds = REGIONAL_OFFER_SEEDS[region.regionCode] ?? [];
  return [...DEMO_OFFER_SEEDS, ...regionalSeeds];
};

/**
 * Erzeugt deterministisch alle gematchten Wochenangebote für eine Postleitzahl und Referenzwoche.
 * Läuft vollständig über denselben regelbasierten Kategorie-Matcher (`matchOfferToCategory`).
 */
export const buildRegionalOffersForZip = (
  zipCode: string,
  referenceDate: string,
): OfferRecord[] => {
  const region = resolveZipRegion(zipCode);
  const window = getWeekWindowForDate(referenceDate);
  const rawSeeds = buildRegionalRawOfferSeedsForZip(region.zipCode);
  const records: OfferRecord[] = [];

  for (const seed of rawSeeds) {
    const match = matchOfferToCategory({
      title: seed.title,
      description: seed.description,
      priceCents: seed.priceCents,
      loyaltyPriceCents: seed.loyaltyPriceCents,
    });

    if (!match) continue;

    records.push({
      id: `${seed.id}-${region.zipCode}`,
      storeId: seed.storeId,
      categoryId: match.categoryId,
      title: seed.title,
      priceCents: seed.priceCents,
      loyaltyPriceCents: seed.loyaltyPriceCents ?? null,
      requiresLoyaltyApp: false,
      packageAmount: match.packageAmount,
      packageUnit: match.packageUnit,
      validFrom: seed.validityWindow === "do_sa" ? window.thursday : window.monday,
      validTo: window.saturday,
    });
  }

  return records;
};

export interface FetchZipOffersOptions {
  zipCode: string;
  referenceDate: string;
  stores?: readonly StoreId[];
  feedUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Ruft aktuelle Wochenangebote für eine deutsche Postleitzahl ab:
 * 1. Falls `feedUrl` oder `process.env.OFFER_FEED_URL` gesetzt ist, wird der strukturierte
 *    JSON-Prospekt-Feed (`?zip=<PLZ>&date=<YYYY-MM-DD>`) abgefragt.
 * 2. Ist kein externer Feed konfiguriert oder nicht erreichbar, greift nahtlos der
 *    deterministische regionale PLZ-Angebotskatalog (Offline-/Demo-Garantie).
 * 3. Alle Roh-Angebote durchlaufen `matchOfferToCategory`.
 */
export const fetchAndMatchOffersForZip = async (
  options: FetchZipOffersOptions,
): Promise<ZipOfferFetchResult> => {
  const region = resolveZipRegion(options.zipCode);
  const window = getWeekWindowForDate(options.referenceDate);
  const allowedStores = options.stores ? new Set(options.stores) : null;
  const configuredFeedUrl = options.feedUrl ?? process.env.OFFER_FEED_URL;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  let rawCandidates: ExternalRawOffer[] | null = null;
  let source: "remote_feed" | "regional_catalog" = "regional_catalog";

  if (configuredFeedUrl && typeof fetchFn === "function") {
    try {
      const url = new URL(configuredFeedUrl);
      url.searchParams.set("zip", region.zipCode);
      url.searchParams.set("date", options.referenceDate);
      const response = await fetchFn(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const json = await response.json();
        const rawList = Array.isArray(json) ? json : json?.offers;
        const parsed = z.array(ExternalRawOfferSchema).safeParse(rawList);
        if (parsed.success && parsed.data.length > 0) {
          rawCandidates = parsed.data;
          source = "remote_feed";
        }
      }
    } catch {
      // Fallback auf deterministischen regionalen PLZ-Katalog
      rawCandidates = null;
    }
  }

  if (!rawCandidates) {
    rawCandidates = buildRegionalRawOfferSeedsForZip(region.zipCode).map((seed) => ({
      id: seed.id,
      storeId: seed.storeId,
      title: seed.title,
      description: seed.description,
      priceCents: seed.priceCents,
      loyaltyPriceCents: seed.loyaltyPriceCents ?? null,
      validityWindow: seed.validityWindow,
    }));
    source = "regional_catalog";
  }

  const filteredCandidates = allowedStores
    ? rawCandidates.filter((c) => allowedStores.has(c.storeId))
    : rawCandidates;

  const matchedOffers: OfferRecord[] = [];
  for (let i = 0; i < filteredCandidates.length; i++) {
    const raw = filteredCandidates[i];
    const match = matchOfferToCategory({
      title: raw.title,
      description: raw.description,
      priceCents: raw.priceCents,
      loyaltyPriceCents: raw.loyaltyPriceCents,
    });

    if (!match) continue;

    const validFrom =
      raw.validFrom ?? (raw.validityWindow === "do_sa" ? window.thursday : window.monday);
    const validTo = raw.validTo ?? window.saturday;
    const baseId = raw.id ?? `feed-${raw.storeId}-${match.categoryId}-${i}`;

    matchedOffers.push({
      id: `${baseId}-${region.zipCode}`,
      storeId: raw.storeId,
      categoryId: match.categoryId,
      title: raw.title,
      priceCents: raw.priceCents,
      loyaltyPriceCents: raw.loyaltyPriceCents ?? null,
      requiresLoyaltyApp: false,
      packageAmount: match.packageAmount,
      packageUnit: match.packageUnit,
      validFrom,
      validTo,
    });
  }

  return {
    zipCode: region.zipCode,
    region,
    referenceDate: options.referenceDate,
    source,
    fetchedRawCount: filteredCandidates.length,
    matchedCount: matchedOffers.length,
    offers: matchedOffers,
  };
};
