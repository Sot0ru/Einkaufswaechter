import { CATEGORY_MAP } from "@/lib/rules/catalog";
import type { ResolvedStoreItem } from "@/lib/rules/optimizer";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" });

/** "2026-11-21" → "Samstag" */
export const formatWeekday = (isoDate: string): string =>
  WEEKDAY_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

/** "2026-11-21" → "21.11." */
export const formatShortDate = (isoDate: string): string => {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}.`;
};

/** 500 → "5 €", 250 → "2,50 €" */
export const formatThreshold = (cents: number): string =>
  cents % 100 === 0 ? `${cents / 100} €` : `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export const itemShortName = (item: Pick<ResolvedStoreItem, "categoryId" | "categoryName">): string =>
  CATEGORY_MAP[item.categoryId]?.shortName ?? item.categoryName;

/** Kompakte Aufzählung für den Linienplan, z. B. "2× Butter, Kaffee" */
export const describeStopItems = (items: readonly ResolvedStoreItem[]): string =>
  items
    .map((item) =>
      item.requestedQuantity > 1
        ? `${item.requestedQuantity}× ${itemShortName(item)}`
        : itemShortName(item),
    )
    .join(", ");
