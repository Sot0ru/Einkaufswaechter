import { NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { STORES, type StoreId } from "@/lib/rules/catalog";
import { optimizeShoppingBasket } from "@/lib/rules/optimizer";
import { getCustomBasePricesMap } from "@/lib/services/base-prices";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const OptimizeRequestSchema = z.object({
  items: z.array(
    z.object({
      categoryId: z.string().min(1),
      quantity: z.number().int().min(1).max(50),
    }),
  ),
  enabledStores: z.array(z.enum(validStoreIds)).min(1),
  enabledLoyaltyApps: z.array(z.enum(validStoreIds)).default([]),
  shoppingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  secondStoreThresholdCents: z.number().int().min(0).max(10000).default(500),
  zipCode: z.string().regex(/^\d{5}$/).default("10115"),
});

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = OptimizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage-Daten.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [syncResult, customBasePrices] = await Promise.all([
      syncOffersForZipCode(db, {
        zipCode: parsed.data.zipCode,
        referenceDate: parsed.data.shoppingDate,
      }),
      getCustomBasePricesMap(db),
    ]);
    const result = optimizeShoppingBasket({
      ...parsed.data,
      offers: syncResult.offers,
      customBasePrices,
    });

    return NextResponse.json({
      ...result,
      zipCode: syncResult.zipCode,
      region: syncResult.region,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Optimierung fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
