import type { FavoriteAlertSummary } from "@/lib/rules/favorites";
import { formatEuroCents } from "@/lib/rules/optimizer";
import { itemShortName } from "./format";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, StarIcon } from "./ui";

interface FavoriteAlertsCardProps {
  summary: FavoriteAlertSummary;
  favoriteCount: number;
  basketCategoryIds: ReadonlySet<string>;
  onAddAll: () => void;
  onDownloadReminder: () => void;
  /** Hinweise anzeigen, wenn noch keine Stammprodukte markiert sind bzw. keines im Angebot ist */
  showEmptyStates?: boolean;
}

/** Wochen-Radar: Stammprodukte, die diese Woche im Angebot sind */
export const FavoriteAlertsCard = ({
  summary,
  favoriteCount,
  basketCategoryIds,
  onAddAll,
  onDownloadReminder,
  showEmptyStates = false,
}: FavoriteAlertsCardProps) => {
  const count = summary.alerts.length;

  if (count === 0) {
    if (!showEmptyStates) return null;
    return (
      <section aria-labelledby="favorites-title" className="rounded-md border border-line p-5">
        <h2 id="favorites-title" className="flex items-center gap-2 text-xl font-black">
          <StarIcon className="size-5 text-route" filled={favoriteCount > 0} />
          Deine Stammprodukte
        </h2>
        <p className="mt-1.5 text-[15px]">
          {favoriteCount === 0
            ? "Markiere in der Einkaufsliste Produkte mit dem Stern. Dann siehst du hier jede Woche, welche davon im Angebot sind."
            : `Keines deiner ${favoriteCount} Stammprodukte ist diese Woche im Angebot.`}
        </p>
        {favoriteCount > 0 && (
          <button type="button" onClick={onDownloadReminder} className={`${SECONDARY_BUTTON} mt-3`}>
            Montags erinnern
          </button>
        )}
      </section>
    );
  }

  const missingFromBasket = summary.alerts.filter((alert) => !basketCategoryIds.has(alert.categoryId)).length;

  return (
    <section aria-labelledby="favorites-title" className="rounded-md bg-panel p-5">
      <h2 id="favorites-title" className="flex items-start gap-2 text-xl leading-tight font-black">
        <StarIcon className="mt-0.5 size-5 flex-none text-route" filled />
        {count === 1
          ? "Eines deiner Stammprodukte ist diese Woche im Angebot"
          : `${count} deiner Stammprodukte sind diese Woche im Angebot`}
      </h2>
      <p className="mt-1 text-[15px]">
        Zusammen {formatEuroCents(summary.totalSavingsCents)} günstiger als zum Normalpreis.
      </p>
      <ul className="mt-3 divide-y divide-line-strong">
        {summary.alerts.map((alert) => (
          <li key={alert.categoryId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-bold">
                {itemShortName({ categoryId: alert.categoryId, categoryName: alert.categoryId })}
                <span className="font-normal text-muted"> bei {alert.storeName}</span>
              </p>
              <p className="text-sm text-muted">
                {alert.offerTitle}
                {alert.usedLoyaltyApp && ", mit App"}
              </p>
            </div>
            <p className="flex-none text-right tabular-nums">
              <span className="block font-extrabold">{formatEuroCents(alert.offerPriceCents)}</span>
              <span className="block text-xs text-muted">
                statt <s>{formatEuroCents(alert.regularPriceCents)}</s>
              </span>
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddAll}
          disabled={missingFromBasket === 0}
          className={`${PRIMARY_BUTTON} disabled:opacity-60`}
        >
          {missingFromBasket === 0 ? "Alle sind auf der Liste" : "Alle auf die Liste"}
        </button>
        <button type="button" onClick={onDownloadReminder} className={SECONDARY_BUTTON}>
          Montags erinnern
        </button>
      </div>
    </section>
  );
};
