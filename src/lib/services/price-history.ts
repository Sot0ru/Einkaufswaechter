import { desc, eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import {
  type BarcodeLookupOptions,
  type BarcodeProductInfo,
  evaluateBarcodePriceShrinkflation,
  isValidBarcode,
  lookupBarcodeProduct,
  normalizeBarcode,
} from "@/lib/providers/barcode-lookup";
import { getWeekWindowForDate } from "@/lib/providers/demo-offers";
import { CATEGORY_MAP, type BaseUnit, type StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  buildCategoryPriceStats,
  buildVerifiedKey,
  type PriceHistorySample,
  type PriceHistorySummary,
  type ShrinkflationWarning,
  type VerifiedPriceRecord,
} from "@/lib/rules/price-intelligence";
import {
  type CustomBasePricesMap,
  getCustomBasePricesMap,
  updateStoreBasePrice,
} from "./base-prices";

/**
 * Erstellt die 90-Tage-Preishistorie (Tiefstpreis, Median, größte Packungsgröße)
 * sowie die letzten verifizierten Bon-/Barcode-Preise je (Kategorie, Kette).
 */
export const getPriceHistorySummary = async (
  db: Db,
  referenceDate: string,
  windowDays = 90,
): Promise<PriceHistorySummary> => {
  const [offerRows, observationRows] = await Promise.all([
    db.select().from(schema.weeklyOffers),
    db
      .select()
      .from(schema.receiptObservations)
      .orderBy(desc(schema.receiptObservations.receiptDate)),
  ]);

  const samples: PriceHistorySample[] = [];
  const verifiedPrices: Record<string, VerifiedPriceRecord> = {};

  for (const row of offerRows) {
    const effectiveCents =
      row.loyaltyPriceCents != null && row.loyaltyPriceCents < row.priceCents
        ? row.loyaltyPriceCents
        : row.priceCents;
    samples.push({
      categoryId: row.categoryId,
      storeId: row.storeId as StoreId,
      priceCents: effectiveCents,
      packageAmount: row.packageAmount,
      packageUnit: row.packageUnit as BaseUnit,
      observedDate: row.validFrom,
      source: "weekly_offer",
      isOffer: true,
    });
  }

  for (const row of observationRows) {
    const category = CATEGORY_MAP[row.categoryId];
    const packageAmount = row.packageAmount ?? category?.standardAmount ?? 0;
    const packageUnit = (row.packageUnit as BaseUnit | null) ?? category?.unit ?? "g";
    const obsSource: "barcode" | "open_prices" | "receipt" = row.rawLabel.startsWith("[EAN:")
      ? "barcode"
      : row.rawLabel.startsWith("[OP:")
        ? "open_prices"
        : "receipt";

    if (packageAmount > 0) {
      samples.push({
        categoryId: row.categoryId,
        storeId: row.storeId as StoreId,
        priceCents: row.priceCents,
        packageAmount,
        packageUnit,
        observedDate: row.receiptDate,
        source: obsSource,
        isOffer: row.isOffer,
      });
    }

    const key = buildVerifiedKey(row.categoryId, row.storeId as StoreId);
    const existing = verifiedPrices[key];
    if (!existing || row.receiptDate >= existing.observedDate) {
      verifiedPrices[key] = {
        categoryId: row.categoryId,
        storeId: row.storeId as StoreId,
        priceCents: row.priceCents,
        observedDate: row.receiptDate,
        source: obsSource,
        packageAmount: row.packageAmount ?? null,
        packageUnit: (row.packageUnit as BaseUnit | null) ?? null,
      };
    }
  }

  return {
    windowDays,
    referenceDate,
    categoryStats: buildCategoryPriceStats(samples, referenceDate, windowDays),
    verifiedPrices,
  };
};

/**
 * Sucht ein Produkt per EAN/GTIN zunächst im lokalen Datenbank-Cache (`barcode_products`),
 * ansonsten über Open Food Facts (mit Offline-Demo-Fallback) und cacht den Treffer.
 */
export const lookupAndCacheBarcode = async (
  db: Db,
  rawBarcode: string,
  options: BarcodeLookupOptions = {},
): Promise<BarcodeProductInfo | null> => {
  const barcode = normalizeBarcode(rawBarcode);
  if (!isValidBarcode(barcode)) return null;

  const cachedRows = await db
    .select()
    .from(schema.barcodeProducts)
    .where(eq(schema.barcodeProducts.barcode, barcode))
    .limit(1);

  if (cachedRows.length > 0) {
    const row = cachedRows[0];
    const cat = row.categoryId ? CATEGORY_MAP[row.categoryId] : undefined;
    let shrinkflationNote: string | null = null;
    if (
      cat &&
      row.packageAmount != null &&
      row.packageUnit === cat.unit &&
      row.packageAmount < Math.round(cat.standardAmount * 0.92) &&
      row.packageAmount >= Math.round(cat.standardAmount * 0.5)
    ) {
      const diffPercent = Math.round(((cat.standardAmount - row.packageAmount) / cat.standardAmount) * 100);
      shrinkflationNote = `Kleinere Packung erkannt: ${row.packageAmount} ${row.packageUnit} statt Norm ${cat.standardAmount} ${cat.unit} (−${diffPercent} % Inhalt – Grundpreis prüfen!)`;
    }

    return {
      barcode: row.barcode,
      productName: row.productName,
      brand: row.brand,
      quantityText: row.quantityText,
      packageAmount: row.packageAmount,
      packageUnit: (row.packageUnit as BaseUnit | null) ?? null,
      categoryId: row.categoryId,
      categoryName: cat?.name ?? null,
      source: "db_cache",
      shrinkflationNote,
    };
  }

  const found = await lookupBarcodeProduct(barcode, options);
  if (!found) return null;

  await ensureCatalogAndDemoOffers(db, new Date().toISOString().slice(0, 10));

  await db
    .insert(schema.barcodeProducts)
    .values({
      barcode: found.barcode,
      productName: found.productName,
      brand: found.brand,
      quantityText: found.quantityText,
      packageAmount: found.packageAmount,
      packageUnit: found.packageUnit,
      categoryId: found.categoryId && CATEGORY_MAP[found.categoryId] ? found.categoryId : null,
      source: found.source,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.barcodeProducts.barcode,
      set: {
        productName: found.productName,
        brand: found.brand,
        quantityText: found.quantityText,
        packageAmount: found.packageAmount,
        packageUnit: found.packageUnit,
        categoryId: found.categoryId && CATEGORY_MAP[found.categoryId] ? found.categoryId : null,
        source: found.source,
        updatedAt: new Date(),
      },
    });

  return found;
};

export interface SaveBarcodeObservationInput {
  barcode: string;
  productName: string;
  brand?: string | null;
  quantityText?: string | null;
  packageAmount?: number | null;
  packageUnit?: BaseUnit | null;
  categoryId: string;
  storeId: StoreId;
  zipCode: string;
  priceCents: number;
  isOffer: boolean;
  observedDate: string;
}

export interface SaveBarcodeObservationResult {
  barcode: string;
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  isOffer: boolean;
  createdOffer: OfferRecord | null;
  shrinkflationWarning: ShrinkflationWarning | null;
  customBasePrices: CustomBasePricesMap;
  priceHistory: PriceHistorySummary;
}

/**
 * Speichert eine im Laden per Barcode-Scanner erfasste Preisbeobachtung dauerhaft in
 * `barcode_products`, `receipt_observations` sowie (je nach Auswahl) in `base_prices`
 * oder `weekly_offers`.
 */
export const saveBarcodePriceObservation = async (
  db: Db,
  input: SaveBarcodeObservationInput,
): Promise<SaveBarcodeObservationResult> => {
  const category = CATEGORY_MAP[input.categoryId];
  if (!category) {
    throw new Error(`Unbekannte Kategorie: ${input.categoryId}`);
  }

  const barcode = normalizeBarcode(input.barcode);
  await ensureCatalogAndDemoOffers(db, input.observedDate);

  const packageAmount = input.packageAmount ?? category.standardAmount;
  const packageUnit = input.packageUnit ?? category.unit;

  // 1. Barcode-Produkt im lokalen Cache sichern
  if (barcode.length >= 8) {
    await db
      .insert(schema.barcodeProducts)
      .values({
        barcode,
        productName: input.productName.trim(),
        brand: input.brand?.trim() || null,
        quantityText: input.quantityText?.trim() || null,
        packageAmount,
        packageUnit,
        categoryId: category.id,
        source: "user_scan",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.barcodeProducts.barcode,
        set: {
          productName: input.productName.trim(),
          brand: input.brand?.trim() || null,
          quantityText: input.quantityText?.trim() || null,
          packageAmount,
          packageUnit,
          categoryId: category.id,
          updatedAt: new Date(),
        },
      });
  }

  // 2. Preisbeobachtung für Historie & Konfidenz-Anzeige protokollieren
  await db.insert(schema.receiptObservations).values({
    storeId: input.storeId,
    zipCode: input.zipCode,
    categoryId: category.id,
    rawLabel: `[EAN:${barcode || "manual"}] ${input.productName.trim()}`,
    priceCents: input.priceCents,
    isOffer: input.isOffer,
    receiptDate: input.observedDate,
    packageAmount,
    packageUnit,
  });

  // 3. Je nach Typ Basispreis kalibrieren oder Wochenangebot anlegen
  let createdOffer: OfferRecord | null = null;
  if (input.isOffer) {
    const week = getWeekWindowForDate(input.observedDate);
    const offerId = `barcode-${input.storeId}-${category.id}-${input.zipCode}-${week.monday}`;
    const title = [input.brand, input.productName].filter(Boolean).join(" ").trim();

    await db
      .insert(schema.weeklyOffers)
      .values({
        id: offerId,
        storeId: input.storeId,
        zipCode: input.zipCode,
        categoryId: category.id,
        title,
        priceCents: input.priceCents,
        loyaltyPriceCents: null,
        requiresLoyaltyApp: false,
        packageAmount,
        packageUnit,
        validFrom: week.monday,
        validTo: week.saturday,
      })
      .onConflictDoUpdate({
        target: schema.weeklyOffers.id,
        set: {
          title,
          priceCents: input.priceCents,
          packageAmount,
          packageUnit,
        },
      });

    createdOffer = {
      id: offerId,
      storeId: input.storeId,
      categoryId: category.id,
      title,
      priceCents: input.priceCents,
      loyaltyPriceCents: null,
      requiresLoyaltyApp: false,
      packageAmount,
      packageUnit,
      validFrom: week.monday,
      validTo: week.saturday,
    };
  } else {
    await updateStoreBasePrice(db, {
      categoryId: category.id,
      storeId: input.storeId,
      priceCents: input.priceCents,
      productLabel: category.defaultBasePrices[input.storeId].productLabel,
    });
  }

  const shrinkflationWarning = evaluateBarcodePriceShrinkflation({
    categoryId: category.id,
    packageAmount,
    packageUnit,
    priceCents: input.priceCents,
    referencePriceCents: category.defaultBasePrices[input.storeId].priceCents,
  });

  const [customBasePrices, priceHistory] = await Promise.all([
    getCustomBasePricesMap(db),
    getPriceHistorySummary(db, input.observedDate),
  ]);

  return {
    barcode,
    categoryId: category.id,
    storeId: input.storeId,
    priceCents: input.priceCents,
    isOffer: input.isOffer,
    createdOffer,
    shrinkflationWarning,
    customBasePrices,
    priceHistory,
  };
};
