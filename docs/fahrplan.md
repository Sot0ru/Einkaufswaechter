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

- [x] Erweiterung des Standard-Katalogs von den wichtigsten 20 Kern-Kategorien auf **240 normierte Alltags-Kategorien** über alle 8 Abteilungen (inkl. Bio-, Saison-, Vegan-, Baby- & Tierbedarf-Artikeln, Wortgrenzen-Schutz und vollständiger Matcher-Selbsttests).
- [x] Hintergrund-Cronjob (`/api/cron/fetch-offers?live=true`) & PLZ-API (`/api/v1/offers`) für automatisierten wöchentlichen Angebots-Abruf nach Postleitzahl (inkl. 5 deutscher Handelsregionen, Aldi-Äquator Nord/Süd, externem JSON-Feed-Adapter mit Offline-Fallback und `offer_fetch_runs`-Protokollierung).
- [x] **7-Ketten Live-Scraper-Engine (`src/lib/providers/chain-scrapers.ts`, `/api/v1/offers/scrape`):** Strukturierte Extraktion aus `schema.org` JSON-LD, `__NEXT_DATA__`/Embedded-JSON und HTML-Angebotskacheln für Lidl, Aldi (Nord/Süd), Rewe, Edeka, Kaufland, Netto & Penny – mit strikter Anti-Bot-/CAPTCHA-Respektierung und nahtlosem Regional-Fallback.
- [x] Persistente Einkaufslisten (`/api/v1/lists`) & eigene 1-Klick-Basispreis-Korrektur im Laden (`/api/v1/base-prices`).
- [x] **Kassenbon / E-Bon Crowdsourcing (`/api/v1/receipts/import`):** Deterministischer Kassenbon-Parser (Kette, PLZ, Wiegeware `kg × €/kg`, Mehrfachmengen, Rabatt-/App-Coupon-Zeilen, Pfand-Filter) + selbstlernendes Kürzel-Wörterbuch (`receipt_aliases`) und `receipt_observations`.

## Ausbaustufe 3: Datenqualität, Gerichte-Baukasten & Haushalts-Sync

- [x] **Noch echtere Preise & Datenqualität (Paket 1):**
  - 90-Tage-Preishistorie, Schnäppchen-Ampel (*Echter Tiefstpreis*, *Gutes Angebot*, *Schein-Angebot*) & Shrinkflation-Wächter (`src/lib/rules/price-intelligence.ts`, `/api/v1/price-history`).
  - Preiskonfidenz-Badges (*Live-Angebot*, *Per Bon/Scan geprüft*, *Von dir angepasst*, *Richtpreis*) in Vergleich, Abhakliste und Angebotsliste.
  - Barcode-Scanner im Laden mit Open Food Facts API, lokalem DB-Cache (`barcode_products`) & Offline-Demo-Referenz (`src/lib/providers/barcode-lookup.ts`, `/api/v1/barcode`, `BarcodeScannerPanel.tsx`).
  - Lokale Kassenbon-Foto-OCR im Browser (`tesseract.js`) & E-Bon-PDF-Import (`src/lib/providers/browser-ocr.ts`).
  - Zero-Dependency PDF-/HTML-Prospekt-Dropzone (`src/lib/providers/pdf-brochure-parser.ts`) direkt im Angebots-Tab.
- [x] **Smartere Einkaufs- & Optimierungslogik (Paket 2 – `docs/paket-6-smarte-optimierung.md`):** Gerichte-Baukasten („Was ist diese Woche günstig zu kochen?“), Eigenmarke/Bio/Marke-Filter, Vorrats-Tipp & Entfernungs-Gewichtung im Smart-Split.
- [x] **Alltag im Laden & Haushalt (Paket 3 – `docs/paket-7-alltag-haushalt.md`):** Geteilte Haushalts-Liste per Link/QR-Code, Wochen-Alert für Lieblingsprodukte & Kassenzettel-Gegencheck.

## Ausbaustufe 4: Vollsortiment & echte Filial-Daten (OSM)

- [x] **Vollsortiment & Eigene Artikel (Paket 8):**
  - Ausbau des Standard-Katalogs von 240 auf **405 normierte Alltags-Kategorien** über alle 8 Abteilungen (`src/lib/rules/catalog-vollsortiment.ts`, `src/lib/rules/catalog.ts`) mit 2.835 Eigenmarken-Referenzpreisen und vollständigen Matcher-Kollisionstests.
  - Intelligente Marken- & Synonym-Suche (`searchCatalogCategories`, z. B. *Nutella*, *Pampers*, *Pringles*, *Kerrygold*).
  - Freie **Eigene Artikel** (`CustomBasketItem`) in Einkaufsliste und Laufroute im Laden (inkl. `localStorage`/PWA-Persistenz).
- [x] **Echte Filial-Entfernungen, Öffnungszeiten & Feiertags-Wächter (Paket 9):**
  - Kostenlose OpenStreetMap/Overpass- & Nominatim-Anbindung (`src/lib/providers/store-locator.ts`, `GET /api/v1/stores/nearby`) mit 7-Tage-DB-Cache (`store_locations`) und Offline-Fallback.
  - Deterministischer OSM-`opening_hours`-Parser und deutscher Feiertags-Rechner nach PLZ-Bundesland (`src/lib/rules/opening-hours.ts`) inkl. automatischer Übernahme realer Wegzeiten in die Smart-Split-Umweg-Minuten sowie Karten-Links in `CompareView` und `InStoreView`.
- [ ] **Haushaltsbudget, Einkaufs-Archiv & Spar-Bilanz (Paket 10):** Monats-/Wochenbudget, Einkaufs-Archiv mit realer Ersparnis-Bilanz und CSV-Export.
- [ ] **Vorratsschrank, MHD-Radar & 7-Tage-Wochen-Essensplan (Paket 11):** Doppelkauf-Schutz, Reste-Küche & Pfand-/Leergut-Rechner.
