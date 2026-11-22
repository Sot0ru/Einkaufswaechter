import { formatEuroCents } from "@/lib/rules/optimizer";
import type {
  ReconciliationResult,
  ReconciliationStatus,
} from "@/lib/rules/receipt-reconciliation";
import { cn, SECONDARY_BUTTON } from "./ui";

export interface ReconciliationView {
  storeName: string;
  result: ReconciliationResult;
  /** Anzahl Positionen, deren bezahlter Preis als neuer Normalpreis übernommen werden kann */
  pendingPriceUpdates: number;
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  matched: "wie geplant",
  price_changed: "anderer Preis",
  unplanned_extra: "nicht geplant",
  missing_from_receipt: "nicht auf dem Bon",
};

const formatDelta = (cents: number): string =>
  cents === 0 ? "±0,00 €" : `${cents > 0 ? "+" : "−"}${formatEuroCents(Math.abs(cents))}`;

const summarySentence = (result: ReconciliationResult): string => {
  const delta = result.comparableDeltaCents;
  if (delta === 0) return "Die geplanten Artikel haben genau so viel gekostet wie erwartet.";
  return delta < 0
    ? `Die geplanten Artikel waren ${formatEuroCents(-delta)} günstiger als erwartet.`
    : `Die geplanten Artikel waren ${formatEuroCents(delta)} teurer als erwartet.`;
};

interface ReceiptReconciliationProps {
  view: ReconciliationView;
  onApplyPrices: () => void;
}

/** Gegencheck nach dem Bon-Import: geplant gegen tatsächlich bezahlt */
export const ReceiptReconciliation = ({ view, onApplyPrices }: ReceiptReconciliationProps) => {
  const { result } = view;
  return (
    <section aria-labelledby="reconciliation-title" className="mt-6 rounded-md border-2 border-line-strong p-4">
      <h3 id="reconciliation-title" className="text-[19px] font-black">
        Gegencheck mit deinem Einkauf bei {view.storeName}
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md bg-panel px-3 py-2">
          <dt className="text-muted">Geplant</dt>
          <dd className="text-[17px] font-extrabold tabular-nums">{formatEuroCents(result.plannedTotalCents)}</dd>
        </div>
        <div className="rounded-md bg-panel px-3 py-2">
          <dt className="text-muted">Bezahlt</dt>
          <dd className="text-[17px] font-extrabold tabular-nums">{formatEuroCents(result.paidTotalCents)}</dd>
        </div>
        <div className="col-span-2 rounded-md bg-panel px-3 py-2 sm:col-span-1">
          <dt className="text-muted">Bei geplanten Artikeln</dt>
          <dd className="text-[17px] font-extrabold tabular-nums">{formatDelta(result.comparableDeltaCents)}</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-[15px]">
        {summarySentence(result)}
        {result.unplannedExtraCents > 0 &&
          ` Dazu kamen ${formatEuroCents(result.unplannedExtraCents)} für nicht geplante Artikel.`}
        {result.missingPlannedCents > 0 &&
          ` Artikel für ${formatEuroCents(result.missingPlannedCents)} fehlen auf dem Bon.`}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="border-b-2 border-ink py-2 pr-3 font-bold">Artikel</th>
              <th scope="col" className="border-b-2 border-ink px-3 py-2 text-right font-bold">Geplant</th>
              <th scope="col" className="border-b-2 border-ink px-3 py-2 text-right font-bold">Bezahlt</th>
              <th scope="col" className="border-b-2 border-ink py-2 pl-3 font-bold">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => (
              <tr key={line.categoryId}>
                <th scope="row" className="border-b border-line py-2 pr-3 text-left font-semibold">
                  {line.categoryName}
                </th>
                <td className="border-b border-line px-3 py-2 text-right">
                  {line.plannedCents == null ? "–" : formatEuroCents(line.plannedCents)}
                </td>
                <td className="border-b border-line px-3 py-2 text-right">
                  {line.actualCents == null ? "–" : formatEuroCents(line.actualCents)}
                </td>
                <td className="border-b border-line py-2 pl-3">
                  <span
                    className={cn(
                      "rounded px-1.5 pt-0.5 text-xs font-bold",
                      line.status === "matched" ? "bg-panel" : "border border-line-strong",
                    )}
                  >
                    {STATUS_LABEL[line.status]}
                  </span>
                  {line.status === "price_changed" && (
                    <span className="ml-1.5 text-xs">{formatDelta(line.deltaCents)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.pendingPriceUpdates > 0 && (
        <div className="mt-3">
          <button type="button" onClick={onApplyPrices} className={SECONDARY_BUTTON}>
            {view.pendingPriceUpdates === 1
              ? "Neuen Preis als Normalpreis übernehmen"
              : `${view.pendingPriceUpdates} neue Preise als Normalpreis übernehmen`}
          </button>
        </div>
      )}
    </section>
  );
};
