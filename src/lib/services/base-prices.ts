import { and, eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import {
  CATEGORIES,
  CATEGORY_MAP,
  STORES,
  type BasePriceEntry,
  type StoreId,
} from "@/lib/rules/catalog";

export type CustomBasePricesMap = Record<
  string,
  Partial<Record<StoreId, BasePriceEntry>>
>;

const validStoreSet = new Set<string>(STORES.map((s) => s.id));

/**
 * Liest alle in der Datenbank vom Standard abweichenden (oder aktualisierten) Basispreise
 * als Lookup-Map `customBasePrices[categoryId][storeId]` aus.
 */
export const getCustomBasePricesMap = async (db: Db): Promise<CustomBasePricesMap> => {
  const rows = await db.select().from(schema.basePrices);
  const map: CustomBasePricesMap = {};

  for (const row of rows) {
    const category = CATEGORY_MAP[row.categoryId];
    if (!category || !validStoreSet.has(row.storeId)) continue;
    const storeId = row.storeId as StoreId;
    const defaultEntry = category.defaultBasePrices[storeId];

    // Nur Einträge aufnehmen, die vom hinterlegten Katalog-Standard abweichen
    if (
      row.priceCents !== defaultEntry.priceCents ||
      row.productLabel !== defaultEntry.productLabel
    ) {
      map[row.categoryId] ??= {};
      map[row.categoryId]![storeId] = {
        priceCents: row.priceCents,
        productLabel: row.productLabel,
      };
    }
  }

  return map;
};

export interface UpdateBasePriceInput {
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  productLabel?: string;
}

/**
 * Speichert eine 1-Klick-Basispreis-Korrektur (z. B. direkt im Supermarkt am Regal)
 * idempotent in der Tabelle `base_prices`.
 */
export const updateStoreBasePrice = async (
  db: Db,
  input: UpdateBasePriceInput,
): Promise<{
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  productLabel: string;
  isCustom: boolean;
}> => {
  const category = CATEGORY_MAP[input.categoryId];
  if (!category) {
    throw new Error(`Unbekannte Kategorie: ${input.categoryId}`);
  }
  if (!validStoreSet.has(input.storeId)) {
    throw new Error(`Unbekannte Supermarkt-Kette: ${input.storeId}`);
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 10 || input.priceCents > 25000) {
    throw new Error("Ungültiger Basispreis (muss zwischen 0,10 € und 250,00 € liegen).");
  }

  await ensureCatalogAndDemoOffers(db, "2026-11-18");

  const defaultEntry = category.defaultBasePrices[input.storeId];
  const productLabel = input.productLabel?.trim() || defaultEntry.productLabel;

  await db
    .insert(schema.basePrices)
    .values({
      categoryId: input.categoryId,
      storeId: input.storeId,
      priceCents: input.priceCents,
      productLabel,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.basePrices.categoryId, schema.basePrices.storeId],
      set: {
        priceCents: input.priceCents,
        productLabel,
        updatedAt: new Date(),
      },
    });

  return {
    categoryId: input.categoryId,
    storeId: input.storeId,
    priceCents: input.priceCents,
    productLabel,
    isCustom:
      input.priceCents !== defaultEntry.priceCents ||
      productLabel !== defaultEntry.productLabel,
  };
};

/**
 * Setzt den Eigenmarken-Basispreis einer Kategorie für eine Kette wieder auf den Katalog-Standard zurück.
 */
export const resetStoreBasePriceToDefault = async (
  db: Db,
  params: { categoryId: string; storeId: StoreId },
): Promise<BasePriceEntry> => {
  const category = CATEGORY_MAP[params.categoryId];
  if (!category) {
    throw new Error(`Unbekannte Kategorie: ${params.categoryId}`);
  }
  const defaultEntry = category.defaultBasePrices[params.storeId];

  await db
    .update(schema.basePrices)
    .set({
      priceCents: defaultEntry.priceCents,
      productLabel: defaultEntry.productLabel,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.basePrices.categoryId, params.categoryId),
        eq(schema.basePrices.storeId, params.storeId),
      ),
    );

  return defaultEntry;
};

export const countCatalogBasePrices = (): number => CATEGORIES.length * STORES.length;
