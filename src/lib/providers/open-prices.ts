import { CATEGORY_MAP, type BaseUnit, type StoreId } from "@/lib/rules/catalog";
import { matchOfferToCategory } from "@/lib/rules/matcher";
import type { OfferRecord } from "@/lib/rules/optimizer";
import type { VerifiedPriceRecord } from "@/lib/rules/price-intelligence";
import { isStoreBrandLabel } from "@/lib/rules/store-brands";
import { getWeekWindowForDate } from "./demo-offers";
import { mapOsmTagsToStoreId, resolveZipCoordinates } from "./store-locator";

export const OPEN_PRICES_API_BASE = "https://prices.openfoodfacts.org/api/v1/prices";

const USER_AGENT =
  "Einkaufswaechter/1.0 (+https://github.com/Sot0ru/Einkaufswaechter; Offener Preisvergleich DE)";

export interface OpenPricesApiProduct {
  code?: string | null;
  product_name?: string | null;
  brands?: string | null;
  quantity?: string | null;
  product_quantity?: number | string | null;
  product_quantity_unit?: string | null;
  categories_tags?: string[] | null;
}

export interface OpenPricesApiLocation {
  osm_id?: number | null;
  osm_type?: string | null;
  osm_name?: string | null;
  osm_display_name?: string | null;
  osm_brand?: string | null;
  osm_address_postcode?: string | null;
  osm_address_city?: string | null;
  osm_address_country_code?: string | null;
}

export interface OpenPricesApiItem {
  id: number;
  type?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  category_tag?: string | null;
  price?: number | string | null;
  price_is_discounted?: boolean | null;
  price_without_discount?: number | string | null;
  discount_type?: string | null;
  price_per?: string | null;
  currency?: string | null;
  date?: string | null;
  location_osm_id?: number | null;
  location_osm_type?: string | null;
  product?: OpenPricesApiProduct | null;
  location?: OpenPricesApiLocation | null;
}

export interface OpenPricesApiResponse {
  items?: OpenPricesApiItem[];
  page?: number;
  pages?: number;
  size?: number;
  total?: number;
}

/**
 * Übersetzung häufiger Open-Prices-Kategorie-Tags (lose Ware ohne Barcode)
 * ins Deutsche, damit der regelbasierte Kategorie-Matcher sie zuverlässig trifft.
 */
const OPEN_PRICES_CATEGORY_TAG_MAP: Record<string, { title: string; defaultHint: string }> = {
  "en:bananas": { title: "Bananen lose", defaultHint: "1 kg" },
  "en:apples": { title: "Tafeläpfel", defaultHint: "1 kg" },
  "en:pears": { title: "Birnen", defaultHint: "1 kg" },
  "en:oranges": { title: "Orangen", defaultHint: "1 kg" },
  "en:lemons": { title: "Zitronen", defaultHint: "500 g" },
  "en:strawberries": { title: "Erdbeeren", defaultHint: "500 g" },
  "en:grapes": { title: "Weintrauben", defaultHint: "500 g" },
  "en:kiwis": { title: "Kiwi", defaultHint: "1 Stück" },
  "en:avocados": { title: "Avocado", defaultHint: "1 Stück" },
  "en:tomatoes": { title: "Tomaten", defaultHint: "500 g" },
  "en:cherry-tomatoes": { title: "Cherrytomaten", defaultHint: "250 g" },
  "en:potatoes": { title: "Speisekartoffeln", defaultHint: "1 kg" },
  "en:onions": { title: "Speisezwiebeln", defaultHint: "1 kg" },
  "en:carrots": { title: "Möhren Karotten", defaultHint: "1 kg" },
  "en:cucumbers": { title: "Salatgurke", defaultHint: "1 Stück" },
  "en:bell-peppers": { title: "Paprika", defaultHint: "500 g" },
  "en:sweet-peppers": { title: "Paprika", defaultHint: "500 g" },
  "en:broccoli": { title: "Brokkoli", defaultHint: "500 g" },
  "en:zucchini": { title: "Zucchini", defaultHint: "1 kg" },
  "en:courgettes": { title: "Zucchini", defaultHint: "1 kg" },
  "en:cauliflowers": { title: "Blumenkohl", defaultHint: "1 Stück" },
  "en:iceberg-lettuces": { title: "Eisbergsalat", defaultHint: "1 Stück" },
  "en:garlic": { title: "Knoblauch", defaultHint: "1 Stück" },
  "en:ginger": { title: "Ingwer", defaultHint: "1 kg" },
  "en:mushrooms": { title: "Champignons", defaultHint: "400 g" },
  "en:button-mushrooms": { title: "Champignons", defaultHint: "400 g" },
  "en:fresh-eggs": { title: "Eier Bodenhaltung", defaultHint: "10 Stück" },
  "en:butter": { title: "Deutsche Markenbutter", defaultHint: "250 g" },
  "en:whole-milks": { title: "Frische Vollmilch 3,5%", defaultHint: "1 l" },
  "en:semi-skimmed-milks": { title: "Fettarme Milch 1,5%", defaultHint: "1 l" },
};

