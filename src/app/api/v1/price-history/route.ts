import { NextResponse, connection } from "next/server";
import { getDb } from "@/db";
import { getPriceHistorySummary } from "@/lib/services/price-history";

const todayInGermany = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const windowParam = searchParams.get("days");
    const referenceDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayInGermany();
    const parsedDays = windowParam ? Number.parseInt(windowParam, 10) : 90;
    const windowDays = Number.isFinite(parsedDays) && parsedDays >= 7 && parsedDays <= 365 ? parsedDays : 90;

    const db = await getDb();
    const summary = await getPriceHistorySummary(db, referenceDate, windowDays);
    return NextResponse.json({ status: "ok", ...summary });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Preishistorie konnte nicht geladen werden.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
