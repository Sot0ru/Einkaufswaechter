# Handoff – Einkaufswächter

## Aktueller Status

- **Ausbaustufe 1 (Fundament & Optimierungs-Kern):** Abgeschlossen auf `main`.
  - Next.js 16 + TypeScript + Tailwind v4 + Drizzle ORM (PGlite lokal / Postgres produktiv) + Vitest.
  - Regelbasierter Angebots-Matcher (`src/lib/rules/matcher.ts`) ohne externe KI-API.
  - Warenkorb-Optimierer (`src/lib/rules/optimizer.ts`) für 1-Laden-Ranking, 2-Läden-Smart-Split (mit Hauptladen-Tie-Breaking und Ersparnis-Schwelle) sowie Abteilungs-Laufroute.
  - Interaktive Web-Oberfläche + JSON-API (`/api/v1/optimize`, `/api/v1/offers/import`).
- **Ausbaustufe 2 – Paket 1 (Katalog-Erweiterung auf 172 Alltags-Kategorien):** Umgesetzt durch Antigravity.
  - Katalog (`src/lib/rules/catalog.ts`) auf **172 normierte Alltags-Kategorien** über alle 8 Supermarkt-Abteilungen erweitert.
  - Matcher (`src/lib/rules/matcher.ts`) um Wortgrenzen-Erkennung bei kurzen Include-/Exclude-Keywords, `(100 g = ...)`-Grundpreis-Bereinigung, Stück-Einheiten (`Tabs`, `Pads`, `WL`) und Packungsgrößen-Nähe-Scoring ergänzt.
  - Vollständige Invarianten- und Selbst-Matching-Tests über alle 172 Kategorien in `src/lib/__tests__/matcher.test.ts`.
- **Ausbaustufe 2 – Paket 2 (Automatischer Angebots-Fetcher nach PLZ):** Umgesetzt durch Antigravity.
  - `src/lib/providers/zip-offer-fetcher.ts` & `src/lib/providers/zip-offer-sync.ts`: PLZ-Validierung, Zuordnung zu den 5 deutschen Handelsregionen (`ost`, `nord`, `west`, `suedwest`, `sued`) inkl. Aldi-Äquator (`Aldi Nord` vs. `Aldi Süd`), externer JSON-Feed-Adapter (`OFFER_FEED_URL`) mit deterministischem Regional-Fallback, idempotente DB-Migration (`offer_fetch_runs`).
  - API-Routen `GET/POST /api/cron/fetch-offers` und `GET /api/v1/offers?zipCode=...` + Tests in `src/lib/__tests__/zip-offer-fetcher.test.ts`.
- **Ausbaustufe 2 – Paket 3 (Persistente Einkaufslisten & 1-Klick-Basispreis-Korrektur im Laden):** Umgesetzt durch Antigravity.
  - `src/lib/services/shopping-lists.ts` & `GET/POST/DELETE /api/v1/lists`: Einkaufslisten dauerhaft in `shopping_lists` und `shopping_list_items` speichern, aktualisieren, wiederladen und löschen.
  - `src/lib/services/base-prices.ts` & `GET/PATCH/POST /api/v1/base-prices`: 1-Klick-Basispreis-Korrektur je Kette und Kategorie direkt aus der Supermarkt-Abhakliste (`−10 ct` / `+10 ct` / `Standard`).
  - Vollständige Unit- und DB-Tests in `src/lib/__tests__/persistence.test.ts`.
