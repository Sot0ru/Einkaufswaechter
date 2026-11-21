import { CATEGORY_MAP, type StoreId } from "./catalog";
import {
  type OfferRecord,
  type OptimizationInput,
  resolveStoreItemPrice,
} from "./optimizer";

export interface FavoriteAlert {
  categoryId: string;
  storeId: StoreId;
  storeName: string;
  offerTitle: string;
  offerPriceCents: number;
  regularPriceCents: number;
  savingsCents: number;
  usedLoyaltyApp: boolean;
}

export interface FavoriteAlertSummary {
  alerts: FavoriteAlert[];
  totalSavingsCents: number;
}

/**
 * Wochen-Radar: Welche Stammprodukte sind diese Woche in einem der gewählten Märkte im Angebot?
 * Je Produkt zählt das günstigste Angebot (eine Standardpackung).
 */
export const evaluateFavoriteAlerts = (
  input: Pick<
    OptimizationInput,
    "enabledStores" | "enabledLoyaltyApps" | "shoppingDate" | "customBasePrices"
  > & {
    favoriteCategoryIds: readonly string[];
    offers: readonly OfferRecord[];
  },
): FavoriteAlertSummary => {
  const loyaltyApps = new Set(input.enabledLoyaltyApps);
  const alerts: FavoriteAlert[] = [];

  for (const categoryId of new Set(input.favoriteCategoryIds)) {
    if (!CATEGORY_MAP[categoryId]) continue;
    let best: FavoriteAlert | null = null;

    for (const storeId of input.enabledStores) {
      const hasOfferHere = input.offers.some(
        (offer) => offer.storeId === storeId && offer.categoryId === categoryId,
      );
      if (!hasOfferHere) continue;

      const resolved = resolveStoreItemPrice({
        categoryId,
        quantity: 1,
        storeId,
        shoppingDate: input.shoppingDate,
        hasLoyaltyApp: loyaltyApps.has(storeId),
        offers: input.offers,
        customBasePrices: input.customBasePrices,
      });
      if (!resolved.isOffer || resolved.savingsCents <= 0) continue;

      const isBetter =
        best == null ||
        resolved.checkoutCents < best.offerPriceCents ||
        (resolved.checkoutCents === best.offerPriceCents && resolved.savingsCents > best.savingsCents);
      if (isBetter) {
        best = {
          categoryId,
          storeId,
          storeName: resolved.storeName,
          offerTitle: resolved.productLabel,
          offerPriceCents: resolved.checkoutCents,
          regularPriceCents: resolved.regularCheckoutCents,
          savingsCents: resolved.savingsCents,
          usedLoyaltyApp: resolved.usedLoyaltyApp,
        };
      }
    }

    if (best) alerts.push(best);
  }

  alerts.sort((a, b) => b.savingsCents - a.savingsCents || a.categoryId.localeCompare(b.categoryId));
  return {
    alerts,
    totalSavingsCents: alerts.reduce((sum, alert) => sum + alert.savingsCents, 0),
  };
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** Nächster Montag (heute, falls heute Montag ist) als YYYYMMDD in UTC-Kalenderlogik */
const nextMondayDateStamp = (now: Date): string => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysUntilMonday = (8 - date.getUTCDay()) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
};

/**
 * Kalender-Erinnerung (.ics) jeden Montag um 7:30 Uhr Ortszeit, ganz ohne Push-Server.
 * Die Zeit ist bewusst „schwebend“ (ohne Zeitzone), damit sie überall 7:30 Uhr bleibt.
 */
export const buildFavoritesReminderIcs = (params: { now: Date; appUrl: string }): string => {
  const { now, appUrl } = params;
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const start = `${nextMondayDateStamp(now)}T073000`;
  const end = `${nextMondayDateStamp(now)}T074500`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Einkaufswaechter//Wochen-Radar//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:wochen-radar-${stamp}@einkaufswaechter`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "SUMMARY:Einkaufswächter: Angebote deiner Stammprodukte prüfen",
    `DESCRIPTION:Die neuen Wochenangebote sind da. Sieh nach\\, welche deiner Stammprodukte günstiger sind: ${appUrl}`,
    `URL:${appUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};
