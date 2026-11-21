import type {
  DealAssessment,
  PriceConfidence,
  ShrinkflationWarning,
} from "@/lib/rules/price-intelligence";
import { cn, InfoIcon } from "./ui";

export const PriceConfidenceBadge = ({
  confidence,
  className,
}: {
  confidence: PriceConfidence;
  className?: string;
}) => {
  const toneClass =
    confidence.source === "live_scraped" || confidence.source === "receipt_verified"
      ? "border-route bg-paper text-route"
      : confidence.source === "user_calibrated"
        ? "border-ink bg-paper text-ink"
        : confidence.source === "regional_offer"
          ? "border-line-strong bg-paper text-ink"
          : "border-line bg-paper text-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 pt-0.5 text-xs font-bold",
        toneClass,
        className,
      )}
    >
      {confidence.label}
    </span>
  );
};

export const DealRatingBadge = ({
  deal,
  className,
}: {
  deal: DealAssessment;
  className?: string;
}) => {
  if (deal.rating === "fair") return null;

  const toneClass =
    deal.rating === "top_deal"
      ? "border-route bg-route text-route-ink"
      : deal.rating === "good_deal"
        ? "border-route bg-paper text-route"
        : "border-detour bg-detour-soft text-ink";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 pt-0.5 text-xs font-bold",
        toneClass,
        className,
      )}
    >
      {deal.label}
    </span>
  );
};

export const ShrinkflationAlert = ({
  warning,
  className,
}: {
  warning: ShrinkflationWarning;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-start gap-1.5 rounded bg-detour-soft px-2 py-1 text-[13px] font-semibold text-ink",
      className,
    )}
  >
    <InfoIcon className="mt-px size-4 flex-none text-detour" />
    <span>{warning.message}</span>
  </span>
);
