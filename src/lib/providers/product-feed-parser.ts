import type { StoreId } from "@/lib/rules/catalog";
import { mapOsmTagsToStoreId } from "./store-locator";

export interface ParsedFeedRawOffer {
  id: string;
  storeId: StoreId;
  title: string;
  description: string;
  priceCents: number;
  loyaltyPriceCents: number | null;
  validityWindow: "mo_sa" | "do_sa";
  validFrom?: string;
  validTo?: string;
  ean?: string;
}

export interface StructuredFeedParseResult {
  format: "csv" | "tsv" | "json";
  totalRows: number;
  parsedOffers: ParsedFeedRawOffer[];
  skippedRows: number;
}

const normalizeHeader = (raw: string): string =>
  raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const detectDelimiter = (headerLine: string): "," | ";" | "\t" => {
  const counts: Record<"," | ";" | "\t", number> = {
    ",": 0,
    ";": 0,
    "\t": 0,
  };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch] += 1;
    }
  }
  if (counts["\t"] >= counts[";"] && counts["\t"] >= counts[","] && counts["\t"] > 0) {
    return "\t";
  }
  if (counts[";"] >= counts[","] && counts[";"] > 0) {
    return ";";
  }
  return ",";
};

/**
 * RFC-4180-kompatibler, abhängigkeitsfreier CSV/TSV-Parser (inkl. Anführungszeichen und `""`-Escaping).
 */
export const parseDelimitedRows = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
};

const parsePriceValueToCents = (raw: string, isCentColumn = false): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isCentColumn) {
    const cents = Number.parseInt(trimmed.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(cents) && cents >= 10 && cents <= 50000 ? cents : null;
  }

  // Entfernt Währungssymbole ("EUR", "€", Leerzeichen) und normalisiert Dezimalzeichen
  const cleaned = trimmed
    .replace(/(?:eur|€)/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  // Deutsches Tausender-/Dezimalformat: "1.234,56" -> "1234.56"
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    normalized = cleaned.replace(",", ".");
  }

  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num < 0.1 || num > 500) return null;
  return Math.round(num * 100);
};

const resolveStoreFromFeedCell = (
  rawMerchant: string | undefined,
  fallbackStoreId?: StoreId,
): StoreId | null => {
  if (rawMerchant && rawMerchant.trim().length > 0) {
    const direct = rawMerchant.trim().toLowerCase();
    if (
      direct === "lidl" ||
      direct === "aldi" ||
      direct === "rewe" ||
      direct === "edeka" ||
      direct === "kaufland" ||
      direct === "netto" ||
      direct === "penny"
    ) {
      return direct;
    }
    const mapped = mapOsmTagsToStoreId({ brand: rawMerchant, name: rawMerchant });
    if (mapped) return mapped;
  }
  return fallbackStoreId ?? null;
};

const pickColumn = (row: Record<string, string>, candidates: readonly string[]): string => {
  for (const key of candidates) {
    const val = row[key];
    if (val && val.trim().length > 0) return val.trim();
  }
  return "";
};

const TITLE_COLS = [
  "product_name",
  "title",
  "name",
  "artikel",
  "artikelname",
  "produktname",
  "product_title",
] as const;

const BRAND_COLS = ["brand_name", "brand", "marke", "manufacturer"] as const;

const DESC_COLS = [
  "description",
  "product_short_description",
  "specifications",
  "short_description",
  "beschreibung",
  "package_size",
  "quantity",
  "menge",
  "inhalt",
  "base_price",
  "grundpreis",
] as const;

const PRICE_COLS = [
  "search_price",
  "store_price",
  "sale_price",
  "price",
  "preis",
  "aktionspreis",
  "offer_price",
  "display_price",
] as const;

const PRICE_CENT_COLS = ["price_cents", "pricecents"] as const;

const LOYALTY_PRICE_COLS = ["loyalty_price", "app_price", "app_preis"] as const;

const MERCHANT_COLS = [
  "merchant_name",
  "merchant",
  "advertiser_name",
  "store_id",
  "storeid",
  "store",
  "markt",
  "kette",
  "haendler",
  "shop",
] as const;

const EAN_COLS = ["ean", "gtin", "product_gtin", "barcode"] as const;

