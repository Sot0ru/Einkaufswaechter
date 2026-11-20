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
  - `src/lib/providers/zip-offer-fetcher.ts`: PLZ-Validierung, Zuordnung zu den 5 deutschen Handelsregionen (`ost`, `nord`, `west`, `suedwest`, `sued`) inkl. Aldi-Äquator (`Aldi Nord` vs. `Aldi Süd`), externer JSON-Feed-Adapter (`OFFER_FEED_URL`) mit deterministischem Regional-Fallback.
  - `src/lib/providers/zip-offer-sync.ts` & idempotente Migration in `src/db/migrate.ts` (`offer_fetch_runs` + `weekly_offers_zip_lookup_idx`).
  - API-Routen `GET/POST /api/cron/fetch-offers` und `GET /api/v1/offers?zipCode=...` (mit `await connection()` für Next.js 16 `cacheComponents`).
  - UI-Integration in `src/components/ShoppingOptimizerApp.tsx` (Live-PLZ-Wechsel im Header & Regional-Schnellwahl in Reiter 4) + Tests in `src/lib/__tests__/zip-offer-fetcher.test.ts`.
