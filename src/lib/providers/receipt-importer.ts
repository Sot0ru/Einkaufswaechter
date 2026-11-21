import {
  CATEGORY_MAP,
  type BaseUnit,
  type StoreId,
} from "@/lib/rules/catalog";
import { detectLoyaltyRequirement, matchOfferToCategory } from "@/lib/rules/matcher";
import { isStoreBrandLabel } from "@/lib/rules/store-brands";
import type { OfferRecord } from "@/lib/rules/optimizer";
import { getWeekWindowForDate } from "./demo-offers";

export interface ReceiptAliasEntry {
  aliasNormalized: string;
  storeId: StoreId | null;
  categoryId: string;
  sampleLabel: string;
  hitCount: number;
}

export interface ParsedReceiptItem {
  lineIndex: number;
  rawLabel: string;
  aliasNormalized: string;
  expandedLabel: string;
  quantity: number;
  /** Regulärer Stückpreis vor Rabattabzug (in Cent) */
  regularPriceCents: number;
  /** Effektiver Stückpreis nach eventuellem Rabatt-/App-Abzug (in Cent) */
  effectivePriceCents: number;
  discountCents: number;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  isWeighedItem: boolean;
  isStoreBrand: boolean;
  isOffer: boolean;
  usedLoyaltyApp: boolean;
  /** Sollte dieser Eintrag den regulären Eigenmarken-Basispreis (base_prices) aktualisieren? */
  suggestBasePriceUpdate: boolean;
  matched: boolean;
  matchedVia: "learned_alias" | "rule_matcher" | "unmatched";
  categoryId: string | null;
  categoryName: string | null;
  reasonIfUnmatched?: string;
}

export interface ParsedReceiptResult {
  detectedStoreId: StoreId | null;
  detectedZipCode: string | null;
  detectedDate: string | null;
  items: ParsedReceiptItem[];
  skippedLines: { rawLine: string; reason: string }[];
}

export const SAMPLE_RECEIPT_TEXT = `LIDL DIENSTLEISTUNG GMBH & CO. KG
Friedrichstr. 112
10117 Berlin
Datum: 20.11.2026

MILB.DT.MARKENBUTT. 250G          2,29 A
JA! / MILBONA VOLLMILCH 3,5% 1L
  2 x 0,99                        1,98 A
BANANEN LOSE
  1,240 kg x 1,29 EUR/kg          1,60 A
METZGERFR. RINDERHACK 500G        3,49 A
  LIDL PLUS RABATT               -0,60 A
BARILLA SPAGHETTI NR.5 500G       0,99 A
  LIDL PLUS RABATT               -0,14 A
MILB. ALPENLAND SCHNITTK. 400G    2,79 A
PFAND 0,25 EUR                    0,25 B
SUMME                            12,66
EC-KARTE                         12,66`;

const STORE_HEADER_PATTERNS: readonly { storeId: StoreId; patterns: readonly RegExp[] }[] = [
  { storeId: "lidl", patterns: [/\blidl\b/i] },
  { storeId: "aldi", patterns: [/\baldi\b/i] },
  { storeId: "rewe", patterns: [/\brewe\b/i] },
  { storeId: "edeka", patterns: [/\bedeka\b/i, /\be-center\b/i] },
  { storeId: "kaufland", patterns: [/\bkaufland\b/i] },
  { storeId: "netto", patterns: [/\bnetto\s+marken/i, /\bnetto\s+filiale/i, /^\s*netto\s*$/i] },
  { storeId: "penny", patterns: [/\bpenny\b/i] },
];


