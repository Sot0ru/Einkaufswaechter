import type { WeekWindow } from "@/lib/providers/demo-offers";
import type { parseBrochureText } from "@/lib/providers/text-importer";
import { CATEGORY_MAP, STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import { formatEuroCents, type OfferRecord } from "@/lib/rules/optimizer";
import { formatShortDate } from "./format";
import { cn, PRIMARY_BUTTON } from "./ui";

type BrochurePreview = ReturnType<typeof parseBrochureText>;

interface OffersViewProps {
  offers: readonly OfferRecord[];
  weekWindow: WeekWindow;
  importStoreId: StoreId;
  onImportStoreChange: (storeId: StoreId) => void;
  brochureInput: string;
  onBrochureInputChange: (text: string) => void;
  preview: BrochurePreview;
  feedback: string | null;
  onApplyImport: () => void;
}

export const OffersView = ({
  offers,
  weekWindow,
  importStoreId,
  onImportStoreChange,
  brochureInput,
  onBrochureInputChange,
  preview,
  feedback,
  onApplyImport,
}: OffersViewProps) => {
  const matchedCount = preview.filter((result) => result.matched).length;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <section aria-labelledby="import-title" className="min-w-0">
        <h2 id="import-title" className="text-[26px] leading-tight font-black tracking-tight">
          Prospekt-Zeilen prüfen
        </h2>
        <p className="mt-2 max-w-prose text-[15px]">
          Füge Zeilen aus einem Wochenprospekt ein. Der Regel-Matcher erkennt Kategorie,
          Packungsgröße, Grundpreis und „ab Donnerstag“ und lässt Fallen wie „Butterkäse“ oder
          „Erdnussbutter“ aus.
        </p>

        <label className="mt-4 flex items-center gap-3 text-[15px] font-bold">
          Markt
          <select
            value={importStoreId}
            onChange={(event) => onImportStoreChange(event.target.value as StoreId)}
            className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 font-semibold"
          >
            {STORES.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-[15px] font-bold">Prospekt-Text</span>
          <textarea
            value={brochureInput}
            onChange={(event) => onBrochureInputChange(event.target.value)}
            rows={6}
            placeholder="Beispiel: Kerrygold Irische Butter 250g 1,49 €"
            className="mt-1.5 w-full rounded border border-line-strong bg-paper p-3 font-mono text-[13px]"
          />
        </label>

        <h3 className="mt-5 text-[15px] font-bold" aria-live="polite">
          {matchedCount} von {preview.length} Zeilen erkannt
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {preview.map((result, index) => (
            <li
              key={`${index}-${result.rawLine}`}
              className={cn(
                "rounded-md px-3 py-2.5 text-sm",
                result.matched ? "bg-panel" : "border border-line",
              )}
            >
              <p className="font-mono text-[13px]">{result.rawLine}</p>
              {result.matched && result.offer ? (
                <p className="mt-1 font-bold">
                  Erkannt als {CATEGORY_MAP[result.offer.categoryId]?.name}:{" "}
                  {formatEuroCents(result.offer.priceCents)}
                  {result.offer.loyaltyPriceCents != null &&
                    `, mit App ${formatEuroCents(result.offer.loyaltyPriceCents)}`}
                  , gültig {formatShortDate(result.offer.validFrom)} bis{" "}
                  {formatShortDate(result.offer.validTo)}
                </p>
              ) : (
                <p className="mt-1 text-muted">Nicht übernommen: {result.reasonIfSkipped}</p>
              )}
            </li>
          ))}
        </ul>

        <button type="button" onClick={onApplyImport} className={cn(PRIMARY_BUTTON, "mt-5 w-full")}>
          Erkannte Angebote übernehmen
        </button>
        {feedback && (
          <p className="mt-2.5 text-[15px] font-bold" role="status">
            {feedback}
          </p>
        )}
      </section>

      <section aria-labelledby="offers-title" className="min-w-0">
        <h2 id="offers-title" className="text-[26px] leading-tight font-black tracking-tight">
          Wochenangebote
        </h2>
        <p className="mt-2 text-[15px]">
          {offers.length} Angebote für die Woche vom {formatShortDate(weekWindow.monday)} bis{" "}
          {formatShortDate(weekWindow.saturday)} Angebote ab Donnerstag zählen nur, wenn du Do–Sa
          einkaufst.
        </p>
        <ul className="mt-4 max-h-[560px] divide-y divide-line overflow-y-auto border-y border-line pr-1">
          {offers.map((offer) => {
            const store = STORE_MAP[offer.storeId];
            const category = CATEGORY_MAP[offer.categoryId];
            const startsThursday = offer.validFrom >= weekWindow.thursday;
            return (
              <li key={offer.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-extrabold">{store.shortName}</span>
                    <span className="text-muted">{category?.name ?? offer.categoryId}</span>
                    {startsThursday && (
                      <span className="rounded border border-line-strong px-1.5 pt-0.5 text-xs font-bold">
                        ab Donnerstag
                      </span>
                    )}
                  </p>
                  <p className="font-semibold">{offer.title}</p>
                </div>
                <div className="flex-none text-right tabular-nums">
                  <p className="font-extrabold">{formatEuroCents(offer.priceCents)}</p>
                  {offer.loyaltyPriceCents != null && (
                    <p className="text-xs text-muted">
                      mit App {formatEuroCents(offer.loyaltyPriceCents)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
