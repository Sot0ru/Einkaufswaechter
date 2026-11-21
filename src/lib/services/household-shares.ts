import { randomInt } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { type Db, schema } from "@/db";

/** Ohne leicht verwechselbare Zeichen (0/o, 1/l/i), damit Codes auch abgetippt funktionieren */
const SHARE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const SHARE_CODE_LENGTH = 10;
export const DEFAULT_SHARE_VALID_DAYS = 14;

export interface SharedListItem {
  categoryId: string;
  quantity: number;
  checked: boolean;
  /** ISO-Zeitstempel der letzten Änderung dieser Position */
  updatedAt: string;
}

export interface SharedList {
  shareCode: string;
  listId: string;
  name: string;
  zipCode: string;
  shoppingDate: string;
  secondStoreThresholdCents: number;
  expiresAt: string;
  /** Letzter Abgleich irgendeines Haushaltsmitglieds */
  syncedAt: string;
  items: SharedListItem[];
}

export interface CheckChange {
  categoryId: string;
  checked: boolean;
  /** Wann die Person den Artikel abgehakt hat (ISO); ältere Änderungen verlieren */
  changedAt: string;
}

export class ShareNotFoundError extends Error {
  constructor() {
    super("Diese geteilte Liste gibt es nicht oder sie ist abgelaufen.");
    this.name = "ShareNotFoundError";
  }
}

export const generateShareCode = (): string =>
  Array.from(
    { length: SHARE_CODE_LENGTH },
    () => SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)],
  ).join("");

export const isValidShareCode = (code: string): boolean =>
  code.length === SHARE_CODE_LENGTH && [...code].every((char) => SHARE_CODE_ALPHABET.includes(char));

/**
 * Erzeugt einen Teilen-Code für eine gespeicherte Liste.
 * Gibt es für die Liste schon einen gültigen Code, wird dieser wiederverwendet.
 */
export const createHouseholdShare = async (
  db: Db,
  params: { listId: string; validDays?: number; now?: Date },
): Promise<{ shareCode: string; expiresAt: string }> => {
  const now = params.now ?? new Date();
  const list = await db
    .select({ id: schema.shoppingLists.id })
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, params.listId));
  if (list.length === 0) {
    throw new Error("Die Liste muss zuerst gespeichert werden, bevor du sie teilen kannst.");
  }

  const active = await db
    .select()
    .from(schema.householdShares)
    .where(
      and(eq(schema.householdShares.listId, params.listId), gt(schema.householdShares.expiresAt, now)),
    )
    .orderBy(desc(schema.householdShares.expiresAt));
  if (active.length > 0) {
    return { shareCode: active[0].shareCode, expiresAt: active[0].expiresAt.toISOString() };
  }

  const validDays = params.validDays ?? DEFAULT_SHARE_VALID_DAYS;
  const expiresAt = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const shareCode = generateShareCode();
  await db.insert(schema.householdShares).values({
    shareCode,
    listId: params.listId,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });
  return { shareCode, expiresAt: expiresAt.toISOString() };
};

/** Lädt eine geteilte Liste; wirft ShareNotFoundError bei unbekanntem oder abgelaufenem Code */
export const getSharedList = async (
  db: Db,
  shareCode: string,
  now: Date = new Date(),
): Promise<SharedList> => {
  if (!isValidShareCode(shareCode)) throw new ShareNotFoundError();
  const shares = await db
    .select()
    .from(schema.householdShares)
    .where(eq(schema.householdShares.shareCode, shareCode));
  const share = shares[0];
  if (!share || share.expiresAt <= now) throw new ShareNotFoundError();

  const lists = await db
    .select()
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, share.listId));
  const list = lists[0];
  if (!list) throw new ShareNotFoundError();

  const items = await db
    .select()
    .from(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, list.id));

  return {
    shareCode,
    listId: list.id,
    name: list.name,
    zipCode: list.zipCode,
    shoppingDate: list.shoppingDate,
    secondStoreThresholdCents: list.secondStoreThresholdCents,
    expiresAt: share.expiresAt.toISOString(),
    syncedAt: share.updatedAt.toISOString(),
    items: items.map((item) => ({
      categoryId: item.categoryId,
      quantity: item.quantity,
      checked: item.checked,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
};

/**
 * Übernimmt abgehakte Artikel aus dem Laden. Pro Position gewinnt die jüngste Änderung,
 * damit zwei Personen gleichzeitig abhaken können, ohne sich zu überschreiben.
 */
export const syncSharedListChecks = async (
  db: Db,
  shareCode: string,
  changes: readonly CheckChange[],
  now: Date = new Date(),
): Promise<SharedList> => {
  const current = await getSharedList(db, shareCode, now);

  for (const change of changes) {
    const changedAt = new Date(change.changedAt);
    if (Number.isNaN(changedAt.getTime())) continue;
    // Uhren auf Handys gehen manchmal vor: Zeitpunkte aus der Zukunft auf „jetzt“ begrenzen
    const effectiveChangedAt = changedAt > now ? now : changedAt;
    await db
      .update(schema.shoppingListItems)
      .set({ checked: change.checked, updatedAt: effectiveChangedAt })
      .where(
        and(
          eq(schema.shoppingListItems.listId, current.listId),
          eq(schema.shoppingListItems.categoryId, change.categoryId),
          lt(schema.shoppingListItems.updatedAt, effectiveChangedAt),
        ),
      );
  }

  await db
    .update(schema.householdShares)
    .set({ updatedAt: now })
    .where(eq(schema.householdShares.shareCode, shareCode));

  return getSharedList(db, shareCode, now);
};
