import { CATEGORY_MAP } from "./catalog";

export type ReconciliationStatus =
  | "matched"
  | "price_changed"
  | "unplanned_extra"
  | "missing_from_receipt";

/** Ein geplanter Artikel aus der Laufroute (Kassenpreis für die geplante Menge) */
export interface PlannedPosition {
  categoryId: string;
  quantity: number;
  plannedCents: number;
}

/** Eine erkannte Bon-Position, bereits einer Kategorie zugeordnet */
export interface ReceiptPosition {
  categoryId: string;
  quantity: number;
  /** Tatsächlich bezahlt für diese Position (Stückpreis × Menge, nach Rabatten) */
  actualCents: number;
  isOffer: boolean;
}

export interface ReconciliationLine {
  categoryId: string;
  categoryName: string;
  plannedCents: number | null;
  actualCents: number | null;
  /** Bezahlt minus geplant (negativ = günstiger als erwartet) */
  deltaCents: number;
  plannedQuantity: number;
  actualQuantity: number;
  status: ReconciliationStatus;
  /** Bezahlter Preis pro Packung, um einen geänderten Normalpreis zu übernehmen */
  actualUnitCents: number | null;
  actualWasOffer: boolean;
}

export interface ReconciliationResult {
  lines: ReconciliationLine[];
  plannedTotalCents: number;
  paidTotalCents: number;
  /** Abweichung nur über Artikel, die geplant UND bezahlt wurden */
  comparableDeltaCents: number;
  unplannedExtraCents: number;
  missingPlannedCents: number;
}

const STATUS_ORDER: Record<ReconciliationStatus, number> = {
  price_changed: 0,
  unplanned_extra: 1,
  missing_from_receipt: 2,
  matched: 3,
};

/**
 * Kassenzettel-Gegencheck: vergleicht die geplanten (abgehakten) Artikel mit dem echten Bon.
 * Abweichungen bis zur Toleranz (Standard 1 Cent, Rundung) gelten als passend.
 */
export const reconcileReceiptWithBasket = (params: {
  planned: readonly PlannedPosition[];
  receipt: readonly ReceiptPosition[];
  toleranceCents?: number;
}): ReconciliationResult => {
  const toleranceCents = params.toleranceCents ?? 1;

  const plannedByCategory = new Map<string, PlannedPosition>();
  for (const position of params.planned) {
    const existing = plannedByCategory.get(position.categoryId);
    plannedByCategory.set(position.categoryId, {
      categoryId: position.categoryId,
      quantity: (existing?.quantity ?? 0) + position.quantity,
      plannedCents: (existing?.plannedCents ?? 0) + position.plannedCents,
    });
  }

  const receiptByCategory = new Map<string, ReceiptPosition>();
  for (const position of params.receipt) {
    const existing = receiptByCategory.get(position.categoryId);
    receiptByCategory.set(position.categoryId, {
      categoryId: position.categoryId,
      quantity: (existing?.quantity ?? 0) + position.quantity,
      actualCents: (existing?.actualCents ?? 0) + position.actualCents,
      isOffer: (existing?.isOffer ?? false) || position.isOffer,
    });
  }

  const categoryIds = new Set([...plannedByCategory.keys(), ...receiptByCategory.keys()]);
  const lines: ReconciliationLine[] = [];

  for (const categoryId of categoryIds) {
    const planned = plannedByCategory.get(categoryId);
    const paid = receiptByCategory.get(categoryId);
    const plannedCents = planned?.plannedCents ?? null;
    const actualCents = paid?.actualCents ?? null;
    let status: ReconciliationStatus;
    if (planned && paid) {
      status = Math.abs(paid.actualCents - planned.plannedCents) <= toleranceCents ? "matched" : "price_changed";
    } else if (paid) {
      status = "unplanned_extra";
    } else {
      status = "missing_from_receipt";
    }

    lines.push({
      categoryId,
      categoryName: CATEGORY_MAP[categoryId]?.name ?? categoryId,
      plannedCents,
      actualCents,
      deltaCents: (actualCents ?? 0) - (plannedCents ?? 0),
      plannedQuantity: planned?.quantity ?? 0,
      actualQuantity: paid?.quantity ?? 0,
      status,
      actualUnitCents: paid && paid.quantity > 0 ? Math.round(paid.actualCents / paid.quantity) : null,
      actualWasOffer: paid?.isOffer ?? false,
    });
  }

  lines.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      Math.abs(b.deltaCents) - Math.abs(a.deltaCents) ||
      a.categoryName.localeCompare(b.categoryName, "de"),
  );

  const sumBy = (status: ReconciliationStatus, pick: (line: ReconciliationLine) => number) =>
    lines.filter((line) => line.status === status).reduce((sum, line) => sum + pick(line), 0);

  return {
    lines,
    plannedTotalCents: [...plannedByCategory.values()].reduce((sum, p) => sum + p.plannedCents, 0),
    paidTotalCents: [...receiptByCategory.values()].reduce((sum, p) => sum + p.actualCents, 0),
    comparableDeltaCents:
      sumBy("matched", (line) => line.deltaCents) + sumBy("price_changed", (line) => line.deltaCents),
    unplannedExtraCents: sumBy("unplanned_extra", (line) => line.actualCents ?? 0),
    missingPlannedCents: sumBy("missing_from_receipt", (line) => line.plannedCents ?? 0),
  };
};
