# Fahrplan – Einkaufswächter

## Ausbaustufe 1: Fundament & Optimierungs-Kern (Initiales Release)

- [x] **Kategorie-Katalog & Basispreise (`src/lib/rules/catalog.ts`):**
  - 7 Ketten (Lidl, Aldi, Rewe, Edeka, Kaufland, Netto, Penny) inkl. Treue-App-Metadaten.
  - 8 Supermarkt-Abteilungen in typischer Laufreihenfolge.
  - Normierte Alltags-Kategorien mit Eigenmarken-Referenzpreisen, Standard-Packungsgrößen und Plausibilitäts-Korridoren.
- [x] **Regelbasierter Angebots-Matcher (`src/lib/rules/matcher.ts`):**
  - Deterministisches Keyword-Matching mit Negativ-Ausschlüssen (z. B. Schutz vor der „Butterkäse-Falle“).
  - Einheiten- & Packungsgrößen-Parser (`g`, `kg`, `ml`, `l`, `Stück`) sowie Grundpreis-Berechnung (`€/kg`, `€/L`).
  - Erkennung von Kundenkarten-/App-Bedingungen (*Lidl Plus*, *Kaufland Card*, *Rewe Bonus*, *Penny App*, *Netto App*, *Edeka App*).
- [x] **Warenkorb-Optimierer (`src/lib/rules/optimizer.ts`):**
  - Einzelmarkt-Vergleich über alle ausgewählten Ketten am geplanten Einkaufstag.
  - 2-Läden-Smart-Split über alle $\binom{k}{2}$ Markt-Kombinationen mit Hauptladen-Tie-Breaking und frei wählbarer Ersparnis-Schwelle (Standard: 5,00 €).
  - Berechnung nach tatsächlichem Kassenpreis für die benötigte Menge + Hinweis auf günstigere Aktions-Großpackungen.
  - Abteilungs-sortierte Abhak-Listen pro Markt mit konkretem Regal-Griffhinweis.
- [x] **Datenbank & API (`src/db/`, `src/app/api/v1/`):**
  - Idempotentes Schema auf Postgres / PGlite (`stores`, `categories`, `base_prices`, `weekly_offers`, `shopping_lists`, `shopping_list_items`).
  - Deterministischer Demo-Provider + Freitext-Prospekt-Importer.
- [x] **Mobile-first Web-Oberfläche (`src/app/`):**
  - Einkaufsliste mit Schnellwahl & Vorlagen („Wochen-Basics“, „Frühstück“, „Pasta-Abend“).
  - Live-Optimierung (1 Laden vs. Smart-Split), Einkaufstag-Wahl (Mo–Mi vs. Do–Sa), Treue-App-Schalter.
  - Abhak-Modus im Laden und Prospekt-Tester.

## Ausbaustufe 2: Ausbau Katalog & Automatisierter PLZ-Abruf

- [x] Erweiterung des Standard-Katalogs von den wichtigsten 20 Kern-Kategorien auf 172 normierte Alltags-Kategorien über alle 8 Abteilungen (inkl. Wortgrenzen-Schutz und vollständiger Matcher-Selbsttests).
- [ ] Hintergrund-Cronjob (`/api/cron/fetch-offers`) für automatisierten wöchentlichen Angebots-Abruf nach PLZ.
- [ ] Persistente Einkaufslisten & eigene Basispreis-Korrektur im Laden mit 1 Klick.

## Ausbaustufe 3: Gerichte-Baukasten & Haushalts-Sync

- [ ] Eigene Gerichte/Rezepte speichern und mit 1 Klick auf die Wochenliste setzen.
- [ ] Geteilte Haushalts-Listen per Einladungs-Link.
