import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { STORES, type StoreId } from "@/lib/rules/catalog";
import {
  getCustomBasePricesMap,
  resetStoreBasePriceToDefault,
  updateStoreBasePrice,
} from "@/lib/services/base-prices";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const BasePriceMutationSchema = z.object({
  categoryId: z.string().min(1),
  storeId: z.enum(validStoreIds),
  priceCents: z.number().int().min(10).max(25000).optional(),
  productLabel: z.string().min(2).max(120).optional(),
  resetToDefault: z.boolean().optional().default(false),
});

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    const customBasePrices = await getCustomBasePricesMap(db);
    return NextResponse.json({ customBasePrices });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Basispreise konnten nicht geladen werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

async function handleBasePriceMutation(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = BasePriceMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Basispreis-Daten.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    if (parsed.data.resetToDefault) {
      const defaultEntry = await resetStoreBasePriceToDefault(db, {
        categoryId: parsed.data.categoryId,
        storeId: parsed.data.storeId,
      });
      const customBasePrices = await getCustomBasePricesMap(db);
      return NextResponse.json({
        status: "ok",
        updated: {
          categoryId: parsed.data.categoryId,
          storeId: parsed.data.storeId,
          priceCents: defaultEntry.priceCents,
          productLabel: defaultEntry.productLabel,
          isCustom: false,
        },
        customBasePrices,
      });
    }

    if (parsed.data.priceCents == null) {
      return NextResponse.json(
        { error: "Bitte einen gültigen Preis in Cent (priceCents) angeben." },
        { status: 400 },
      );
    }

    const updated = await updateStoreBasePrice(db, {
      categoryId: parsed.data.categoryId,
      storeId: parsed.data.storeId,
      priceCents: parsed.data.priceCents,
      productLabel: parsed.data.productLabel,
    });
    const customBasePrices = await getCustomBasePricesMap(db);

    return NextResponse.json({
      status: "ok",
      updated,
      customBasePrices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Basispreis-Korrektur fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  return handleBasePriceMutation(request);
}

export async function POST(request: Request) {
  return handleBasePriceMutation(request);
}
