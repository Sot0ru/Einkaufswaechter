import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@/db";
import {
  POPULAR_GERMAN_ZIPS,
  fetchAndMatchOffersForZip,
  resolveZipRegion,
} from "@/lib/providers/zip-offer-fetcher";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { SHOPPING_PRESETS } from "@/lib/rules/catalog";
import { optimizeShoppingBasket } from "@/lib/rules/optimizer";

describe("Automatischer PLZ-Angebots-Fetcher (zip-offer-fetcher.ts & zip-offer-sync.ts)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("ordnet deutsche Postleitzahlen der richtigen Handelsregion und dem Aldi-Äquator (Nord/Süd) zu", () => {
    expect(resolveZipRegion("10115")).toMatchObject({
      zipCode: "10115",
      regionCode: "ost",
      aldiVariant: "Aldi Nord",
    });
    expect(resolveZipRegion("20095")).toMatchObject({
      zipCode: "20095",
      regionCode: "nord",
      aldiVariant: "Aldi Nord",
    });
    // Münsterland (48xxx) liegt nördlich des Aldi-Äquators in NRW
    expect(resolveZipRegion("48143")).toMatchObject({
      zipCode: "48143",
      regionCode: "west",
      aldiVariant: "Aldi Nord",
    });
    expect(resolveZipRegion("50667")).toMatchObject({
      zipCode: "50667",
      regionCode: "west",
      aldiVariant: "Aldi Süd",
    });
    expect(resolveZipRegion("60311")).toMatchObject({
      zipCode: "60311",
      regionCode: "suedwest",
      aldiVariant: "Aldi Süd",
    });
    expect(resolveZipRegion("80331")).toMatchObject({
      zipCode: "80331",
      regionCode: "sued",
      aldiVariant: "Aldi Süd",
    });
  });

  it("erzeugt für alle 5 deutschen Handelsregionen valide, regelbasiert gematchte Wochenangebote", async () => {
    for (const entry of POPULAR_GERMAN_ZIPS) {
      const result = await fetchAndMatchOffersForZip({
        zipCode: entry.zipCode,
        referenceDate: "2026-11-18",
      });

      expect(result.zipCode).toBe(entry.zipCode);
      expect(result.region.regionCode).toBe(entry.regionCode);
      expect(result.source).toBe("regional_catalog");
      expect(result.matchedCount).toBe(result.fetchedRawCount);
      expect(result.offers.length).toBeGreaterThanOrEqual(25);
    }
  });

  it("verarbeitet externe JSON-Prospekt-Feeds über matchOfferToCategory und fällt bei Netzwerkfehlern auf den Regional-Katalog zurück", async () => {
    const mockFetchSuccess: typeof fetch = async (input) => {
      const url = String(input);
      expect(url).toContain("zip=80331");
      expect(url).toContain("date=2026-11-18");

      return new Response(
        JSON.stringify({
          offers: [
            {
              id: "ext-1",
              storeId: "rewe",
              title: "Kerrygold Original Irische Butter",
              description: "250-g-Packung",
              priceCents: 139,
              loyaltyPriceCents: 129,
              validityWindow: "mo_sa",
            },
            {
              id: "ext-trap",
              storeId: "rewe",
              title: "Kerrygold Irischer Butterkäse",
              description: "150-g-Packung",
              priceCents: 179,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const remoteResult = await fetchAndMatchOffersForZip({
      zipCode: "80331",
      referenceDate: "2026-11-18",
      feedUrl: "https://prospekt-feed.example.test/api/offers",
      fetchImpl: mockFetchSuccess,
    });

    expect(remoteResult.source).toBe("remote_feed");
    expect(remoteResult.fetchedRawCount).toBe(2);
    // Butter wird gematcht, Butterkäse-Falle wird durch excludeKeywords herausgefiltert
    expect(remoteResult.matchedCount).toBe(1);
    expect(remoteResult.offers[0].categoryId).toBe("butter_250g");
    expect(remoteResult.offers[0].priceCents).toBe(139);

    // Bei Netzwerkausfall muss der Offline-/Demo-Fallback greifen
    const mockFetchOffline: typeof fetch = async () => {
      throw new Error("Network offline");
    };

    const fallbackResult = await fetchAndMatchOffersForZip({
      zipCode: "80331",
      referenceDate: "2026-11-18",
      feedUrl: "https://prospekt-feed.example.test/api/offers",
      fetchImpl: mockFetchOffline,
    });

    expect(fallbackResult.source).toBe("regional_catalog");
    expect(fallbackResult.offers.length).toBeGreaterThanOrEqual(25);
  });

  it("synchronisiert Angebote getrennt nach PLZ idempotent in die Datenbank und protokolliert Läufe in offer_fetch_runs", async () => {
    const db = await getDb();

    const syncBerlin = await syncOffersForZipCode(db, {
      zipCode: "10115",
      referenceDate: "2026-11-18",
    });
    const syncMunich = await syncOffersForZipCode(db, {
      zipCode: "80331",
      referenceDate: "2026-11-18",
    });
    const syncMunichSecondRun = await syncOffersForZipCode(db, {
      zipCode: "80331",
      referenceDate: "2026-11-18",
    });

    expect(syncBerlin.region.regionCode).toBe("ost");
    expect(syncMunich.region.regionCode).toBe("sued");
    expect(syncMunichSecondRun.offers.length).toBe(syncMunich.offers.length);

    const runRows = await db.select().from(schema.offerFetchRuns);
    expect(runRows).toHaveLength(3);
    expect(runRows.map((r) => r.zipCode)).toEqual(["10115", "80331", "80331"]);

    // In München (Region Süd) hat Aldi Süd regionale Angebote auf Butter, Gouda & Rinderhack,
    // wodurch Aldi in 80331 deutlich günstiger abschneidet als in 10115 Berlin:
    const optBerlin = optimizeShoppingBasket({
      items: SHOPPING_PRESETS[0].items,
      enabledStores: ["aldi", "lidl", "rewe"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 300,
      offers: syncBerlin.offers,
    });

    const optMunich = optimizeShoppingBasket({
      items: SHOPPING_PRESETS[0].items,
      enabledStores: ["aldi", "lidl", "rewe"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 300,
      offers: syncMunich.offers,
    });

    const aldiBerlin = optBerlin.singleStoreRankings.find((r) => r.storeId === "aldi")!;
    const aldiMunich = optMunich.singleStoreRankings.find((r) => r.storeId === "aldi")!;
    expect(aldiMunich.totalCheckoutCents).toBeLessThan(aldiBerlin.totalCheckoutCents);
  });
});
