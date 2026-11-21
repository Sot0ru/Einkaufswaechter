import { deflateSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import {
  DEMO_BARCODE_PRODUCTS,
  isValidBarcode,
  lookupBarcodeProduct,
  parseOpenFoodFactsResponse,
} from "@/lib/providers/barcode-lookup";
import {
  extractBrochureTextFromFile,
  extractTextFromPdfBytes,
} from "@/lib/providers/pdf-brochure-parser";
import { parseBrochureText } from "@/lib/providers/text-importer";
import type { OfferRecord } from "@/lib/rules/optimizer";
import {
  assessOfferConfidence,
  buildCategoryPriceStats,
  buildVerifiedKey,
  detectShrinkflation,
  evaluateOfferDeal,
} from "@/lib/rules/price-intelligence";
import {
  getPriceHistorySummary,
  lookupAndCacheBarcode,
  saveBarcodePriceObservation,
} from "@/lib/services/price-history";

const buildTestPdf = (contentLines: string[], compress: boolean): Uint8Array => {
  const streamText = [
    "BT",
    "/F1 12 Tf",
    ...contentLines.map((line) => `(${line.replace(/([()\\])/g, "\\$1")}) Tj T*`),
    "ET",
  ].join("\n");

  const rawBytes = Buffer.from(streamText, "latin1");
  const payload = compress ? deflateSync(rawBytes) : rawBytes;
  const header = Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Length ${payload.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`,
    "latin1",
  );
  const footer = Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1");
  return new Uint8Array(Buffer.concat([header, payload, footer]));
};

describe("Datenqualität: Preishistorie, Shrinkflation, Preiskonfidenz, Barcode & PDF-Prospekt", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("berechnet 90-Tage-Preishistorie und bewertet echte Tiefstpreise vs. Schein-Angebote", () => {
    const statsMap = buildCategoryPriceStats(
      [
        {
          categoryId: "butter_250g",
          storeId: "lidl",
          priceCents: 169,
          packageAmount: 250,
          packageUnit: "g",
          observedDate: "2026-10-01",
          source: "weekly_offer",
          isOffer: true,
        },
        {
          categoryId: "butter_250g",
          storeId: "rewe",
          priceCents: 149,
          packageAmount: 250,
          packageUnit: "g",
          observedDate: "2026-11-05",
          source: "weekly_offer",
          isOffer: true,
        },
        // Zu alt (> 90 Tage) -> darf nicht im 90-Tage-Tiefstpreis landen
        {
          categoryId: "butter_250g",
          storeId: "aldi",
          priceCents: 99,
          packageAmount: 250,
          packageUnit: "g",
          observedDate: "2026-05-01",
          source: "weekly_offer",
          isOffer: true,
        },
      ],
      "2026-11-20",
      90,
    );

    const butterStats = statsMap["butter_250g"];
    expect(butterStats.sampleCount).toBe(2);
    expect(butterStats.minUnitPriceCents).toBe(596); // 1,49 € / 0,25 kg = 5,96 €/kg

    const topDealOffer: OfferRecord = {
      id: "live-lidl-butter_250g-10115-0",
      storeId: "lidl",
      categoryId: "butter_250g",
      title: "Kerrygold Original Irische Butter 250g",
      priceCents: 129,
      loyaltyPriceCents: null,
      requiresLoyaltyApp: false,
      packageAmount: 250,
      packageUnit: "g",
      validFrom: "2026-11-16",
      validTo: "2026-11-21",
    };

    const topAssessment = evaluateOfferDeal(topDealOffer, butterStats);
    expect(topAssessment.rating).toBe("top_deal");
    expect(topAssessment.isHistoricLow).toBe(true);
    expect(topAssessment.label).toContain("Echter Tiefstpreis");
    expect(topAssessment.shrinkflationWarning).toBeNull();

    const fakeOffer: OfferRecord = {
      ...topDealOffer,
      id: "reg-lidl-butter-fake",
      priceCents: 249,
    };
    const fakeAssessment = evaluateOfferDeal(fakeOffer, butterStats);
    expect(fakeAssessment.rating).toBe("fake_deal");
    expect(fakeAssessment.label).toContain("Schein-Angebot");
  });

  it("erkennt Shrinkflation (kleinere Packung + gestiegener Grundpreis) ohne Fehlalarm bei regulären Großpackungen", () => {
    const shrinkWarning = detectShrinkflation({
      categoryId: "butter_250g",
      packageAmount: 200,
      packageUnit: "g",
      priceCents: 189,
      referencePriceCents: 189,
    });
    expect(shrinkWarning).not.toBeNull();
    expect(shrinkWarning?.unitPriceIncreasePercent).toBe(25);
    expect(shrinkWarning?.message).toContain("200 g statt 250 g");

    // 200 g Packung, die proportional günstiger ist (1,29 € -> 6,45 €/kg vs 7,56 €/kg), ist KEINE Shrinkflation
    const fairSmallPack = detectShrinkflation({
      categoryId: "butter_250g",
      packageAmount: 200,
      packageUnit: "g",
      priceCents: 129,
      referencePriceCents: 189,
    });
    expect(fairSmallPack).toBeNull();

    // Großpackung (500 g) ist keine Shrinkflation
    const bulkPack = detectShrinkflation({
      categoryId: "butter_250g",
      packageAmount: 500,
      packageUnit: "g",
      priceCents: 379,
      referencePriceCents: 189,
    });
    expect(bulkPack).toBeNull();
  });

  it("weist Angeboten die richtige Preiskonfidenz zu (Live, Per Bon/Scan, Regional)", () => {
    const baseOffer: OfferRecord = {
      id: "live-rewe-butter_250g-50667-1",
      storeId: "rewe",
      categoryId: "butter_250g",
      title: "Kerrygold Butter 250g",
      priceCents: 149,
      loyaltyPriceCents: null,
      requiresLoyaltyApp: false,
      packageAmount: 250,
      packageUnit: "g",
      validFrom: "2026-11-18",
      validTo: "2026-11-21",
    };

    expect(assessOfferConfidence(baseOffer, "2026-11-20")).toMatchObject({
      source: "live_scraped",
      label: "Live-Angebot",
    });

    expect(
      assessOfferConfidence({ ...baseOffer, id: "receipt-rewe-butter" }, "2026-11-20"),
    ).toMatchObject({
      source: "receipt_verified",
      label: "Per Bon/Scan geprüft (vor 2 Tagen)",
    });

    expect(
      assessOfferConfidence({ ...baseOffer, id: "reg-west-rewe-butter" }, "2026-11-20"),
    ).toMatchObject({
      source: "regional_offer",
      label: "Wochenangebot",
    });
  });

  it("validiert EAN-Prüfziffern, parst Open-Food-Facts-Antworten und fällt offline auf Demo-Barcodes zurück", async () => {
    for (const demo of DEMO_BARCODE_PRODUCTS) {
      expect(isValidBarcode(demo.barcode)).toBe(true);
    }
    expect(isValidBarcode("4008400404128")).toBe(false); // falsche Prüfziffer
    expect(isValidBarcode("12345")).toBe(false);

    const parsedOff = parseOpenFoodFactsResponse("8076800195057", {
      status: 1,
      product: {
        product_name_de: "Spaghetti No. 5",
        brands: "Barilla",
        quantity: "500 g",
        product_quantity: 500,
        product_quantity_unit: "g",
      },
    });
    expect(parsedOff).toMatchObject({
      barcode: "8076800195057",
      categoryId: "pasta_500g",
      packageAmount: 500,
      packageUnit: "g",
      source: "open_food_facts",
    });

    const offlineFetch: typeof fetch = async () => {
      throw new Error("Offline");
    };
    const fallbackProduct = await lookupBarcodeProduct("4008400404202", {
      fetchImpl: offlineFetch,
    });
    expect(fallbackProduct).toMatchObject({
      barcode: "4008400404202",
      categoryId: "butter_250g",
      packageAmount: 200,
      source: "offline_demo",
    });
    expect(fallbackProduct?.shrinkflationNote).toContain("200 g statt Norm 250 g");
  });

  it("extrahiert Angebotszeilen lokal aus unkomprimierten und FlateDecode-PDFs sowie HTML-Dateien", async () => {
    const lines = [
      "Kerrygold Original Irische Butter 250 g 1,39 EUR",
      "Barilla Spaghetti 500 g 0,99 EUR",
    ];
    // Unkomprimiertes PDF
    const plainPdf = buildTestPdf(lines, false);
    const plainText = await extractTextFromPdfBytes(plainPdf);
    expect(plainText).toContain("Kerrygold Original Irische Butter");
    expect(plainText).toContain("Barilla Spaghetti");

    // FlateDecode-komprimiertes PDF
    const compressedPdf = buildTestPdf(lines, true);
    const extracted = await extractBrochureTextFromFile({
      fileName: "wochenprospekt.pdf",
      bytes: compressedPdf,
      storeId: "lidl",
    });
    expect(extracted.fileType).toBe("pdf");
    const parsedBrochure = parseBrochureText({
      text: extracted.text.replace(/EUR/g, "€"),
      storeId: "lidl",
      referenceDate: "2026-11-18",
    });
    const matchedIds = parsedBrochure
      .filter((r) => r.matched && r.offer)
      .map((r) => r.offer?.categoryId);
    expect(matchedIds).toContain("butter_250g");
    expect(matchedIds).toContain("pasta_500g");

    // HTML-Prospektdatei mit JSON-LD
    const htmlBytes = new TextEncoder().encode(
      `<html><script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Weihenstephan Frische Vollmilch 1L",
        description: "1-l-Packung",
        offers: { "@type": "Offer", price: "1.09" },
      })}</script></html>`,
    );
    const htmlExtracted = await extractBrochureTextFromFile({
      fileName: "angebote.html",
      bytes: htmlBytes,
      storeId: "rewe",
    });
    expect(htmlExtracted.fileType).toBe("html");
    expect(htmlExtracted.text).toContain("Weihenstephan Frische Vollmilch");
  });

  it("cacht gescannte Barcodes in PGlite, speichert Regalpreise und liefert verifizierte Preishistorie", async () => {
    const db = await getDb();

    // 1. Erster Lookup über Offline-Demo -> schreibt in barcode_products
    const firstLookup = await lookupAndCacheBarcode(db, "4008400404127", {
      offlineOnly: true,
    });
    expect(firstLookup?.source).toBe("offline_demo");
    expect(firstLookup?.categoryId).toBe("butter_250g");

    // 2. Zweiter Lookup trifft den lokalen DB-Cache
    const cachedLookup = await lookupAndCacheBarcode(db, "4008400404127", {
      offlineOnly: true,
    });
    expect(cachedLookup?.source).toBe("db_cache");

    // 3. Gescannten Regalpreis speichern (inkl. Shrinkflation-Test mit 200 g Packung)
    const saved = await saveBarcodePriceObservation(db, {
      barcode: "4008400404202",
      productName: "Kerrygold Original Irische Butter (Aktionspackung)",
      brand: "Kerrygold",
      quantityText: "200 g",
      packageAmount: 200,
      packageUnit: "g",
      categoryId: "butter_250g",
      storeId: "rewe",
      zipCode: "50667",
      priceCents: 249,
      isOffer: false,
      observedDate: "2026-11-20",
    });

    expect(saved.shrinkflationWarning).not.toBeNull();
    expect(saved.customBasePrices["butter_250g"]?.rewe?.priceCents).toBe(249);

    const history = await getPriceHistorySummary(db, "2026-11-20");
    const verified = history.verifiedPrices[buildVerifiedKey("butter_250g", "rewe")];
    expect(verified).toMatchObject({
      categoryId: "butter_250g",
      storeId: "rewe",
      priceCents: 249,
      source: "barcode",
      packageAmount: 200,
    });
  });
});
