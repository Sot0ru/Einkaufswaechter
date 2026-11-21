import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  deleteShoppingList,
  listSavedShoppingLists,
  saveShoppingList,
} from "@/lib/services/shopping-lists";

const SaveListRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  zipCode: z.string().regex(/^\d{5}$/).default("10115"),
  shoppingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  secondStoreThresholdCents: z.number().int().min(0).max(10000).default(500),
  items: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        checked: z.boolean().optional().default(false),
      }),
    )
    .min(1),
});

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    const lists = await listSavedShoppingLists(db);
    return NextResponse.json({ lists });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Einkaufslisten konnten nicht geladen werden.",
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
    const parsed = SaveListRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Einkaufslisten-Daten.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await getDb();
    const list = await saveShoppingList(db, parsed.data);
    const lists = await listSavedShoppingLists(db);
    return NextResponse.json({ status: "ok", list, lists });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Speichern der Einkaufsliste fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  await connection();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json(
        { error: "Listen-ID (id) fehlt." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const deleted = await deleteShoppingList(db, id);
    const lists = await listSavedShoppingLists(db);
    return NextResponse.json({ status: "ok", deleted, lists });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Löschen der Einkaufsliste fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
