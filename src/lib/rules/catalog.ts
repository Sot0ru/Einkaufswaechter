export type StoreId = "lidl" | "aldi" | "rewe" | "edeka" | "kaufland" | "netto" | "penny";

export interface StoreDefinition {
  id: StoreId;
  name: string;
  shortName: string;
  loyaltyAppName: string | null;
  isDiscounter: boolean;
  badgeColor: string;
}

export const STORES: readonly StoreDefinition[] = [
  {
    id: "lidl",
    name: "Lidl",
    shortName: "Lidl",
    loyaltyAppName: "Lidl Plus",
    isDiscounter: true,
    badgeColor: "#0050aa",
  },
  {
    id: "aldi",
    name: "Aldi (Nord / Süd)",
    shortName: "Aldi",
    loyaltyAppName: null,
    isDiscounter: true,
    badgeColor: "#0078c8",
  },
  {
    id: "rewe",
    name: "Rewe",
    shortName: "Rewe",
    loyaltyAppName: "Rewe Bonus",
    isDiscounter: false,
    badgeColor: "#cc071e",
  },
  {
    id: "edeka",
    name: "Edeka",
    shortName: "Edeka",
    loyaltyAppName: "Edeka App",
    isDiscounter: false,
    badgeColor: "#004b93",
  },
  {
    id: "kaufland",
    name: "Kaufland",
    shortName: "Kaufland",
    loyaltyAppName: "Kaufland Card",
    isDiscounter: false,
    badgeColor: "#e10915",
  },
  {
    id: "netto",
    name: "Netto Marken-Discount",
    shortName: "Netto",
    loyaltyAppName: "Netto App",
    isDiscounter: true,
    badgeColor: "#c99700",
  },
  {
    id: "penny",
    name: "Penny",
    shortName: "Penny",
    loyaltyAppName: "Penny App",
    isDiscounter: true,
    badgeColor: "#cd1719",
  },
] as const;

export const STORE_MAP: Record<StoreId, StoreDefinition> = Object.fromEntries(
  STORES.map((s) => [s.id, s]),
) as Record<StoreId, StoreDefinition>;

export type DepartmentId =
  | "obst_gemuese"
  | "backwaren"
  | "kuehlung"
  | "fleisch_wurst"
  | "trocken"
  | "tiefkuehl"
  | "getraenke"
  | "haushalt";

export interface DepartmentDefinition {
  id: DepartmentId;
  name: string;
  /** Kurzname für kompakte Darstellungen wie den Linienplan (z. B. "Kühlregal") */
  shortName: string;
  icon: string;
  /** Typische Laufroute im deutschen Supermarkt (1 = Eingang / Obst & Gemüse, 8 = Drogerie/Kasse) */
  sortOrder: number;
}

export const DEPARTMENTS: readonly DepartmentDefinition[] = [
  { id: "obst_gemuese", name: "Obst & Gemüse", shortName: "Obst & Gemüse", icon: "🥦", sortOrder: 1 },
  { id: "backwaren", name: "Brot & Backwaren", shortName: "Backwaren", icon: "🥖", sortOrder: 2 },
  { id: "kuehlung", name: "Kühlregal & Molkerei", shortName: "Kühlregal", icon: "🧀", sortOrder: 3 },
  { id: "fleisch_wurst", name: "Fleisch & Wurst", shortName: "Fleisch & Wurst", icon: "🥩", sortOrder: 4 },
  { id: "trocken", name: "Vorrat & Trockensortiment", shortName: "Vorrat", icon: "🍝", sortOrder: 5 },
  { id: "tiefkuehl", name: "Tiefkühlkost", shortName: "Tiefkühl", icon: "🧊", sortOrder: 6 },
  { id: "getraenke", name: "Getränke & Kaffee", shortName: "Getränke", icon: "☕", sortOrder: 7 },
  { id: "haushalt", name: "Haushalt & Drogerie", shortName: "Haushalt", icon: "🧻", sortOrder: 8 },
] as const;

export const DEPARTMENT_MAP: Record<DepartmentId, DepartmentDefinition> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d]),
) as Record<DepartmentId, DepartmentDefinition>;

export type BaseUnit = "g" | "ml" | "stueck";

export interface BasePriceEntry {
  priceCents: number;
  productLabel: string;
}

