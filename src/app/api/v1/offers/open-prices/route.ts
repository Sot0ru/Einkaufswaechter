import { NextResponse, connection } from "next/server";
import { getDb } from "@/db";
import { isValidGermanZip } from "@/lib/providers/zip-offer-fetcher";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { getPriceHistorySummary } from "@/lib/services/price-history";

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/**
 * Ruft echte Community-Supermarktpreise über die freie, offene Open-Prices-API
 * (Open Food Facts, ODbL-1.0) für die gewählte deutsche Postleitzahl + bundesweit ab
 * und übernimmt gematchte Angebote sowie verifizierte Preisbeobachtungen in die Datenbank.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const url = new URL(request.url);
    const zipCode = (url.searchParams.get("zipCode") ?? "10115").trim();
    const referenceDate = url.searchParams.get("date") ?? todayInGermany();

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
      enableLiveScraping: false,
      enableOpenPrices: true,
    });
    const priceHistory = await getPriceHistorySummary(db, referenceDate);

    return NextResponse.json({
      status: "ok",
      ...result,
      priceHistory,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Open-Prices-Abruf fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
