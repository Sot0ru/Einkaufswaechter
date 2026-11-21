import { desc, sql } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import {
  buildOfferRecordFromReceiptItem,
  normalizeReceiptLabel,
  type ReceiptAliasEntry,
} from "@/lib/providers/receipt-importer";
import { CATEGORY_MAP, type BaseUnit, type StoreId } from "@/lib/rules/catalog";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  type CustomBasePricesMap,
  getCustomBasePricesMap,
  updateStoreBasePrice,
} from "./base-prices";

export interface ConfirmedReceiptItemInput {
  rawLabel: string;
  categoryId: string;
  regularPriceCents: number;
  effectivePriceCents: number;
  isOffer: boolean;
  usedLoyaltyApp: boolean;
  updateBasePrice: boolean;
  learnAlias?: boolean;
  packageAmount?: number | null;
  packageUnit?: BaseUnit | null;
}

export interface ImportReceiptInput {
  storeId: StoreId;
  zipCode: string;
  receiptDate: string;
  items: readonly ConfirmedReceiptItemInput[];
}

export interface ImportReceiptResult {
  observationsInserted: number;
  basePricesUpdated: number;
  offersUpserted: number;
  aliasesLearned: number;
  createdOffers: OfferRecord[];
  customBasePrices: CustomBasePricesMap;
  aliases: ReceiptAliasEntry[];
}

/**
 * Lädt alle aus bisherigen Kassenbons gelernten Produktkürzel-Zuordnungen aus `receipt_aliases`.
 */
export const listReceiptAliases = async (db: Db): Promise<ReceiptAliasEntry[]> => {
  const rows = await db
    .select()
    .from(schema.receiptAliases)
    .orderBy(desc(schema.receiptAliases.hitCount));

  return rows.map((row) => ({
    aliasNormalized: row.aliasNormalized,
    storeId: (row.storeId as StoreId | null) ?? null,
    categoryId: row.categoryId,
    sampleLabel: row.sampleLabel,
    hitCount: row.hitCount,
  }));
};

/**
 * Speichert oder verstärkt ein Kassenbon-Kürzel im selbstlernenden Wörterbuch (`receipt_aliases`).
 */
export const learnReceiptAlias = async (
  db: Db,
  params: { rawLabel: string; storeId?: StoreId | null; categoryId: string },
): Promise<ReceiptAliasEntry | null> => {
  const category = CATEGORY_MAP[params.categoryId];
  if (!category) return null;

  const aliasNormalized = normalizeReceiptLabel(params.rawLabel);
  if (!aliasNormalized || aliasNormalized.length < 3) return null;

  const inserted = await db
    .insert(schema.receiptAliases)
    .values({
      aliasNormalized,
      storeId: params.storeId ?? null,
      categoryId: params.categoryId,
      sampleLabel: params.rawLabel.trim(),
      hitCount: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.receiptAliases.aliasNormalized,
      set: {
        categoryId: params.categoryId,
        sampleLabel: params.rawLabel.trim(),
        hitCount: sql`${schema.receiptAliases.hitCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const row = inserted[0];
  return {
    aliasNormalized: row.aliasNormalized,
    storeId: (row.storeId as StoreId | null) ?? null,
    categoryId: row.categoryId,
    sampleLabel: row.sampleLabel,
    hitCount: row.hitCount,
  };
};

/**
 * Importiert verifizierte Kassenbon-Positionen in die Datenbank:
 * 1. Protokolliert jede Beobachtung in `receipt_observations`.
 * 2. Aktualisiert bei Eigenmarken den regulären Basispreis (`base_prices`).
 * 3. Speichert rabattierte / Aktions-Positionen als verifiziertes Wochenangebot (`weekly_offers`).
 * 4. Lernt manuell zugeordnete oder neue Kürzel dauerhaft in `receipt_aliases`.
 */
export const importReceiptObservations = async (
  db: Db,
  input: ImportReceiptInput,
): Promise<ImportReceiptResult> => {
  await ensureCatalogAndDemoOffers(db, input.receiptDate);

  let observationsInserted = 0;
  let basePricesUpdated = 0;
  let offersUpserted = 0;
  let aliasesLearned = 0;
  const createdOffers: OfferRecord[] = [];

  for (const item of input.items) {
    const category = CATEGORY_MAP[item.categoryId];
    if (!category) continue;
    if (
      item.effectivePriceCents < Math.round(category.minPlausiblePriceCents * 0.4) ||
      item.regularPriceCents > Math.round(category.maxPlausiblePriceCents * 2.0)
    ) {
      continue;
    }

    // 1. Kassenbon-Beobachtung protokollieren
    await db.insert(schema.receiptObservations).values({
      storeId: input.storeId,
      zipCode: input.zipCode,
      categoryId: item.categoryId,
      rawLabel: item.rawLabel,
      priceCents: item.effectivePriceCents,
      isOffer: item.isOffer,
      receiptDate: input.receiptDate,
      packageAmount: item.packageAmount ?? category.standardAmount,
      packageUnit: item.packageUnit ?? category.unit,
    });
    observationsInserted += 1;

    // 2. Kürzel lernen, falls angefordert
    if (item.learnAlias) {
      const learned = await learnReceiptAlias(db, {
        rawLabel: item.rawLabel,
        storeId: input.storeId,
        categoryId: item.categoryId,
      });
      if (learned) aliasesLearned += 1;
    }

    // 3. Regulären Eigenmarken-Basispreis aktualisieren (Preis VOR Rabattabzug!)
    if (item.updateBasePrice) {
      await updateStoreBasePrice(db, {
        categoryId: item.categoryId,
        storeId: input.storeId,
        priceCents: item.regularPriceCents,
      });
      basePricesUpdated += 1;
    }

    // 4. Verifiziertes Wochenangebot / App-Schnäppchen speichern
    if (item.isOffer) {
      const offer = buildOfferRecordFromReceiptItem({
        storeId: input.storeId,
        categoryId: item.categoryId,
        rawLabel: item.rawLabel,
        regularPriceCents: item.regularPriceCents,
        effectivePriceCents: item.effectivePriceCents,
        usedLoyaltyApp: item.usedLoyaltyApp,
        packageAmount: item.packageAmount ?? null,
        packageUnit: item.packageUnit ?? null,
        receiptDate: input.receiptDate,
      });

      if (offer) {
        const dbOfferId = `${offer.id}-${input.zipCode}`;
        await db
          .insert(schema.weeklyOffers)
          .values({
            id: dbOfferId,
            storeId: offer.storeId,
            zipCode: input.zipCode,
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
              packageAmount: offer.packageAmount,
            },
          });
        offersUpserted += 1;
        createdOffers.push({ ...offer, id: dbOfferId });
      }
    }
  }

  const [customBasePrices, aliases] = await Promise.all([
    getCustomBasePricesMap(db),
    listReceiptAliases(db),
  ]);

  return {
    observationsInserted,
    basePricesUpdated,
    offersUpserted,
    aliasesLearned,
    createdOffers,
    customBasePrices,
    aliases,
  };
};
