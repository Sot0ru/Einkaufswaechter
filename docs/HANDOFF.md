# Handoff – Einkaufswächter

## Aktueller Status

- **Initiales Grundgerüst (Ausbaustufe 1):** Aufgesetzt durch Antigravity.
- **Enthalten:**
  - Next.js 16 + TypeScript + Tailwind v4 + Drizzle ORM (PGlite lokal / Postgres produktiv) + Vitest.
  - Regelbasierter Angebots-Matcher (`src/lib/rules/matcher.ts`) ohne externe KI-API.
  - Warenkorb-Optimierer (`src/lib/rules/optimizer.ts`) für 1-Laden-Ranking, 2-Läden-Smart-Split (mit Hauptladen-Tie-Breaking und Ersparnis-Schwelle) sowie Abteilungs-Laufroute.
  - Interaktive Web-Oberfläche + JSON-API (`/api/v1/optimize`, `/api/v1/offers/import`).
- **Oberfläche „Laufroute“ (Ausbaustufe 2):** Umgesetzt durch Claude auf Wunsch des Projektinhabers.
  - Designrichtung: Der Einkauf als Linienplan. Abteilungen sind Haltestellen in Laufroutenreihenfolge, Blau steht für den Hauptladen, Orange ausschließlich für den Abstecher zum Zweitladen. Heller und dunkler Modus.
  - Schrift Overpass, selbst gehostet über `@fontsource-variable/overpass` und `next/font/local` (Build ohne Netzwerkzugriff).
  - `ShoppingOptimizerApp.tsx` in Teilkomponenten aufgeteilt (`CompareView`, `RoutePlan`, `InStoreView`, `ShoppingListView`, `OffersView`, `SettingsPanel`, `ui.tsx`); die Optimierungslogik ist unverändert.
  - Katalog um `shortName` für Kategorien und Abteilungen ergänzt (Beschriftung im Linienplan).
