# Arbeitspaket 7: Alltag im Laden & Haushalt

> **Status:** Entwurf (bereit für Review & Umsetzung in Ausbaustufe 3)  
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
- [ ] Unit- & PGlite-Tests für Share-Sync, Favoriten-Alerts und Kassenzettel-Gegencheck (`src/lib/__tests__/household-sync.test.ts`).
- [ ] Vollständiger Demo-/Offline-Modus ohne Server-Abhängigkeit.
- [ ] Pflicht-Checks (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:pwa`) grün.
