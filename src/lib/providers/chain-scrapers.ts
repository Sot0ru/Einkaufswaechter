import { STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import { detectLoyaltyRequirement, matchOfferToCategory } from "@/lib/rules/matcher";
import type { OfferRecord } from "@/lib/rules/optimizer";
import { getWeekWindowForDate } from "./demo-offers";
import { resolveZipRegion } from "./zip-offer-fetcher";

export interface ScrapedRawOffer {
  storeId: StoreId;
  title: string;
  description: string;
  priceCents: number;
  loyaltyPriceCents: number | null;
  validityWindow: "mo_sa" | "do_sa";
  validFrom?: string;
  validTo?: string;
  extractor: "json_ld" | "embedded_json" | "html_cards";
}

export interface ChainScrapeTarget {
  storeId: StoreId;
  storeName: string;
  url: string;
}

export interface ChainScrapeStatus {
  storeId: StoreId;
  storeName: string;
  sourceUrl: string;
  status: "live_scraped" | "blocked" | "empty" | "error";
  extractedRawCount: number;
  matchedCount: number;
  extractorUsed: "json_ld" | "embedded_json" | "html_cards" | "none";
  message: string;
}

export interface MultiChainScrapeResult {
  zipCode: string;
  referenceDate: string;
  liveChainCount: number;
  totalExtractedRawCount: number;
  totalMatchedCount: number;
  offers: OfferRecord[];
  chainStatuses: ChainScrapeStatus[];
}

const ANTI_BOT_MARKERS = [
  "cf-browser-verification",
  "challenge-platform",
  "cf-turnstile",
  "verify you are human",
  "captcha",
  "access denied",
  "datadome",
  "perimeterx",
  "incapsula",
] as const;

export const isAntiBotChallengePage = (html: string, httpStatus: number): boolean => {
  if (httpStatus === 403 || httpStatus === 429 || httpStatus === 503) {
    return true;
  }
  const lower = html.slice(0, 12000).toLowerCase();
  return ANTI_BOT_MARKERS.some((marker) => lower.includes(marker));
};

/**
 * Liefert die öffentlichen Angebots-URLs der 7 deutschen Supermarkt- & Discounter-Ketten
 * unter Berücksichtigung des Aldi-Äquators (Aldi Nord vs. Aldi Süd) für die gewählte PLZ.
 */
export const getChainScrapeTargets = (
  zipCode: string,
  stores?: readonly StoreId[],
): ChainScrapeTarget[] => {
  const region = resolveZipRegion(zipCode);
  const aldiUrl =
    region.aldiVariant === "Aldi Nord"
      ? (process.env.SCRAPER_ALDI_NORD_URL ?? "https://www.aldi-nord.de/angebote.html")
      : (process.env.SCRAPER_ALDI_SUED_URL ?? "https://www.aldi-sued.de/de/angebote.html");

  const allTargets: ChainScrapeTarget[] = [
    {
      storeId: "lidl",
      storeName: "Lidl",
      url: process.env.SCRAPER_LIDL_URL ?? "https://www.lidl.de/c/billiger-montag/a10006065",
    },
    {
      storeId: "aldi",
      storeName: region.aldiVariant,
      url: aldiUrl,
    },
    {
      storeId: "rewe",
      storeName: "Rewe",
      url: process.env.SCRAPER_REWE_URL ?? "https://www.rewe.de/angebote/",
    },
    {
      storeId: "edeka",
      storeName: "Edeka",
      url: process.env.SCRAPER_EDEKA_URL ?? "https://www.edeka.de/eh/angebote.jsp",
    },
    {
      storeId: "kaufland",
      storeName: "Kaufland",
      url:
        process.env.SCRAPER_KAUFLAND_URL ??
        "https://filiale.kaufland.de/angebote/aktuelle-woche.html",
    },
    {
      storeId: "netto",
      storeName: "Netto Marken-Discount",
      url: process.env.SCRAPER_NETTO_URL ?? "https://www.netto-online.de/filial-angebote",
    },
    {
      storeId: "penny",
      storeName: "Penny",
      url: process.env.SCRAPER_PENNY_URL ?? "https://www.penny.de/angebote",
    },
  ];

  if (!stores || stores.length === 0) return allTargets;
  const allowed = new Set(stores);
  return allTargets.filter((t) => allowed.has(t.storeId));
};

const parsePriceValueToCents = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Falls bereits in Cent (z. B. 149) vs. Euro (1.49):
    // In JSON-LD / Retail-APIs sind Preise fast immer Euro-Floats (< 250) oder Strings;
    // ganzzahlige Werte >= 35 behandeln wir nur als Cent, wenn explizit aus *Cents-Feld gelesen.
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[€\s]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 500) {
      return Math.round(parsed * 100);
    }
  }
  return null;
};

