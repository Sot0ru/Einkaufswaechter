import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  getSharedList,
  ShareNotFoundError,
  syncSharedListChecks,
} from "@/lib/services/household-shares";

const SyncRequestSchema = z.object({
  changes: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        checked: z.boolean(),
        changedAt: z.string().datetime({ offset: true }),
      }),
    )
    .max(300),
});

const failure = (error: unknown) => {
  if (error instanceof ShareNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(
    {
      error: "Die geteilte Liste konnte nicht abgeglichen werden.",
      message: error instanceof Error ? error.message : "Unbekannter Fehler",
    },
    { status: 500 },
  );
};

/** Lädt die geteilte Liste samt abgehakter Artikel (für Polling im Laden) */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/lists/share/[code]">) {
  await connection();
  try {
    const { code } = await ctx.params;
    const db = await getDb();
    return NextResponse.json({ list: await getSharedList(db, code) });
  } catch (error) {
    return failure(error);
  }
}

/** Überträgt abgehakte Artikel; pro Position gewinnt die jüngste Änderung */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/lists/share/[code]">) {
  await connection();
  try {
    const { code } = await ctx.params;
    const parsed = SyncRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Abgleich-Daten.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const db = await getDb();
    return NextResponse.json({ list: await syncSharedListChecks(db, code, parsed.data.changes) });
  } catch (error) {
    return failure(error);
  }
}
