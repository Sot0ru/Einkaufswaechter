import { type ChangeEvent, type ReactNode, useState } from "react";
import { extractReceiptTextFromFile } from "@/lib/providers/browser-ocr";
import type { ParsedReceiptItem, ParsedReceiptResult } from "@/lib/providers/receipt-importer";
import {
  CATEGORIES,
  CATEGORY_MAP,
  DEPARTMENTS,
  STORE_MAP,
  STORES,
  type StoreId,
} from "@/lib/rules/catalog";
import { formatEuroCents } from "@/lib/rules/optimizer";
import { formatShortDate } from "./format";
import { ReceiptReconciliation, type ReconciliationView } from "./ReceiptReconciliation";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

interface ReceiptImportPanelProps {
  receiptInput: string;
  onReceiptInputChange: (text: string) => void;
  preview: ParsedReceiptResult;
  fallbackStoreId: StoreId;
  onFallbackStoreChange: (storeId: StoreId) => void;
  activeZipCode: string;
  shoppingDate: string;
  manualAssignments: Record<string, string>;
  onAssign: (aliasNormalized: string, categoryId: string) => void;
  learnedAliasCount: number;
  isImporting: boolean;
  onImport: () => void;
  feedback: string | null;
  reconciliation: ReconciliationView | null;
  onApplyReconciledPrices: () => void;
}