const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\s+/g, " ")
    .trim();

const stripHtmlTags = (html: string): string =>
  decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));

const detectValidityWindow = (text: string): "mo_sa" | "do_sa" =>
  /\bab\s+do\.?\b|\bab\s+donnerstag\b|\bwochenend-?knaller\b|\bsuper-?wochenende\b/i.test(text)
    ? "do_sa"
    : "mo_sa";

const normalizeIsoDate = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
};

/**
 * Extrahiert Angebotsdaten aus allen `<script type="application/ld+json">` Blöcken
 * (`schema.org/Product`, `Offer`, `ItemList`, `@graph`).
 */
export const extractOffersFromJsonLd = (
  html: string,
  storeId: StoreId,
): ScrapedRawOffer[] => {
  const results: ScrapedRawOffer[] = [];
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const visitNode = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visitNode(item);
      return;
    }

    const obj = node as Record<string, unknown>;
    const rawType = obj["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isProduct = types.some(
      (t) => typeof t === "string" && t.toLowerCase().includes("product"),
    );

    if (isProduct && typeof obj.name === "string") {
      const title = decodeHtmlEntities(obj.name);
      const description =
        typeof obj.description === "string" ? decodeHtmlEntities(obj.description) : "";

      const offerField = obj.offers;
      const offerCandidates = Array.isArray(offerField)
        ? offerField
        : offerField && typeof offerField === "object"
          ? [offerField]
          : [];

      let priceCents: number | null = null;
      let loyaltyPriceCents: number | null = null;
      let validFrom: string | undefined;
      let validTo: string | undefined;

      for (const candidate of offerCandidates) {
        if (!candidate || typeof candidate !== "object") continue;
        const c = candidate as Record<string, unknown>;
        const p = parsePriceValueToCents(c.price ?? c.lowPrice);
        if (!p) continue;

        const offerDesc = `${typeof c.name === "string" ? c.name : ""} ${typeof c.description === "string" ? c.description : ""}`;
        if (detectLoyaltyRequirement(offerDesc)) {
          loyaltyPriceCents = loyaltyPriceCents != null ? Math.min(loyaltyPriceCents, p) : p;
        } else {
          priceCents = priceCents != null ? Math.min(priceCents, p) : p;
        }

        validFrom ??= normalizeIsoDate(c.validFrom ?? c.priceValidFrom);
        validTo ??= normalizeIsoDate(c.validThrough ?? c.priceValidUntil);
      }

      if (priceCents == null && loyaltyPriceCents != null) {
        priceCents = loyaltyPriceCents;
      }

      if (title.length >= 3 && priceCents != null && priceCents > 0) {
        results.push({
          storeId,
          title,
          description,
          priceCents,
          loyaltyPriceCents:
            loyaltyPriceCents != null && loyaltyPriceCents < priceCents
              ? loyaltyPriceCents
              : null,
          validityWindow: detectValidityWindow(`${title} ${description}`),
          validFrom,
          validTo,
          extractor: "json_ld",
        });
      }
    }

    if (Array.isArray(obj["@graph"])) visitNode(obj["@graph"]);
    if (Array.isArray(obj.itemListElement)) visitNode(obj.itemListElement);
    if (obj.item && typeof obj.item === "object") visitNode(obj.item);
  };

  for (const match of html.matchAll(scriptRegex)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      visitNode(parsed);
    } catch {
      // Ungültigen JSON-LD Block überspringen
    }
  }

  return results;
};

/**
 * Extrahiert Angebotsdaten aus eingebetteten JSON-Payloads (`__NEXT_DATA__`,
 * `__INITIAL_STATE__` oder reinen JSON-Antworten moderner Supermarkt-Websites).
 */