export interface OpenPricesBaseCalibration {
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  productLabel: string;
  observedDate: string;
  city: string | null;
  zipCode: string | null;
  isLocal: boolean;
  openPriceId: number;
}

export interface OpenPricesMatchedEntry {
  openPriceId: number;
  storeId: StoreId;
  categoryId: string;
  title: string;
  barcode: string | null;
  priceCents: number;
  regularPriceCents: number | null;
  loyaltyPriceCents: number | null;
  isDiscounted: boolean;
  packageAmount: number;
  packageUnit: BaseUnit;
  observedDate: string;
  city: string | null;
  zipCode: string | null;
  isLocal: boolean;
  isStoreBrand: boolean;
}

export interface OpenPricesZipResult {
  zipCode: string;
  source: "open_prices_live" | "offline";
  fetchedRawCount: number;
  localRawCount: number;
  germanyRawCount: number;
  matchedCount: number;
  localMatchedCount: number;
  offers: OfferRecord[];
  baseCalibrations: OpenPricesBaseCalibration[];
  verifiedPrices: VerifiedPriceRecord[];
  fetchedAt: string;
}

export interface OpenPriceBarcodeSighting {
  openPriceId: number;
  priceCents: number;
  regularPriceCents: number | null;
  isDiscounted: boolean;
  isLoyaltyDiscount: boolean;
  storeId: StoreId | null;
  storeLabel: string;
  city: string | null;
  zipCode: string | null;
  countryCode: string | null;
  date: string;
}

export interface OpenPricesBarcodeResult {
  barcode: string;
  source: "open_prices_live" | "offline";
  sightings: OpenPriceBarcodeSighting[];
}

export const parseDecimalEuroToCents = (raw: number | string | null | undefined): number | null => {
  if (raw == null) return null;
  const num = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0 || num > 500) return null;
  return Math.round(num * 100);
};

const subtractDaysIso = (isoDate: string, days: number): string => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const utc = Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
  );
  const shifted = new Date(utc - days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
};

const resolveStoreIdFromLocation = (location: OpenPricesApiLocation | null | undefined): StoreId | null => {
  if (!location) return null;
  return mapOsmTagsToStoreId({
    brand: location.osm_brand ?? undefined,
    name: location.osm_name ?? undefined,
    operator: location.osm_display_name ?? undefined,
  });
};

const buildQuantityHint = (item: OpenPricesApiItem): string => {
  const prod = item.product;
  if (item.price_per === "KILOGRAM") return "1 kg";
  if (prod?.quantity && prod.quantity.trim().length > 0) return prod.quantity.trim();
  if (prod?.product_quantity && prod.product_quantity_unit) {
    return `${prod.product_quantity} ${prod.product_quantity_unit}`;
  }
  const catTag = item.category_tag?.toLowerCase() ?? "";
  const mappedCat = OPEN_PRICES_CATEGORY_TAG_MAP[catTag];
  if (mappedCat) return mappedCat.defaultHint;
  return "";
};

