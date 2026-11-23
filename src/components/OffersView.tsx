import { type ChangeEvent, type DragEvent, useState } from "react";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import { extractBrochureTextFromFile } from "@/lib/providers/pdf-brochure-parser";
import type { parseBrochureText } from "@/lib/providers/text-importer";
import { CATEGORY_MAP, STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import { formatEuroCents, type OfferRecord } from "@/lib/rules/optimizer";
import {
  assessOfferConfidence,
  buildVerifiedKey,
  evaluateOfferDeal,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import { formatShortDate } from "./format";
import { DealRatingBadge, PriceConfidenceBadge, ShrinkflationAlert } from "./PriceBadges";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

type BrochurePreview = ReturnType<typeof parseBrochureText>;

interface OffersViewProps {
  offers: readonly OfferRecord[];
  weekWindow: WeekWindow;
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  customBasePrices?: CustomBasePricesMap;
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
  shoppingDate,
  priceHistory,
  customBasePrices,
  importStoreId,
  onImportStoreChange,
  brochureInput,
  onBrochureInputChange,
  preview,
  feedback,
  onApplyImport,
}: OffersViewProps) => {
  const [fileFeedback, setFileFeedback] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const matchedCount = preview.filter((result) => result.matched).length;

  const processBrochureFile = async (file: File) => {
    setFileFeedback(`Lese ${file.name} lokal aus…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractBrochureTextFromFile({
        fileName: file.name,
        bytes,
        storeId: importStoreId,
      });
      if (!extracted.text.trim()) {
        setFileFeedback(
          `In „${file.name}“ wurden keine Textzeilen gefunden (reines Bild-PDF). Kopiere ggf. den Text oder nutze den Kassenbon-Import.`,
        );
        return;
      }
      onBrochureInputChange(extracted.text);
      setFileFeedback(
        `${extracted.lineCount} Zeilen aus ${file.name} (${extracted.fileType.toUpperCase()}) lokal extrahiert und geprüft.`,
      );
    } catch {
      setFileFeedback(`Datei „${file.name}“ konnte nicht gelesen werden.`);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void processBrochureFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processBrochureFile(file);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <section aria-labelledby="import-title" className="min-w-0">
        <h2 id="import-title" className="text-[26px] leading-tight font-black tracking-tight">
          Prospekt-PDF & Zeilen prüfen
        </h2>
        <p className="mt-2 max-w-prose text-[15px]">
          Zieh das Wochenprospekt-PDF (oder HTML/Text) deines Markts hier rein oder füge Zeilen
          direkt ein. Der Regel-Matcher erkennt Kategorie, Packungsgröße, Grundpreis und „ab
          Donnerstag“ und lässt Fallen wie „Butterkäse“ aus.
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

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "mt-4 rounded-md border-2 border-dashed p-4 transition",
            isDragging ? "border-route bg-panel" : "border-line-strong bg-panel",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold">
                PDF-, HTML-, CSV-/TSV-Produktfeed oder Text ablegen
              </p>
              <p className="text-xs text-muted">
                Wird vollständig lokal im Browser ausgelesen (auch Awin-/Händler-CSV-Feeds)
              </p>
            </div>
            <label className={cn(SECONDARY_BUTTON, "cursor-pointer")}>
              Datei wählen
              <input
                type="file"
                accept=".pdf,.html,.htm,.csv,.tsv,.txt"
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>
          </div>
          {fileFeedback && (
            <p role="status" className="mt-2 text-xs font-bold text-route">
              {fileFeedback}
            </p>
          )}
        </div>

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
          {preview.map((result, index) => {
            const deal =
              result.matched && result.offer
                ? evaluateOfferDeal(
                    result.offer,
                    priceHistory?.categoryStats[result.offer.categoryId],
                    customBasePrices,
                  )
                : null;

            return (
              <li
                key={`${index}-${result.rawLine}`}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm",
                  result.matched ? "bg-panel" : "border border-line",
                )}
              >
                <p className="font-mono text-[13px]">{result.rawLine}</p>
                {result.matched && result.offer ? (
                  <>
                    <p className="mt-1 font-bold">
                      Erkannt als {CATEGORY_MAP[result.offer.categoryId]?.name}:{" "}
                      {formatEuroCents(result.offer.priceCents)}
                      {result.offer.loyaltyPriceCents != null &&
                        `, mit App ${formatEuroCents(result.offer.loyaltyPriceCents)}`}
                      , gültig {formatShortDate(result.offer.validFrom)} bis{" "}
                      {formatShortDate(result.offer.validTo)}
                    </p>
                    {deal && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <DealRatingBadge deal={deal} />
                        {deal.shrinkflationWarning && (
                          <ShrinkflationAlert warning={deal.shrinkflationWarning} />
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-muted">Nicht übernommen: {result.reasonIfSkipped}</p>
                )}
              </li>
            );
          })}
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
          Wochenangebote & Schnäppchen-Ampel
        </h2>
        <p className="mt-2 text-[15px]">
          {offers.length} Angebote für die Woche vom {formatShortDate(weekWindow.monday)} bis{" "}
          {formatShortDate(weekWindow.saturday)}. Jedes Angebot wird gegen Normalpreis,
          90-Tage-Tiefstpreis und Packungsgröße (Shrinkflation) geprüft.
        </p>
        <ul className="mt-4 max-h-[600px] divide-y divide-line overflow-y-auto border-y border-line pr-1">
          {offers.map((offer) => {
            const store = STORE_MAP[offer.storeId];
            const category = CATEGORY_MAP[offer.categoryId];
            const startsThursday = offer.validFrom >= weekWindow.thursday;
            const stats = priceHistory?.categoryStats[offer.categoryId];
            const verified =
              priceHistory?.verifiedPrices[buildVerifiedKey(offer.categoryId, offer.storeId)];
            const deal = evaluateOfferDeal(offer, stats, customBasePrices);
            const confidence = assessOfferConfidence(offer, shoppingDate, verified);

            return (
              <li key={offer.id} className="flex items-start justify-between gap-3 py-3">
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
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <DealRatingBadge deal={deal} />
                    <PriceConfidenceBadge confidence={confidence} />
                  </div>
                  {deal.shrinkflationWarning && (
                    <div className="mt-1.5">
                      <ShrinkflationAlert warning={deal.shrinkflationWarning} />
                    </div>
                  )}
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
