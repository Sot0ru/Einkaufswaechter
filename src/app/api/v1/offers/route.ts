import { NextResponse, connection } from "next/server";
import { getDb } from "@/db";
import { isValidGermanZip } from "@/lib/providers/zip-offer-fetcher";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";

const todayInVienna = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function GET(request: Request) {
  await connection();
  try {
    const url = new URL(request.url);
    const zipCode = (url.searchParams.get("zipCode") ?? "10115").trim();
    const referenceDate = url.searchParams.get("date") ?? todayInVienna();

    if (!isValidGermanZip(zipCode)) {
      return NextResponse.json(
        { error: "Bitte eine gültige 5-stellige deutsche Postleitzahl eingeben." },
        { status: 400 },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
      return NextResponse.json(
        { error: "Ungültiges Datumsformat (YYYY-MM-DD erwartet)." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const result = await syncOffersForZipCode(db, {
      zipCode,
      referenceDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Abruf der Wochenangebote für diese Postleitzahl fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