export const extractOffersFromEmbeddedJson = (
  htmlOrJson: string,
  storeId: StoreId,
): ScrapedRawOffer[] => {
  const results: ScrapedRawOffer[] = [];
  const jsonPayloads: unknown[] = [];

  const trimmed = htmlOrJson.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      jsonPayloads.push(JSON.parse(trimmed));
    } catch {
      // kein reines JSON
    }
  }

  const nextDataMatch = htmlOrJson.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch?.[1]) {
    try {
      jsonPayloads.push(JSON.parse(nextDataMatch[1]));
    } catch {
      // ignorieren
    }
  }

  const seenNodes = new Set<unknown>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 10 || !node || typeof node !== "object" || seenNodes.has(node)) return;
    seenNodes.add(node);

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }

    const obj = node as Record<string, unknown>;
    const rawTitle = obj.title ?? obj.productName ?? obj.headline ?? obj.name;
    const rawDesc =
      obj.subtitle ?? obj.description ?? obj.packaging ?? obj.basicPrice ?? obj.unitPrice ?? "";

    let priceCents: number | null = null;
    if (typeof obj.priceCents === "number" && obj.priceCents > 0) {
      priceCents = Math.round(obj.priceCents);
    } else {
      const priceObj =
        obj.price && typeof obj.price === "object"
          ? (obj.price as Record<string, unknown>)
          : null;
      priceCents = parsePriceValueToCents(
        priceObj?.price ??
          priceObj?.currentPrice ??
          priceObj?.value ??
          obj.currentPrice ??
          obj.salesPrice ??
          obj.offerPrice ??
          obj.price,
      );
    }

    let loyaltyPriceCents: number | null = null;
    if (typeof obj.loyaltyPriceCents === "number" && obj.loyaltyPriceCents > 0) {
      loyaltyPriceCents = Math.round(obj.loyaltyPriceCents);
    } else {
      loyaltyPriceCents = parsePriceValueToCents(
        obj.loyaltyPrice ?? obj.appPrice ?? obj.lidlPlusPrice ?? obj.cardPrice,
      );
    }

    if (typeof rawTitle === "string" && rawTitle.trim().length >= 3 && priceCents != null) {
      const title = decodeHtmlEntities(rawTitle);
      const description = typeof rawDesc === "string" ? decodeHtmlEntities(rawDesc) : "";
      results.push({
        storeId,
        title,
        description,
        priceCents,
        loyaltyPriceCents:
          loyaltyPriceCents != null && loyaltyPriceCents < priceCents
            ? loyaltyPriceCents
            : null,
        validityWindow: detectValidityWindow(`${title} ${description}`),
        validFrom: normalizeIsoDate(obj.validFrom ?? obj.startDate),
        validTo: normalizeIsoDate(obj.validTo ?? obj.endDate),
        extractor: "embedded_json",
      });
    }

    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") {
        walk(val, depth + 1);
      }
    }
  };

  for (const payload of jsonPayloads) {
    walk(payload, 0);
  }

  return results;
};

/**
 * Fallback-Extraktor für klassische HTML-Angebotskacheln (`<article>`, `data-price`,
 * `itemprop="name"` / `itemprop="price"`).
 */