const ABBREVIATION_RULES: readonly [RegExp, string][] = [
  [/\bmilb\.?/gi, "milbona "],
  [/\bmetzgerfr\.?/gi, "metzgerfrisch "],
  [/\bk-cl\.?/gi, "k-classic "],
  [/\bg&g\b/gi, "gut & günstig "],
  [/\bdt\.?/gi, "deutsche "],
  [/\bmarkenbutt(?:er)?\.?/gi, "markenbutter "],
  [/\bmarkenbut\.?/gi, "markenbutter "],
  [/\bsuessrahmbutt(?:er)?\.?/gi, "süßrahmbutter "],
  [/\bvollmil(?:ch)?\.?/gi, "vollmilch "],
  [/\bfrischm(?:ilch)?\.?/gi, "frischmilch "],
  [/\brinderhack(?:fl)?\.?/gi, "rinderhackfleisch "],
  [/\bhackfl\.?/gi, "hackfleisch "],
  [/\bhaehnchenbr\.?/gi, "hähnchenbrustfilet "],
  [/\bhähnchenbr\.?/gi, "hähnchenbrustfilet "],
  [/\bkochschink\.?/gi, "hinterkochschinken "],
  [/\bpass\.?\s*tomat\.?/gi, "passierte tomaten "],
  [/\brispentom\.?/gi, "rispentomaten "],
  [/\bspeisekart\.?/gi, "speisekartoffeln "],
  [/\btoilettenp(?:ap)?\.?/gi, "toilettenpapier "],
  [/\btoil\.?\s*pap\.?/gi, "toilettenpapier "],
  [/\bkuechent\.?/gi, "küchentücher "],
  [/\bküchent\.?/gi, "küchentücher "],
  [/\bfilterkaf\.?/gi, "filterkaffee "],
  [/\broestkaf\.?/gi, "röstkaffee "],
  [/\bbuttert\.?/gi, "buttertoast "],
  [/\bspeisequ\.?/gi, "speisequark "],
  [/\bmagerqu\.?/gi, "magerquark "],
  [/\bnaturjogh\.?/gi, "naturjoghurt "],
  [/\bhaferfl\.?/gi, "haferflocken "],
  [/\bolivenoel\b/gi, "olivenöl"],
  [/\bschnittk\.?/gi, "schnittkäse "],
  [/\bbodenh\.?/gi, "bodenhaltung "],
  [/\bfreilandh\.?/gi, "freilandhaltung "],
  [/\bmineralw\.?/gi, "mineralwasser "],
];

const FOOTER_STOP_PATTERNS = [
  /^\s*summe\b/i,
  /^\s*gesamt\b/i,
  /^\s*zu\s+zahlen\b/i,
  /^\s*total\b/i,
  /^\s*ec-karte\b/i,
  /^\s*girocard\b/i,
  /^\s*barzahlung\b/i,
  /^\s*gegeben\b/i,
];

const SKIP_ITEM_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\bpfand\b|\bleergut\b|\beinwegpfand\b|\bmehrwegpfand\b/i, reason: "Pfand / Leergut" },
  { pattern: /\btragetasche\b|\beinkaufstüte\b|\bpapiertüte\b/i, reason: "Tragetasche" },
  { pattern: /\bmwst\b|\bust-id\b|\bsteuernr\b|\btse\b|\bbon-nr\b|\bkasse\b/i, reason: "Kassen-Metadaten" },
  { pattern: /\bwww\.|\bhttp|\btel\.|\btelefon\b|\bfiliale\b|\bgmbh\b|\bco\.\s*kg\b|\bmarkt ohg\b/i, reason: "Filial-Kopfzeile" },
];

const DISCOUNT_LINE_PATTERN =
  /(?:rabatt|preisvorteil|coupon|sofortrabatt|lidl\s+plus|rewe\s+bonus|kaufland\s+card|edeka\s+app|netto\s+app|penny\s+app|aktion).*-(\d+[,.]\d{2})\s*€?\s*[a-z]?$/i;

const GENERIC_NEGATIVE_PRICE_PATTERN = /-\s*(\d+[,.]\d{2})\s*€?\s*[a-z]?$/i;

const WEIGHT_DETAIL_PATTERN =
  /(\d+[,.]\d+)\s*(kg|g)\s*[x×*]\s*(\d+[,.]\d{2})\s*(?:eur|€)?(?:\/(?:kg|g))?/i;

