import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@/db";
import {
  extractOffersFromEmbeddedJson,
  extractOffersFromHtmlCards,
  extractOffersFromJsonLd,
  extractRawOffersFromDocument,
  getChainScrapeTargets,
  isAntiBotChallengePage,
  matchScrapedRawOffers,
  scrapeChainsForZip,
} from "@/lib/providers/chain-scrapers";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";

describe("7-Ketten Live-Scraper-Engine (chain-scrapers.ts)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("wählt nach dem Aldi-Äquator für Nord- und Süd-PLZ die passende Aldi-URL und alle 7 Ketten", () => {
    const berlinTargets = getChainScrapeTargets("10115");
    expect(berlinTargets).toHaveLength(7);
    const aldiBerlin = berlinTargets.find((t) => t.storeId === "aldi");
    expect(aldiBerlin?.storeName).toBe("Aldi Nord");
    expect(aldiBerlin?.url).toContain("aldi-nord.de");

    const muensterTargets = getChainScrapeTargets("48143");
    expect(muensterTargets.find((t) => t.storeId === "aldi")?.url).toContain("aldi-nord.de");

    const munichTargets = getChainScrapeTargets("80331");
    const aldiMunich = munichTargets.find((t) => t.storeId === "aldi");
    expect(aldiMunich?.storeName).toBe("Aldi Süd");
    expect(aldiMunich?.url).toContain("aldi-sued.de");

    const subset = getChainScrapeTargets("50667", ["lidl", "aldi", "rewe"]);
    expect(subset.map((t) => t.storeId)).toEqual(["lidl", "aldi", "rewe"]);
    expect(subset.find((t) => t.storeId === "aldi")?.url).toContain("aldi-sued.de");
  });

  it("extrahiert strukturierte Angebote aus schema.org JSON-LD (@graph & Treue-App-Preise)", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Product",
                  "name": "Kerrygold Original Irische Butter 250g",
                  "description": "250-g-Packung (1 kg = 5,56 €)",
                  "offers": [
                    {
                      "@type": "Offer",
                      "price": "1.39",
                      "priceCurrency": "EUR",
                      "validFrom": "2026-11-16",
                      "validThrough": "2026-11-21"
                    },
                    {
                      "@type": "Offer",
                      "name": "Mit Lidl Plus App",
                      "price": "1.25",
                      "priceCurrency": "EUR"
                    }
                  ]
                },
                {
                  "@type": "Product",
                  "name": "Weihenstephan Frische Vollmilch 3,5% 1L",
                  "description": "1-l-Packung ab Donnerstag",
                  "offers": {
                    "@type": "Offer",
                    "price": 1.09
                  }
                }
              ]
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const rawOffers = extractOffersFromJsonLd(html, "lidl");
    expect(rawOffers).toHaveLength(2);
    expect(rawOffers[0]).toMatchObject({
      storeId: "lidl",
      priceCents: 139,
      loyaltyPriceCents: 125,
      validFrom: "2026-11-16",
      validTo: "2026-11-21",
      extractor: "json_ld",
    });
    expect(rawOffers[1]).toMatchObject({
      storeId: "lidl",
      priceCents: 109,
      loyaltyPriceCents: null,
      validityWindow: "do_sa",
    });

    const matched = matchScrapedRawOffers(rawOffers, "10115", "2026-11-18");
    expect(matched).toHaveLength(2);
    expect(matched.find((m) => m.categoryId === "butter_250g")).toMatchObject({
      priceCents: 139,
      loyaltyPriceCents: 125,
      validFrom: "2026-11-16",
    });
    expect(matched.find((m) => m.categoryId === "vollmilch_1l")).toMatchObject({
      priceCents: 109,
      validFrom: "2026-11-19",
    });
  });

  it("extrahiert Angebote aus eingebettetem __NEXT_DATA__ JSON inkl. App-Preisen", () => {
    const html = `
      <html>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "weeklyOffers": [
                    {
                      "productName": "Barilla Spaghetti No. 5",
                      "packaging": "500-g-Packung",
                      "currentPrice": "0.99",
                      "appPrice": "0.85",
                      "startDate": "2026-11-16",
                      "endDate": "2026-11-21"
                    },
                    {
                      "title": "Lavazza Caffè Crema ganze Bohnen 1kg",
                      "description": "1-kg-Beutel",
                      "price": { "value": 11.49 },
                      "cardPrice": "10.99"
                    }
                  ]
                }
              }
            }
          </script>
        </body>
      </html>
    `;

    const { rawOffers, extractorUsed } = extractRawOffersFromDocument(html, "kaufland");
    expect(extractorUsed).toBe("embedded_json");
    expect(rawOffers).toHaveLength(2);

    const directJsonOffers = extractOffersFromEmbeddedJson(
      JSON.stringify([
        {
          title: "Kerrygold Original Irische Butter 250g",
          description: "250-g-Packung",
          priceCents: 149,
          loyaltyPriceCents: 135,
        },
      ]),
      "kaufland",
    );
    expect(directJsonOffers).toHaveLength(1);
    expect(directJsonOffers[0].loyaltyPriceCents).toBe(135);

    const matched = matchScrapedRawOffers(rawOffers, "60311", "2026-11-18");
    expect(matched.find((m) => m.categoryId === "pasta_500g")).toMatchObject({
      priceCents: 99,
      loyaltyPriceCents: 85,
    });
    expect(matched.find((m) => m.categoryId === "kaffeebohnen_1kg")).toMatchObject({
      priceCents: 1149,
      loyaltyPriceCents: 1099,
    });
  });

  it("extrahiert Angebote aus HTML-Angebotskacheln, ignoriert Grundpreise in Klammern und erkennt Do–Sa", () => {
    const html = `
      <section>
        <article class="offer-card" data-product-title="Bio Bananen Fairtrade 1 kg">
          <h3>Bio Bananen Fairtrade 1 kg</h3>
          <p>ab Donnerstag (1 kg = 1,49 €) Super-Wochenende</p>
          <span class="price">1,49 €</span>
          <span class="app-price">Mit Rewe Bonus App 1,29 €</span>
        </article>
        <article class="offer-card">
          <h3>Oatly Haferdrink Barista Edition 1L</h3>
          <p>1-l-Packung (1 L = 1,69 €)</p>
          <span class="price">1,69 €</span>
        </article>
      </section>
    `;

    const rawOffers = extractOffersFromHtmlCards(html, "rewe");
    expect(rawOffers).toHaveLength(2);
    expect(rawOffers[0]).toMatchObject({
      priceCents: 149,
      loyaltyPriceCents: 129,
      validityWindow: "do_sa",
      extractor: "html_cards",
    });

    const matched = matchScrapedRawOffers(rawOffers, "50667", "2026-11-18");
    expect(matched.find((m) => m.categoryId === "bananen_1kg")?.priceCents).toBe(149);
    expect(matched.find((m) => m.categoryId === "haferdrink_1l")?.priceCents).toBe(169);
  });

  it("erkennt Anti-Bot-/CAPTCHA-Seiten strikt ohne Bypass und meldet Status pro Kette transparent", async () => {
    expect(isAntiBotChallengePage("<html>Access Denied - cf-turnstile</html>", 200)).toBe(true);
    expect(isAntiBotChallengePage("<html>ok</html>", 403)).toBe(true);
    expect(isAntiBotChallengePage("<html><h1>Angebote der Woche</h1></html>", 200)).toBe(false);

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("lidl.de")) {
        return new Response(
          `<html><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "Milbona Deutsche Markenbutter 250g",
            description: "250-g-Packung",
            offers: { "@type": "Offer", price: "1.29" },
          })}</script></html>`,
          { status: 200 },
        );
      }
      if (url.includes("rewe.de")) {
        return new Response("<html><title>Verify you are human - Cloudflare</title></html>", {
          status: 403,
        });
      }
      if (url.includes("edeka.de")) {
        throw new Error("ECONNREFUSED");
      }
      return new Response("<html><body><div id='app'>Loading...</div></body></html>", {
        status: 200,
      });
    };

    const result = await scrapeChainsForZip({
      zipCode: "80331",
      referenceDate: "2026-11-18",
      stores: ["lidl", "rewe", "edeka", "aldi"],
      fetchImpl: mockFetch,
    });

    expect(result.liveChainCount).toBe(1);
    expect(result.totalMatchedCount).toBe(1);
    expect(result.chainStatuses.find((s) => s.storeId === "lidl")?.status).toBe("live_scraped");
    expect(result.chainStatuses.find((s) => s.storeId === "rewe")?.status).toBe("blocked");
    expect(result.chainStatuses.find((s) => s.storeId === "edeka")?.status).toBe("error");
    expect(result.chainStatuses.find((s) => s.storeId === "aldi")?.status).toBe("empty");
  });

  it("kombiniert in syncOffersForZipCode Live-Scraping mit Regional-Fallback und protokolliert live_scraped in PGlite", async () => {
    const db = await getDb();

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("aldi-sued.de")) {
        return new Response(
          `<html><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "Milsani Deutsche Markenbutter 250g",
            description: "250-g-Packung",
            offers: { "@type": "Offer", price: "1.19" },
          })}</script></html>`,
          { status: 200 },
        );
      }
      return new Response("<html>Access Denied</html>", { status: 403 });
    };

    const syncResult = await syncOffersForZipCode(db, {
      zipCode: "80331",
      referenceDate: "2026-11-18",
      enableLiveScraping: true,
      fetchImpl: mockFetch,
    });

    expect(syncResult.source).toBe("live_scraped");
    expect(syncResult.liveChainCount).toBe(1);
    expect(syncResult.liveScrapedOfferCount).toBe(1);
    expect(syncResult.chainStatuses).toHaveLength(7);

    // Live-gescraptes Aldi-Süd-Angebot muss in weekly_offers angekommen sein
    const liveButter = syncResult.offers.find(
      (o) => o.storeId === "aldi" && o.categoryId === "butter_250g" && o.priceCents === 119,
    );
    expect(liveButter).toBeDefined();

    // Blockierte Ketten müssen weiterhin Regional-Fallback-Angebote enthalten
    const fallbackRewe = syncResult.offers.some((o) => o.storeId === "rewe");
    expect(fallbackRewe).toBe(true);

    // Protokollierung in offer_fetch_runs prüfen
    const runs = await db.select().from(schema.offerFetchRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].source).toBe("live_scraped");
    expect(runs[0].zipCode).toBe("80331");
  });
});