const buildProductTitle = (item: OpenPricesApiItem): string | null => {
  const prod = item.product;
  const brand = prod?.brands?.split(",")[0]?.trim() || "";
  const prodName = (prod?.product_name || item.product_name || "").trim();

  if (prodName) {
    if (brand && !prodName.toLowerCase().includes(brand.toLowerCase())) {
      return `${brand} ${prodName}`.trim();
    }
    return prodName;
  }

  const catTag = item.category_tag?.toLowerCase() ?? "";
  const mappedCat = OPEN_PRICES_CATEGORY_TAG_MAP[catTag];
  if (mappedCat) return mappedCat.title;

  return null;
};

/**
 * Parst und normalisiert einen einzelnen Datensatz der Open-Prices-API (`GET /api/v1/prices`)
 * über den rein regelbasierten Kategorie-Matcher (`matchOfferToCategory`).
 */
export const matchOpenPriceItem = (
  item: OpenPricesApiItem,
  isLocal: boolean,
): OpenPricesMatchedEntry | null => {
  if (!item || typeof item.id !== "number") return null;

  const currency = (item.currency ?? "").toUpperCase();
  if (currency !== "EUR") return null;

  const storeId = resolveStoreIdFromLocation(item.location);
  if (!storeId) return null;

  const observedDate = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.date)
    ? item.date.slice(0, 10)
    : null;
  if (!observedDate) return null;

  const rawPriceCents = parseDecimalEuroToCents(item.price);
  if (rawPriceCents == null) return null;

  const title = buildProductTitle(item);
  if (!title || title.length < 2) return null;

  const quantityHint = buildQuantityHint(item);
  const rawRegularCents = parseDecimalEuroToCents(item.price_without_discount);
  const isDiscounted = Boolean(item.price_is_discounted);
  const isLoyalty = isDiscounted && item.discount_type === "LOYALTY_PROGRAM";

  const priceCents =
    isLoyalty && rawRegularCents != null && rawRegularCents > rawPriceCents
      ? rawRegularCents
      : rawPriceCents;
  const loyaltyPriceCents =
    isLoyalty && rawRegularCents != null && rawRegularCents > rawPriceCents
      ? rawPriceCents
      : null;

  const matched = matchOfferToCategory({
    title,
    description: quantityHint,
    priceCents,
    loyaltyPriceCents,
  });
  if (!matched) return null;

  const city = item.location?.osm_address_city?.trim() || null;
  const zipCode = item.location?.osm_address_postcode?.trim() || null;

  return {
    openPriceId: item.id,
    storeId,
    categoryId: matched.categoryId,
    title,
    barcode: item.product_code?.trim() || item.product?.code?.trim() || null,
    priceCents,
    regularPriceCents: rawRegularCents,
    loyaltyPriceCents,
    isDiscounted,
    packageAmount: matched.packageAmount,
    packageUnit: matched.packageUnit,
    observedDate,
    city,
    zipCode,
    isLocal,
    isStoreBrand: isStoreBrandLabel(title),
  };
};

/**
 * Gruppiert gematchte Open-Prices-Einträge nach `(storeId, categoryId)` (lokale & aktuellere
 * Einträge gewinnen), und erzeugt daraus `OfferRecord`s, vorsichtige Basispreis-Kalibrierungen
 * sowie `VerifiedPriceRecord`s für die Preiskonfidenz-Anzeige.
 */