export const ReceiptImportPanel = ({
  receiptInput,
  onReceiptInputChange,
  preview,
  fallbackStoreId,
  onFallbackStoreChange,
  activeZipCode,
  shoppingDate,
  manualAssignments,
  onAssign,
  learnedAliasCount,
  isImporting,
  onImport,
  feedback,
  reconciliation,
  onApplyReconciledPrices,
}: ReceiptImportPanelProps) => {
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [isExtractingFile, setIsExtractingFile] = useState(false);

  const resolvedCount = preview.items.filter(
    (item) => item.matched || Boolean(manualAssignments[item.aliasNormalized]),
  ).length;
  const storeId = preview.detectedStoreId ?? fallbackStoreId;

  const handleReceiptFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsExtractingFile(true);
    setOcrStatus(`Verarbeite ${file.name}…`);
    try {
      const result = await extractReceiptTextFromFile(file, setOcrStatus);
      if (!result.text.trim()) {
        setOcrStatus(
          "Aus der Datei konnte kein Text gelesen werden. Bei sehr unscharfen Fotos bitte gerade und gut beleuchtet fotografieren.",
        );
        return;
      }
      onReceiptInputChange(result.text);
      const sourceText =
        result.source === "pdf"
          ? "E-Bon-PDF lokal ausgelesen"
          : result.source === "ocr_image"
            ? `Foto lokal per OCR erkannt${result.confidence != null ? ` (${result.confidence} % Sicherheit)` : ""}`
            : "Textdatei geladen";
      setOcrStatus(`${sourceText} – prüfe die erkannten Zeilen rechts.`);
    } catch {
      setOcrStatus(
        "Lokale Texterkennung konnte nicht geladen werden (ggf. offline). Du kannst E-Bon-PDFs oder kopierten Text direkt einfügen.",
      );
    } finally {
      setIsExtractingFile(false);
    }
  };

  return (
    <section aria-labelledby="receipt-title">
      <h2 id="receipt-title" className="text-[26px] leading-tight font-black tracking-tight">
        Kassenbon einlesen
      </h2>
      <p className="mt-2 max-w-[70ch] text-[15px]">
        Fotografiere deinen Papier-Kassenbon (lokale Browser-OCR), lade ein E-Bon-PDF hoch oder füge
        den Text ein. Die App erkennt Kette, PLZ, Datum, Wiegeware, Mehrfachmengen und Rabatte und
        lässt Pfand und Summe weg. Unbekannte Kürzel ordnest du einmal zu, danach erkennt die App sie
        selbst.
      </p>
      <p className="mt-1 text-sm text-muted">{learnedAliasCount} gelernte Kürzel</p>

      <div className="mt-5 grid items-start gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <div className="mb-3 rounded-md border border-dashed border-line-strong bg-panel p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">Foto oder E-Bon-PDF lokal einlesen</p>
                <p className="text-xs text-muted">
                  Läuft direkt auf deinem Gerät (Tesseract.js OCR / PDF-Parser, keine Cloud-KI)
                </p>
              </div>
              <label
                className={cn(
                  SECONDARY_BUTTON,
                  "cursor-pointer",
                  isExtractingFile && "pointer-events-none opacity-60",
                )}
              >
                {isExtractingFile ? "Lese ein…" : "Foto / PDF wählen"}
                <input
                  type="file"
                  accept="image/*,.pdf,.txt"
                  capture="environment"
                  onChange={(event) => void handleReceiptFileChange(event)}
                  className="sr-only"
                />
              </label>
            </div>
            {ocrStatus && (
              <p role="status" className="mt-2 text-xs font-bold text-route">
                {ocrStatus}
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-[15px] font-bold">Bon-Text</span>
            <textarea
              value={receiptInput}
              onChange={(event) => onReceiptInputChange(event.target.value)}
              rows={12}
              placeholder="Text aus dem E-Bon oder einer Foto-Texterkennung einfügen"
              className="mt-1.5 w-full rounded border border-line-strong bg-paper p-3 font-mono text-[13px]"
            />
          </label>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md bg-panel px-3 py-2">
              <dt className="text-muted">Kette</dt>
              <dd className="font-extrabold">{STORE_MAP[storeId].shortName}</dd>
            </div>
            <div className="rounded-md bg-panel px-3 py-2">
              <dt className="text-muted">PLZ</dt>
              <dd className="font-extrabold tabular-nums">
                {preview.detectedZipCode ?? activeZipCode}
              </dd>
            </div>
            <div className="rounded-md bg-panel px-3 py-2">
              <dt className="text-muted">Datum</dt>
              <dd className="font-extrabold tabular-nums">
                {formatShortDate(preview.detectedDate ?? shoppingDate)}
              </dd>
            </div>
          </dl>
          <label className="mt-3 flex flex-wrap items-center gap-2.5 text-[15px] font-bold">
            Kette, falls nicht erkannt
            <select
              value={fallbackStoreId}
              onChange={(event) => onFallbackStoreChange(event.target.value as StoreId)}
              className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 font-semibold"
            >
              {STORES.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <h3 className="text-[15px] font-bold" aria-live="polite">
            {resolvedCount} von {preview.items.length} Positionen zugeordnet
          </h3>
          <p className="text-sm text-muted">
            {preview.skippedLines.length} Zeilen ohne Artikel ausgelassen (Kopf, Pfand, Summe)
          </p>
          <ul className="mt-3 flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1">
            {preview.items.map((item) => (
              <ReceiptLine
                key={`${item.lineIndex}-${item.aliasNormalized}`}
                item={item}
                assignedCategoryId={manualAssignments[item.aliasNormalized] || item.categoryId || ""}
                manualCategoryId={manualAssignments[item.aliasNormalized] ?? ""}
                onAssign={(categoryId) => onAssign(item.aliasNormalized, categoryId)}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={onImport}
            disabled={isImporting}
            className={cn(PRIMARY_BUTTON, "mt-4 w-full disabled:opacity-60")}
          >
            {isImporting ? "Bon wird gespeichert…" : "Bonpreise übernehmen"}
          </button>
          {feedback && (
            <p role="status" className="mt-2.5 text-[15px] font-bold">
              {feedback}
            </p>
          )}
        </div>
      </div>
      {reconciliation && (
        <ReceiptReconciliation view={reconciliation} onApplyPrices={onApplyReconciledPrices} />
      )}
    </section>
  );
};

interface ReceiptLineProps {
  item: ParsedReceiptItem;
  assignedCategoryId: string;
  manualCategoryId: string;
  onAssign: (categoryId: string) => void;
}

const ReceiptLine = ({ item, assignedCategoryId, manualCategoryId, onAssign }: ReceiptLineProps) => {
  const assignedCategory = assignedCategoryId ? CATEGORY_MAP[assignedCategoryId] : undefined;

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 rounded-md px-3 py-2.5",
        assignedCategory ? "bg-panel" : "border-2 border-dashed border-line-strong",
      )}
    >
      <div className="min-w-0">
        <p className="font-mono text-[13px] font-semibold">
          {item.quantity > 1 && `${item.quantity}× `}
          {item.rawLabel}
        </p>
        {assignedCategory ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-bold">
              {assignedCategory.name}, {assignedCategory.subtitle}
            </span>
            {item.matchedVia === "learned_alias" && <ReceiptTag>gelerntes Kürzel</ReceiptTag>}
            {item.isWeighedItem && <ReceiptTag>Wiegeware, auf kg umgerechnet</ReceiptTag>}
            {item.suggestBasePriceUpdate && (
              <ReceiptTag>Normalpreis {formatEuroCents(item.regularPriceCents)}</ReceiptTag>
            )}
            {item.isOffer && (
              <ReceiptTag>
                {item.usedLoyaltyApp ? "App-Angebot" : "Aktionspreis"}{" "}
                {formatEuroCents(item.effectivePriceCents)}
              </ReceiptTag>
            )}
          </p>
        ) : (
          <label className="mt-1.5 flex flex-col gap-1 text-sm">
            <span className="text-muted">Unbekanntes Kürzel. Welche Kategorie ist das?</span>
            <select
              value={manualCategoryId}
              onChange={(event) => onAssign(event.target.value)}
              className="h-11 max-w-full rounded border border-line-strong bg-paper px-2.5 pt-0.5"
            >
              <option value="">Kategorie wählen</option>
              {DEPARTMENTS.map((department) => (
                <optgroup key={department.id} label={department.name}>
                  {CATEGORIES.filter((category) => category.department === department.id).map(
                    (category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.subtitle})
                      </option>
                    ),
                  )}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex-none text-right tabular-nums">
        <p className="font-extrabold">{formatEuroCents(item.effectivePriceCents)}</p>
        {item.discountCents > 0 && (
          <p className="text-xs text-muted">
            statt <s>{formatEuroCents(item.regularPriceCents)}</s>
          </p>
        )}
      </div>
    </li>
  );
};

const ReceiptTag = ({ children }: { children: ReactNode }) => (
  <span className="rounded border border-line-strong bg-paper px-1.5 pt-0.5 text-xs font-bold">
    {children}
  </span>
);
