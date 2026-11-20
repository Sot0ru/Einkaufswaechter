import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import {
  extractRawOffersFromDocument,
  matchScrapedRawOffers,
} from "@/lib/providers/chain-scrapers";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { STORES, type StoreId } from "@/lib/rules/catalog";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const ScrapeRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("live_chains"),
    zipCode: z.string().regex(/^\d{5}$/).default("10115"),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    stores: z.array(z.enum(validStoreIds)).optional(),
  }),
  z.object({
    mode: z.literal("html_document"),
    storeId: z.enum(validStoreIds),
    zipCode: z.string().regex(/^\d{5}$/).default("10115"),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    documentContent: z.string().min(20).max(500000),
  }),
]);

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = ScrapeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Scraping-Anfrage.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    const referenceDate = parsed.data.referenceDate ?? todayInGermany();

    if (parsed.data.mode === "live_chains") {
      const result = await syncOffersForZipCode(db, {
        zipCode: parsed.data.zipCode,
        referenceDate,
        stores: parsed.data.stores,
        enableLiveScraping: true,
      });

      return NextResponse.json({
        status: "ok",
        mode: "live_chains",
        ...result,
      });
    }

    // Modus B: Direktes Extrahieren aus kopiertem HTML / JSON-LD / __NEXT_DATA__
    await ensureCatalogAndDemoOffers(db, referenceDate);
    const { rawOffers, extractorUsed } = extractRawOffersFromDocument(
      parsed.data.documentContent,
      parsed.data.storeId,
    );
    const matchedOffers = matchScrapedRawOffers(
      rawOffers,
      parsed.data.zipCode,
      referenceDate,
    );

    for (const offer of matchedOffers) {
      const dbOfferId = `${offer.id}-${offer.validFrom}`;
      await db
        .insert(schema.weeklyOffers)
        .values({
          id: dbOfferId,
          storeId: offer.storeId,
          zipCode: parsed.data.zipCode,
          categoryId: offer.categoryId,
          title: offer.title,
          priceCents: offer.priceCents,
          loyaltyPriceCents: offer.loyaltyPriceCents,
          requiresLoyaltyApp: offer.requiresLoyaltyApp,
          packageAmount: offer.packageAmount,
          packageUnit: offer.packageUnit,
          validFrom: offer.validFrom,
          validTo: offer.validTo,
        })
        .onConflictDoUpdate({
          target: schema.weeklyOffers.id,
          set: {
            title: offer.title,
            priceCents: offer.priceCents,
            loyaltyPriceCents: offer.loyaltyPriceCents,
            packageAmount: offer.packageAmount,
          },
        });
    }

    return NextResponse.json({
      status: "ok",
      mode: "html_document",
      storeId: parsed.data.storeId,
      zipCode: parsed.data.zipCode,
      extractorUsed,
      extractedRawCount: rawOffers.length,
      matchedCount: matchedOffers.length,
      offers: matchedOffers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Angebots-Scraping fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
