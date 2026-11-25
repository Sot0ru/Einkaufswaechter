import { like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@/db";
import {
  buildOpenPricesSyncArtifacts,
  fetchOpenPricesByBarcode,
  fetchOpenPricesForZip,
  matchOpenPriceItem,
  type OpenPricesApiItem,
  parseDecimalEuroToCents,
} from "@/lib/providers/open-prices";
import { extractBrochureTextFromFile } from "@/lib/providers/pdf-brochure-parser";
import { parseStructuredCsvProductFeed } from "@/lib/providers/product-feed-parser";
import { parseReceiptText } from "@/lib/providers/receipt-importer";
import { fetchAndMatchOffersForZip } from "@/lib/providers/zip-offer-fetcher";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { optimizeShoppingBasket } from "@/lib/rules/optimizer";
import { assessOfferConfidence, assessResolvedItemConfidence } from "@/lib/rules/price-intelligence";
import { getPriceHistorySummary } from "@/lib/services/price-history";

const SAMPLE_OPEN_PRICES_ITEMS: OpenPricesApiItem[] = [
  {
    id: 1001,
    type: "PRODUCT",
    product_code: "4008400404127",
    price: "1.490",
    price_is_discounted: true,
    price_without_discount: "2.390",
    discount_type: "LOYALTY_PROGRAM",
    currency: "EUR",
    date: "2026-11-20",
    product: {
      code: "4008400404127",
      product_name: "Original Irische Butter",
      brands: "Kerrygold",
      quantity: "250 g",
      product_quantity: 250,
      product_quantity_unit: "g",
    },
    location: {
      osm_id: 123456,
      osm_type: "NODE",
      osm_name: "Lidl",
      osm_brand: "Lidl",
      osm_address_postcode: "10115",
      osm_address_city: "Berlin",
      osm_address_country_code: "DE",
    },
  },
  {
    id: 1002,
    type: "CATEGORY",
    category_tag: "en:bananas",
    price: 1.19,
    price_is_discounted: false,
    price_per: "KILOGRAM",
    currency: "EUR",
    date: "2026-11-19",
    product: null,
    location: {
      osm_id: 234567,
      osm_type: "WAY",
      osm_name: "REWE Markt",
      osm_brand: "REWE",
      osm_address_postcode: "10117",
      osm_address_city: "Berlin",
      osm_address_country_code: "DE",
    },
  },
  {
    id: 1003,
    type: "PRODUCT",
    product_code: "4008452014008",
    price: "0.990",
    price_is_discounted: false,
    currency: "EUR",
    date: "2026-11-18",
    product: {
      code: "4008452014008",
      product_name: "Milbona Frische Vollmilch 3,5%",
      brands: "Milbona",
      quantity: "1 l",
    },
    location: {
      osm_id: 123456,
      osm_type: "NODE",
      osm_name: "Lidl",
      osm_brand: "Lidl",
      osm_address_postcode: "10115",
      osm_address_city: "Berlin",
      osm_address_country_code: "DE",
    },
  },
  {
    // Ungültig: USD statt EUR + null product -> muss sauber ignoriert werden
    id: 1004,
    type: "PRODUCT",
    price: "2.50",
    currency: "USD",
    date: "2026-11-20",
    product: null,
    location: null,
  },
];

describe("Open Prices Provider (Open Food Facts)", () => {
  it("parst Dezimal-Euro-Preise als Zahl oder String sicher in Cent", () => {
    expect(parseDecimalEuroToCents("1.490")).toBe(149);
    expect(parseDecimalEuroToCents(2.29)).toBe(229);
    expect(parseDecimalEuroToCents("0,99")).toBe(99);
    expect(parseDecimalEuroToCents(0)).toBeNull();
    expect(parseDecimalEuroToCents("abc")).toBeNull();
    expect(parseDecimalEuroToCents(null)).toBeNull();
  });

  it("matcht Open-Prices-Einträge inkl. Loyalty-Rabatt und loser Kategorie-Ware sicher", () => {
    const butter = matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[0], true);
    expect(butter).not.toBeNull();
    expect(butter?.storeId).toBe("lidl");
    expect(butter?.categoryId).toBe("butter_250g");
    expect(butter?.priceCents).toBe(239);
    expect(butter?.loyaltyPriceCents).toBe(149);
    expect(butter?.isDiscounted).toBe(true);

    const bananas = matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[1], true);
    expect(bananas).not.toBeNull();
    expect(bananas?.storeId).toBe("rewe");
    expect(bananas?.categoryId).toBe("bananen_1kg");
    expect(bananas?.priceCents).toBe(119);
    expect(bananas?.packageAmount).toBe(1000);
    expect(bananas?.packageUnit).toBe("g");

    const milk = matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[2], true);
    expect(milk).not.toBeNull();
    expect(milk?.storeId).toBe("lidl");
    expect(milk?.categoryId).toBe("vollmilch_1l");
    expect(milk?.isStoreBrand).toBe(true);

    // Null-Guards & Fremdwährung
    expect(matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[3], false)).toBeNull();
  });

  it("bevorzugt lokale Beobachtungen gegenüber bundesweiten und kalibriert Normalpreise konservativ", () => {
    const localButter = matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[0], true)!;
    const distantButter = matchOpenPriceItem(
      {
        ...SAMPLE_OPEN_PRICES_ITEMS[0],
        id: 2001,
        price: "1.990",
        date: "2026-11-21",
        location: {
          ...SAMPLE_OPEN_PRICES_ITEMS[0].location!,
          osm_address_city: "München",
        },
      },
      false,
    )!;
    const milk = matchOpenPriceItem(SAMPLE_OPEN_PRICES_ITEMS[2], true)!;

    const artifacts = buildOpenPricesSyncArtifacts({
      entries: [distantButter, localButter, milk],
      zipCode: "10115",
      referenceDate: "2026-11-21",
    });

    const butterOffer = artifacts.offers.find((o) => o.categoryId === "butter_250g");
    expect(butterOffer?.loyaltyPriceCents).toBe(149);
    expect(butterOffer?.title).toContain("Berlin");

    // Eigenmarken-Vollmilch (nicht rabattiert) erzeugt eine Basispreis-Kalibrierung
    const milkCal = artifacts.baseCalibrations.find((c) => c.categoryId === "vollmilch_1l");
    expect(milkCal?.priceCents).toBe(99);
    expect(artifacts.localMatchedCount).toBe(2);
  });

  it("ruft Open Prices per PLZ & Barcode mit gemocktem fetch ab und fällt offline sauber zurück", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(JSON.stringify([{ lat: "52.5326", lon: "13.3847", display_name: "10115, Berlin" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("product_code=4008400404127")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 501,
                price: "2.49",
                currency: "EUR",
                date: "2026-11-20",
                location: { osm_brand: "Carrefour", osm_address_city: "Paris", osm_address_country_code: "FR" },
              },
              SAMPLE_OPEN_PRICES_ITEMS[0],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ items: SAMPLE_OPEN_PRICES_ITEMS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const zipRes = await fetchOpenPricesForZip({
      zipCode: "10115",
      referenceDate: "2026-11-21",
      fetchImpl: mockFetch,
    });
    expect(zipRes.source).toBe("open_prices_live");
    expect(zipRes.matchedCount).toBe(3);
    expect(zipRes.offers.some((o) => o.id.startsWith("openprices-lidl-butter_250g"))).toBe(true);

    const barcodeRes = await fetchOpenPricesByBarcode("4008400404127", { fetchImpl: mockFetch });
    expect(barcodeRes.source).toBe("open_prices_live");
    expect(barcodeRes.sightings.length).toBe(2);
    // Deutscher Lidl-Treffer muss vor dem französischen Eintrag sortiert sein
    expect(barcodeRes.sightings[0].storeId).toBe("lidl");
    expect(barcodeRes.sightings[0].priceCents).toBe(149);

    const offlineRes = await fetchOpenPricesForZip({
      zipCode: "10115",
      referenceDate: "2026-11-21",
      offlineOnly: true,
    });
    expect(offlineRes.source).toBe("offline");
    expect(offlineRes.offers).toHaveLength(0);
  });
});

