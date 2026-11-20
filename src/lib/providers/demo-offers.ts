import type { StoreId } from "@/lib/rules/catalog";
import { matchOfferToCategory } from "@/lib/rules/matcher";
import type { OfferRecord } from "@/lib/rules/optimizer";

export interface RawDemoOfferSeed {
  id: string;
  storeId: StoreId;
  title: string;
  description: string;
  priceCents: number;
  loyaltyPriceCents?: number | null;
  /** "mo_sa" = ganze Woche gültig, "do_sa" = erst ab Donnerstag gültig */
  validityWindow: "mo_sa" | "do_sa";
}

export interface WeekWindow {
  monday: string;
  thursday: string;
  saturday: string;
}

/**
 * Berechnet für ein beliebiges Datum (YYYY-MM-DD) Montag, Donnerstag und Samstag derselben Kalenderwoche.
 */
export const getWeekWindowForDate = (isoDate: string): WeekWindow => {
  const [y, m, d] = isoDate.split("-").map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay(); // 0 = So, 1 = Mo, ..., 6 = Sa
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const mondayDate = new Date(dt);
  mondayDate.setUTCDate(dt.getUTCDate() + diffToMonday);

  const thursdayDate = new Date(mondayDate);
  thursdayDate.setUTCDate(mondayDate.getUTCDate() + 3);

  const saturdayDate = new Date(mondayDate);
  saturdayDate.setUTCDate(mondayDate.getUTCDate() + 5);

  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  return {
    monday: fmt(mondayDate),
    thursday: fmt(thursdayDate),
    saturday: fmt(saturdayDate),
  };
};

