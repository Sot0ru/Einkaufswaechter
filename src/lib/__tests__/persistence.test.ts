import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { optimizeShoppingBasket, resolveStoreItemPrice } from "@/lib/rules/optimizer";
import {
  getCustomBasePricesMap,
  resetStoreBasePriceToDefault,
  updateStoreBasePrice,
} from "@/lib/services/base-prices";
import {
  deleteShoppingList,
  listSavedShoppingLists,
  saveShoppingList,
} from "@/lib/services/shopping-lists";

describe("Persistente Einkaufslisten & 1-Klick-Basispreis-Korrektur (Ausbaustufe 2, Paket 3)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("speichert, aktualisiert, lädt und löscht persistente Einkaufslisten in der Datenbank", async () => {
    const db = await getDb();

    const created = await saveShoppingList(db, {
      name: "Familien-Wocheneinkauf KW 47",
      zipCode: "80331",
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 600,
      items: [
        { categoryId: "butter_250g", quantity: 2 },
        { categoryId: "vollmilch_1l", quantity: 3 },
      ],
    });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Familien-Wocheneinkauf KW 47");
    expect(created.zipCode).toBe("80331");
    expect(created.items).toHaveLength(2);

    const allListsAfterCreate = await listSavedShoppingLists(db);
    expect(allListsAfterCreate).toHaveLength(1);
    expect(allListsAfterCreate[0].items).toEqual([
      { categoryId: "butter_250g", quantity: 2, checked: false },
      { categoryId: "vollmilch_1l", quantity: 3, checked: false },
    ]);

    // Aktualisieren derselben Liste
    const updated = await saveShoppingList(db, {
      id: created.id,
      name: "Familien-Wocheneinkauf (Aktualisiert)",
      zipCode: "80331",
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 500,
      items: [{ categoryId: "pasta_500g", quantity: 4, checked: true }],
    });

    expect(updated.id).toBe(created.id);
    const allListsAfterUpdate = await listSavedShoppingLists(db);
    expect(allListsAfterUpdate).toHaveLength(1);
    expect(allListsAfterUpdate[0].name).toBe("Familien-Wocheneinkauf (Aktualisiert)");
    expect(allListsAfterUpdate[0].items).toEqual([
      { categoryId: "pasta_500g", quantity: 4, checked: true },
    ]);

    // Löschen der Liste
    const wasDeleted = await deleteShoppingList(db, created.id);
    expect(wasDeleted).toBe(true);
    expect(await listSavedShoppingLists(db)).toHaveLength(0);
  });

  it("speichert 1-Klick-Basispreis-Korrekturen je Kette, wendet sie in der Optimierung an und setzt sie auf Wunsch zurück", async () => {
    const db = await getDb();

    // Standardmäßig kostet Markenbutter (butter_250g) bei Lidl 239 Cent (2,39 €)
    const updated = await updateStoreBasePrice(db, {
      categoryId: "butter_250g",
      storeId: "lidl",
      priceCents: 219,
    });

    expect(updated.isCustom).toBe(true);
    expect(updated.priceCents).toBe(219);

    const customMap = await getCustomBasePricesMap(db);
    expect(customMap.butter_250g?.lidl?.priceCents).toBe(219);

    // Ohne Wochenangebote fließt der korrigierte Basispreis (2,19 € statt 2,39 €) direkt in den Optimierer ein
    const lidlResolved = resolveStoreItemPrice({
      categoryId: "butter_250g",
      quantity: 2,
      storeId: "lidl",
      shoppingDate: "2026-11-18",
      hasLoyaltyApp: false,
      offers: [],
      customBasePrices: customMap,
    });
    expect(lidlResolved.checkoutCents).toBe(438); // 2 * 2,19 €

    const basketOpt = optimizeShoppingBasket({
      items: [{ categoryId: "butter_250g", quantity: 2 }],
      enabledStores: ["lidl", "rewe"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-18",
      offers: [],
      customBasePrices: customMap,
    });
    expect(basketOpt.bestSingleStore?.storeId).toBe("lidl");
    expect(basketOpt.bestSingleStore?.totalCheckoutCents).toBe(438);

    // Zurücksetzen auf Katalog-Standard (2,39 €)
    const resetEntry = await resetStoreBasePriceToDefault(db, {
      categoryId: "butter_250g",
      storeId: "lidl",
    });
    expect(resetEntry.priceCents).toBe(239);

    const mapAfterReset = await getCustomBasePricesMap(db);
    expect(mapAfterReset.butter_250g?.lidl).toBeUndefined();
  });
});
