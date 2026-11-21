/**
 * Eigenmarken-Kennungen der Ketten in Kleinschreibung (inkl. typischer Bon-Abkürzungen).
 * Wird vom Kassenbon-Parser und von der Produkt-Präferenz („Marke“) genutzt.
 */
export const STORE_BRAND_MARKERS = [
  "ja!",
  "gut & günstig",
  "gut&günstig",
  "g&g",
  "k-classic",
  "k-cl",
  "k-purland",
  "milbona",
  "milb.",
  "milsani",
  "metzgerfrisch",
  "metzgerfr.",
  "meine metzgerei",
  "combino",
  "freshona",
  "bellarom",
  "floralys",
  "kokett",
  "grafschafter",
  "goldähren",
  "gutes land",
  "markttag",
  "marktliebe",
  "dulano",
  "elite",
  "san fabio",
  "mühlenhof",
  "saskia",
  "quellbrunn",
  "crownfield",
  "knusperone",
  "vemondo",
  "myvay",
  "w5",
  "tandil",
  "all seasons",
  "bäckerkrönung",
  "gut ponholz",
  "kings crown",
  "kornmühle",
  "mondo italiano",
  "natuvell",
  "priva",
  "rio d'oro",
  "solevita",
  "today",
] as const;

export const isStoreBrandLabel = (label: string): boolean => {
  const lower = label.toLowerCase();
  return STORE_BRAND_MARKERS.some((marker) => lower.includes(marker));
};
