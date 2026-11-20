# Einkaufswächter

Wocheneinkaufs-Optimierer für Deutschland (**Lidl, Aldi, Rewe, Edeka, Kaufland, Netto, Penny**).

Du schreibst deine Einkaufsliste ganz normal nach **allgemeinen Produktkategorien** (z. B. *„Butter 250g“*, *„Vollmilch 1L“*, *„Rinderhack 500g“*, *„Spaghetti 500g“*). **Einkaufswächter** kombiniert eine Basispreis-Datenbank der günstigsten Eigenmarken mit aktuellen **Wochenangeboten** (inkl. Gültigkeit ab Montag vs. Donnerstag und optionalen Treue-App-Rabatten wie *Lidl Plus*, *Kaufland Card* oder *Rewe Bonus*) und berechnet in Echtzeit:

1. **Alles in 1 Laden:** Welcher einzelne Supermarkt ist diese Woche für deinen gesamten Warenkorb am günstigsten?
2. **Smart-Split (max. 2 Läden):** Lohnt sich ein kurzer Abstecher zu einem zweiten Markt nur für die echten Wochen-Knaller (z. B. erst ab ≥ 5,00 € Zusatz-Ersparnis)?
3. **Abhak-Liste nach Laufroute:** Getrennte Einkaufslisten pro Markt, sortiert nach Abteilungen (*Obst & Gemüse → Backwaren → Kühlregal → Fleisch & Wurst → Trockensortiment → Tiefkühl → Getränke → Haushalt*) – inklusive konkretem Hinweis, zu welcher Marke/Packung du beim Angebot im Regal greifen musst.

---

## Kernfunktionen

- **7 Supermarkt- & Discounter-Ketten:** Lidl, Aldi (Nord/Süd), Rewe, Edeka, Kaufland, Netto Marken-Discount, Penny.
- **Allgemeiner Kategorie-Katalog statt Barcode-Chaos:** Normierte Alltags-Kategorien mit hinterlegten Eigenmarken-Standardpreisen je Kette.
- **Deterministischer, regelbasierter Angebots-Matcher (`src/lib/rules/matcher.ts`):**
  - Verhindert klassische Wort-Fallen (z. B. *„Butterkäse“*, *„Erdnussbutter“* oder *„Buttermilch“* werden **nicht** als `Butter 250g` fehlinterpretiert).
  - Liest Packungsgrößen (`250 g`, `0,5 l`, `1 kg`) und Grundpreise (`€/kg`, `€/L`) automatisch aus Prospekt-Zeilen.
  - Erkennt App-Coupons (*„Mit Lidl Plus“*, *„Kaufland Card“*, *„Rewe Bonus“*) und berücksichtigt sie nur, wenn du die jeweilige App aktiviert hast.
- **Einkaufstag-Filter (Mo–Sa vs. Do–Sa):** Wenn du deinen Einkauf für Samstag planst, fließen die Donnerstags-/Wochenend-Angebote automatisch ein.
- **Kassenpreis + Großpackungs-Hinweis:** Optimiert nach dem echten Betrag an der Kasse, zeigt aber sofort an, wenn ein Aktions-Großpack im Grundpreis (`€/kg`) deutlich günstiger ist.
- **Hauptladen-Tie-Breaking:** Beim 2-Läden-Split bleiben alle gleich teuren Standardartikel im Hauptladen – im Zweitladen stehen garantiert nur die wenigen echten Aktions-Schnäppchen.

---

## Lokale Entwicklung

Voraussetzung: Node.js 22+. Es wird **keine** lokale Postgres-Installation benötigt – im Entwicklungs- und Testbetrieb läuft automatisch **PGlite** im Prozess.

```bash
npm install
npm run dev
```

Die App ist anschließend unter `http://localhost:3000` erreichbar.

### Pflicht-Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

---

## Projektstruktur

- `src/lib/rules/catalog.ts` – Die 7 Ketten, Abteilungs-Laufroute, Standard-Kategorien mit Include-/Exclude-Regeln und Eigenmarken-Basispreisen.
- `src/lib/rules/matcher.ts` – Regelbasierter Parser & Kategorie-Matcher für Prospekt- und Angebotszeilen.
- `src/lib/rules/optimizer.ts` – Warenkorb-Optimierer (1-Laden-Ranking, 2-Läden-Smart-Split mit Tie-Breaking, Schwellenwert-Prüfung, Abteilungs-Checklisten).
- `src/lib/providers/` – Provider-Architektur (`DemoOfferProvider` + `parseBrochureText` für Prospekt-Freitext-Import).
- `src/db/` – Idempotente Migrationen (`migrate.ts`), Drizzle-Schema (`schema.ts`), PGlite/Postgres-Connector (`index.ts`) und Seeding (`seed.ts`).
- `src/app/` – Next.js 16 App Router Oberfläche & JSON-API (`/api/v1/optimize`, `/api/v1/offers/import`).