export const buildOpenPricesSyncArtifacts = (params: {
  entries: readonly OpenPricesMatchedEntry[];
  zipCode: string;
  referenceDate: string;
}): {
  offers: OfferRecord[];
  baseCalibrations: OpenPricesBaseCalibration[];
  verifiedPrices: VerifiedPriceRecord[];
  localMatchedCount: number;
} => {
  const bestByStoreCategory = new Map<string, OpenPricesMatchedEntry>();

  for (const entry of params.entries) {
    const key = `${entry.storeId}:${entry.categoryId}`;
    const existing = bestByStoreCategory.get(key);
    if (!existing) {
      bestByStoreCategory.set(key, entry);
      continue;
    }
    // Lokale Beobachtungen aus der PLZ-Umgebung bevorzugen; bei Gleichstand das neuere Datum
    if (entry.isLocal && !existing.isLocal) {
      bestByStoreCategory.set(key, entry);
      continue;
    }
    if (entry.isLocal === existing.isLocal && entry.observedDate > existing.observedDate) {
      bestByStoreCategory.set(key, entry);
    }
  }

  const week = getWeekWindowForDate(params.referenceDate);
  const offers: OfferRecord[] = [];
  const baseCalibrations: OpenPricesBaseCalibration[] = [];
  const verifiedPrices: VerifiedPriceRecord[] = [];
  let localMatchedCount = 0;

  for (const entry of bestByStoreCategory.values()) {
    const cat = CATEGORY_MAP[entry.categoryId];
    if (!cat) continue;
    if (entry.isLocal) localMatchedCount += 1;

    const effectiveCents = entry.loyaltyPriceCents ?? entry.priceCents;
    const storeDefaultRegular = cat.defaultBasePrices[entry.storeId].priceCents;

    verifiedPrices.push({
      categoryId: entry.categoryId,
      storeId: entry.storeId,
      priceCents: effectiveCents,
      observedDate: entry.observedDate,
      source: "open_prices",
      packageAmount: entry.packageAmount,
      packageUnit: entry.packageUnit,
    });

    const locationSuffix = entry.city ? ` · ${entry.city}` : "";
    const isCheaperThanDefault =
      entry.packageUnit === cat.unit &&
      Math.abs(entry.packageAmount - cat.standardAmount) <= Math.round(cat.standardAmount * 0.25) &&
      effectiveCents < storeDefaultRegular;

    if (entry.isDiscounted || isCheaperThanDefault) {
      offers.push({
        id: `openprices-${entry.storeId}-${entry.categoryId}-${params.zipCode}`,
        storeId: entry.storeId,
        categoryId: entry.categoryId,
        title: `${entry.title} (Open Prices${locationSuffix})`,
        priceCents: entry.priceCents,
        loyaltyPriceCents: entry.loyaltyPriceCents,
        requiresLoyaltyApp: false,
        packageAmount: entry.packageAmount,
        packageUnit: entry.packageUnit,
        validFrom: week.monday,
        validTo: week.saturday,
      });
    }

    // Basispreis-Kalibrierung nur für nicht rabattierte Standardpackungen, damit teure
    // Nischenmarken den Eigenmarken-Richtpreis nicht verzerren.
    const matchesStandardSize =
      entry.packageUnit === cat.unit &&
      Math.abs(entry.packageAmount - cat.standardAmount) <= Math.round(cat.standardAmount * 0.15);

    if (
      !entry.isDiscounted &&
      matchesStandardSize &&
      (entry.isStoreBrand || entry.priceCents <= Math.round(storeDefaultRegular * 1.15))
    ) {
      baseCalibrations.push({
        categoryId: entry.categoryId,
        storeId: entry.storeId,
        priceCents: entry.priceCents,
        productLabel: `${entry.title} (Open Prices${locationSuffix})`,
        observedDate: entry.observedDate,
        city: entry.city,
        zipCode: entry.zipCode,
        isLocal: entry.isLocal,
        openPriceId: entry.openPriceId,
      });
    }
  }

  return {
    offers,
    baseCalibrations,
    verifiedPrices,
    localMatchedCount,
  };
};

export interface FetchOpenPricesOptions {
  zipCode: string;
  referenceDate: string;
  stores?: readonly StoreId[];
  radiusKm?: number;
  maxAgeDays?: number;
  fetchImpl?: typeof fetch;
  offlineOnly?: boolean;
  timeoutMs?: number;
}

