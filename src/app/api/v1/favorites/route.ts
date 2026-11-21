import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getFavoriteCategoryIds, saveFavoriteCategoryIds } from "@/lib/services/favorites";

const SaveFavoritesSchema = z.object({
  categoryIds: z.array(z.string().min(1)).max(120),
});

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    return NextResponse.json({ categoryIds: await getFavoriteCategoryIds(db) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Stammprodukte konnten nicht geladen werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  await connection();
  try {
    const parsed = SaveFavoritesSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Stammprodukte.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const db = await getDb();
    return NextResponse.json({ categoryIds: await saveFavoriteCategoryIds(db, parsed.data.categoryIds) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Stammprodukte konnten nicht gespeichert werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
