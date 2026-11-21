import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { createHouseholdShare } from "@/lib/services/household-shares";

const CreateShareRequestSchema = z.object({
  listId: z.string().uuid(),
  validDays: z.number().int().min(1).max(60).optional(),
});

/** Erzeugt einen Teilen-Code für eine gespeicherte Liste (ohne Konto, Code läuft ab) */
export async function POST(request: Request) {
  await connection();
  try {
    const parsed = CreateShareRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage zum Teilen.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const db = await getDb();
    const share = await createHouseholdShare(db, parsed.data);
    return NextResponse.json({ status: "ok", ...share });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Die Liste konnte nicht geteilt werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 400 },
    );
  }
}
