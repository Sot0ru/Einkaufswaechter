import { NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ensureCatalogAndDemoOffers } from "@/db/seed";
import { parseBrochureText } from "@/lib/providers/text-importer";
import { STORES, type StoreId } from "@/lib/rules/catalog";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const ImportRequestSchema = z.object({
  text: z.string().min(1).max(20000),
  storeId: z.enum(validStoreIds),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zipCode: z.string().min(4).max(10).default("10115"),
});

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = ImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Prospekt-Daten.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    await ensureCatalogAndDemoOffers(db, parsed.data.referenceDate);

    const results = parseBrochureText({
      text: parsed.data.text,
      storeId: parsed.data.storeId,
      referenceDate: parsed.data.referenceDate,
    });

    const matchedOffers = results
      .filter((r) => r.matched && r.offer != null)
      .map((r) => r.offer!);

    for (const offer of matchedOffers) {
      await db
        .insert(schema.weeklyOffers)
        .values({
          id: `${offer.id}-${offer.validFrom}`,
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
            requiresLoyaltyApp: offer.requiresLoyaltyApp,
            packageAmount: offer.packageAmount,
          },
        });
    }

    return NextResponse.json({
      totalLines: results.length,
      matchedCount: matchedOffers.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Prospekt-Import fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
