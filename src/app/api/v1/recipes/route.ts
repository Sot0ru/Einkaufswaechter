import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { deleteRecipe, listRecipes, saveRecipe } from "@/lib/services/recipes";

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const SaveRecipeRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  servings: z.number().int().min(1).max(20).default(4),
  prepMinutes: z.number().int().min(0).max(600).default(30),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  ingredients: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
});

const errorResponse = (error: unknown, message: string, status = 500) =>
  NextResponse.json(
    { error: message, message: error instanceof Error ? error.message : "Unbekannter Fehler" },
    { status },
  );

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    const recipes = await listRecipes(db, todayInGermany());
    return NextResponse.json({ recipes });
  } catch (error) {
    return errorResponse(error, "Gerichte konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const parsed = SaveRecipeRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Gericht-Daten.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const db = await getDb();
    const today = todayInGermany();
    const recipe = await saveRecipe(db, parsed.data, today);
    const recipes = await listRecipes(db, today);
    return NextResponse.json({ status: "ok", recipe, recipes });
  } catch (error) {
    return errorResponse(error, "Speichern des Gerichts fehlgeschlagen.");
  }
}

export async function DELETE(request: Request) {
  await connection();
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Gericht-ID (id) fehlt." }, { status: 400 });
    }
    const db = await getDb();
    const deleted = await deleteRecipe(db, id);
    const recipes = await listRecipes(db, todayInGermany());
    return NextResponse.json({ status: "ok", deleted, recipes });
  } catch (error) {
    return errorResponse(error, "Löschen des Gerichts fehlgeschlagen.");
  }
}
