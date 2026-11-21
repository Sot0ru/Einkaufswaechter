import { desc, eq } from "drizzle-orm";
import { type Db, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { CATEGORY_MAP } from "@/lib/rules/catalog";

export interface SavedShoppingListItem {
  categoryId: string;
  quantity: number;
  checked: boolean;
}

export interface SavedShoppingList {
  id: string;
  name: string;
  zipCode: string;
  shoppingDate: string;
  secondStoreThresholdCents: number;
  createdAt: string;
  items: SavedShoppingListItem[];
}

export interface SaveShoppingListInput {
  id?: string;
  name: string;
  zipCode: string;
  shoppingDate: string;
  secondStoreThresholdCents?: number;
  items: readonly {
    categoryId: string;
    quantity: number;
    checked?: boolean;
  }[];
}

/**
 * Lädt alle gespeicherten Einkaufslisten inklusive ihrer Positionen aus der Datenbank.
 */
export const listSavedShoppingLists = async (db: Db): Promise<SavedShoppingList[]> => {
  const lists = await db
    .select()
    .from(schema.shoppingLists)
    .orderBy(desc(schema.shoppingLists.createdAt));

  if (lists.length === 0) return [];

  const allItems = await db.select().from(schema.shoppingListItems);
  const itemsByListId = new Map<string, SavedShoppingListItem[]>();

  for (const row of allItems) {
    const group = itemsByListId.get(row.listId) ?? [];
    group.push({
      categoryId: row.categoryId,
      quantity: row.quantity,
      checked: row.checked,
    });
    itemsByListId.set(row.listId, group);
  }

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    zipCode: list.zipCode,
    shoppingDate: list.shoppingDate,
    secondStoreThresholdCents: list.secondStoreThresholdCents,
    createdAt: list.createdAt.toISOString(),
    items: itemsByListId.get(list.id) ?? [],
  }));
};

/**
 * Speichert eine neue Einkaufsliste oder aktualisiert eine bestehende Liste samt Positionen.
 */
export const saveShoppingList = async (
  db: Db,
  input: SaveShoppingListInput,
): Promise<SavedShoppingList> => {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Bitte einen Namen für die Einkaufsliste angeben.");
  }

  const validItems = input.items.filter(
    (item) => item.quantity > 0 && CATEGORY_MAP[item.categoryId] != null,
  );
  if (validItems.length === 0) {
    throw new Error("Die Einkaufsliste muss mindestens eine gültige Produktkategorie enthalten.");
  }

  await ensureCatalogAndDemoOffers(db, input.shoppingDate);

  const thresholdCents = input.secondStoreThresholdCents ?? 500;
  let listId = input.id;

  if (listId) {
    const existing = await db
      .select()
      .from(schema.shoppingLists)
      .where(eq(schema.shoppingLists.id, listId));

    if (existing.length > 0) {
      await db
        .update(schema.shoppingLists)
        .set({
          name: trimmedName,
          zipCode: input.zipCode,
          shoppingDate: input.shoppingDate,
          secondStoreThresholdCents: thresholdCents,
        })
        .where(eq(schema.shoppingLists.id, listId));

      await db
        .delete(schema.shoppingListItems)
        .where(eq(schema.shoppingListItems.listId, listId));
    } else {
      listId = undefined;
    }
  }

  let createdAtIso = new Date().toISOString();

  if (!listId) {
    const inserted = await db
      .insert(schema.shoppingLists)
      .values({
        name: trimmedName,
        zipCode: input.zipCode,
        shoppingDate: input.shoppingDate,
        secondStoreThresholdCents: thresholdCents,
      })
      .returning();

    listId = inserted[0].id;
    createdAtIso = inserted[0].createdAt.toISOString();
  }

  await db.insert(schema.shoppingListItems).values(
    validItems.map((item) => ({
      listId: listId!,
      categoryId: item.categoryId,
      quantity: item.quantity,
      checked: Boolean(item.checked),
    })),
  );

  return {
    id: listId!,
    name: trimmedName,
    zipCode: input.zipCode,
    shoppingDate: input.shoppingDate,
    secondStoreThresholdCents: thresholdCents,
    createdAt: createdAtIso,
    items: validItems.map((item) => ({
      categoryId: item.categoryId,
      quantity: item.quantity,
      checked: Boolean(item.checked),
    })),
  };
};

/**
 * Löscht eine gespeicherte Einkaufsliste samt ihrer Positionen.
 */
export const deleteShoppingList = async (db: Db, listId: string): Promise<boolean> => {
  const deleted = await db
    .delete(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, listId))
    .returning({ id: schema.shoppingLists.id });
  return deleted.length > 0;
};
