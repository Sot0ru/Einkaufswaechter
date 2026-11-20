# Handoff – Einkaufswächter

## Aktueller Status

- **Ausbaustufe 1 (Fundament & Optimierungs-Kern):** Abgeschlossen auf `main`.
  - Next.js 16 + TypeScript + Tailwind v4 + Drizzle ORM (PGlite lokal / Postgres produktiv) + Vitest.
  - Regelbasierter Angebots-Matcher (`src/lib/rules/matcher.ts`) ohne externe KI-API.
  - Warenkorb-Optimierer (`src/lib/rules/optimizer.ts`) für 1-Laden-Ranking, 2-Läden-Smart-Split (mit Hauptladen-Tie-Breaking und Ersparnis-Schwelle) sowie Abteilungs-Laufroute.
  - Interaktive Web-Oberfläche + JSON-API (`/api/v1/optimize`, `/api/v1/offers/import`).
- **Ausbaustufe 2 – Paket 1 (Katalog-Erweiterung auf 172 Alltags-Kategorien):** Umgesetzt durch Antigravity.
  - Katalog (`src/lib/rules/catalog.ts`) auf **172 normierte Alltags-Kategorien** über alle 8 Supermarkt-Abteilungen erweitert (inkl. hinterlegter Eigenmarken-Basispreise und Produktbezeichnungen für alle 7 Ketten).
  - Matcher (`src/lib/rules/matcher.ts`) um Wortgrenzen-Erkennung bei kurzen Include-/Exclude-Keywords, `(100 g = ...)`-Grundpreis-Bereinigung, Stück-Einheiten (`Tabs`, `Pads`, `WL`) und Packungsgrößen-Nähe-Scoring ergänzt.
  - Katalog-Browser in `src/components/ShoppingOptimizerApp.tsx` um Abteilungs-Schnellfilter ergänzt.
  - Vollständige Invarianten- und Selbst-Matching-Tests über alle 172 Kategorien und sämtliche hinterlegten `includeKeywords` in `src/lib/__tests__/matcher.test.ts`.