export const DEMO_OFFER_SEEDS: readonly RawDemoOfferSeed[] = [
  // LIDL
  {
    id: "demo-lidl-pasta",
    storeId: "lidl",
    title: "Barilla Spaghetti Nr. 5",
    description: "500-g-Packung, mit Lidl Plus nur 0,85 €",
    priceCents: 99,
    loyaltyPriceCents: 85,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-lidl-gouda",
    storeId: "lidl",
    title: "Milbona Gouda jung in Scheiben",
    description: "400-g-Packung (1 kg = 5,48)",
    priceCents: 219,
    loyaltyPriceCents: 199,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-lidl-eier",
    storeId: "lidl",
    title: "Frische Eier aus Bodenhaltung",
    description: "10er-Karton, mit Lidl Plus",
    priceCents: 199,
    loyaltyPriceCents: 159,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-lidl-hack-do",
    storeId: "lidl",
    title: "Metzgerfrisch Hackfleisch gemischt",
    description: "500-g-Packung – Ab Donnerstag im Angebot",
    priceCents: 289,
    loyaltyPriceCents: null,
    validityWindow: "do_sa",
  },
  {
    id: "demo-lidl-tomaten",
    storeId: "lidl",
    title: "Freshona Passierte Tomaten",
    description: "500-g-Packung",
    priceCents: 55,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },

  // REWE
  {
    id: "demo-rewe-butter",
    storeId: "rewe",
    title: "Kerrygold Original Irische Butter",
    description: "250-g-Packung (1 kg = 6,36)",
    priceCents: 159,
    loyaltyPriceCents: 149,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-rewe-kaffee",
    storeId: "rewe",
    title: "Jacobs Krönung Filterkaffee",
    description: "500-g-Vakuumpackung, mit Rewe Bonus",
    priceCents: 449,
    loyaltyPriceCents: 399,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-rewe-haehnchen-do",
    storeId: "rewe",
    title: "Wilhelm Brandenburg Hähnchenbrustfilet",
    description: "400-g-Packung – Wochenend-Knaller ab Donnerstag",
    priceCents: 329,
    loyaltyPriceCents: null,
    validityWindow: "do_sa",
  },
  {
    id: "demo-rewe-pizza",
    storeId: "rewe",
    title: "Dr. Oetker Ristorante Pizza Salame",
    description: "320-g-Packung",
    priceCents: 199,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },

  // KAUFLAND
  {
    id: "demo-kaufland-kaffee",
    storeId: "kaufland",
    title: "Dallmayr Prodomo Röstkaffee",
    description: "500-g-Packung, mit Kaufland Card noch günstiger",
    priceCents: 469,
    loyaltyPriceCents: 429,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-kaufland-butter-do",
    storeId: "kaufland",
    title: "Meggle Feine Butter oder Streichzart",
    description: "250-g-Packung – Gültig ab Donnerstag",
    priceCents: 149,
    loyaltyPriceCents: null,
    validityWindow: "do_sa",
  },
  {
    id: "demo-kaufland-hack-xxl",
    storeId: "kaufland",
    title: "K-Purland Hackfleisch gemischt XXL-Großpackung",
    description: "800-g-Packung (1 kg = 5,50)",
    priceCents: 440,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-kaufland-klopapier",
    storeId: "kaufland",
    title: "Zewa Bewährt Toilettenpapier 3-lagig",
    description: "8 Rollen Packung, mit Kaufland Card",
    priceCents: 249,
    loyaltyPriceCents: 219,
    validityWindow: "mo_sa",
  },

  // ALDI
  {
    id: "demo-aldi-bananen",
    storeId: "aldi",
    title: "Bananen 1 kg Sonderposten",
    description: "1-kg-Bund",
    priceCents: 99,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-aldi-olivenoel",
    storeId: "aldi",
    title: "Cantinelle Natives Olivenöl extra",
    description: "500-ml-Flasche",
    priceCents: 479,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-aldi-haehnchen-do",
    storeId: "aldi",
    title: "Meine Metzgerei Hähnchenbrustfilet XXL",
    description: "800-g-Packung – Ab Donnerstag",
    priceCents: 699,
    loyaltyPriceCents: null,
    validityWindow: "do_sa",
  },

  // EDEKA
  {
    id: "demo-edeka-vollmilch",
    storeId: "edeka",
    title: "Bärenmarke Die Frische Vollmilch 3,8 %",
    description: "1-Liter-Packung",
    priceCents: 88,
    loyaltyPriceCents: 79,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-edeka-rispentomaten",
    storeId: "edeka",
    title: "Strauchtomaten / Rispentomaten",
    description: "500-g-Schale",
    priceCents: 99,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-edeka-kartoffeln-do",
    storeId: "edeka",
    title: "Deutsche Speisekartoffeln festkochend",
    description: "2-kg-Netz – Ab Donnerstag",
    priceCents: 179,
    loyaltyPriceCents: null,
    validityWindow: "do_sa",
  },

  // NETTO
  {
    id: "demo-netto-toast",
    storeId: "netto",
    title: "Golden Toast Buttertoast",
    description: "500-g-Packung",
    priceCents: 79,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-netto-schinken",
    storeId: "netto",
    title: "Wolf Hinterkochschinken",
    description: "200-g-Packung",
    priceCents: 129,
    loyaltyPriceCents: 119,
    validityWindow: "mo_sa",
  },

  // PENNY
  {
    id: "demo-penny-quark",
    storeId: "penny",
    title: "Elite Speisequark Magerstufe",
    description: "500-g-Becher",
    priceCents: 99,
    loyaltyPriceCents: null,
    validityWindow: "mo_sa",
  },
  {
    id: "demo-penny-haferflocken",
    storeId: "penny",
    title: "Kölln Zarte Haferflocken",
    description: "500-g-Packung, mit Penny App",
    priceCents: 99,
    loyaltyPriceCents: 89,
    validityWindow: "mo_sa",
  },
];

/**
 * Erzeugt die gematchten Wochenangebote für die Kalenderwoche des angegebenen Datums.
 * Durchläuft denselben regelbasierten Matcher wie echte Prospekt-Daten.
 */
export const buildDemoOffersForDate = (referenceDate: string): OfferRecord[] => {
  const window = getWeekWindowForDate(referenceDate);
  const records: OfferRecord[] = [];

  for (const seed of DEMO_OFFER_SEEDS) {
    const match = matchOfferToCategory({
      title: seed.title,
      description: seed.description,
      priceCents: seed.priceCents,
      loyaltyPriceCents: seed.loyaltyPriceCents,
    });

    if (!match) continue;

    records.push({
      id: seed.id,
      storeId: seed.storeId,
      categoryId: match.categoryId,
      title: seed.title,
      priceCents: seed.priceCents,
      loyaltyPriceCents: seed.loyaltyPriceCents ?? null,
      requiresLoyaltyApp: false,
      packageAmount: match.packageAmount,
      packageUnit: match.packageUnit,
      validFrom: seed.validityWindow === "do_sa" ? window.thursday : window.monday,
      validTo: window.saturday,
    });
  }

  return records;
};
