# Arbeitspaket 7: Alltag im Laden & Haushalt

> **Status:** Umgesetzt durch Claude (Ausbaustufe 3, Paket 3)  
> **Basis:** `main` (240 Alltags-Kategorien, Designrichtung „Laufroute“, Kassenbon-Crowdsourcing, Mobile PWA)

## Ziel

Den Wocheneinkauf im Mehrpersonen-Haushalt nahtlos nutzbar machen: geteilte Listen mit Live-Abgleich im Laden, gezielte Wochen-Benachrichtigungen für Lieblingsprodukte und ein automatischer Gegencheck nach dem Einkauf zwischen geplanter Liste und echtem Kassenbon.

## Enthaltene Funktionen

### 1. Geteilte Haushalts-Liste per Einladungs-Link & QR-Code
- **Datenmodell (idempotent in `src/db/migrate.ts` & `src/db/schema.ts`):**
  - `household_shares` (`shareCode` kryptografisch zufällig 10 Zeichen, `listId`, `updatedAt`, `expiresAt`)
  - Optimistisches Locking / Zeitstempel pro Position (`shopping_list_items.checked`, `updated_at`), damit zwei Personen parallel im Laden abhaken können.
- **API:**
  - `POST /api/v1/lists/share` (erzeugt teilbaren Link + QR-Code ohne Kontozwang)
  - `GET / PATCH /api/v1/lists/share/[code]` (lädt Liste & synchronisiert abgehakte Artikel per Polling/SSE)
- **Offline-Fallback (PWA):** Kompakte Base64-Snapshot-URL für reines Offline-Teilen einer Liste ohne Serververbindung.
- **UI („Laufroute“-Stil):** Button „Liste teilen“ in `SavedListsPanel.tsx` und Status-Hinweis in `InStoreView.tsx` (*„Gemeinsame Liste · zuletzt vor 12 Sek. abgeglichen“*).

### 2. Wochen-Alert für Lieblingsprodukte („Stammprodukte im Angebot“)
- **Favoriten-Markierung:** Herz-/Stern-Umschalter pro Kategorie in `ShoppingListView.tsx`, persistiert in `app_settings` (`favorite_categories`) bzw. `localStorage`.
- **Wochen-Radar (`evaluateFavoriteAlerts`):**
  - Vergleicht markierte Stammprodukte automatisch mit den aktuellen Wochenangeboten (`weekly_offers`) für die aktive PLZ.
  - Zeigt im Tab **Preisvergleich** und **Angebote** eine kompakte Karte: *„4 deiner Lieblingsprodukte sind diese Woche im Angebot (bis zu 4,20 € Ersparnis)“* mit 1-Klick-Button „Alle auf die Liste“.
  - Optional: Browser-Notification (PWA Notification API) oder exportierbare Kalender-Erinnerung (`.ics`, Montag 07:30 Uhr) ohne externen Push-Server.

### 3. Kassenzettel-Gegencheck (Geplant vs. Tatsächlich bezahlt)
- **Abgleich-Engine (`reconcileReceiptWithBasket`):**
  - Vergleicht die abgehakten Artikel aus `InStoreView` (geplanter Kassenpreis je Position) mit den erkannten Positionen eines importierten Kassenbons (`receipt-importer.ts`).
  - Liefert pro Position: `plannedCents`, `actualCents`, `deltaCents`, Status (`matched`, `price_changed`, `unplanned_extra`, `missing_from_receipt`).
  - Gesamtauswertung: *„Geplant: 42,80 € · Bezahlt: 41,30 € · 1,50 € günstiger als erwartet“* sowie direkte Übernahme erkannter Preisabweichungen in `base_prices`.
- **UI:** Neuer Bereich „Gegencheck mit letztem Einkauf“ direkt nach dem Bon-Import in `ReceiptImportPanel.tsx`.

## Datenschutz & Rechtliches
- Kein Benutzerkonto und keine personenbezogenen Daten erforderlich; geteilte Listen nutzen zufällige unerratbare Codes (`shareCode`) und laufen optional automatisch ab.
- Kassenbon-Gegencheck speichert ausschließlich anonymisierte Preisbeobachtungen (`storeId`, `zipCode`, `categoryId`, `priceCents`).

## Akzeptanzkriterien & Tests
- [x] Unit- & PGlite-Tests für Share-Sync, Favoriten-Alerts und Kassenzettel-Gegencheck (`src/lib/__tests__/household-sync.test.ts`).
- [x] Vollständiger Demo-/Offline-Modus ohne Server-Abhängigkeit.
- [x] Pflicht-Checks (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:pwa`) grün.

## Umsetzungsnotizen

- **Geteilte Liste:** `src/lib/services/household-shares.ts` (10-stellige Codes aus `crypto.randomInt` ohne verwechselbare Zeichen, Standard-Gültigkeit 14 Tage, pro Liste wird ein gültiger Code wiederverwendet), Abgleich pro Position nach „letzte Änderung gewinnt“ über `shopping_list_items.updated_at`; Zeitpunkte aus der Zukunft werden auf die Serverzeit begrenzt. Der Client fragt im Laden alle 5 Sekunden ab (`src/components/useHouseholdShare.ts`) und puffert Haken, solange keine Verbindung besteht.
- **Offline-Schnappschuss:** `src/lib/rules/list-snapshot.ts` kodiert Name und Artikel Base64url im Link (`#liste=…`), ohne Abgleich der Haken. Die PWA nutzt das automatisch, wenn kein Server erreichbar ist.
- **QR-Code:** über `qrcode-generator` (MIT, ohne Abhängigkeiten), als SVG gezeichnet.
- **Stammprodukte:** `src/lib/rules/favorites.ts` (`evaluateFavoriteAlerts`, `.ics`-Erinnerung jeden Montag 7:30 Uhr Ortszeit), Speicherung in `app_settings.favorite_categories` über `GET/PUT /api/v1/favorites` und in `localStorage`. Auf eine Browser-Benachrichtigung wurde verzichtet, weil sie ohne Push-Server nur bei geöffneter App ankäme; die Kalender-Erinnerung funktioniert zuverlässig.
- **Kassenzettel-Gegencheck:** `src/lib/rules/receipt-reconciliation.ts` vergleicht nach dem Bon-Import die abgehakten (sonst alle geplanten) Artikel des Markts mit dem Bon; abweichende Normalpreise (keine Angebote, keine Wiegeware) lassen sich mit einem Klick übernehmen.
