import type { ChainScrapeStatus } from "@/lib/providers/chain-scrapers";
import {
  POPULAR_GERMAN_ZIPS,
  resolveZipRegion,
  type ZipRegionInfo,
} from "@/lib/providers/zip-offer-fetcher";
import { ChevronIcon, cn, PRIMARY_BUTTON, SECONDARY_BUTTON, ToggleChip } from "./ui";

interface ZipOffersPanelProps {
  zipCode: string;
  onZipCodeChange: (value: string) => void;
  activeZipCode: string;
  region: ZipRegionInfo;
  onFetchOffers: (zipCode?: string) => void;
  onFetchOpenPrices: () => void;
  onLiveScrape: () => void;
  isSyncing: boolean;
  isFetchingOpenPrices: boolean;
  isLiveScraping: boolean;
  feedback: string | null;
  chainStatuses: readonly ChainScrapeStatus[];
}

const chainStatusLabel = (status: ChainScrapeStatus): string => {
  if (status.status === "live_scraped") return `Live, ${status.matchedCount} Treffer`;
  if (status.status === "blocked") return "Bot-Schutz, Regionalkatalog";
  return "Regionalkatalog";
};

export const ZipOffersPanel = ({
  zipCode,
  onZipCodeChange,
  activeZipCode,
  region,
  onFetchOffers,
  onFetchOpenPrices,
  onLiveScrape,
  isSyncing,
  isFetchingOpenPrices,
  isLiveScraping,
  feedback,
  chainStatuses,
}: ZipOffersPanelProps) => {
  const busy = isSyncing || isLiveScraping || isFetchingOpenPrices;

  return (
    <section
      aria-labelledby="zip-offers-title"
      className="rounded-xl border border-line bg-paper p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="zip-offers-title" className="text-xl leading-tight font-black tracking-tight">
          Angebote für PLZ {activeZipCode}
        </h2>
        <span className="text-sm text-muted">
          {region.regionLabel} · {region.aldiVariant}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">
          Postleitzahl
          <input
            type="text"
            value={zipCode}
            onChange={(event) => onZipCodeChange(event.target.value)}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            className="h-12 w-28 rounded-md border border-line-strong bg-paper px-3 text-base font-bold text-ink tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={() => onFetchOffers(zipCode)}
          disabled={busy}
          className={cn(PRIMARY_BUTTON, "disabled:opacity-60")}
        >
          {isSyncing ? "Lädt…" : "Angebote laden"}
        </button>
        <button
          type="button"
          onClick={onFetchOpenPrices}
          disabled={busy}
          className={cn(SECONDARY_BUTTON, "text-sm disabled:opacity-60")}
        >
          {isFetchingOpenPrices ? "Open Prices…" : "Open Prices"}
        </button>
        <button
          type="button"
          onClick={onLiveScrape}
          disabled={busy}
          className={cn(SECONDARY_BUTTON, "text-sm disabled:opacity-60")}
        >
          {isLiveScraping ? "Live-Abruf…" : "Live-Abruf"}
        </button>
      </div>

      {feedback && (
        <p role="status" className="mt-3 text-sm font-bold text-route">
          {feedback}
        </p>
      )}

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <span>Andere Region ausprobieren</span>
          <ChevronIcon className="size-4 transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {POPULAR_GERMAN_ZIPS.map((entry) => (
            <ToggleChip
              key={entry.zipCode}
              active={activeZipCode === entry.zipCode}
              onToggle={() => onFetchOffers(entry.zipCode)}
            >
              {entry.zipCode} {entry.city} ({resolveZipRegion(entry.zipCode).aldiVariant})
            </ToggleChip>
          ))}
        </div>
      </details>

      {chainStatuses.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {chainStatuses.map((chain) => {
            const isLive = chain.status === "live_scraped";
            return (
              <li
                key={chain.storeId}
                className={cn("rounded-lg px-3 py-2.5", isLive ? "bg-panel" : "border border-line")}
              >
                <p className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-extrabold">{chain.storeName}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 pt-0.5 text-xs font-bold",
                      isLive ? "bg-route text-route-ink" : "border border-line-strong",
                    )}
                  >
                    {chainStatusLabel(chain)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">{chain.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
