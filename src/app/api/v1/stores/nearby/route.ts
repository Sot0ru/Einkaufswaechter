import { NextResponse, connection } from "next/server";
import { getDb } from "@/db";
import { isValidGermanZip } from "@/lib/providers/zip-offer-fetcher";
import { getGermanHolidayForDate, resolveGermanStateForZip } from "@/lib/rules/opening-hours";
import { getNearbyStoresForZip } from "@/lib/services/store-locations";

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const zipCode = (searchParams.get("zipCode") ?? "10115").trim();
    const dateParam = searchParams.get("date");

    if (!isValidGermanZip(zipCode)) {
      return NextResponse.json(
        { error: "Ungültige Postleitzahl. Bitte eine 5-stellige deutsche PLZ angeben." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const result = await getNearbyStoresForZip(db, zipCode);
    const state = resolveGermanStateForZip(zipCode);
    const holidayName =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? getGermanHolidayForDate(dateParam, state.code)
        : null;

    return NextResponse.json({
      status: "ok",
      ...result,
      holidayName,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Filialen konnten nicht geladen werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