const fetchOpenPricesPage = async (
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<OpenPricesApiItem[]> => {
  const response = await fetchFn(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return [];
  const json = (await response.json()) as OpenPricesApiResponse;
  return Array.isArray(json.items) ? json.items : [];
};

/**
 * Ruft echte, crowdsourcte Supermarktpreise aus der offenen Open-Prices-API
 * (`https://prices.openfoodfacts.org/api/v1/prices`, ODbL-1.0, CORS-fähig) ab:
 * 1. Lokal im Umkreis (`radiusKm`, Standard 25 km) rund um die PLZ-Koordinaten
 * 2. Ergänzend bundesweite aktuelle EUR-Beobachtungen aus Deutschland (`DE`)
 * Alle Treffer werden deterministisch auf unsere 7 Ketten und alle Kategorien gematcht.
 */
export const fetchOpenPricesForZip = async (
  options: FetchOpenPricesOptions,
): Promise<OpenPricesZipResult> => {
  const zipCode = options.zipCode.replace(/\D/g, "").slice(0, 5) || "10115";
  const fetchedAt = new Date().toISOString();

  if (options.offlineOnly) {
    return {
      zipCode,
      source: "offline",
      fetchedRawCount: 0,
      localRawCount: 0,
      germanyRawCount: 0,
      matchedCount: 0,
      localMatchedCount: 0,
      offers: [],
      baseCalibrations: [],
      verifiedPrices: [],
      fetchedAt,
    };
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const radiusKm = options.radiusKm ?? 25;
  const maxAgeDays = options.maxAgeDays ?? 90;
  const minDate = subtractDaysIso(options.referenceDate, maxAgeDays);
  const allowedStores = options.stores ? new Set(options.stores) : null;

  const center = await resolveZipCoordinates(zipCode, {
    fetchImpl: fetchFn,
    timeoutMs: Math.min(timeoutMs, 4000),
  });

  const localParams = new URLSearchParams({
    lat: center.lat.toFixed(5),
    lon: center.lon.toFixed(5),
    radius_km: String(radiusKm),
    currency: "EUR",
    duplicate_of__isnull: "true",
    date__gte: minDate,
    order_by: "-date",
    size: "100",
    page: "1",
  });

  const germanyPage1Params = new URLSearchParams({
    location__osm_address_country_code: "DE",
    currency: "EUR",
    duplicate_of__isnull: "true",
    date__gte: minDate,
    order_by: "-date",
    size: "100",
    page: "1",
  });

  const germanyPage2Params = new URLSearchParams({
    location__osm_address_country_code: "DE",
    currency: "EUR",
    duplicate_of__isnull: "true",
    date__gte: minDate,
    order_by: "-date",
    size: "100",
    page: "2",
  });

  const [localRes, dePage1Res, dePage2Res] = await Promise.allSettled([
    fetchOpenPricesPage(`${OPEN_PRICES_API_BASE}?${localParams.toString()}`, fetchFn, timeoutMs),
    fetchOpenPricesPage(`${OPEN_PRICES_API_BASE}?${germanyPage1Params.toString()}`, fetchFn, timeoutMs),
    fetchOpenPricesPage(`${OPEN_PRICES_API_BASE}?${germanyPage2Params.toString()}`, fetchFn, timeoutMs),
  ]);

  const allFailed =
    localRes.status === "rejected" &&
    dePage1Res.status === "rejected" &&
    dePage2Res.status === "rejected";

  if (allFailed) {
    return {
      zipCode,
      source: "offline",
      fetchedRawCount: 0,
      localRawCount: 0,
      germanyRawCount: 0,
      matchedCount: 0,
      localMatchedCount: 0,
      offers: [],
      baseCalibrations: [],
      verifiedPrices: [],
      fetchedAt,
    };
  }

  const localItems = localRes.status === "fulfilled" ? localRes.value : [];
  const deItems = [
    ...(dePage1Res.status === "fulfilled" ? dePage1Res.value : []),
    ...(dePage2Res.status === "fulfilled" ? dePage2Res.value : []),
  ];

  const seenIds = new Set<number>();
  const matchedEntries: OpenPricesMatchedEntry[] = [];

  for (const item of localItems) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const matched = matchOpenPriceItem(item, true);
    if (!matched) continue;
    if (allowedStores && !allowedStores.has(matched.storeId)) continue;
    matchedEntries.push(matched);
  }

  for (const item of deItems) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const matched = matchOpenPriceItem(item, false);
    if (!matched) continue;
    if (allowedStores && !allowedStores.has(matched.storeId)) continue;
    matchedEntries.push(matched);
  }

  const artifacts = buildOpenPricesSyncArtifacts({
    entries: matchedEntries,
    zipCode,
    referenceDate: options.referenceDate,
  });

  return {
    zipCode,
    source: "open_prices_live",
    fetchedRawCount: localItems.length + deItems.length,
    localRawCount: localItems.length,
    germanyRawCount: deItems.length,
    matchedCount: artifacts.verifiedPrices.length,
    localMatchedCount: artifacts.localMatchedCount,
    offers: artifacts.offers,
    baseCalibrations: artifacts.baseCalibrations,
    verifiedPrices: artifacts.verifiedPrices,
    fetchedAt,
  };
};

/**
 * Sucht echte, zuletzt von der Community beobachtete EUR-Preise für einen konkreten
 * EAN-/GTIN-Barcode in Open Prices (bevorzugt deutsche Filialen unserer 7 Ketten).
 */
export const fetchOpenPricesByBarcode = async (
  barcode: string,
  options: { fetchImpl?: typeof fetch; offlineOnly?: boolean; timeoutMs?: number } = {},
): Promise<OpenPricesBarcodeResult> => {
  const cleanCode = barcode.replace(/\D/g, "").trim();
  if (!cleanCode || options.offlineOnly) {
    return { barcode: cleanCode, source: "offline", sightings: [] };
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  try {
    const params = new URLSearchParams({
      product_code: cleanCode,
      currency: "EUR",
      duplicate_of__isnull: "true",
      order_by: "-date",
      size: "25",
    });

    const items = await fetchOpenPricesPage(
      `${OPEN_PRICES_API_BASE}?${params.toString()}`,
      fetchFn,
      timeoutMs,
    );

    const sightings: OpenPriceBarcodeSighting[] = [];
    for (const item of items) {
      if ((item.currency ?? "").toUpperCase() !== "EUR") continue;
      const priceCents = parseDecimalEuroToCents(item.price);
      if (priceCents == null) continue;
      const date =
        typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.date)
          ? item.date.slice(0, 10)
          : "";
      if (!date) continue;

      const storeId = resolveStoreIdFromLocation(item.location);
      const storeLabel =
        item.location?.osm_brand?.trim() ||
        item.location?.osm_name?.trim() ||
        "Supermarkt (Open Prices)";
      const regularPriceCents = parseDecimalEuroToCents(item.price_without_discount);

      sightings.push({
        openPriceId: item.id,
        priceCents,
        regularPriceCents,
        isDiscounted: Boolean(item.price_is_discounted),
        isLoyaltyDiscount: Boolean(
          item.price_is_discounted && item.discount_type === "LOYALTY_PROGRAM",
        ),
        storeId,
        storeLabel,
        city: item.location?.osm_address_city?.trim() || null,
        zipCode: item.location?.osm_address_postcode?.trim() || null,
        countryCode: item.location?.osm_address_country_code?.toUpperCase() || null,
        date,
      });
    }

    // Deutsche Märkte unserer 7 Ketten zuerst, dann übrige deutsche Einträge, dann restliches EU-EUR-Gebiet
    sightings.sort((a, b) => {
      const rank = (s: OpenPriceBarcodeSighting) => {
        if (s.countryCode === "DE" && s.storeId) return 0;
        if (s.countryCode === "DE") return 1;
        if (s.storeId) return 2;
        return 3;
      };
      const rDiff = rank(a) - rank(b);
      if (rDiff !== 0) return rDiff;
      return b.date.localeCompare(a.date);
    });

    return {
      barcode: cleanCode,
      source: "open_prices_live",
      sightings: sightings.slice(0, 8),
    };
  } catch {
    return { barcode: cleanCode, source: "offline", sightings: [] };
  }
};
