import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { buildFavoritesReminderIcs, evaluateFavoriteAlerts } from "@/lib/rules/favorites";
import { decodeListSnapshot, encodeListSnapshot } from "@/lib/rules/list-snapshot";
import type { OfferRecord } from "@/lib/rules/optimizer";
import { reconcileReceiptWithBasket } from "@/lib/rules/receipt-reconciliation";
import { getFavoriteCategoryIds, saveFavoriteCategoryIds } from "@/lib/services/favorites";
import {
  createHouseholdShare,
  getSharedList,
  isValidShareCode,
  SHARE_CODE_LENGTH,
  ShareNotFoundError,
  syncSharedListChecks,
} from "@/lib/services/household-shares";
import { saveShoppingList } from "@/lib/services/shopping-lists";

const offer = (
  id: string,
  storeId: OfferRecord["storeId"],
  categoryId: string,
  title: string,
  priceCents: number,
  loyaltyPriceCents: number | null = null,
): OfferRecord => ({
  id,
  storeId,
  categoryId,
  title,
  priceCents,
  loyaltyPriceCents,
  requiresLoyaltyApp: false,
  packageAmount: categoryId === "butter_250g" ? 250 : 500,
  packageUnit: "g",
  validFrom: "2026-11-16",
  validTo: "2026-11-21",
});

