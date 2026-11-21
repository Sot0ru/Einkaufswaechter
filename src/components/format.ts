import { CATEGORY_MAP, type CategoryDefinition } from "@/lib/rules/catalog";
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

/**
 * Leitet einen Kurznamen aus dem Kategorienamen ab, falls der Katalog keinen hinterlegt:
 * Klammern entfallen, bei Alternativen („Lauch / Porree“) zählt die erste.
 * Endet die erste Alternative auf einen Bindestrich („Butter- / Schoko-Croissants“),
 * wird das gemeinsame Grundwort der letzten Alternative genommen („Croissants“).
 */
export const deriveShortName = (name: string): string => {
  const withoutParentheses = name.replace(/\s*\([^)]*\)/g, "").trim();
  const alternatives = withoutParentheses
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const first = alternatives[0] ?? name;
  if (first.endsWith("-") && alternatives.length > 1) {
    const last = alternatives[alternatives.length - 1];
    return last.slice(last.lastIndexOf("-") + 1);
  }
  return first;
};

export const categoryShortName = (category: Pick<CategoryDefinition, "name" | "shortName">): string =>
  category.shortName ?? deriveShortName(category.name);

export const itemShortName = (item: Pick<ResolvedStoreItem, "categoryId" | "categoryName">): string => {
  const category = CATEGORY_MAP[item.categoryId];
  return category ? categoryShortName(category) : deriveShortName(item.categoryName);
};

/** Kompakte Aufzählung für den Linienplan, z. B. "2× Butter, Kaffee" */
export const describeStopItems = (items: readonly ResolvedStoreItem[]): string =>
  items
    .map((item) =>
      item.requestedQuantity > 1
        ? `${item.requestedQuantity}× ${itemShortName(item)}`
        : itemShortName(item),
    )
    .join(", ");
