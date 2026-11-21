import type { BasePriceEntry, CategoryDefinition, StoreId } from "./catalog";
import { isStoreBrandLabel } from "./store-brands";

/** Welche Produktqualität jemand für einen Artikel möchte */
export type ItemPreference = "cheapest" | "bio" | "brand";

export const ITEM_PREFERENCES: readonly ItemPreference[] = ["cheapest", "bio", "brand"];

export const ITEM_PREFERENCE_LABELS: Record<ItemPreference, string> = {
  cheapest: "Günstigste",
  bio: "Bio",
  brand: "Marke",
};

/**
 * Aufschlag auf den Eigenmarken-Normalpreis, wenn keine eigene Bio- bzw. Marken-Referenz existiert.
 * Orientiert sich an typischen Regalpreisen deutscher Supermärkte (Bio ca. +60 %, Marke ca. +80 %).
 */
export const PREFERENCE_PRICE_FACTORS: Record<ItemPreference, number> = {
  cheapest: 1,
  bio: 1.6,
  brand: 1.8,
};

const BIO_PATTERN = /(^|[^a-zäöüß])(bio|öko|demeter|naturland|bioland)([^a-zäöüß]|$)|\bbio-/i;

export const isBioLabel = (label: string): boolean => BIO_PATTERN.test(label);

/** Ist die Kategorie selbst bereits ein Bio-Produkt (z. B. „Bio-Vollmilch“)? */
export const isBioCategory = (category: Pick<CategoryDefinition, "id" | "name">): boolean =>
  category.id.startsWith("bio_") || category.id.includes("_bio") || isBioLabel(category.name);

/** Endpreise wie im Regal: auf …,x9 € runden, aber nie unter den Ausgangspreis */
const roundToShelfPrice = (cents: number, minimumCents: number): number =>
  Math.max(minimumCents, Math.round(cents / 10) * 10 - 1);

/**
 * Normalpreis, gegen den ein Artikel mit der gewünschten Präferenz bewertet wird.
 * „Günstigste“ nutzt den Eigenmarken-Preis unverändert.
 */
export const resolvePreferenceBasePrice = (params: {
  category: CategoryDefinition;
  storeBaseEntry: BasePriceEntry;
  preference: ItemPreference;
}): BasePriceEntry => {
  const { category, storeBaseEntry, preference } = params;
  if (preference === "cheapest") return storeBaseEntry;
  if (preference === "bio" && isBioCategory(category)) return storeBaseEntry;

  const factor = PREFERENCE_PRICE_FACTORS[preference];
  const priceCents = roundToShelfPrice(storeBaseEntry.priceCents * factor, storeBaseEntry.priceCents);
  const productLabel =
    preference === "bio" ? `${category.name} in Bio-Qualität` : `${category.name}, Markenprodukt`;
  return { priceCents, productLabel };
};

/**
 * Darf ein Angebot für die gewünschte Präferenz verwendet werden?
 * Bio verlangt ein Bio-Merkmal im Titel, Marke schließt Eigenmarken der Ketten aus.
 */
export const offerMatchesPreference = (params: {
  offerTitle: string;
  category: CategoryDefinition;
  storeId: StoreId;
  preference: ItemPreference;
}): boolean => {
  const { offerTitle, category, storeId, preference } = params;
  if (preference === "cheapest") return true;
  if (preference === "bio") return isBioCategory(category) || isBioLabel(offerTitle);
  const storeBrandLabel = category.defaultBasePrices[storeId].productLabel;
  const storeBrandPrefix = storeBrandLabel.split(" ")[0]?.toLowerCase() ?? "";
  const startsWithStoreBrand =
    isStoreBrandLabel(storeBrandLabel) && offerTitle.toLowerCase().startsWith(storeBrandPrefix);
  return !isStoreBrandLabel(offerTitle) && !startsWithStoreBrand;
};