export interface CategoryDefinition {
  id: string;
  name: string;
  /** Kurzname für kompakte Darstellungen wie den Linienplan (z. B. "Butter") */
  shortName: string;
  subtitle: string;
  department: DepartmentId;
  unit: BaseUnit;
  /** Normierte Standard-Packungsgröße in g, ml oder Stück */
  standardAmount: number;
  /** Begriffe, von denen mindestens einer im Angebotstitel vorkommen muss (Kleinschreibung) */
  includeKeywords: readonly string[];
  /** Begriffe, die einen Treffer ausschließen (z. B. "butterkäse" bei Butter) */
  excludeKeywords: readonly string[];
  /** Plausibilitäts-Korridor für eine Standardpackung in Cent */
  minPlausiblePriceCents: number;
  maxPlausiblePriceCents: number;
  /** Reguläre Eigenmarken-Basispreise je Kette */
  defaultBasePrices: Record<StoreId, BasePriceEntry>;
}

const uniformEigenmarke = (
  priceCents: number,
  labels: Record<StoreId, string>,
  overrides?: Partial<Record<StoreId, { priceCents?: number; productLabel?: string }>>,
): Record<StoreId, BasePriceEntry> => {
  const storeIds: StoreId[] = ["lidl", "aldi", "rewe", "edeka", "kaufland", "netto", "penny"];
  const result = {} as Record<StoreId, BasePriceEntry>;
  for (const id of storeIds) {
    result[id] = {
      priceCents: overrides?.[id]?.priceCents ?? priceCents,
      productLabel: overrides?.[id]?.productLabel ?? labels[id],
    };
  }
  return result;
};

