import { NextResponse, connection } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  POPULAR_GERMAN_ZIPS,
  isValidGermanZip,
} from "@/lib/providers/zip-offer-fetcher";
import { syncOffersForZipCode } from "@/lib/providers/zip-offer-sync";
import { STORES, type StoreId } from "@/lib/rules/catalog";

const validStoreIds = STORES.map((s) => s.id) as [StoreId, ...StoreId[]];

const CronFetchRequestSchema = z.object({
  zipCode: z.string().regex(/^\d{5}$/).optional(),
  zipCodes: z.array(z.string().regex(/^\d{5}$/)).optional(),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  stores: z.array(z.enum(validStoreIds)).optional(),
  allRegions: z.boolean().optional().default(false),
});

const todayInVienna = (): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const isAuthorizedCronRequest = (request: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
};

const collectTargetZipCodes = async (options: {
  zipCode?: string;
  zipCodes?: string[];
  allRegions?: boolean;
}): Promise<string[]> => {
  const explicit = new Set<string>();
  if (options.zipCode && isValidGermanZip(options.zipCode)) {
    explicit.add(options.zipCode.trim());
  }
  for (const z of options.zipCodes ?? []) {
    if (isValidGermanZip(z)) explicit.add(z.trim());
  }
  if (options.allRegions) {
    for (const p of POPULAR_GERMAN_ZIPS) {
      explicit.add(p.zipCode);
    }
  }
  if (explicit.size > 0) {
    return [...explicit];
  }

  // Standard-Cron-Lauf: Alle in Einkaufslisten hinterlegten PLZ + Standard-PLZ 10115
  const db = await getDb();
  const listRows = await db
    .select({ zipCode: schema.shoppingLists.zipCode })
    .from(schema.shoppingLists);
  const discovered = new Set<string>(["10115"]);
  for (const row of listRows) {
    if (row.zipCode && isValidGermanZip(row.zipCode)) {
      discovered.add(row.zipCode);
    }
  }
  return [...discovered];
};

export async function GET(request: Request) {
  await connection();
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Nicht autorisierter Cron-Aufruf." },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const zipParam = url.searchParams.get("zipCode") ?? undefined;
    const zipsParam = url.searchParams.get("zipCodes");
    const dateParam = url.searchParams.get("referenceDate") ?? todayInVienna();
    const allRegions = url.searchParams.get("allRegions") === "true";

    const zipCodesFromQuery = zipsParam
      ? zipsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    if (zipParam && !isValidGermanZip(zipParam)) {
      return NextResponse.json(
        { error: "Ungültige Postleitzahl (5 Ziffern erwartet)." },
        { status: 400 },
      );
    }

    const targetZips = await collectTargetZipCodes({
      zipCode: zipParam,
      zipCodes: zipCodesFromQuery,
      allRegions,
    });

    const db = await getDb();
    const runs = [];
    for (const zip of targetZips) {
      const syncResult = await syncOffersForZipCode(db, {
        zipCode: zip,
        referenceDate: dateParam,
      });
      runs.push({
        zipCode: syncResult.zipCode,
        region: syncResult.region,
        source: syncResult.source,
        fetchedRawCount: syncResult.fetchedRawCount,
        matchedCount: syncResult.matchedCount,
        upsertedCount: syncResult.upsertedCount,
        activeOfferCount: syncResult.offers.length,
        syncedAt: syncResult.syncedAt,
      });
    }

    return NextResponse.json({
      status: "ok",
      referenceDate: dateParam,
      syncedZipCount: runs.length,
      totalMatchedCount: runs.reduce((sum, r) => sum + r.matchedCount, 0),
      totalUpsertedCount: runs.reduce((sum, r) => sum + r.upsertedCount, 0),
      runs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hintergrund-Abruf der Wochenangebote fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await connection();
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: "Nicht autorisierter Cron-Aufruf." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = CronFetchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Parameter für den Angebots-Abruf.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const referenceDate = parsed.data.referenceDate ?? todayInVienna();
    const targetZips = await collectTargetZipCodes({
      zipCode: parsed.data.zipCode,
      zipCodes: parsed.data.zipCodes,
      allRegions: parsed.data.allRegions,
    });

    const db = await getDb();
    const runs = [];
    for (const zip of targetZips) {
      const syncResult = await syncOffersForZipCode(db, {
        zipCode: zip,
        referenceDate,
        stores: parsed.data.stores,
      });
      runs.push({
        zipCode: syncResult.zipCode,
        region: syncResult.region,
        source: syncResult.source,
        fetchedRawCount: syncResult.fetchedRawCount,
        matchedCount: syncResult.matchedCount,
        upsertedCount: syncResult.upsertedCount,
        activeOfferCount: syncResult.offers.length,
        syncedAt: syncResult.syncedAt,
      });
    }

    return NextResponse.json({
      status: "ok",
      referenceDate,
      syncedZipCount: runs.length,
      totalMatchedCount: runs.reduce((sum, r) => sum + r.matchedCount, 0),
      totalUpsertedCount: runs.reduce((sum, r) => sum + r.upsertedCount, 0),
      runs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hintergrund-Abruf der Wochenangebote fehlgeschlagen.",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 },
    );
  }
}