/**
 * Parst offizielle Affiliate-/Händler-Produktfeeds (z. B. Awin, TradeTracker, Webgains
 * für Lidl.de, Kaufland.de, Netto-Online) im CSV- oder TSV-Format in einheitliche Roh-Angebote.
 */
export const parseStructuredCsvProductFeed = (
  content: string,
  options: { fallbackStoreId?: StoreId; maxRows?: number } = {},
): StructuredFeedParseResult => {
  const firstNewline = content.search(/\r?\n/);
  const headerLine = firstNewline === -1 ? content : content.slice(0, firstNewline);
  const delimiter = detectDelimiter(headerLine);
  const format: "csv" | "tsv" = delimiter === "\t" ? "tsv" : "csv";

  const rows = parseDelimitedRows(content, delimiter);
  if (rows.length < 2) {
    return { format, totalRows: 0, parsedOffers: [], skippedRows: 0 };
  }

  const headers = rows[0].map(normalizeHeader);
  const maxRows = options.maxRows ?? 5000;
  const dataRows = rows.slice(1, 1 + maxRows);

  const parsedOffers: ParsedFeedRawOffer[] = [];
  let skippedRows = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const cells = dataRows[idx];
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) {
        record[headers[c]] = cells[c] ?? "";
      }
    }

    const storeId = resolveStoreFromFeedCell(
      pickColumn(record, MERCHANT_COLS),
      options.fallbackStoreId,
    );
    const rawTitle = pickColumn(record, TITLE_COLS);
    const brand = pickColumn(record, BRAND_COLS);
    const title =
      brand && rawTitle && !rawTitle.toLowerCase().includes(brand.toLowerCase())
        ? `${brand} ${rawTitle}`
        : rawTitle;

    if (!storeId || title.length < 2) {
      skippedRows += 1;
      continue;
    }

    const centColVal = pickColumn(record, PRICE_CENT_COLS);
    const euroColVal = pickColumn(record, PRICE_COLS);
    const priceCents = centColVal
      ? parsePriceValueToCents(centColVal, true)
      : parsePriceValueToCents(euroColVal, false);

    if (priceCents == null) {
      skippedRows += 1;
      continue;
    }

    const loyaltyRaw = pickColumn(record, LOYALTY_PRICE_COLS);
    const parsedLoyalty = loyaltyRaw ? parsePriceValueToCents(loyaltyRaw, false) : null;
    const loyaltyPriceCents =
      parsedLoyalty != null && parsedLoyalty < priceCents ? parsedLoyalty : null;

    const descParts: string[] = [];
    for (const col of DESC_COLS) {
      if (record[col] && !descParts.includes(record[col])) {
        descParts.push(record[col]);
      }
    }
    const description = descParts.slice(0, 3).join(" · ");

    const ean = pickColumn(record, EAN_COLS).replace(/\D/g, "") || undefined;
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(record.valid_from ?? "")
      ? record.valid_from
      : undefined;
    const validTo = /^\d{4}-\d{2}-\d{2}$/.test(record.valid_to ?? "")
      ? record.valid_to
      : undefined;
    const validityWindow: "mo_sa" | "do_sa" =
      record.validity_window === "do_sa" || /ab\s+donnerstag/i.test(description)
        ? "do_sa"
        : "mo_sa";

    parsedOffers.push({
      id: `feed-csv-${storeId}-${ean ?? idx}`,
      storeId,
      title,
      description,
      priceCents,
      loyaltyPriceCents,
      validityWindow,
      validFrom,
      validTo,
      ean,
    });
  }

  return {
    format,
    totalRows: dataRows.length,
    parsedOffers,
    skippedRows,
  };
};

export const formatFeedOffersAsBrochureText = (offers: readonly ParsedFeedRawOffer[]): string => {
  return offers
    .map((offer) => {
      const priceStr = (offer.priceCents / 100).toFixed(2).replace(".", ",");
      const loyaltyPart =
        offer.loyaltyPriceCents != null
          ? ` (Mit App ${(offer.loyaltyPriceCents / 100).toFixed(2).replace(".", ",")} €)`
          : "";
      const dayPart = offer.validityWindow === "do_sa" ? " ab Donnerstag" : "";
      return `${offer.title} ${offer.description}${dayPart} ${priceStr} €${loyaltyPart}`.replace(
        /\s+/g,
        " ",
      );
    })
    .join("\n");
};