describe("Strukturierter Produktfeed-Parser (Awin / TradeTracker CSV & TSV)", () => {
  it("parst Awin-CSV-Feeds inkl. Anführungszeichen und bindet sie an OFFER_FEED_URL an", async () => {
    const awinCsv = [
      "merchant_name,brand_name,product_name,search_price,description,ean",
      'Lidl.de,Kerrygold,"Original Irische Butter, mild gesäuert",1.49,"250 g Packung",4008400404127',
      'Kaufland.de,Barilla,"Spaghetti No. 5",0.89,"500 g Packung",8076800195057',
      'UnbekannterShop,Test,"Irgendwas",9.99,"100 g",12345678',
    ].join("\n");

    const parsed = parseStructuredCsvProductFeed(awinCsv);
    expect(parsed.format).toBe("csv");
    expect(parsed.parsedOffers).toHaveLength(2);
    expect(parsed.parsedOffers[0].storeId).toBe("lidl");
    expect(parsed.parsedOffers[0].priceCents).toBe(149);
    expect(parsed.parsedOffers[1].storeId).toBe("kaufland");
    expect(parsed.parsedOffers[1].priceCents).toBe(89);

    // Integration in fetchAndMatchOffersForZip über OFFER_FEED_URL
    const feedResult = await fetchAndMatchOffersForZip({
      zipCode: "10115",
      referenceDate: "2026-11-21",
      feedUrl: "https://feeds.example.test/awin-grocery.csv",
      fetchImpl: async () =>
        new Response(awinCsv, {
          status: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        }),
    });
    expect(feedResult.source).toBe("remote_feed");
    expect(feedResult.matchedCount).toBe(2);
    expect(feedResult.offers.some((o) => o.categoryId === "butter_250g" && o.storeId === "lidl")).toBe(
      true,
    );
  });

  it("extrahiert deutsche Semikolon-CSV-Dateien lokal über extractBrochureTextFromFile", async () => {
    const deCsv = [
      "Kette;Produktname;Menge;Preis",
      "Netto Marken-Discount;Melitta Auslese Filterkaffee;500 g;3,99 €",
      "Netto Marken-Discount;Oatly Haferdrink Barista;1 l;1,59 €",
    ].join("\n");

    const extracted = await extractBrochureTextFromFile({
      fileName: "netto-feed.csv",
      bytes: new TextEncoder().encode(deCsv),
      storeId: "netto",
    });
    expect(extracted.fileType).toBe("csv");
    expect(extracted.lineCount).toBe(2);
    expect(extracted.text).toContain("3,99 €");
  });
});