export const extractOffersFromHtmlCards = (
  html: string,
  storeId: StoreId,
): ScrapedRawOffer[] => {
  const results: ScrapedRawOffer[] = [];
  const cardRegex = /<(?:article|li|div)[^>]*(?:offer|product|tile|card)[^>]*>([\s\S]{30,2200}?)<\/(?:article|li|div)>/gi;

  for (const match of html.matchAll(cardRegex)) {
    const block = match[0];
    const titleAttr = block.match(/data-(?:product-)?(?:title|name)=["']([^"']{3,160})["']/i);
    const headingMatch = block.match(/<h[2-4][^>]*>([\s\S]{3,160}?)<\/h[2-4]>/i);
    const title = titleAttr
      ? decodeHtmlEntities(titleAttr[1])
      : headingMatch
        ? stripHtmlTags(headingMatch[1])
        : null;

    if (!title || title.length < 3) continue;

    const plainText = stripHtmlTags(block);
    const cleanedForPrice = plainText.replace(
      /\(?\b(?:1|100|1000)\s*(?:kg|g|l|liter|ml)\s*=\s*\d+[,.]\d+\s*€?\)?/gi,
      " ",
    );

    const dataPriceMatch = block.match(/data-(?:current-)?price=["'](\d+[.,]\d{2})["']/i);
    const priceMatches = [...cleanedForPrice.matchAll(/(\d+[,.]\d{2})\s*€/g)].map((m) =>
      parsePriceValueToCents(m[1]),
    );
    const validPrices = priceMatches.filter((p): p is number => p != null && p >= 19 && p <= 9999);

    let priceCents = dataPriceMatch ? parsePriceValueToCents(dataPriceMatch[1]) : null;
    if (priceCents == null && validPrices.length > 0) {
      priceCents = Math.max(...validPrices);
    }
    if (priceCents == null) continue;

    const hasLoyalty = detectLoyaltyRequirement(plainText);
    const minPrice = validPrices.length >= 2 ? Math.min(...validPrices) : null;
    const loyaltyPriceCents =
      hasLoyalty && minPrice != null && minPrice < priceCents ? minPrice : null;

    results.push({
      storeId,
      title,
      description: plainText.slice(0, 260),
      priceCents,
      loyaltyPriceCents,
      validityWindow: detectValidityWindow(plainText),
      extractor: "html_cards",
    });
  }

  return results;
};

/**
 * Wendet alle 3 deterministischen Extraktoren (JSON-LD → Embedded JSON → HTML-Kacheln)
 * auf eine Angebotsseite an und dedupliziert die extrahierten Roh-Angebote.
 */
export const extractRawOffersFromDocument = (
  documentContent: string,
  storeId: StoreId,
): {
  rawOffers: ScrapedRawOffer[];
  extractorUsed: "json_ld" | "embedded_json" | "html_cards" | "none";
} => {
  const fromJsonLd = extractOffersFromJsonLd(documentContent, storeId);
  const fromEmbedded = extractOffersFromEmbeddedJson(documentContent, storeId);
  const fromHtml =
    fromJsonLd.length === 0 && fromEmbedded.length === 0
      ? extractOffersFromHtmlCards(documentContent, storeId)
      : [];

  const combined = [...fromJsonLd, ...fromEmbedded, ...fromHtml];
  const deduped: ScrapedRawOffer[] = [];
  const seenKeys = new Set<string>();

  for (const item of combined) {
    const key = `${item.storeId}|${item.title.toLowerCase()}|${item.priceCents}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(item);
  }

  const extractorUsed =
    fromJsonLd.length > 0
      ? "json_ld"
      : fromEmbedded.length > 0
        ? "embedded_json"
        : fromHtml.length > 0
          ? "html_cards"
          : "none";

  return { rawOffers: deduped, extractorUsed };
};

export const matchScrapedRawOffers = (
  rawOffers: readonly ScrapedRawOffer[],
  zipCode: string,
  referenceDate: string,
): OfferRecord[] => {
  const week = getWeekWindowForDate(referenceDate);
  const matchedOffers: OfferRecord[] = [];
  const seenStoreCat = new Map<string, OfferRecord>();

  for (let i = 0; i < rawOffers.length; i++) {
    const raw = rawOffers[i];
    const match = matchOfferToCategory({
      title: raw.title,
      description: raw.description,
      priceCents: raw.priceCents,
      loyaltyPriceCents: raw.loyaltyPriceCents,
    });

    if (!match) continue;

    const validFrom =
      raw.validFrom ?? (raw.validityWindow === "do_sa" ? week.thursday : week.monday);
    const validTo = raw.validTo ?? week.saturday;

    const record: OfferRecord = {
      id: `live-${raw.storeId}-${match.categoryId}-${zipCode}-${i}`,
      storeId: raw.storeId,
      categoryId: match.categoryId,
      title: raw.title,
      priceCents: raw.priceCents,
      loyaltyPriceCents: raw.loyaltyPriceCents,
      requiresLoyaltyApp: false,
      packageAmount: match.packageAmount,
      packageUnit: match.packageUnit,
      validFrom,
      validTo,
    };

    const dedupeKey = `${record.storeId}:${record.categoryId}:${record.packageAmount}`;
    const existing = seenStoreCat.get(dedupeKey);
    if (!existing || record.priceCents < existing.priceCents) {
      seenStoreCat.set(dedupeKey, record);
    }
  }

  for (const offer of seenStoreCat.values()) {
    matchedOffers.push(offer);
  }
  return matchedOffers;
};

export interface ScrapeChainsOptions {
  zipCode: string;
  referenceDate: string;
  stores?: readonly StoreId[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Führt einen respektvollen Live-Abruf über alle 7 deutschen Supermarkt-Ketten durch
 * (inkl. Aldi Nord/Süd nach PLZ). Bei Anti-Bot-/CAPTCHA-Seiten wird der Schutz strikt
 * respektiert und der Status transparent zurückgegeben.
 */
export const scrapeChainsForZip = async (
  options: ScrapeChainsOptions,
): Promise<MultiChainScrapeResult> => {
  const targets = getChainScrapeTargets(options.zipCode, options.stores);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  const perChainPromises = targets.map(async (target) => {
    try {
      const response = await fetchFn(target.url, {
        headers: {
          "User-Agent":
            "EinkaufswaechterBot/1.0 (+https://github.com/Sot0ru/Einkaufswaechter; Preisvergleich DE)",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const bodyText = await response.text();

      if (isAntiBotChallengePage(bodyText, response.status)) {
        return {
          status: {
            storeId: target.storeId,
            storeName: target.storeName,
            sourceUrl: target.url,
            status: "blocked" as const,
            extractedRawCount: 0,
            matchedCount: 0,
            extractorUsed: "none" as const,
            message: `HTTP ${response.status} / Bot-Schutz erkannt – Regional-Katalog als Fallback aktiv`,
          },
          offers: [] as OfferRecord[],
        };
      }

      if (!response.ok) {
        return {
          status: {
            storeId: target.storeId,
            storeName: target.storeName,
            sourceUrl: target.url,
            status: "error" as const,
            extractedRawCount: 0,
            matchedCount: 0,
            extractorUsed: "none" as const,
            message: `HTTP ${response.status} – Regional-Katalog als Fallback aktiv`,
          },
          offers: [] as OfferRecord[],
        };
      }

      const { rawOffers, extractorUsed } = extractRawOffersFromDocument(
        bodyText,
        target.storeId,
      );
      const matched = matchScrapedRawOffers(
        rawOffers,
        options.zipCode,
        options.referenceDate,
      );

      if (matched.length === 0) {
        return {
          status: {
            storeId: target.storeId,
            storeName: target.storeName,
            sourceUrl: target.url,
            status: "empty" as const,
            extractedRawCount: rawOffers.length,
            matchedCount: 0,
            extractorUsed,
            message:
              rawOffers.length > 0
                ? `${rawOffers.length} Roh-Artikel gelesen, keine Standard-Kategorie im Preis-Korridor`
                : "Seite dynamisch gerendert – Regional-Katalog als Fallback aktiv",
          },
          offers: [] as OfferRecord[],
        };
      }

      return {
        status: {
          storeId: target.storeId,
          storeName: target.storeName,
          sourceUrl: target.url,
          status: "live_scraped" as const,
          extractedRawCount: rawOffers.length,
          matchedCount: matched.length,
          extractorUsed,
          message: `${matched.length} Live-Angebote aus ${rawOffers.length} Artikeln via ${extractorUsed} extrahiert`,
        },
        offers: matched,
      };
    } catch (error) {
      return {
        status: {
          storeId: target.storeId,
          storeName: target.storeName,
          sourceUrl: target.url,
          status: "error" as const,
          extractedRawCount: 0,
          matchedCount: 0,
          extractorUsed: "none" as const,
          message:
            error instanceof Error
              ? `Nicht erreichbar (${error.name}) – Regional-Fallback aktiv`
              : "Netzwerkfehler – Regional-Fallback aktiv",
        },
        offers: [] as OfferRecord[],
      };
    }
  });

  const settled = await Promise.all(perChainPromises);
  const chainStatuses: ChainScrapeStatus[] = [];
  const allOffers: OfferRecord[] = [];

  for (const entry of settled) {
    chainStatuses.push(entry.status);
    allOffers.push(...entry.offers);
  }

  return {
    zipCode: options.zipCode,
    referenceDate: options.referenceDate,
    liveChainCount: chainStatuses.filter((s) => s.status === "live_scraped").length,
    totalExtractedRawCount: chainStatuses.reduce((sum, s) => sum + s.extractedRawCount, 0),
    totalMatchedCount: allOffers.length,
    offers: allOffers,
    chainStatuses,
  };
};

export const ALL_SCRAPABLE_STORES: readonly StoreId[] = STORES.map((s) => s.id);
export const getStoreDisplayName = (storeId: StoreId): string => STORE_MAP[storeId].name;