export const CATEGORIES: readonly CategoryDefinition[] = [
  // 1. Obst & Gemüse
  {
    id: "bananen_1kg",
    name: "Bananen",
    shortName: "Bananen",
    subtitle: "1 kg",
    department: "obst_gemuese",
    unit: "g",
    standardAmount: 1000,
    includeKeywords: ["bananen", "banane"],
    excludeKeywords: ["bananensaft", "bananenmilch", "bananenchips", "schokobananen", "nektar"],
    minPlausiblePriceCents: 79,
    maxPlausiblePriceCents: 249,
    defaultBasePrices: uniformEigenmarke(139, {
      lidl: "Bananen 1 kg",
      aldi: "Bananen 1 kg",
      rewe: "ja! Bananen 1 kg",
      edeka: "Gut & Günstig Bananen 1 kg",
      kaufland: "Bananen 1 kg",
      netto: "Markttag Bananen 1 kg",
      penny: "Marktliebe Bananen 1 kg",
    }),
  },
  {
    id: "rispentomaten_500g",
    name: "Rispentomaten",
    shortName: "Rispentomaten",
    subtitle: "500 g",
    department: "obst_gemuese",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["rispentomaten", "strauchtomaten", "cherrytomaten", "romatomaten"],
    excludeKeywords: ["passierte", "gehakte", "dosentomaten", "tomatenmark", "ketchup", "soße", "sauce"],
    minPlausiblePriceCents: 69,
    maxPlausiblePriceCents: 299,
    defaultBasePrices: uniformEigenmarke(
      149,
      {
        lidl: "Rispentomaten 500 g",
        aldi: "Rispentomaten 500 g",
        rewe: "Rispentomaten 500 g",
        edeka: "Rispentomaten 500 g",
        kaufland: "Rispentomaten 500 g",
        netto: "Markttag Rispentomaten 500 g",
        penny: "Marktliebe Rispentomaten 500 g",
      },
      { rewe: { priceCents: 169 }, edeka: { priceCents: 169 } },
    ),
  },
  {
    id: "kartoffeln_2kg",
    name: "Speisekartoffeln",
    shortName: "Kartoffeln",
    subtitle: "2 kg Netz",
    department: "obst_gemuese",
    unit: "g",
    standardAmount: 2000,
    includeKeywords: ["speisekartoffeln", "kartoffeln", "festkochend", "vorwiegend festkochend"],
    excludeKeywords: ["chips", "püree", "knödel", "pommes", "kroketten", "kartoffelsalat", "süßkartoffel"],
    minPlausiblePriceCents: 129,
    maxPlausiblePriceCents: 449,
    defaultBasePrices: uniformEigenmarke(
      249,
      {
        lidl: "Speisekartoffeln 2 kg",
        aldi: "Speisekartoffeln 2 kg",
        rewe: "ja! Speisekartoffeln 2 kg",
        edeka: "Gut & Günstig Kartoffeln 2 kg",
        kaufland: "K-Classic Speisekartoffeln 2 kg",
        netto: "Markttag Speisekartoffeln 2 kg",
        penny: "Marktliebe Speisekartoffeln 2 kg",
      },
      { rewe: { priceCents: 269 }, edeka: { priceCents: 269 } },
    ),
  },
  {
    id: "gurke_1st",
    name: "Salatgurke",
    shortName: "Gurke",
    subtitle: "1 Stück",
    department: "obst_gemuese",
    unit: "stueck",
    standardAmount: 1,
    includeKeywords: ["salatgurke", "schlangengurke"],
    excludeKeywords: ["gewürzgurken", "cornichons", "gurkensalat", "glas"],
    minPlausiblePriceCents: 39,
    maxPlausiblePriceCents: 149,
    defaultBasePrices: uniformEigenmarke(
      89,
      {
        lidl: "Salatgurke 1 Stück",
        aldi: "Salatgurke 1 Stück",
        rewe: "Salatgurke 1 Stück",
        edeka: "Salatgurke 1 Stück",
        kaufland: "Salatgurke 1 Stück",
        netto: "Salatgurke 1 Stück",
        penny: "Salatgurke 1 Stück",
      },
      { rewe: { priceCents: 99 }, edeka: { priceCents: 99 } },
    ),
  },
  {
    id: "aepfel_1kg",
    name: "Tafeläpfel",
    shortName: "Äpfel",
    subtitle: "1 kg Schale/Beutel",
    department: "obst_gemuese",
    unit: "g",
    standardAmount: 1000,
    includeKeywords: ["tafeläpfel", "äpfel", "elstar", "gala", "braeburn", "pink lady"],
    excludeKeywords: ["apfelsaft", "apfelmus", "apfelmark", "apfelschorle", "apfelringe", "apfelstrudel"],
    minPlausiblePriceCents: 99,
    maxPlausiblePriceCents: 349,
    defaultBasePrices: uniformEigenmarke(
      199,
      {
        lidl: "Deutsche Tafeläpfel 1 kg",
        aldi: "Tafeläpfel 1 kg",
        rewe: "ja! Tafeläpfel 1 kg",
        edeka: "Gut & Günstig Tafeläpfel 1 kg",
        kaufland: "Tafeläpfel 1 kg",
        netto: "Markttag Tafeläpfel 1 kg",
        penny: "Marktliebe Tafeläpfel 1 kg",
      },
      { rewe: { priceCents: 219 }, edeka: { priceCents: 219 } },
    ),
  },

  // 2. Brot & Backwaren
  {
    id: "toastbrot_500g",
    name: "Buttertoast / Sandwichtoast",
    shortName: "Toastbrot",
    subtitle: "500 g Packung",
    department: "backwaren",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["buttertoast", "sandwichtoast", "vollkorntoast", "toastbrot", "american sandwich"],
    excludeKeywords: ["toastkäse", "toastschnitzel", "toaster"],
    minPlausiblePriceCents: 69,
    maxPlausiblePriceCents: 249,
    defaultBasePrices: uniformEigenmarke(99, {
      lidl: "Grafschafter Buttertoast 500 g",
      aldi: "Goldähren Buttertoast 500 g",
      rewe: "ja! Buttertoast 500 g",
      edeka: "Gut & Günstig Buttertoast 500 g",
      kaufland: "K-Classic Buttertoast 500 g",
      netto: "Kornmühle Buttertoast 500 g",
      penny: "Bäckerkrönung Buttertoast 500 g",
    }),
  },
  {
    id: "aufbackbroetchen_6st",
    name: "Weizen-Aufbackbrötchen",
    shortName: "Aufbackbrötchen",
    subtitle: "6–8 Stück Packung",
    department: "backwaren",
    unit: "stueck",
    standardAmount: 6,
    includeKeywords: ["aufbackbrötchen", "weizenbrötchen", "sonntagsbrötchen", "steinofenbrötchen"],
    excludeKeywords: ["paniermehl", "semmelbrösel", "burger"],
    minPlausiblePriceCents: 59,
    maxPlausiblePriceCents: 229,
    defaultBasePrices: uniformEigenmarke(89, {
      lidl: "Grafschafter Weizenbrötchen 6er",
      aldi: "Goldähren Weizenbrötchen 6er",
      rewe: "ja! Weizenbrötchen 6er",
      edeka: "Gut & Günstig Weizenbrötchen 6er",
      kaufland: "K-Classic Weizenbrötchen 6er",
      netto: "Kornmühle Weizenbrötchen 6er",
      penny: "Bäckerkrönung Weizenbrötchen 6er",
    }),
  },

  // 3. Kühlregal & Molkerei
  {
    id: "butter_250g",
    name: "Markenbutter / Süßrahmbutter",
    shortName: "Butter",
    subtitle: "250 g Packung",
    department: "kuehlung",
    unit: "g",
    standardAmount: 250,
    includeKeywords: ["butter", "süßrahmbutter", "mildgesäuerte butter", "markenbutter", "streichfein", "irische butter"],
    excludeKeywords: [
      "butterkäse",
      "buttermilch",
      "erdnussbutter",
      "butterkeks",
      "buttergemüse",
      "buttertoast",
      "buttercroissant",
      "kakaobutter",
      "kräuterbutter-baguette",
      "butterschmalz",
    ],
    minPlausiblePriceCents: 119,
    maxPlausiblePriceCents: 349,
    defaultBasePrices: uniformEigenmarke(239, {
      lidl: "Milbona Deutsche Markenbutter 250 g",
      aldi: "Milsani Deutsche Markenbutter 250 g",
      rewe: "ja! Deutsche Markenbutter 250 g",
      edeka: "Gut & Günstig Markenbutter 250 g",
      kaufland: "K-Classic Deutsche Markenbutter 250 g",
      netto: "Gutes Land Markenbutter 250 g",
      penny: "Elite Deutsche Markenbutter 250 g",
    }),
  },
  {
    id: "vollmilch_1l",
    name: "Vollmilch (3,5 % / 3,8 %)",
    shortName: "Vollmilch",
    subtitle: "1 Liter Packung",
    department: "kuehlung",
    unit: "ml",
    standardAmount: 1000,
    includeKeywords: ["vollmilch", "frischmilch", "h-milch", "weidemilch", "alpenmilch"],
    excludeKeywords: ["milchschokolade", "kokosmilch", "kondensmilch", "milchreis", "milchschnitte", "buttermilch", "müllermilch"],
    minPlausiblePriceCents: 69,
    maxPlausiblePriceCents: 189,
    defaultBasePrices: uniformEigenmarke(99, {
      lidl: "Milbona Frische Vollmilch 1 L",
      aldi: "Milsani Frische Vollmilch 1 L",
      rewe: "ja! Frische Vollmilch 1 L",
      edeka: "Gut & Günstig Vollmilch 1 L",
      kaufland: "K-Classic Frische Vollmilch 1 L",
      netto: "Gutes Land Vollmilch 1 L",
      penny: "Elite Frische Vollmilch 1 L",
    }),
  },
  {
    id: "gouda_400g",
    name: "Gouda jung in Scheiben",
    shortName: "Gouda",
    subtitle: "400 g Packung",
    department: "kuehlung",
    unit: "g",
    standardAmount: 400,
    includeKeywords: ["gouda", "edamer", "butterkäse in scheiben", "käsescheiben"],
    excludeKeywords: ["frischkäse", "käsekuchen", "käsewürstchen", "streichkäse"],
    minPlausiblePriceCents: 149,
    maxPlausiblePriceCents: 449,
    defaultBasePrices: uniformEigenmarke(299, {
      lidl: "Milbona Gouda jung Scheiben 400 g",
      aldi: "Milsani Gouda jung Scheiben 400 g",
      rewe: "ja! Gouda jung Scheiben 400 g",
      edeka: "Gut & Günstig Gouda jung 400 g",
      kaufland: "K-Classic Gouda jung 400 g",
      netto: "Gutes Land Gouda jung 400 g",
      penny: "Selection Gouda jung 400 g",
    }),
  },
  {
    id: "eier_10st",
    name: "Freiland- / Bodenhaltung-Eier",
    shortName: "Eier",
    subtitle: "10er Packung",
    department: "kuehlung",
    unit: "stueck",
    standardAmount: 10,
    includeKeywords: ["frische eier", "bodenhaltung", "freilandeier", "eier aus freilandhaltung", "10 eier"],
    excludeKeywords: ["eierlikör", "eiernudeln", "eierspätzle", "schokoeier", "eiersalat", "überraschungsei"],
    minPlausiblePriceCents: 139,
    maxPlausiblePriceCents: 359,
    defaultBasePrices: uniformEigenmarke(199, {
      lidl: "Frische Eier Bodenhaltung 10er",
      aldi: "Frische Eier Bodenhaltung 10er",
      rewe: "ja! Frische Eier 10er",
      edeka: "Gut & Günstig Frische Eier 10er",
      kaufland: "K-Classic Frische Eier 10er",
      netto: "Kornmühle Frische Eier 10er",
      penny: "Frische Eier 10er",
    }),
  },
  {
    id: "naturjoghurt_500g",
    name: "Naturjoghurt mild",
    shortName: "Joghurt",
    subtitle: "500 g Becher",
    department: "kuehlung",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["naturjoghurt", "joghurt mild", "griechischer joghurt"],
    excludeKeywords: ["joghurtdressing", "joghurtschokolade", "joghurt-gums"],
    minPlausiblePriceCents: 49,
    maxPlausiblePriceCents: 199,
    defaultBasePrices: uniformEigenmarke(85, {
      lidl: "Milbona Joghurt mild 500 g",
      aldi: "Milsani Naturjoghurt 500 g",
      rewe: "ja! Joghurt mild 500 g",
      edeka: "Gut & Günstig Joghurt mild 500 g",
      kaufland: "K-Classic Joghurt mild 500 g",
      netto: "Gutes Land Joghurt mild 500 g",
      penny: "Elite Joghurt mild 500 g",
    }),
  },
  {
    id: "speisequark_500g",
    name: "Speisequark / Magerquark",
    shortName: "Quark",
    subtitle: "500 g Becher",
    department: "kuehlung",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["magerquark", "speisequark"],
    excludeKeywords: ["quarkbällchen", "quarktasche", "kräuterquark"],
    minPlausiblePriceCents: 79,
    maxPlausiblePriceCents: 219,
    defaultBasePrices: uniformEigenmarke(139, {
      lidl: "Milbona Speisequark mager 500 g",
      aldi: "Milsani Speisequark 500 g",
      rewe: "ja! Speisequark mager 500 g",
      edeka: "Gut & Günstig Speisequark 500 g",
      kaufland: "K-Classic Speisequark 500 g",
      netto: "Gutes Land Speisequark 500 g",
      penny: "Elite Speisequark 500 g",
    }),
  },

  // 4. Fleisch & Wurst
  {
    id: "hackfleisch_500g",
    name: "Hackfleisch gemischt / Rinderhack",
    shortName: "Hackfleisch",
    subtitle: "500 g Packung",
    department: "fleisch_wurst",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["hackfleisch", "rinderhackfleisch", "rinderhack", "gemischtes hack"],
    excludeKeywords: ["hackfleischsauce", "fix für hackfleisch", "gewürz"],
    minPlausiblePriceCents: 249,
    maxPlausiblePriceCents: 699,
    defaultBasePrices: uniformEigenmarke(
      399,
      {
        lidl: "Metzgerfrisch Hackfleisch gemischt 500 g",
        aldi: "Meine Metzgerei Hackfleisch gemischt 500 g",
        rewe: "ja! Hackfleisch gemischt 500 g",
        edeka: "Gut & Günstig Hackfleisch gemischt 500 g",
        kaufland: "K-Purland Hackfleisch gemischt 500 g",
        netto: "Gut Ponholz Hackfleisch gemischt 500 g",
        penny: "Mühlenhof Hackfleisch gemischt 500 g",
      },
      { kaufland: { priceCents: 389 } },
    ),
  },
  {
    id: "haehnchenbrust_400g",
    name: "Hähnchenbrustfilet",
    shortName: "Hähnchenbrust",
    subtitle: "400 g Packung",
    department: "fleisch_wurst",
    unit: "g",
    standardAmount: 400,
    includeKeywords: ["hähnchenbrustfilet", "hähnchen-brustfilet", "putenbrustfilet", "hähncheninnenfilet"],
    excludeKeywords: ["aufschnitt", "katzenfutter", "hundefutter", "paniert", "nuggets"],
    minPlausiblePriceCents: 279,
    maxPlausiblePriceCents: 699,
    defaultBasePrices: uniformEigenmarke(449, {
      lidl: "Metzgerfrisch Hähnchenbrustfilet 400 g",
      aldi: "Meine Metzgerei Hähnchenbrustfilet 400 g",
      rewe: "ja! Hähnchenbrustfilet 400 g",
      edeka: "Gut & Günstig Hähnchenbrustfilet 400 g",
      kaufland: "K-Purland Hähnchenbrustfilet 400 g",
      netto: "Gut Ponholz Hähnchenbrustfilet 400 g",
      penny: "Mühlenhof Hähnchenbrustfilet 400 g",
    }),
  },
  {
    id: "kochschinken_200g",
    name: "Hinterkochschinken",
    shortName: "Kochschinken",
    subtitle: "200 g Packung",
    department: "fleisch_wurst",
    unit: "g",
    standardAmount: 200,
    includeKeywords: ["hinterkochschinken", "kochschinken", "saftschinken"],
    excludeKeywords: ["schinkennudeln", "schinken-käse-croissant", "pizza"],
    minPlausiblePriceCents: 119,
    maxPlausiblePriceCents: 299,
    defaultBasePrices: uniformEigenmarke(169, {
      lidl: "Dulano Hinterkochschinken 200 g",
      aldi: "Gut Drei Eichen Hinterkochschinken 200 g",
      rewe: "ja! Hinterkochschinken 200 g",
      edeka: "Gut & Günstig Hinterkochschinken 200 g",
      kaufland: "K-Classic Hinterkochschinken 200 g",
      netto: "Wolf Hinterkochschinken 200 g",
      penny: "Mühlenhof Hinterkochschinken 200 g",
    }),
  },

  // 5. Vorrat & Trockensortiment
  {
    id: "pasta_500g",
    name: "Spaghetti / Pasta (Hartweizen)",
    shortName: "Pasta",
    subtitle: "500 g Packung",
    department: "trocken",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["spaghetti", "fusilli", "penne rigate", "nudeln", "maccheroni", "barilla", "birkel"],
    excludeKeywords: ["fertiggericht", "nudelgericht", "nudelsalat", "instant", "ramen", "dosengericht", "pesto"],
    minPlausiblePriceCents: 49,
    maxPlausiblePriceCents: 249,
    defaultBasePrices: uniformEigenmarke(79, {
      lidl: "Combino Spaghetti 500 g",
      aldi: "Cucina Nobile Spaghetti 500 g",
      rewe: "ja! Spaghetti 500 g",
      edeka: "Gut & Günstig Spaghetti 500 g",
      kaufland: "K-Classic Spaghetti 500 g",
      netto: "Mondo Italiano Spaghetti 500 g",
      penny: "San Fabio Spaghetti 500 g",
    }),
  },
  {
    id: "passierte_tomaten_500g",
    name: "Passierte / Gehackte Tomaten",
    shortName: "Passierte Tomaten",
    subtitle: "500 g Packung / Dose",
    department: "trocken",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["passierte tomaten", "gehackte tomaten", "geschälte tomaten", "tomaten passiert"],
    excludeKeywords: ["tomatensuppe", "ketchup"],
    minPlausiblePriceCents: 45,
    maxPlausiblePriceCents: 199,
    defaultBasePrices: uniformEigenmarke(75, {
      lidl: "Freshona Passierte Tomaten 500 g",
      aldi: "Kings Crown Passierte Tomaten 500 g",
      rewe: "ja! Passierte Tomaten 500 g",
      edeka: "Gut & Günstig Passierte Tomaten 500 g",
      kaufland: "K-Classic Passierte Tomaten 500 g",
      netto: "Mondo Italiano Passierte Tomaten 500 g",
      penny: "San Fabio Passierte Tomaten 500 g",
    }),
  },
  {
    id: "olivenoel_500ml",
    name: "Natives Olivenöl extra",
    shortName: "Olivenöl",
    subtitle: "500 ml – 750 ml Flasche",
    department: "trocken",
    unit: "ml",
    standardAmount: 500,
    includeKeywords: ["olivenöl", "natives olivenöl"],
    excludeKeywords: ["sardinen in olivenöl", "thunfisch in olivenöl", "handcreme", "duschgel"],
    minPlausiblePriceCents: 349,
    maxPlausiblePriceCents: 999,
    defaultBasePrices: uniformEigenmarke(
      599,
      {
        lidl: "Primadonna Natives Olivenöl extra 500 ml",
        aldi: "Cantinelle Natives Olivenöl extra 500 ml",
        rewe: "ja! Natives Olivenöl extra 500 ml",
        edeka: "Gut & Günstig Olivenöl extra 500 ml",
        kaufland: "K-Classic Natives Olivenöl 500 ml",
        netto: "Mondo Italiano Olivenöl 500 ml",
        penny: "San Fabio Olivenöl 500 ml",
      },
      { rewe: { priceCents: 629 }, edeka: { priceCents: 629 } },
    ),
  },
  {
    id: "reis_1kg",
    name: "Basmati- / Jasmin- / Langkornreis",
    shortName: "Reis",
    subtitle: "1 kg Packung",
    department: "trocken",
    unit: "g",
    standardAmount: 1000,
    includeKeywords: ["basmatireis", "basmati-reis", "jasminreis", "langkornreis", "parboiled reis"],
    excludeKeywords: ["milchreis", "reiswaffeln", "reismilch", "reisgericht"],
    minPlausiblePriceCents: 119,
    maxPlausiblePriceCents: 449,
    defaultBasePrices: uniformEigenmarke(219, {
      lidl: "Golden Sun Basmatireis 1 kg",
      aldi: "Bon-Ri Basmatireis 1 kg",
      rewe: "ja! Basmatireis 1 kg",
      edeka: "Gut & Günstig Basmatireis 1 kg",
      kaufland: "K-Classic Basmatireis 1 kg",
      netto: "Saphir Basmatireis 1 kg",
      penny: "Penny Basmatireis 1 kg",
    }),
  },
  {
    id: "haferflocken_500g",
    name: "Haferflocken (zart / kernig)",
    shortName: "Haferflocken",
    subtitle: "500 g Packung",
    department: "trocken",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["haferflocken", "zarte haferflocken", "kernige haferflocken", "kölln"],
    excludeKeywords: ["haferdrink", "hafermilch", "haferkekse", "riegel"],
    minPlausiblePriceCents: 49,
    maxPlausiblePriceCents: 199,
    defaultBasePrices: uniformEigenmarke(79, {
      lidl: "Crownfield Haferflocken 500 g",
      aldi: "Knusperone Haferflocken 500 g",
      rewe: "ja! Haferflocken 500 g",
      edeka: "Gut & Günstig Haferflocken 500 g",
      kaufland: "K-Classic Haferflocken 500 g",
      netto: "Kornmühle Haferflocken 500 g",
      penny: "Penny Haferflocken 500 g",
    }),
  },

  // 6. Tiefkühlkost
  {
    id: "tk_pizza_1st",
    name: "Tiefkühl-Pizza (Salami / Margherita)",
    shortName: "TK-Pizza",
    subtitle: "320–400 g Packung",
    department: "tiefkuehl",
    unit: "g",
    standardAmount: 350,
    includeKeywords: ["steinofenpizza", "tk-pizza", "ristorante", "ofentrische", "die backfrische", "gustavo gusto", "pizza salami", "pizza speciale"],
    excludeKeywords: ["pizzamehl", "pizzateig", "pizzakäse", "pizzaschneider"],
    minPlausiblePriceCents: 129,
    maxPlausiblePriceCents: 499,
    defaultBasePrices: uniformEigenmarke(
      269,
      {
        lidl: "Trattoria Alfredo Steinofenpizza 350 g",
        aldi: "Mama Mancini Steinofenpizza 350 g",
        rewe: "ja! Steinofenpizza 350 g",
        edeka: "Gut & Günstig Steinofenpizza 350 g",
        kaufland: "K-Classic Steinofenpizza 350 g",
        netto: "Mondo Italiano Pizza 350 g",
        penny: "San Fabio Steinofenpizza 350 g",
      },
      { rewe: { priceCents: 279 }, edeka: { priceCents: 279 } },
    ),
  },

  // 7. Getränke & Kaffee
  {
    id: "filterkaffee_500g",
    name: "Röstkaffee / Filterkaffee gemahlen",
    shortName: "Kaffee",
    subtitle: "500 g Vakuumpackung",
    department: "getraenke",
    unit: "g",
    standardAmount: 500,
    includeKeywords: ["röstkaffee", "filterkaffee", "dallmayr prodomo", "jacobs krönung", "melitta auslese", "tchibo feine milde", "eduscho"],
    excludeKeywords: ["kaffeefilter", "kaffeesahne", "eiskaffee", "kaffeemaschine", "kapseln"],
    minPlausiblePriceCents: 329,
    maxPlausiblePriceCents: 849,
    defaultBasePrices: uniformEigenmarke(
      499,
      {
        lidl: "Bellarom Röstkaffee Gold 500 g",
        aldi: "Moreno Röstkaffee 500 g",
        rewe: "ja! Röstkaffee 500 g",
        edeka: "Gut & Günstig Röstkaffee 500 g",
        kaufland: "K-Classic Röstkaffee 500 g",
        netto: "Cafféapiro Röstkaffee 500 g",
        penny: "Adelholz Röstkaffee 500 g",
      },
      { rewe: { priceCents: 529 }, edeka: { priceCents: 529 } },
    ),
  },
  {
    id: "mineralwasser_6x15l",
    name: "Mineralwasser (Sixpack)",
    shortName: "Mineralwasser",
    subtitle: "6 × 1,5 Liter",
    department: "getraenke",
    unit: "ml",
    standardAmount: 9000,
    includeKeywords: ["mineralwasser", "natürliches mineralwasser", "volvic", "gerolsteiner", "vittel"],
    excludeKeywords: ["wassermelone", "wasserkocher", "gesichtswasser", "mundwasser"],
    minPlausiblePriceCents: 129,
    maxPlausiblePriceCents: 599,
    defaultBasePrices: uniformEigenmarke(174, {
      lidl: "Saskia Mineralwasser 6×1,5 L",
      aldi: "Quellbrunn Mineralwasser 6×1,5 L",
      rewe: "ja! Mineralwasser 6×1,5 L",
      edeka: "Gut & Günstig Mineralwasser 6×1,5 L",
      kaufland: "K-Classic Mineralwasser 6×1,5 L",
      netto: "Natuvell Mineralwasser 6×1,5 L",
      penny: "וב Mineralwasser 6×1,5 L",
    }),
  },

  // 8. Haushalt & Drogerie
  {
    id: "toilettenpapier_8st",
    name: "Toilettenpapier 3-/4-lagig",
    shortName: "Toilettenpapier",
    subtitle: "8–10 Rollen Packung",
    department: "haushalt",
    unit: "stueck",
    standardAmount: 8,
    includeKeywords: ["toilettenpapier", "klopapier", "zewa", "hakle", "floralys", "kokett"],
    excludeKeywords: ["feuchtes toilettenpapier", "küchentücher", "taschentücher"],
    minPlausiblePriceCents: 199,
    maxPlausiblePriceCents: 549,
    defaultBasePrices: uniformEigenmarke(295, {
      lidl: "Floralys Toilettenpapier 3-lagig 8er",
      aldi: "Kokett Toilettenpapier 3-lagig 8er",
      rewe: "ja! Toilettenpapier 3-lagig 8er",
      edeka: "Gut & Günstig Toilettenpapier 8er",
      kaufland: "K-Classic Toilettenpapier 8er",
      netto: "Frotto Toilettenpapier 8er",
      penny: "Happy End Toilettenpapier 8er",
    }),
  },
] as const;