describe("Erweiterter deutscher E-Bon-Parser (Lidl Plus & Rewe eBon)", () => {
  it("erkennt Lidl-Plus-Preis-zuerst-Mengenzeilen (0,99 x 2) und Rewe-eBon-Steuerflags (B*)", () => {
    const eBonText = `REWE Markt GmbH
Hauptstr. 10
50667 Köln
Datum: 20.11.2026

REWE B. HAFERDR. NATUR 1L
  0,99 x 2                         1,98 B*
JA! DT. MARKENBUTT. 250G           1,89 A*
K-BIO SPAGH. 500G                  1,19 A
  REWE BONUS RABATT               -0,20 A
PAYBACK PUNKTE                       12
SUMME EUR                          4,86
APPLE PAY                          4,86`;

    const parsed = parseReceiptText({ text: eBonText });
    expect(parsed.detectedStoreId).toBe("rewe");
    expect(parsed.detectedZipCode).toBe("50667");
    expect(parsed.items).toHaveLength(3);

    const oatDrink = parsed.items[0];
    expect(oatDrink.quantity).toBe(2);
    expect(oatDrink.effectivePriceCents).toBe(99);
    expect(oatDrink.categoryId).toBe("haferdrink_1l");

    const butter = parsed.items[1];
    expect(butter.categoryId).toBe("butter_250g");
    expect(butter.effectivePriceCents).toBe(189);

    const pasta = parsed.items[2];
    expect(pasta.categoryId).toBe("pasta_500g");
    expect(pasta.effectivePriceCents).toBe(99);
    expect(pasta.usedLoyaltyApp).toBe(true);
  });
});

describe("Open Prices Datenbank-Sync & Preiskonfidenz", () => {
  it("persistiert Open-Prices-Angebote und -Beobachtungen idempotent in der DB", async () => {
    resetDbForTests();
    const db = await getDb();
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([{ lat: "52.5326", lon: "13.3847", display_name: "10115, Berlin" }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ items: SAMPLE_OPEN_PRICES_ITEMS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const run1 = await syncOffersForZipCode(db, {
      zipCode: "10115",
      referenceDate: "2026-11-21",
      enableLiveScraping: false,
      enableOpenPrices: true,
      fetchImpl: mockFetch,
    });
    expect(run1.source).toBe("open_prices");
    expect(run1.openPricesMatchedCount).toBe(3);
    expect(run1.openPricesOfferCount).toBeGreaterThanOrEqual(2);

    // Zweiter Lauf darf [OP:...]-Beobachtungen nicht duplizieren
    await syncOffersForZipCode(db, {
      zipCode: "10115",
      referenceDate: "2026-11-21",
      enableLiveScraping: false,
      enableOpenPrices: true,
      fetchImpl: mockFetch,
    });

    const opRows = await db
      .select()
      .from(schema.receiptObservations)
      .where(like(schema.receiptObservations.rawLabel, "[OP:%"));
    expect(opRows.length).toBe(3);

    const history = await getPriceHistorySummary(db, "2026-11-21");
    expect(history.verifiedPrices["butter_250g:lidl"]?.source).toBe("open_prices");

    const openPricesOffer = run1.offers.find((o) => o.id.startsWith("openprices-lidl-butter_250g"))!;
    const offerConfidence = assessOfferConfidence(
      openPricesOffer,
      "2026-11-21",
      history.verifiedPrices["butter_250g:lidl"],
    );
    expect(offerConfidence.source).toBe("open_prices");
    expect(offerConfidence.label).toContain("Open Prices");

    const opt = optimizeShoppingBasket({
      items: [{ categoryId: "vollmilch_1l", quantity: 1 }],
      enabledStores: ["lidl"],
      enabledLoyaltyApps: [],
      shoppingDate: "2026-11-21",
      secondStoreThresholdCents: 500,
      offers: [],
    });
    const milkItem = opt.singleStoreRankings[0].items[0];
    const itemConfidence = assessResolvedItemConfidence({
      item: milkItem,
      isUserCustomized: false,
      verifiedRecord: history.verifiedPrices["vollmilch_1l:lidl"],
      referenceDate: "2026-11-21",
    });
    expect(itemConfidence.source).toBe("open_prices");
  });
});
