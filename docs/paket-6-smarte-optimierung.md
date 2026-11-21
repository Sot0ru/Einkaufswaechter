# Arbeitspaket 6: Smartere Einkaufs- & Optimierungslogik

> **Status:** Umgesetzt durch Claude (Ausbaustufe 3, Paket 2)  
> **Basis:** `main` (240 Alltags-Kategorien, Designrichtung „Laufroute“, 7-Ketten-Live-Scraper)

## Ziel

Die Optimierungs-Engine (`src/lib/rules/optimizer.ts`) von einem reinen Preisvergleich zu einem alltagsnahen Einkaufsplaner weiterentwickeln – ohne externe KI-Abhängigkeit, rein regelbasiert und vollständig offline-/demo-fähig.

## Enthaltene Funktionen

### 1. Gerichte-Baukasten & „Was ist diese Woche günstig zu kochen?“
- **Datenmodell (idempotent in `src/db/migrate.ts` & `src/db/schema.ts`):**
  - `recipes` (`id`, `name`, `servings`, `prepMinutes`, `tags`, `isBuiltin`, `createdAt`)
  - `recipe_ingredients` (`id`, `recipeId`, `categoryId`, `quantity`)
- **Standard-Rezepte (Offline-Seed):** 15–20 beliebte deutsche Alltagsgerichte (*Spaghetti Bolognese, Kartoffel-Gemüse-Pfanne, Linsencurry, Pfannkuchen, Käsespätzle, Chili sin Carne, Hähnchen-Reis-Bowl, Flammkuchen …*).
- **Angebots-Scoring (`scoreRecipesForWeek`):** Berechnet für jedes Gericht den aktuellen Wochen-Kassenpreis vs. Normalpreis und sortiert nach prozentualer/absoluter Ersparnis (*„Diese Woche 3,40 € günstiger durch Angebote bei Lidl“*).
- **UI („Laufroute“-Stil):** Neuer Bereich im Tab **Einkaufsliste** zum Anlegen eigener Gerichte und 1-Klick-Hinzufügen aller Zutaten auf die Wochenliste (inkl. Mengen-Skalierung nach Portionen).

### 2. Produkt-Präferenz pro Artikel (`Eigenmarke · Bio · Marke`)
- Erweiterung von `BasketItemInput` um optionales Feld `preference?: "cheapest" | "bio" | "brand"`.
- **Regelbasierte Klassifikation:**
  - `bio`: Bevorzugt Kategorien/Angebote mit Bio-/Demeter-/Naturland-Merkmal (oder Bio-Referenzpreis-Faktor).
  - `brand`: Bewertet Marken-Angebote gegen realistischen Marken-Referenzpreis statt Eigenmarken-Tiefstpreis.
  - `cheapest` (Standard): Unverändertes Verhalten (günstigster Kassenpreis).
- Kompakte Auswahl direkt am Artikel in `ShoppingListView.tsx`.

### 3. Vorrats-Tipp bei haltbaren Dauerbrennern
- Neues optionales Flag `isPantryStaple: boolean` in `CategoryDefinition` (z. B. Kaffee, Pasta, Olivenöl, Passierte Tomaten, Toilettenpapier, Waschmittel, Haferflocken).
- Wenn ein haltbarer Artikel um mindestens **25 % unter Normalpreis** liegt, erzeugt `optimizer.ts` einen kompakten Hinweis `stockUpHint`: z. B. *„Vorratstipp: 2× mitnehmen spart zusätzlich 2,10 € gegenüber Normalpreis“*.
- Anzeige direkt unter dem bestehenden `bulkPackHint` in `InStoreView.tsx` und `CompareView.tsx`.

### 4. Entfernungs- & Umweg-Gewichtung im Smart-Split
- In `SettingsPanel.tsx` kann pro aktivem Markt optional die persönliche **Entfernung / Umweg-Zeit in Minuten** hinterlegt werden (z. B. *Lidl 3 Min., Kaufland 15 Min.*), gespeichert in `app_settings` / `localStorage`.
- Erweiterung von `OptimizationInput` um `storeDetourMinutes?: Partial<Record<StoreId, number>>` und `minSavingsPerDetourMinuteCents?: number` (Standard z. B. 50 ct/Min.).
- Ein Abstecher zum Zweitladen wird nur empfohlen, wenn **sowohl** die Euro-Schwelle (`secondStoreThresholdCents`) **als auch** die Umweg-Effizienz erreicht ist. Hauptladen-Tie-Breaking bleibt unverändert erhalten.

## API & Endpunkte
- `GET / POST / DELETE /api/v1/recipes` (mit `await connection()`, Zod-Validierung)
- Erweiterung von `POST /api/v1/optimize` um optionale Felder `preference` und `storeDetourMinutes` (100 % abwärtskompatibel).

## Akzeptanzkriterien & Tests
- [x] Alle neuen Optimierungsregeln (Gerichte-Score, `preference`, `stockUpHint`, Umweg-Gewichtung) in `src/lib/__tests__/optimizer.test.ts` und neuem `src/lib/__tests__/recipes.test.ts` abgedeckt.
- [x] Bestehende Tests und Hauptladen-Tie-Breaking unverändert grün.
- [x] Vollständige Offline-/PWA-Kompatibilität über `localStorage`.
- [x] Pflicht-Checks (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:pwa`) grün.

## Umsetzungsnotizen

- **Regeln:** `src/lib/rules/recipes.ts` (19 Standard-Gerichte, Portionsskalierung, `scoreRecipesForWeek`), `src/lib/rules/preferences.ts` (Bio-/Marken-Erkennung, Referenzpreis-Faktoren Bio ×1,6 und Marke ×1,8 auf den Eigenmarken-Normalpreis), `src/lib/rules/store-brands.ts` (gemeinsame Eigenmarken-Liste für Bon-Parser und Präferenz).
- **Optimierer:** `BasketItemInput.preference`, `ResolvedStoreItem.stockUpHint` (ab 25 % Rabatt bei `isPantryStaple`), `storeDetourMinutes` und `minSavingsPerDetourMinuteCents` (Standard 50 ct/Min.). Gezählt wird der Umweg zum Zweitladen; lohnende Abstecher haben bei der Split-Auswahl Vorrang, sodass ein naher Markt zum Abstecher werden kann.
- **Daten & API:** Tabellen `recipes` und `recipe_ingredients`, Service `src/lib/services/recipes.ts`, `GET/POST/DELETE /api/v1/recipes`, `POST /api/v1/optimize` mit `preference` und `storeDetourMinutes`.
- **Oberfläche:** `RecipesPanel.tsx` im Tab Einkaufsliste, Qualitäts-Auswahl je Artikel, Umwege in den Einstellungen, Vorratstipps im Laden und beim Abstecher.
