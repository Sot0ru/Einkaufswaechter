import { CATEGORY_MAP, type BaseUnit } from "@/lib/rules/catalog";
import { matchOfferToCategory, parsePackageSize } from "@/lib/rules/matcher";
import { detectShrinkflation, type ShrinkflationWarning } from "@/lib/rules/price-intelligence";

export interface BarcodeProductInfo {
  barcode: string;
  productName: string;
  brand: string | null;
  quantityText: string | null;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  categoryId: string | null;
  categoryName: string | null;
  source: "db_cache" | "open_food_facts" | "offline_demo";
  /** Hinweis, falls die Packungsgröße unter der üblichen Normgröße liegt */
  shrinkflationNote: string | null;
}

export const normalizeBarcode = (raw: string): string => raw.replace(/\D/g, "").trim();

/**
 * Validiert EAN-8, UPC-A (12), EAN-13 und GTIN-14 per GS1-Modulo-10-Prüfziffer.
 */
export const isValidBarcode = (raw: string): boolean => {
  const digits = normalizeBarcode(raw);
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const checkDigit = Number.parseInt(digits[digits.length - 1], 10);
  let sum = 0;
  for (let i = digits.length - 2, pos = 0; i >= 0; i--, pos++) {
    const n = Number.parseInt(digits[i], 10);
    sum += pos % 2 === 0 ? n * 3 : n;
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
};

/**
 * Deterministische Offline-Referenz bekannter deutscher Alltagsprodukte
 * (alle EAN-13-Codes mit gültiger GS1-Prüfziffer) für Demo-, Test- und Offline-Betrieb.
 */
export const DEMO_BARCODE_PRODUCTS: readonly Omit<
  BarcodeProductInfo,
  "categoryName" | "source" | "shrinkflationNote"
>[] = [
  {
    barcode: "4008400404127",
    productName: "Kerrygold Original Irische Butter",
    brand: "Kerrygold",
    quantityText: "250 g",
    packageAmount: 250,
    packageUnit: "g",
    categoryId: "butter_250g",
  },
  {
    barcode: "4008400404202",
    productName: "Kerrygold Original Irische Butter (Aktionspackung)",
    brand: "Kerrygold",
    quantityText: "200 g",
    packageAmount: 200,
    packageUnit: "g",
    categoryId: "butter_250g",
  },
  {
    barcode: "4008452014008",
    productName: "Weihenstephan Frische Vollmilch 3,5 %",
    brand: "Weihenstephan",
    quantityText: "1 l",
    packageAmount: 1000,
    packageUnit: "ml",
    categoryId: "vollmilch_1l",
  },
  {
    barcode: "8076800195057",
    productName: "Barilla Spaghetti No. 5",
    brand: "Barilla",
    quantityText: "500 g",
    packageAmount: 500,
    packageUnit: "g",
    categoryId: "pasta_500g",
  },
  {
    barcode: "7394376616501",
    productName: "Oatly Haferdrink Barista Edition",
    brand: "Oatly",
    quantityText: "1 l",
    packageAmount: 1000,
    packageUnit: "ml",
    categoryId: "haferdrink_1l",
  },
  {
    barcode: "4008167103707",
    productName: "Dallmayr Prodomo Röstkaffee gemahlen",
    brand: "Dallmayr",
    quantityText: "500 g",
    packageAmount: 500,
    packageUnit: "g",
    categoryId: "filterkaffee_500g",
  },
  {
    barcode: "4008400202228",
    productName: "Dr. Oetker Ristorante Pizza Salami",
    brand: "Dr. Oetker",
    quantityText: "320 g",
    packageAmount: 320,
    packageUnit: "g",
    categoryId: "tk_pizza_1st",
  },
  {
    barcode: "4008400401621",
    productName: "Mutti Passierte Tomaten",
    brand: "Mutti",
    quantityText: "500 g",
    packageAmount: 500,
    packageUnit: "g",
    categoryId: "passierte_tomaten_500g",
  },
  {
    barcode: "4008400402628",
    productName: "Kölln Echte Kernige Haferflocken",
    brand: "Kölln",
    quantityText: "500 g",
    packageAmount: 500,
    packageUnit: "g",
    categoryId: "haferflocken_500g",
  },
  {
    barcode: "4008400403625",
    productName: "Zewa Soft Toilettenpapier 3-lagig",
    brand: "Zewa",
    quantityText: "8 Rollen",
    packageAmount: 8,
    packageUnit: "stueck",
    categoryId: "toilettenpapier_8st",
  },
];

const DEMO_BARCODE_MAP = new Map(DEMO_BARCODE_PRODUCTS.map((p) => [p.barcode, p]));

const buildSizeShrinkflationNote = (
  categoryId: string | null,
  packageAmount: number | null,
  packageUnit: BaseUnit | null,
): string | null => {
  if (!categoryId || !packageAmount || !packageUnit) return null;
  const cat = CATEGORY_MAP[categoryId];
  if (!cat || cat.unit !== packageUnit) return null;
  if (packageAmount < Math.round(cat.standardAmount * 0.92) && packageAmount >= Math.round(cat.standardAmount * 0.5)) {
    const diffPercent = Math.round(((cat.standardAmount - packageAmount) / cat.standardAmount) * 100);
    return `Kleinere Packung erkannt: ${packageAmount} ${packageUnit} statt Norm ${cat.standardAmount} ${cat.unit} (−${diffPercent} % Inhalt – Grundpreis prüfen!)`;
  }
  return null;
};

const normalizeOffUnit = (
  rawAmount: unknown,
  rawUnit: unknown,
  quantityText: string | null,
): { amount: number; unit: BaseUnit } | null => {
  if (typeof rawAmount === "number" || typeof rawAmount === "string") {
    const parsedNum = typeof rawAmount === "number" ? rawAmount : Number.parseFloat(rawAmount);
    const unitStr = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : "";
    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      if (unitStr === "g" || unitStr === "gram" || unitStr === "grams") {
        return { amount: Math.round(parsedNum), unit: "g" };
      }
      if (unitStr === "kg" || unitStr === "kilogram") {
        return { amount: Math.round(parsedNum * 1000), unit: "g" };
      }
      if (unitStr === "ml" || unitStr === "milliliter") {
        return { amount: Math.round(parsedNum), unit: "ml" };
      }
      if (unitStr === "l" || unitStr === "liter" || unitStr === "litre") {
        return { amount: Math.round(parsedNum * 1000), unit: "ml" };
      }
    }
  }
  if (quantityText) {
    return parsePackageSize(quantityText);
  }
  return null;
};

