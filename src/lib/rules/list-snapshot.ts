import { CATEGORY_MAP } from "./catalog";
import type { BasketItemInput } from "./optimizer";

/**
 * Kompakter Schnappschuss einer Einkaufsliste für das Teilen ohne Server (PWA, offline):
 * die Liste steckt Base64url-kodiert direkt im Link.
 */
export interface ListSnapshot {
  name: string;
  items: BasketItemInput[];
}

interface EncodedSnapshot {
  v: 1;
  n: string;
  i: [string, number][];
}

const MAX_SNAPSHOT_ITEMS = 120;

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (encoded: string): string => {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

export const encodeListSnapshot = (snapshot: ListSnapshot): string => {
  const payload: EncodedSnapshot = {
    v: 1,
    n: snapshot.name.slice(0, 80),
    i: snapshot.items
      .filter((item) => item.quantity > 0 && CATEGORY_MAP[item.categoryId] != null)
      .slice(0, MAX_SNAPSHOT_ITEMS)
      .map((item) => [item.categoryId, item.quantity]),
  };
  return toBase64Url(JSON.stringify(payload));
};

/** Liest einen Schnappschuss; unbekannte Kategorien und ungültige Mengen fallen weg */
export const decodeListSnapshot = (encoded: string): ListSnapshot | null => {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<EncodedSnapshot>;
    if (parsed.v !== 1 || !Array.isArray(parsed.i)) return null;
    const items = parsed.i
      .filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          CATEGORY_MAP[entry[0]] != null &&
          Number.isInteger(entry[1]) &&
          entry[1] > 0 &&
          entry[1] <= 50,
      )
      .slice(0, MAX_SNAPSHOT_ITEMS)
      .map(([categoryId, quantity]) => ({ categoryId, quantity }));
    if (items.length === 0) return null;
    const name = typeof parsed.n === "string" && parsed.n.trim() ? parsed.n.trim() : "Geteilte Liste";
    return { name, items };
  } catch {
    return null;
  }
};
