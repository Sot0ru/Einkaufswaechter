import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from "react";
import type { WeekWindow } from "@/lib/providers/demo-offers";
import { extractBrochureTextFromFile } from "@/lib/providers/pdf-brochure-parser";
import type { parseBrochureText } from "@/lib/providers/text-importer";
import { CATEGORY_MAP, STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import { computeUnitPriceCents } from "@/lib/rules/matcher";
import { formatEuroCents, type OfferRecord } from "@/lib/rules/optimizer";
import {
  assessOfferConfidence,
  buildVerifiedKey,
  evaluateOfferDeal,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import { formatShortDate } from "./format";
import {
  DealRatingBadge,
  PriceConfidenceBadge,
  PrimaryItemBadge,
  resolvePrimaryOfferBadge,
  ShrinkflationAlert,
} from "./PriceBadges";
import {
  ChevronIcon,
  cn,
  CollapsibleCard,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SegmentedControl,
  StarIcon,
  ToggleChip,
} from "./ui";

type BrochurePreview = ReturnType<typeof parseBrochureText>;
type OffersSubTab = "offers" | "receipt_barcode" | "import";
type ReceiptOrBarcodeMode = "receipt" | "barcode";

const OFFERS_SEGMENTS: readonly { value: OffersSubTab; label: string }[] = [
  { value: "offers", label: "Angebote" },
  { value: "receipt_barcode", label: "Bon & Barcode" },
  { value: "import", label: "Prospekt / CSV" },
];

const RECEIPT_BARCODE_SEGMENTS: readonly { value: ReceiptOrBarcodeMode; label: string }[] = [
  { value: "receipt", label: "Kassenbon einlesen" },
  { value: "barcode", label: "Barcode scannen" },
];

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
  zipOffersPanel: ReactNode;
  receiptImportPanel: ReactNode;
  barcodeScannerPanel: ReactNode;
  favoriteAlertCount: number;
  favoriteSavingsCents: number;
  favoritesCard?: ReactNode;
}

const offerUnitLabel = (unit: OfferRecord["packageUnit"]): "kg" | "L" | "Stück" => {
  if (unit === "g") return "kg";
  if (unit === "ml") return "L";
  return "Stück";
};

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
  zipOffersPanel,
  receiptImportPanel,
  barcodeScannerPanel,
  favoriteAlertCount,
  favoriteSavingsCents,
  favoritesCard,
}: OffersViewProps) => {
  const [activeSegment, setActiveSegment] = useState<OffersSubTab>("offers");
  const [receiptBarcodeMode, setReceiptBarcodeMode] = useState<ReceiptOrBarcodeMode>("receipt");
  const [storeFilter, setStoreFilter] = useState<StoreId | "all">("all");
  const [offerQuery, setOfferQuery] = useState("");
  const [fileFeedback, setFileFeedback] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const matchedCount = preview.filter((result) => result.matched).length;

  const filteredOffers = useMemo(() => {
    const query = offerQuery.trim().toLowerCase();
    return offers.filter((offer) => {
      if (storeFilter !== "all" && offer.storeId !== storeFilter) return false;
      if (!query) return true;
      const categoryName = CATEGORY_MAP[offer.categoryId]?.name.toLowerCase() ?? "";
      const storeName = STORE_MAP[offer.storeId]?.name.toLowerCase() ?? "";
      return (
        offer.title.toLowerCase().includes(query) ||
        categoryName.includes(query) ||
        storeName.includes(query)
      );
    });
  }, [offers, storeFilter, offerQuery]);

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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="sr-only">Angebote und Preise</h1>
        <SegmentedControl
          label="Bereich in Angebote & Preise"
          options={OFFERS_SEGMENTS}
          value={activeSegment}
          onChange={setActiveSegment}
        />
      </div>

      {/* Segment 1: Angebote */}
      {activeSegment === "offers" && (
        <div className="flex flex-col gap-5">
          {zipOffersPanel}

          {favoritesCard && (
            <CollapsibleCard
              title="Stammprodukte im Angebot"
              icon={<StarIcon className="size-5 flex-none text-route" filled={favoriteAlertCount > 0} />}
              summary={
                favoriteAlertCount > 0
                  ? `${favoriteAlertCount} Angebote · ${formatEuroCents(favoriteSavingsCents)} sparen`
                  : "Wochen-Radar"
              }
            >
              {favoritesCard}
            </CollapsibleCard>
          )}

          <section
            aria-labelledby="offers-title"
            className="rounded-xl border border-line bg-paper p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="offers-title" className="text-xl leading-tight font-black tracking-tight">
                Wochenangebote ({filteredOffers.length})
              </h2>
              <span className="text-sm text-muted tabular-nums">
                {formatShortDate(weekWindow.monday)} – {formatShortDate(weekWindow.saturday)}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label className="block">
                <span className="sr-only">Wochenangebote durchsuchen</span>
                <input
                  type="search"
                  value={offerQuery}
                  onChange={(event) => setOfferQuery(event.target.value)}
                  placeholder="Angebote filtern, z. B. Butter, Kaffee, Lidl…"
                  className="h-11 w-full rounded-md border border-line-strong bg-paper px-3.5 text-sm font-semibold"
                />
              </label>

              <div className="flex flex-wrap gap-1.5">
                <ToggleChip
                  active={storeFilter === "all"}
                  onToggle={() => setStoreFilter("all")}
                >
                  Alle ({offers.length})
                </ToggleChip>
                {STORES.map((store) => {
                  const count = offers.filter((o) => o.storeId === store.id).length;
                  if (count === 0) return null;
                  return (
                    <ToggleChip
                      key={store.id}
                      active={storeFilter === store.id}
                      onToggle={() => setStoreFilter(store.id)}
                    >
                      {store.shortName} ({count})
                    </ToggleChip>
                  );
                })}
              </div>
            </div>

            {filteredOffers.length === 0 ? (
              <p className="mt-5 text-sm text-muted">
                Keine passenden Angebote für diese Auswahl gefunden.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {filteredOffers.map((offer) => (
                  <QuietOfferRow
                    key={offer.id}
                    offer={offer}
                    weekWindow={weekWindow}
                    shoppingDate={shoppingDate}
                    priceHistory={priceHistory}
                    customBasePrices={customBasePrices}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Segment 2: Bon & Barcode */}
      {activeSegment === "receipt_barcode" && (
        <div className="flex flex-col gap-5">
          <div className="max-w-md">
            <SegmentedControl
              label="Kassenbon oder Barcode wählen"
              options={RECEIPT_BARCODE_SEGMENTS}
              value={receiptBarcodeMode}
              onChange={setReceiptBarcodeMode}
            />
          </div>
          {receiptBarcodeMode === "receipt" ? receiptImportPanel : barcodeScannerPanel}
        </div>
      )}

      {/* Segment 3: Prospekt / CSV */}
      {activeSegment === "import" && (
        <section
          aria-labelledby="import-title"
          className="rounded-xl border border-line bg-paper p-5 sm:p-6"
        >
          <h2 id="import-title" className="text-2xl leading-tight font-black tracking-tight">
            Prospekt-PDF, CSV-Feed & Zeilen prüfen
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Lege ein Wochenprospekt-PDF, eine HTML-/CSV-/TSV-Datei ab oder füge Textzeilen ein. Der
            Regel-Matcher erkennt Kategorie, Packungsgröße, Grundpreis und „ab Donnerstag“ direkt
            lokal im Browser.
          </p>

          <label className="mt-4 flex items-center gap-3 text-sm font-bold">
            Markt
            <select
              value={importStoreId}
              onChange={(event) => onImportStoreChange(event.target.value as StoreId)}
              className="h-11 rounded-md border border-line-strong bg-paper px-3 font-semibold"
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
              "mt-4 rounded-lg border-2 border-dashed p-4 transition",
              isDragging ? "border-route bg-panel" : "border-line-strong bg-panel",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold">
                  PDF-, HTML-, CSV-/TSV-Produktfeed oder Text ablegen
                </p>
                <p className="text-xs text-muted">
                  Vollständig lokal im Browser (auch Awin-/Händler-CSV-Feeds)
                </p>
              </div>
              <label className={cn(SECONDARY_BUTTON, "cursor-pointer text-sm")}>
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
            <span className="text-sm font-bold">Prospekt-Text</span>
            <textarea
              value={brochureInput}
              onChange={(event) => onBrochureInputChange(event.target.value)}
              rows={6}
              placeholder="Beispiel: Kerrygold Irische Butter 250g 1,49 €"
              className="mt-1.5 w-full rounded-md border border-line-strong bg-paper p-3 font-mono text-[13px]"
            />
          </label>

          <h3 className="mt-5 text-sm font-bold" aria-live="polite">
            {matchedCount} von {preview.length} Zeilen erkannt
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
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
                    "rounded-lg px-3.5 py-3 text-sm",
                    result.matched ? "bg-panel" : "border border-line",
                  )}
                >
                  <p className="font-mono text-[13px]">{result.rawLine}</p>
                  {result.matched && result.offer ? (
                    <>
                      <p className="mt-1 font-bold">
                        {CATEGORY_MAP[result.offer.categoryId]?.name}:{" "}
                        {formatEuroCents(result.offer.priceCents)}
                        {result.offer.loyaltyPriceCents != null &&
                          ` (mit App ${formatEuroCents(result.offer.loyaltyPriceCents)})`}
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

          <button
            type="button"
            onClick={onApplyImport}
            className={cn(PRIMARY_BUTTON, "mt-5 w-full")}
          >
            Erkannte Angebote übernehmen
          </button>
          {feedback && (
            <p className="mt-2.5 text-sm font-bold" role="status">
              {feedback}
            </p>
          )}
        </section>
      )}
    </div>
  );
};

interface QuietOfferRowProps {
  offer: OfferRecord;
  weekWindow: WeekWindow;
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  customBasePrices?: CustomBasePricesMap;
}

/** Ruhige Angebotszeile: max. 1 Haupt-Badge sichtbar, Grundpreis/Konfidenz/Shrinkflation per Antippen */
const QuietOfferRow = ({
  offer,
  weekWindow,
  shoppingDate,
  priceHistory,
  customBasePrices,
}: QuietOfferRowProps) => {
  const [expanded, setExpanded] = useState(false);

  const store = STORE_MAP[offer.storeId];
  const category = CATEGORY_MAP[offer.categoryId];
  const startsThursday = offer.validFrom >= weekWindow.thursday;
  const stats = priceHistory?.categoryStats[offer.categoryId];
  const verified = priceHistory?.verifiedPrices[buildVerifiedKey(offer.categoryId, offer.storeId)];
  const deal = evaluateOfferDeal(offer, stats, customBasePrices);
  const confidence = assessOfferConfidence(offer, shoppingDate, verified);
  const primaryBadge = resolvePrimaryOfferBadge({ deal, startsThursday });

  const effectiveCents = offer.loyaltyPriceCents ?? offer.priceCents;
  const unitPriceCents = computeUnitPriceCents(
    effectiveCents,
    offer.packageAmount,
    offer.packageUnit,
  );
  const uLabel = offerUnitLabel(offer.packageUnit);

  return (
    <li className="py-3.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">
            <strong className="font-extrabold text-ink">{store.shortName}</strong>
            {" · "}
            {category?.name ?? offer.categoryId}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">{offer.title}</span>
            {primaryBadge && <PrimaryItemBadge badge={primaryBadge} />}
          </span>
        </span>

        <span className="flex flex-none items-center gap-2 text-right tabular-nums">
          <span>
            <span className="block font-extrabold">{formatEuroCents(offer.priceCents)}</span>
            {offer.loyaltyPriceCents != null && (
              <span className="block text-xs text-muted">
                App {formatEuroCents(offer.loyaltyPriceCents)}
              </span>
            )}
          </span>
          <ChevronIcon
            className={cn(
              "size-4 text-muted transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-panel px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
            <span>
              Grundpreis: {formatEuroCents(unitPriceCents)}/{uLabel}
            </span>
            <span>
              Gültig: {formatShortDate(offer.validFrom)} – {formatShortDate(offer.validTo)}
            </span>
            {offer.requiresLoyaltyApp && store.loyaltyAppName && (
              <span className="font-bold text-route">Nur mit {store.loyaltyAppName}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PriceConfidenceBadge confidence={confidence} />
            <DealRatingBadge deal={deal} />
          </div>
          {deal.shrinkflationWarning && <ShrinkflationAlert warning={deal.shrinkflationWarning} />}
        </div>
      )}
    </li>
  );
};
