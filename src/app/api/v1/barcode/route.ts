import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { isValidBarcode, normalizeBarcode } from "@/lib/providers/barcode-lookup";
import { STORES, type StoreId } from "@/lib/rules/catalog";
import {
  lookupAndCacheBarcode,
  saveBarcodePriceObservation,
} from "@/lib/services/price-history";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const SaveBarcodeSchema = z.object({
  barcode: z.string().min(8).max(18),
  productName: z.string().min(2).max(160),
  brand: z.string().max(100).nullable().optional(),
  quantityText: z.string().max(60).nullable().optional(),
  packageAmount: z.number().int().positive().nullable().optional(),
  packageUnit: z.enum(["g", "ml", "stueck"]).nullable().optional(),
  categoryId: z.string().min(2),
  storeId: z.enum(validStoreIds),
  zipCode: z.string().regex(/^\d{5}$/).default("10115"),
  priceCents: z.number().int().min(10).max(50000),
  isOffer: z.boolean().default(false),
  observedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get("code") ?? "";
    const barcode = normalizeBarcode(rawCode);

    if (!isValidBarcode(barcode)) {
      return NextResponse.json(
        {
          error:
            "Ungültiger Barcode. Bitte eine gültige EAN-8-, EAN-13- oder GTIN-14-Nummer eingeben.",
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    const product = await lookupAndCacheBarcode(db, barcode);
    if (!product) {
      return NextResponse.json(
        {
          status: "not_found",
          barcode,
          message: "Produkt wurde in Open Food Facts nicht gefunden. Du kannst es manuell zuordnen.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "ok",
      product,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Barcode-Abfrage fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = SaveBarcodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Barcode-Preisdaten.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    const result = await saveBarcodePriceObservation(db, {
      ...parsed.data,
      observedDate: parsed.data.observedDate ?? todayInGermany(),
    });

    return NextResponse.json({
      status: "ok",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Barcode-Preis konnte nicht gespeichert werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
