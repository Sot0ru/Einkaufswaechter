import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { STORES, type StoreId } from "@/lib/rules/catalog";
import {
  importReceiptObservations,
  listReceiptAliases,
} from "@/lib/services/receipts";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const ReceiptImportRequestSchema = z.object({
  storeId: z.enum(validStoreIds),
  zipCode: z.string().regex(/^\d{5}$/).default("10115"),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        rawLabel: z.string().min(2).max(160),
        categoryId: z.string().min(1),
        regularPriceCents: z.number().int().min(10).max(25000),
        effectivePriceCents: z.number().int().min(10).max(25000),
        isOffer: z.boolean().default(false),
        usedLoyaltyApp: z.boolean().default(false),
        updateBasePrice: z.boolean().default(false),
        learnAlias: z.boolean().optional().default(false),
        packageAmount: z.number().int().positive().nullable().optional(),
        packageUnit: z.enum(["g", "ml", "stueck"]).nullable().optional(),
      }),
    )
    .min(1),
});

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    const [aliases, observationRows] = await Promise.all([
      listReceiptAliases(db),
      db.select({ id: schema.receiptObservations.id }).from(schema.receiptObservations),
    ]);

    return NextResponse.json({
      aliases,
      observationCount: observationRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Kassenbon-Daten konnten nicht geladen werden.",
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
    const parsed = ReceiptImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Kassenbon-Daten.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    const result = await importReceiptObservations(db, parsed.data);

    return NextResponse.json({
      status: "ok",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Kassenbon-Import fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
