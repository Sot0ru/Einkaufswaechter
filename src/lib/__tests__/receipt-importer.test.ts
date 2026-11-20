import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@/db";
import {
  SAMPLE_RECEIPT_TEXT,
  parseReceiptText,
} from "@/lib/providers/receipt-importer";
import {
  importReceiptObservations,
  listReceiptAliases,
} from "@/lib/services/receipts";

describe("Kassenbon / E-Bon Crowdsourcing-Importer (receipt-importer.ts & receipts.ts)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("erkennt Kette, PLZ, Datum, Abkürzungen, Mehrfachmengen, Wiegeware und App-Rabatte aus einem deutschen E-Bon", () => {
    const parsed = parseReceiptText({ text: SAMPLE_RECEIPT_TEXT });

    expect(parsed.detectedStoreId).toBe("lidl");
    expect(parsed.detectedZipCode).toBe("10117");
    expect(parsed.detectedDate).toBe("2026-11-20");

    // Pfand & SUMME/EC-KARTE müssen sauber herausgefiltert sein
    expect(parsed.items.some((i) => i.rawLabel.toLowerCase().includes("pfand"))).toBe(false);
    expect(parsed.items.some((i) => i.rawLabel.toLowerCase().includes("summe"))).toBe(false);

    // 1. Abgekürzte Eigenmarken-Butter -> butter_250g, Basispreis-Update vorgeschlagen
    const butter = parsed.items.find((i) => i.categoryId === "butter_250g");
    expect(butter).toBeDefined();
    expect(butter?.regularPriceCents).toBe(229);
    expect(butter?.effectivePriceCents).toBe(229);
    expect(butter?.isStoreBrand).toBe(true);
    expect(butter?.suggestBasePriceUpdate).toBe(true);

    // 2. Mehrfachmenge "2 x 0,99" -> Stückpreis 99 Cent, Menge 2
    const milch = parsed.items.find((i) => i.categoryId === "vollmilch_1l");
    expect(milch).toBeDefined();
    expect(milch?.quantity).toBe(2);
    expect(milch?.regularPriceCents).toBe(99);

    // 3. Wiegeware "1,240 kg x 1,29 EUR/kg" -> auf 1 kg = 129 Cent normiert
    const bananen = parsed.items.find((i) => i.categoryId === "bananen_1kg");
    expect(bananen).toBeDefined();
    expect(bananen?.isWeighedItem).toBe(true);
    expect(bananen?.regularPriceCents).toBe(129);
    expect(bananen?.packageAmount).toBe(1000);

    // 4. Rinderhack mit Lidl Plus Rabatt -0,60 -> Basispreis 349 ct, App-Angebot 289 ct
    const hack = parsed.items.find((i) => i.categoryId === "hackfleisch_500g");
    expect(hack).toBeDefined();
    expect(hack?.regularPriceCents).toBe(349);
    expect(hack?.effectivePriceCents).toBe(289);
    expect(hack?.discountCents).toBe(60);
    expect(hack?.isOffer).toBe(true);
    expect(hack?.usedLoyaltyApp).toBe(true);
    expect(hack?.suggestBasePriceUpdate).toBe(true);

    // 5. Unbekanntes Kürzel "MILB. ALPENLAND SCHNITTK. 400G" bleibt zunächst offen zum 1-Klick-Lernen
    const unknownCheese = parsed.items.find((i) =>
      i.rawLabel.includes("ALPENLAND SCHNITTK"),
    );
    expect(unknownCheese).toBeDefined();
    expect(unknownCheese?.matched).toBe(false);
    expect(unknownCheese?.matchedVia).toBe("unmatched");
  });

  it("speichert verifizierte Bon-Preise, Basispreis-Updates, Angebote und lernt unbekannte Kürzel dauerhaft für künftige Bons", async () => {
    const db = await getDb();
    const firstParse = parseReceiptText({ text: SAMPLE_RECEIPT_TEXT });
    const unknownCheese = firstParse.items.find((i) =>
      i.rawLabel.includes("ALPENLAND SCHNITTK"),
    )!;
    const butter = firstParse.items.find((i) => i.categoryId === "butter_250g")!;
    const hack = firstParse.items.find((i) => i.categoryId === "hackfleisch_500g")!;

    // Nutzer bestätigt Butter, Hackfleisch (mit Rabatt) und ordnet "ALPENLAND SCHNITTK." mit 1 Klick gouda_400g zu
    const importResult = await importReceiptObservations(db, {
      storeId: "lidl",
      zipCode: "10117",
      receiptDate: "2026-11-20",
      items: [
        {
          rawLabel: butter.rawLabel,
          categoryId: "butter_250g",
          regularPriceCents: butter.regularPriceCents,
          effectivePriceCents: butter.effectivePriceCents,
          isOffer: false,
          usedLoyaltyApp: false,
          updateBasePrice: true,
        },
        {
          rawLabel: hack.rawLabel,
          categoryId: "hackfleisch_500g",
          regularPriceCents: hack.regularPriceCents,
          effectivePriceCents: hack.effectivePriceCents,
          isOffer: true,
          usedLoyaltyApp: true,
          updateBasePrice: true,
        },
        {
          rawLabel: unknownCheese.rawLabel,
          categoryId: "gouda_400g",
          regularPriceCents: unknownCheese.regularPriceCents,
          effectivePriceCents: unknownCheese.effectivePriceCents,
          isOffer: false,
          usedLoyaltyApp: false,
          updateBasePrice: true,
          learnAlias: true,
        },
      ],
    });

    expect(importResult.observationsInserted).toBe(3);
    expect(importResult.basePricesUpdated).toBe(3);
    expect(importResult.offersUpserted).toBe(1);
    expect(importResult.aliasesLearned).toBe(1);
    expect(importResult.customBasePrices.butter_250g?.lidl?.priceCents).toBe(229);
    expect(importResult.customBasePrices.gouda_400g?.lidl?.priceCents).toBe(279);
    expect(importResult.createdOffers[0].loyaltyPriceCents).toBe(289);

    const obsRows = await db.select().from(schema.receiptObservations);
    expect(obsRows).toHaveLength(3);

    // Beim 2. Kassenbon mit demselben Kürzel erkennt der Parser es jetzt vollautomatisch via learned_alias!
    const storedAliases = await listReceiptAliases(db);
    const secondParse = parseReceiptText({
      text: SAMPLE_RECEIPT_TEXT,
      learnedAliases: storedAliases,
    });

    const learnedCheese = secondParse.items.find((i) =>
      i.rawLabel.includes("ALPENLAND SCHNITTK"),
    );
    expect(learnedCheese?.matched).toBe(true);
    expect(learnedCheese?.categoryId).toBe("gouda_400g");
    expect(learnedCheese?.matchedVia).toBe("learned_alias");
  });
});