export const CATEGORY_MAP: Record<string, CategoryDefinition> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export interface ShoppingPreset {
  id: string;
  name: string;
  description: string;
  items: readonly { categoryId: string; quantity: number }[];
}

export const SHOPPING_PRESETS: readonly ShoppingPreset[] = [
  {
    id: "wochen_basics",
    name: "Typischer Wocheneinkauf (12 Artikel)",
    description: "Milch, Butter, Eier, Käse, Hackfleisch, Hähnchen, Pasta, Kaffee, Obst & Gemüse, Toilettenpapier",
    items: [
      { categoryId: "butter_250g", quantity: 2 },
      { categoryId: "vollmilch_1l", quantity: 2 },
      { categoryId: "eier_10st", quantity: 1 },
      { categoryId: "gouda_400g", quantity: 1 },
      { categoryId: "hackfleisch_500g", quantity: 1 },
      { categoryId: "haehnchenbrust_400g", quantity: 1 },
      { categoryId: "pasta_500g", quantity: 2 },
      { categoryId: "passierte_tomaten_500g", quantity: 2 },
      { categoryId: "filterkaffee_500g", quantity: 1 },
      { categoryId: "bananen_1kg", quantity: 1 },
      { categoryId: "rispentomaten_500g", quantity: 1 },
      { categoryId: "toilettenpapier_8st", quantity: 1 },
    ],
  },
  {
    id: "fruehstueck",
    name: "Frühstück & Kaffee (6 Artikel)",
    description: "Kaffee, Butter, Aufbackbrötchen, Eier, Gouda, Milch",
    items: [
      { categoryId: "filterkaffee_500g", quantity: 1 },
      { categoryId: "butter_250g", quantity: 1 },
      { categoryId: "aufbackbroetchen_6st", quantity: 1 },
      { categoryId: "eier_10st", quantity: 1 },
      { categoryId: "gouda_400g", quantity: 1 },
      { categoryId: "vollmilch_1l", quantity: 1 },
    ],
  },
  {
    id: "bolognese_abend",
    name: "Spaghetti Bolognese & Salat (5 Artikel)",
    description: "Spaghetti, Hackfleisch, Passierte Tomaten, Olivenöl, Salatgurke",
    items: [
      { categoryId: "pasta_500g", quantity: 2 },
      { categoryId: "hackfleisch_500g", quantity: 1 },
      { categoryId: "passierte_tomaten_500g", quantity: 2 },
      { categoryId: "olivenoel_500ml", quantity: 1 },
      { categoryId: "gurke_1st", quantity: 1 },
    ],
  },
];
