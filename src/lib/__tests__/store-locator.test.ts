import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import {
  fetchNearbyStoresForZip,
  haversineDistanceKm,
  mapOsmTagsToStoreId,
  parseOverpassSupermarkets,
} from "@/lib/providers/store-locator";
import {
  evaluateOpeningHours,
  getGermanHolidayForDate,
  resolveGermanStateForZip,
} from "@/lib/rules/opening-hours";
import { getNearbyStoresForZip } from "@/lib/services/store-locations";

describe("Filialfinder, Entfernungen, Öffnungszeiten & Feiertage (Ausbaustufe 4, Paket 9)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("ordnet deutsche PLZ den Bundesländern zu und berechnet bundesweite sowie regionale Feiertage", () => {
    expect(resolveGermanStateForZip("10115").code).toBe("BE");
    expect(resolveGermanStateForZip("80331").code).toBe("BY");
    expect(resolveGermanStateForZip("50667").code).toBe("NW");
    expect(resolveGermanStateForZip("20095").code).toBe("HH");
    expect(resolveGermanStateForZip("21073").code).toBe("HH"); // Hamburg-Harburg
    expect(resolveGermanStateForZip("21335").code).toBe("NI"); // Lüneburg (Niedersachsen)
    expect(resolveGermanStateForZip("03046").code).toBe("BB"); // Cottbus (Brandenburg)
    expect(resolveGermanStateForZip("01067").code).toBe("SN");

    // Bundesweit
    expect(getGermanHolidayForDate("2026-10-03", "BE")).toBe("Tag der Deutschen Einheit");
    expect(getGermanHolidayForDate("2026-04-03", "HH")).toBe("Karfreitag");
    expect(getGermanHolidayForDate("2026-04-06", "BY")).toBe("Ostermontag");

    // Regional: Fronleichnam 2026 = 04.06. (BY/NW ja, BE nein)
    expect(getGermanHolidayForDate("2026-06-04", "BY")).toBe("Fronleichnam");
    expect(getGermanHolidayForDate("2026-06-04", "NW")).toBe("Fronleichnam");
    expect(getGermanHolidayForDate("2026-06-04", "BE")).toBeNull();

    // Regional: Reformationstag 31.10. (HH/SN ja, BY nein) vs. Allerheiligen 01.11. (BY ja, HH nein)
    expect(getGermanHolidayForDate("2026-10-31", "HH")).toBe("Reformationstag");
    expect(getGermanHolidayForDate("2026-10-31", "BY")).toBeNull();
    expect(getGermanHolidayForDate("2026-11-01", "BY")).toBe("Allerheiligen");
    expect(getGermanHolidayForDate("2026-11-01", "HH")).toBeNull();

    // Regional: Buß- und Bettag 2026 = 18.11. (nur Sachsen, NICHT Cottbus/Brandenburg!)
    expect(getGermanHolidayForDate("2026-11-18", "SN")).toBe("Buß- und Bettag");
    expect(getGermanHolidayForDate("2026-11-18", "BB")).toBeNull();
    expect(getGermanHolidayForDate("2026-11-18", "BE")).toBeNull();
  });

  it("wertet OSM opening_hours korrekt für offene Märkte, Komma-Regeln, Ladenschluss, Sonntag und Feiertage aus", () => {
    const hours = "Mo-Fr 07:00-21:00; Sa 07:00-20:00; PH off";

    // Mittwoch 14:00 -> Offen bis 21:00
    expect(
      evaluateOpeningHours({
        openingHours: hours,
        dateIso: "2026-11-18",
        stateCode: "BE",
        currentTimeMinutes: 14 * 60,
      }),
    ).toMatchObject({ state: "open", label: "Offen bis 21:00" });

    // Komma-getrennte Tagesgruppen funktionieren ebenfalls
    expect(
      evaluateOpeningHours({
        openingHours: "Mo-Fr 07:00-20:00, Sa 07:00-18:00",
        dateIso: "2026-11-21",
        stateCode: "BE",
        currentTimeMinutes: 16 * 60,
      }),
    ).toMatchObject({ state: "open", label: "Offen bis 18:00" });

    // Samstag 19:35 -> Schließt in 25 Min. (20:00)
    expect(
      evaluateOpeningHours({
        openingHours: hours,
        dateIso: "2026-11-21",
        stateCode: "BE",
        currentTimeMinutes: 19 * 60 + 35,
      }),
    ).toMatchObject({ state: "closing_soon", label: "Schließt in 25 Min. (20:00)" });

    // Sonntag -> geschlossen mit Öffnungshinweis Montag 07:00
    const sunday = evaluateOpeningHours({
      openingHours: hours,
      dateIso: "2026-11-22",
      stateCode: "BE",
      currentTimeMinutes: 12 * 60,
    });
    expect(sunday.state).toBe("closed");
    expect(sunday.label).toContain("Sonntag geschlossen");
    expect(sunday.label).toContain("Mo 07:00");

    // Feiertag in Sachsen (Buß- und Bettag)
    const saxonyHoliday = evaluateOpeningHours({
      openingHours: hours,
      dateIso: "2026-11-18",
      stateCode: "SN",
      currentTimeMinutes: 12 * 60,
    });
    expect(saxonyHoliday.state).toBe("holiday_closed");
    expect(saxonyHoliday.holidayName).toBe("Buß- und Bettag");
  });

  it("mappt OSM-Supermarkt-Tags sauber auf die 7 Ketten und wählt je Kette die nächste Filiale", () => {
    expect(mapOsmTagsToStoreId({ brand: "Lidl" })).toBe("lidl");
    expect(mapOsmTagsToStoreId({ name: "ALDI SÜD" })).toBe("aldi");
    expect(mapOsmTagsToStoreId({ name: "E-Center Musterstadt" })).toBe("edeka");
    expect(mapOsmTagsToStoreId({ brand: "REWE City" })).toBe("rewe");
    expect(mapOsmTagsToStoreId({ name: "Netto Marken-Discount" })).toBe("netto");
    expect(mapOsmTagsToStoreId({ name: "Netto", operator: "Salling Group" })).toBeNull();

    const center = { lat: 52.5326, lon: 13.3847, city: "Berlin" };
    const parsed = parseOverpassSupermarkets({
      zipCode: "10115",
      center,
      elements: [
        {
          type: "node",
          lat: 52.535,
          lon: 13.388,
          tags: {
            brand: "Lidl",
            name: "Lidl Chausseestraße",
            "addr:street": "Chausseestraße",
            "addr:housenumber": "12",
            "addr:postcode": "10115",
            "addr:city": "Berlin",
            opening_hours: "Mo-Sa 07:00-21:00",
          },
        },
        {
          // Weiter weg -> darf nicht gewinnen
          type: "node",
          lat: 52.55,
          lon: 13.41,
          tags: { brand: "Lidl", name: "Lidl weiter weg" },
        },
        {
          type: "way",
          center: { lat: 52.531, lon: 13.382 },
          tags: {
            brand: "REWE",
            name: "REWE Mitte",
            "addr:street": "Invalidenstraße",
            "addr:housenumber": "5",
            opening_hours: "Mo-Sa 07:00-22:00",
          },
        },
      ],
    });

    expect(parsed).toHaveLength(2);
    const lidl = parsed.find((s) => s.storeId === "lidl");
    expect(lidl?.branchName).toBe("Lidl Chausseestraße");
    expect(lidl?.address).toContain("Chausseestraße 12");
    expect(lidl?.distanceKm).toBeLessThan(0.5);
    expect(haversineDistanceKm(52.5326, 13.3847, 52.535, 13.388)).toBeLessThan(0.5);
  });

  it("cacht abgerufene OSM-Filialen für 7 Tage in PGlite und trennt echte OSM-Treffer sauber von Fallback-Werten", async () => {
    const db = await getDb();
    let fetchCount = 0;

    const mockFetch: typeof fetch = async (input) => {
      fetchCount += 1;
      const url = String(input);
      if (url.includes("nominatim")) {
        return new Response(
          JSON.stringify([{ lat: "48.1351", lon: "11.5820", display_name: "80331, München, DE" }]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          elements: [
            {
              type: "node",
              lat: 48.137,
              lon: 11.58,
              tags: {
                brand: "ALDI SÜD",
                name: "ALDI SÜD Marienplatz",
                "addr:street": "Tal",
                "addr:housenumber": "22",
                "addr:postcode": "80331",
                "addr:city": "München",
                opening_hours: "Mo-Sa 07:00-20:00",
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const first = await getNearbyStoresForZip(db, "80331", { fetchImpl: mockFetch });
    expect(first.source).toBe("osm_overpass");
    expect(first.osmMatchCount).toBe(1);
    expect(first.stores.find((s) => s.storeId === "aldi")?.branchName).toBe("ALDI SÜD Marienplatz");
    const callsAfterFirst = fetchCount;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Zweiter Aufruf bedient sich direkt aus dem 7-Tage PGlite-Cache, bewahrt aber pro Filiale echte Quelle!
    const second = await getNearbyStoresForZip(db, "80331", { fetchImpl: mockFetch });
    expect(second.fromCache).toBe(true);
    expect(second.source).toBe("osm_overpass");
    expect(second.osmMatchCount).toBe(1);
    expect(fetchCount).toBe(callsAfterFirst);
    expect(second.stores.find((s) => s.storeId === "aldi")).toMatchObject({
      branchName: "ALDI SÜD Marienplatz",
      source: "osm_overpass",
    });
    expect(second.stores.find((s) => s.storeId === "rewe")?.source).toBe("estimated_fallback");

    // Offline-Fallback liefert immer alle 7 Ketten
    const offline = await fetchNearbyStoresForZip("10115", { offlineOnly: true });
    expect(offline.source).toBe("estimated_fallback");
    expect(offline.stores).toHaveLength(7);
  });
});