describe("Paket 7: Geteilte Haushaltsliste", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  const createList = async () => {
    const db = await getDb();
    const list = await saveShoppingList(db, {
      name: "WG-Einkauf",
      zipCode: "10115",
      shoppingDate: "2026-11-21",
      items: [
        { categoryId: "butter_250g", quantity: 1 },
        { categoryId: "vollmilch_1l", quantity: 2 },
      ],
    });
    return { db, list };
  };

  it("erzeugt einen zufälligen, unerratbaren Code und verwendet ihn für dieselbe Liste wieder", async () => {
    const { db, list } = await createList();
    const now = new Date("2026-11-20T10:00:00Z");
    const share = await createHouseholdShare(db, { listId: list.id, now });
    expect(share.shareCode).toHaveLength(SHARE_CODE_LENGTH);
    expect(isValidShareCode(share.shareCode)).toBe(true);
    expect(share.expiresAt).toBe("2026-12-04T10:00:00.000Z");

    const again = await createHouseholdShare(db, { listId: list.id, now });
    expect(again.shareCode).toBe(share.shareCode);

    const shared = await getSharedList(db, share.shareCode, now);
    expect(shared.name).toBe("WG-Einkauf");
    expect(shared.items.map((item) => item.categoryId).sort()).toEqual(["butter_250g", "vollmilch_1l"]);
    expect(shared.items.every((item) => !item.checked)).toBe(true);
  });

  it("gleicht abgehakte Artikel ab: pro Position gewinnt die jüngste Änderung", async () => {
    const { db, list } = await createList();
    // Zeitpunkte relativ zu jetzt, da gespeicherte Positionen die aktuelle Uhrzeit tragen
    const base = Date.now() + 60 * 60 * 1000;
    const at = (minutes: number) => new Date(base + minutes * 60 * 1000);
    const { shareCode } = await createHouseholdShare(db, { listId: list.id, now: at(0) });

    // Person A hakt Butter ab
    await syncSharedListChecks(
      db,
      shareCode,
      [{ categoryId: "butter_250g", checked: true, changedAt: at(1).toISOString() }],
      at(1.1),
    );
    // Person B war offline und schickt eine ältere Änderung hinterher: sie verliert
    const afterStale = await syncSharedListChecks(
      db,
      shareCode,
      [{ categoryId: "butter_250g", checked: false, changedAt: at(0.5).toISOString() }],
      at(2),
    );
    expect(afterStale.items.find((item) => item.categoryId === "butter_250g")?.checked).toBe(true);
    expect(afterStale.syncedAt).toBe(at(2).toISOString());

    // Eine jüngere Änderung setzt sich durch
    const afterNewer = await syncSharedListChecks(
      db,
      shareCode,
      [{ categoryId: "butter_250g", checked: false, changedAt: at(3).toISOString() }],
      at(3.1),
    );
    expect(afterNewer.items.find((item) => item.categoryId === "butter_250g")?.checked).toBe(false);

    // Zeitpunkte aus der Zukunft (vorgehende Handy-Uhr) werden auf den Serverzeitpunkt begrenzt
    const afterFuture = await syncSharedListChecks(
      db,
      shareCode,
      [{ categoryId: "vollmilch_1l", checked: true, changedAt: at(500).toISOString() }],
      at(4),
    );
    const milk = afterFuture.items.find((item) => item.categoryId === "vollmilch_1l")!;
    expect(milk.checked).toBe(true);
    expect(milk.updatedAt).toBe(at(4).toISOString());
  });

  it("lehnt abgelaufene, unbekannte und ungültige Codes ab", async () => {
    const { db, list } = await createList();
    const { shareCode } = await createHouseholdShare(db, {
      listId: list.id,
      validDays: 1,
      now: new Date("2026-11-01T00:00:00Z"),
    });
    await expect(getSharedList(db, shareCode, new Date("2026-11-03T00:00:00Z"))).rejects.toBeInstanceOf(
      ShareNotFoundError,
    );
    await expect(getSharedList(db, "abcdefghjk")).rejects.toBeInstanceOf(ShareNotFoundError);
    await expect(getSharedList(db, "../../etc")).rejects.toBeInstanceOf(ShareNotFoundError);
  });

  it("verlangt eine gespeicherte Liste", async () => {
    const db = await getDb();
    await expect(
      createHouseholdShare(db, { listId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow("zuerst gespeichert");
  });

  it("teilt Listen offline über einen Link-Schnappschuss mit Umlauten", () => {
    const encoded = encodeListSnapshot({
      name: "Grillabend für Jürgen",
      items: [
        { categoryId: "bratwurst_400g", quantity: 2 },
        { categoryId: "gibt_es_nicht", quantity: 1 },
      ],
    });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeListSnapshot(encoded)).toEqual({
      name: "Grillabend für Jürgen",
      items: [{ categoryId: "bratwurst_400g", quantity: 2 }],
    });
    expect(decodeListSnapshot("kaputt!!")).toBeNull();
  });
});

describe("Paket 7: Wochen-Alert für Stammprodukte", () => {
  it("findet je Stammprodukt das günstigste Angebot in den gewählten Märkten", () => {
    const offers = [
      offer("lidl-butter", "lidl", "butter_250g", "Milbona Butter 250 g", 169),
      offer("rewe-butter", "rewe", "butter_250g", "Kerrygold Butter 250 g", 199, 149),
      offer("aldi-pasta", "aldi", "pasta_500g", "Spaghetti 500 g", 49),
    ];
    const summary = evaluateFavoriteAlerts({
      favoriteCategoryIds: ["butter_250g", "pasta_500g", "vollmilch_1l"],
      offers,
      enabledStores: ["lidl", "rewe"],
      enabledLoyaltyApps: ["rewe"],
      shoppingDate: "2026-11-18",
    });

    // Rewe mit App (1,49 €) schlägt Lidl (1,69 €); Pasta nur bei Aldi, das nicht aktiv ist
    expect(summary.alerts).toHaveLength(1);
    expect(summary.alerts[0]).toMatchObject({
      categoryId: "butter_250g",
      storeId: "rewe",
      offerPriceCents: 149,
      regularPriceCents: 239,
      savingsCents: 90,
      usedLoyaltyApp: true,
    });
    expect(summary.totalSavingsCents).toBe(90);
  });

  it("erstellt eine wöchentliche Montags-Erinnerung um 7:30 Uhr", () => {
    const ics = buildFavoritesReminderIcs({
      now: new Date("2026-11-21T12:00:00Z"),
      appUrl: "https://example.org/app",
    });
    expect(ics).toContain("DTSTART:20261123T073000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("speichert Stammprodukte in app_settings und filtert unbekannte Kategorien", async () => {
    resetDbForTests();
    const db = await getDb();
    expect(await getFavoriteCategoryIds(db)).toEqual([]);
    await saveFavoriteCategoryIds(db, ["butter_250g", "butter_250g", "gibt_es_nicht", "pasta_500g"]);
    expect(await getFavoriteCategoryIds(db)).toEqual(["butter_250g", "pasta_500g"]);
  });
});

describe("Paket 7: Kassenzettel-Gegencheck", () => {
  it("ordnet jede Position einem Status zu und summiert geplant gegen bezahlt", () => {
    const result = reconcileReceiptWithBasket({
      planned: [
        { categoryId: "butter_250g", quantity: 1, plannedCents: 239 },
        { categoryId: "vollmilch_1l", quantity: 2, plannedCents: 198 },
        { categoryId: "pasta_500g", quantity: 2, plannedCents: 158 },
      ],
      receipt: [
        { categoryId: "butter_250g", quantity: 1, actualCents: 229, isOffer: false },
        { categoryId: "vollmilch_1l", quantity: 1, actualCents: 99, isOffer: false },
        { categoryId: "vollmilch_1l", quantity: 1, actualCents: 99, isOffer: false },
        { categoryId: "bananen_1kg", quantity: 1, actualCents: 160, isOffer: false },
      ],
    });

    const status = Object.fromEntries(result.lines.map((line) => [line.categoryId, line.status]));
    expect(status).toEqual({
      butter_250g: "price_changed",
      vollmilch_1l: "matched",
      pasta_500g: "missing_from_receipt",
      bananen_1kg: "unplanned_extra",
    });
    expect(result.lines[0].categoryId).toBe("butter_250g");
    expect(result.lines[0].deltaCents).toBe(-10);
    expect(result.lines[0].actualUnitCents).toBe(229);
    expect(result.plannedTotalCents).toBe(595);
    expect(result.paidTotalCents).toBe(587);
    expect(result.comparableDeltaCents).toBe(-10);
    expect(result.unplannedExtraCents).toBe(160);
    expect(result.missingPlannedCents).toBe(158);
  });
});
