<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projektüberblick

**Einkaufswächter** ist eine Next.js-Web-App (App Router, TypeScript, Drizzle ORM mit Postgres / PGlite lokal, Vitest) zur Preis-Optimierung des Wocheneinkaufs über die großen deutschen Supermarkt- und Discounter-Ketten (**Lidl, Aldi, Rewe, Edeka, Kaufland, Netto, Penny**). Details zu Architektur, Datenquellen und bekannten Grenzen stehen in `README.md` und `docs/fahrplan.md`.

## Zusammenarbeit: Claude & Antigravity

In diesem Repository arbeiten zwei KI-Agenten mit klarer Rollenverteilung über GitHub und gemeinsame Markdown-Dateien zusammen:

- **Claude (Architekt & Reviewer):** erstellt und schärft Arbeitspakete (`docs/paket-*.md` oder GitHub Issues), legt Aufträge in `docs/HANDOFF.md` ab und prüft Pull Requests auf Logik, Edge-Cases, Architektur, Produktregeln und Tests.
- **Antigravity (Umsetzer & Tester):** prüft Pläne gegen den aktuellen Code, setzt Pakete auf eigenen Feature-Branches um, schreibt Tests, verifiziert die CI-Checks lokal, öffnet Pull Requests und arbeitet Review-Feedback ab.
- **Projektinhaber (Mensch):** stößt Übergaben an und trifft finale Produkt- und Merge-Entscheidungen.

## Verbindliche Projektregeln

- **Sprache:** Benutzeroberfläche, Fehlermeldungen für Nutzer, Dokumentation (`docs/`, `README.md`) und Commit-Nachrichten auf **Deutsch**. Code-Bezeichner, Typen und Dateinamen bleiben konsistent auf Englisch.
- **Idempotente Migrationen:** Datenbank-Änderungen gehören idempotent in `src/db/migrate.ts` (z. B. `IF NOT EXISTS`), da das Schema beim Start automatisch angewendet wird. Bestehende Einträge nie ändern, neue nur unten anhängen.
- **Rein regelbasiertes Matching ohne externe KI-Abhängigkeit:** Der Kategorie-Matcher (`src/lib/rules/matcher.ts`) arbeitet deterministisch mit Include-/Exclude-Keywords, Einheiten-Parser und Preis-Plausibilitäts-Korridoren.
- **Kassenpreis + Grundpreis-Hinweis:** Die Optimierung (`src/lib/rules/optimizer.ts`) rechnet mit dem tatsächlichen Kassenpreis für die benötigte Menge und weist auf günstigere Großpackungen (`€/kg` bzw. `€/L`) explizit hin.
- **Hauptladen-Tie-Breaking beim Smart-Split:** Kostet ein Artikel im Haupt- und Zweitladen gleich viel, bleibt er immer beim Hauptladen, damit im Zweitladen nur echte Angebots-Schnäppchen auf der Liste landen.
- **Demo-Modus intakt halten:** Alle Funktionen müssen ohne Netzwerkzugriff über den deterministischen Demo-Provider funktionieren.
- **Next.js 16 mit `cacheComponents`:** DB- und Request-Zugriffe in Seiten gehören in `<Suspense>`; Route-Handler mit Request-Daten rufen `await connection()` auf. Nach neuen dynamischen Routen vor `tsc` einmal `npx next typegen` ausführen.

## Pflicht-Checks vor Push / PR

Spiegelt `.github/workflows/ci.yml`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