const MULTI_QTY_DETAIL_PATTERN =
  /^\s*(\d+)\s*(?:st\.?|stk\.?|stück)?\s*[x×*]\s*(\d+[,.]\d{2})\s*(?:eur|€)?(?:\s+(\d+[,.]\d{2})\s*€?\s*[a-z]?)?\s*$/i;

const TRAILING_PRICE_PATTERN = /^(.*?)\s+(\d+[,.]\d{2})\s*€?\s*(?:[abAB12])?\s*$/;

const parseEuroToCents = (raw: string): number =>
  Math.round(Number.parseFloat(raw.replace(",", ".")) * 100);

/**
 * Erzeugt einen stabilen, normalisierten Schlüssel für Kassenbon-Kürzel (für `receipt_aliases`).
 * Entfernt Mengen-/Preiszusätze und Sonderzeichen, damit leichte Formatabweichungen denselben Alias treffen.
 */
export const normalizeReceiptLabel = (rawLabel: string): string => {
  return rawLabel
    .toLowerCase()
    .replace(/\b\d+[,.]\d{2}\s*€?\b/g, " ")
    .replace(/\b[ab]\s*$/i, " ")
    .replace(/[^a-zäöüß0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

/**
 * Expandiert typische deutsche Kassenbon-Abkürzungen für den regelbasierten Matcher.
 */
export const expandReceiptAbbreviations = (rawLabel: string): string => {
  let expanded = rawLabel;
  for (const [regex, replacement] of ABBREVIATION_RULES) {
    expanded = expanded.replace(regex, replacement);
  }
  return expanded.replace(/\s+/g, " ").trim();
};

const detectStoreBrand = isStoreBrandLabel;

const detectHeaderMetadata = (
  lines: string[],
): {
  storeId: StoreId | null;
  zipCode: string | null;
  receiptDate: string | null;
} => {
  let storeId: StoreId | null = null;
  let zipCode: string | null = null;
  let receiptDate: string | null = null;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];

    if (!storeId) {
      for (const entry of STORE_HEADER_PATTERNS) {
        if (entry.patterns.some((p) => p.test(line))) {
          storeId = entry.storeId;
          break;
        }
      }
    }

    if (!zipCode) {
      // Bevorzugt Zeilen wie "10117 Berlin" oder "PLZ 80331"
      const zipWithCity = line.match(/\b(\d{5})\s+[A-ZÄÖÜa-zäöüß]{2,}/);
      if (zipWithCity) {
        zipCode = zipWithCity[1];
      }
    }

    if (!receiptDate) {
      const isoMatch = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
      if (isoMatch) {
        receiptDate = isoMatch[1];
      } else {
        const deMatch = line.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
        if (deMatch) {
          receiptDate = `${deMatch[3]}-${deMatch[2]}-${deMatch[1]}`;
        }
      }
    }
  }

  return { storeId, zipCode, receiptDate };
};

export interface ParseReceiptOptions {
  text: string;
  fallbackStoreId?: StoreId;
  learnedAliases?: readonly ReceiptAliasEntry[];
}

/**
 * Parst den Text eines deutschen Kassenbons / E-Bons rein deterministisch:
 * - erkennt Kette, PLZ und Datum aus dem Bon-Kopf
 * - filtert Pfand, Tragetaschen und Kassen-Fußzeilen (ab SUMME / ZU ZAHLEN)
 * - erkennt Mehrfachmengen (`2 x 0,99`) und Wiegeware (`1,240 kg x 1,29 EUR/kg`)
 * - ordnet Rabatt-/App-Coupon-Zeilen (`LIDL PLUS RABATT -0,60`) der vorherigen Position zu
 * - matcht über gelernte `receipt_aliases` + Abkürzungs-Expansion + `matchOfferToCategory`.
 */
export const parseReceiptText = (options: ParseReceiptOptions): ParsedReceiptResult => {
  const rawLines = options.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const header = detectHeaderMetadata(rawLines);
  const effectiveStoreId = header.storeId ?? options.fallbackStoreId ?? null;

  const aliasLookup = new Map<string, ReceiptAliasEntry>();
  for (const alias of options.learnedAliases ?? []) {
    aliasLookup.set(alias.aliasNormalized, alias);
  }

  const items: ParsedReceiptItem[] = [];
  const skippedLines: { rawLine: string; reason: string }[] = [];

  let pendingLabel: string | null = null;
  let pendingLineIndex = -1;

  const pushParsedItem = (params: {
    lineIndex: number;
    rawLabel: string;
    quantity: number;
    unitPriceCents: number;
    packageAmount: number | null;
    packageUnit: BaseUnit | null;
    isWeighedItem: boolean;
  }) => {
    const {
      lineIndex,
      rawLabel,
      quantity,
      unitPriceCents,
      packageAmount,
      packageUnit,
      isWeighedItem,
    } = params;

    for (const skip of SKIP_ITEM_PATTERNS) {
      if (skip.pattern.test(rawLabel)) {
        skippedLines.push({ rawLine: rawLabel, reason: skip.reason });
        return;
      }
    }

    const aliasNormalized = normalizeReceiptLabel(rawLabel);
    if (!aliasNormalized || aliasNormalized.length < 3) {
      skippedLines.push({ rawLine: rawLabel, reason: "Keine Produktbezeichnung" });
      return;
    }

    const expandedLabel = expandReceiptAbbreviations(rawLabel);
    const isStoreBrand = detectStoreBrand(rawLabel) || detectStoreBrand(expandedLabel);

    // 1. Prüfe zuerst gelernte Kassenbon-Aliases
    const learned = aliasLookup.get(aliasNormalized);
    let matchedCategoryId: string | null = null;
    let matchedCategoryName: string | null = null;
    let matchedVia: "learned_alias" | "rule_matcher" | "unmatched" = "unmatched";
    let resolvedAmount = packageAmount;
    let resolvedUnit = packageUnit;

    if (learned && CATEGORY_MAP[learned.categoryId]) {
      const cat = CATEGORY_MAP[learned.categoryId];
      // Weiter Plausibilitäts-Schutz gegen Tippfehler/Fehlzeilen
      if (
        unitPriceCents >= Math.round(cat.minPlausiblePriceCents * 0.5) &&
        unitPriceCents <= Math.round(cat.maxPlausiblePriceCents * 1.6)
      ) {
        matchedCategoryId = cat.id;
        matchedCategoryName = cat.name;
        matchedVia = "learned_alias";
        resolvedAmount ??= cat.standardAmount;
        resolvedUnit ??= cat.unit;
      }
    }

    // 2. Fallback: Deterministischer Regel-Matcher über expandierten Text
    if (!matchedCategoryId) {
      const unitHint =
        packageAmount != null && packageUnit != null
          ? `${packageAmount} ${packageUnit === "stueck" ? "Stück" : packageUnit}`
          : "";
      const match = matchOfferToCategory({
        title: expandedLabel,
        description: unitHint,
        priceCents: unitPriceCents,
      });

      if (match) {
        matchedCategoryId = match.categoryId;
        matchedCategoryName = match.categoryName;
        matchedVia = "rule_matcher";
        resolvedAmount = match.packageAmount;
        resolvedUnit = match.packageUnit;
      }
    }

    const matched = matchedCategoryId != null;
    let suggestBasePriceUpdate = false;
    let isOffer = false;

    if (matched && matchedCategoryId) {
      const cat = CATEGORY_MAP[matchedCategoryId];
      const storeRefPrice = effectiveStoreId
        ? cat.defaultBasePrices[effectiveStoreId].priceCents
        : cat.defaultBasePrices.lidl.priceCents;

      if (isStoreBrand) {
        suggestBasePriceUpdate = true;
      } else if (unitPriceCents < storeRefPrice) {
        // Markenprodukt günstiger als Eigenmarken-Basispreis -> Aktionspreis!
        isOffer = true;
      }
    }

    items.push({
      lineIndex,
      rawLabel,
      aliasNormalized,
      expandedLabel,
      quantity,
      regularPriceCents: unitPriceCents,
      effectivePriceCents: unitPriceCents,
      discountCents: 0,
      packageAmount: resolvedAmount,
      packageUnit: resolvedUnit,
      isWeighedItem,
      isStoreBrand,
      isOffer,
      usedLoyaltyApp: false,
      suggestBasePriceUpdate,
      matched,
      matchedVia,
      categoryId: matchedCategoryId,
      categoryName: matchedCategoryName,
      reasonIfUnmatched: matched
        ? undefined
        : "Kürzel unbekannt – mit 1 Klick zuordnen & dauerhaft lernen",
    });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Ab SUMME / ZU ZAHLEN beginnt der Zahlungs- und MwSt-Fußbereich des Bons
    if (FOOTER_STOP_PATTERNS.some((p) => p.test(line))) {
      skippedLines.push({ rawLine: line, reason: "Bon-Fußbereich (Summe/Zahlung)" });
      break;
    }

    // 1. Rabatt- / Coupon-Zeile gehört immer zur direkt vorherigen Artikel-Position
    const discountMatch =
      line.match(DISCOUNT_LINE_PATTERN) ??
      (items.length > 0 ? line.match(GENERIC_NEGATIVE_PRICE_PATTERN) : null);
    if (discountMatch && items.length > 0) {
      const totalDiscountCents = parseEuroToCents(discountMatch[1]);
      if (totalDiscountCents > 0) {
        const lastItem = items[items.length - 1];
        const perUnitDiscount = Math.round(totalDiscountCents / Math.max(1, lastItem.quantity));
        const nextEffective = Math.max(1, lastItem.effectivePriceCents - perUnitDiscount);
        lastItem.discountCents += perUnitDiscount;
        lastItem.effectivePriceCents = nextEffective;
        lastItem.isOffer = true;
        if (detectLoyaltyRequirement(line)) {
          lastItem.usedLoyaltyApp = true;
        }
        // Bei Eigenmarke bleibt der Preis VOR Rabatt ein verifizierter Basispreis!
        if (lastItem.isStoreBrand) {
          lastItem.suggestBasePriceUpdate = true;
        }
        pendingLabel = null;
        continue;
      }
    }

    // 2. Wiegeware-Detailzeile (z. B. "1,240 kg x 1,29 EUR/kg   1,60 A")
    const weightMatch = line.match(WEIGHT_DETAIL_PATTERN);
    if (weightMatch) {
      const unitStr = weightMatch[2].toLowerCase();
      const pricePerUnitCents = parseEuroToCents(weightMatch[3]);
      const inlineLabel = line
        .slice(0, weightMatch.index)
        .trim();
      const effectiveLabel = inlineLabel.length >= 3 ? inlineLabel : pendingLabel;

      if (effectiveLabel && pricePerUnitCents > 0) {
        const normalizedAmount = unitStr === "kg" ? 1000 : 100;
        const normalizedPriceCents =
          unitStr === "kg" ? pricePerUnitCents : pricePerUnitCents;
        pushParsedItem({
          lineIndex: inlineLabel.length >= 3 ? i : pendingLineIndex,
          rawLabel: effectiveLabel,
          quantity: 1,
          unitPriceCents: normalizedPriceCents,
          packageAmount: normalizedAmount,
          packageUnit: "g",
          isWeighedItem: true,
        });
        pendingLabel = null;
        continue;
      }
    }

    // 3. Mehrfachmengen-Detailzeile (z. B. "2 x 0,99   1,98 A")
    const multiQtyMatch = line.match(MULTI_QTY_DETAIL_PATTERN);
    if (multiQtyMatch && pendingLabel) {
      const qty = Number.parseInt(multiQtyMatch[1], 10);
      const unitPriceCents = parseEuroToCents(multiQtyMatch[2]);
      if (qty > 0 && unitPriceCents > 0) {
        pushParsedItem({
          lineIndex: pendingLineIndex,
          rawLabel: pendingLabel,
          quantity: qty,
          unitPriceCents,
          packageAmount: null,
          packageUnit: null,
          isWeighedItem: false,
        });
        pendingLabel = null;
        continue;
      }
    }

    // 4. Filial-Kopfzeilen / Datumszeilen / Adressen ohne Artikelpreis überspringen
    if (
      SKIP_ITEM_PATTERNS.some((s) => s.pattern.test(line)) ||
      /\bdatum\b/i.test(line) ||
      /^\d{5}\s+[a-zäöüß]/i.test(line) ||
      /\bstr\.?\s*\d+|\bstraße\s*\d+/i.test(line)
    ) {
      skippedLines.push({ rawLine: line, reason: "Kopfzeile / Metadaten" });
      pendingLabel = null;
      continue;
    }

    // 5. Normale Artikelzeile mit Preis am Ende (z. B. "MILB.DT.MARKENBUTT. 250G  2,29 A")
    const priceLineMatch = line.match(TRAILING_PRICE_PATTERN);
    if (priceLineMatch) {
      let labelPart = priceLineMatch[1].trim();
      const totalCents = parseEuroToCents(priceLineMatch[2]);
      let qty = 1;
      let unitPriceCents = totalCents;

      // Optionaler Mengen-Prefix wie "2 x JA! SPAGHETTI 500G  1,58"
      const prefixQtyMatch = labelPart.match(/^(\d+)\s*[x×]\s+(.+)$/i);
      if (prefixQtyMatch) {
        qty = Number.parseInt(prefixQtyMatch[1], 10);
        labelPart = prefixQtyMatch[2].trim();
        if (qty > 1) {
          unitPriceCents = Math.round(totalCents / qty);
        }
      }

      if (labelPart.length >= 2 && unitPriceCents > 0) {
        pushParsedItem({
          lineIndex: i,
          rawLabel: labelPart,
          quantity: qty,
          unitPriceCents,
          packageAmount: null,
          packageUnit: null,
          isWeighedItem: false,
        });
        pendingLabel = null;
        continue;
      }
    }

    // 6. Zeile ohne Preis: evtl. Artikelbezeichnung für nachfolgende Mengen-/Gewichtszeile
    const isHeaderStoreName = STORE_HEADER_PATTERNS.some((s) =>
      s.patterns.some((p) => p.test(line)),
    );
    if (!isHeaderStoreName && /[a-zäöüß]{3,}/i.test(line) && !/^\d{2}\.\d{2}\.\d{4}/.test(line)) {
      pendingLabel = line;
      pendingLineIndex = i;
    } else {
      skippedLines.push({ rawLine: line, reason: "Kopfzeile" });
    }
  }

  return {
    detectedStoreId: effectiveStoreId,
    detectedZipCode: header.zipCode,
    detectedDate: header.receiptDate,
    items,
    skippedLines,
  };
};

/**
 * Erzeugt aus einem bestätigten Kassenbon-Aktionsartikel einen `OfferRecord`
 * für die aktuelle Kalenderwoche.
 */
export const buildOfferRecordFromReceiptItem = (params: {
  storeId: StoreId;
  categoryId: string;
  rawLabel: string;
  regularPriceCents: number;
  effectivePriceCents: number;
  usedLoyaltyApp: boolean;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  receiptDate: string;
}): OfferRecord | null => {
  const cat = CATEGORY_MAP[params.categoryId];
  if (!cat) return null;

  const week = getWeekWindowForDate(params.receiptDate);
  const offerPriceCents = params.usedLoyaltyApp
    ? params.regularPriceCents
    : params.effectivePriceCents;
  const loyaltyPriceCents = params.usedLoyaltyApp ? params.effectivePriceCents : null;

  return {
    id: `receipt-${params.storeId}-${params.categoryId}-${params.receiptDate}`,
    storeId: params.storeId,
    categoryId: params.categoryId,
    title: `${params.rawLabel} (Kassenbon verifiziert)`,
    priceCents: offerPriceCents,
    loyaltyPriceCents,
    requiresLoyaltyApp: false,
    packageAmount: params.packageAmount ?? cat.standardAmount,
    packageUnit: params.packageUnit ?? cat.unit,
    validFrom: params.receiptDate <= week.thursday ? week.monday : week.thursday,
    validTo: week.saturday,
  };
};