/**
 * Findet regelbasiert die passende Einkaufswächter-Kategorie für ein gescanntes Produkt
 * (ohne externe KI-API) über `matchOfferToCategory`.
 */
export const matchBarcodeProductToCategory = (params: {
  productName: string;
  brand: string | null;
  quantityText: string | null;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  knownPriceCents?: number;
}): string | null => {
  const fullTitle = [params.brand, params.productName].filter(Boolean).join(" ").trim();
  const desc = params.quantityText ?? "";

  if (params.knownPriceCents && params.knownPriceCents > 0) {
    const matched = matchOfferToCategory({
      title: fullTitle,
      description: desc,
      priceCents: params.knownPriceCents,
    });
    if (matched) return matched.categoryId;
  }

  // Wenn noch kein Regalpreis eingegeben wurde, testen wir mit typischen Preispunkten,
  // damit der Preis-Plausibilitäts-Korridor sauber passiert wird.
  for (const probeCents of [199, 99, 349, 599, 1199]) {
    const matched = matchOfferToCategory({
      title: fullTitle,
      description: desc,
      priceCents: probeCents,
    });
    if (matched) {
      if (!params.packageUnit || matched.packageUnit === params.packageUnit) {
        return matched.categoryId;
      }
    }
  }

  return null;
};

export interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_de?: string;
    brands?: string;
    quantity?: string;
    product_quantity?: number | string;
    product_quantity_unit?: string;
  };
}

export const parseOpenFoodFactsResponse = (
  barcode: string,
  payload: OpenFoodFactsResponse,
): BarcodeProductInfo | null => {
  if (payload.status !== 1 || !payload.product) return null;
  const p = payload.product;
  const productName = (p.product_name_de || p.product_name || "").trim();
  if (!productName) return null;

  const brand = p.brands?.split(",")[0]?.trim() || null;
  const quantityText = p.quantity?.trim() || null;
  const parsedQty = normalizeOffUnit(p.product_quantity, p.product_quantity_unit, quantityText);
  const packageAmount = parsedQty?.amount ?? null;
  const packageUnit = parsedQty?.unit ?? null;

  const categoryId = matchBarcodeProductToCategory({
    productName,
    brand,
    quantityText,
    packageAmount,
    packageUnit,
  });

  return {
    barcode,
    productName,
    brand,
    quantityText,
    packageAmount,
    packageUnit,
    categoryId,
    categoryName: categoryId ? (CATEGORY_MAP[categoryId]?.name ?? null) : null,
    source: "open_food_facts",
    shrinkflationNote: buildSizeShrinkflationNote(categoryId, packageAmount, packageUnit),
  };
};

export interface BarcodeLookupOptions {
  fetchImpl?: typeof fetch;
  offlineOnly?: boolean;
  timeoutMs?: number;
}

/**
 * Sucht einen EAN-/GTIN-Barcode über die kostenlose, offene Open-Food-Facts-API
 * mit automatischem Offline-/Demo-Fallback.
 */
export const lookupBarcodeProduct = async (
  rawBarcode: string,
  options: BarcodeLookupOptions = {},
): Promise<BarcodeProductInfo | null> => {
  const barcode = normalizeBarcode(rawBarcode);
  if (!isValidBarcode(barcode)) return null;

  if (!options.offlineOnly) {
    const fetchFn = options.fetchImpl ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 5000;
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_de,brands,quantity,product_quantity,product_quantity_unit`;
      const response = await fetchFn(url, {
        headers: {
          "User-Agent":
            "Einkaufswaechter/1.0 (+https://github.com/Sot0ru/Einkaufswaechter; Preisvergleich DE)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const json = (await response.json()) as OpenFoodFactsResponse;
        const parsed = parseOpenFoodFactsResponse(barcode, json);
        if (parsed) return parsed;
      }
    } catch {
      // Offline oder Timeout -> nahtlos auf Demo-Referenz zurückfallen
    }
  }

  const demo = DEMO_BARCODE_MAP.get(barcode);
  if (!demo) return null;

  return {
    ...demo,
    categoryName: demo.categoryId ? (CATEGORY_MAP[demo.categoryId]?.name ?? null) : null,
    source: "offline_demo",
    shrinkflationNote: buildSizeShrinkflationNote(
      demo.categoryId,
      demo.packageAmount,
      demo.packageUnit,
    ),
  };
};

export const evaluateBarcodePriceShrinkflation = (params: {
  categoryId: string;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  priceCents: number;
  referencePriceCents: number;
}): ShrinkflationWarning | null => {
  if (!params.packageAmount || !params.packageUnit) return null;
  return detectShrinkflation({
    categoryId: params.categoryId,
    packageAmount: params.packageAmount,
    packageUnit: params.packageUnit,
    priceCents: params.priceCents,
    referencePriceCents: params.referencePriceCents,
  });
};
