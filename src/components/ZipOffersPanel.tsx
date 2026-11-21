import type { ChainScrapeStatus } from "@/lib/providers/chain-scrapers";
import {
  POPULAR_GERMAN_ZIPS,
  resolveZipRegion,
  type ZipRegionInfo,
} from "@/lib/providers/zip-offer-fetcher";
import { CATEGORIES } from "@/lib/rules/catalog";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON, ToggleChip } from "./ui";

interface ZipOffersPanelProps {
  zipCode: string;
  onZipCodeChange: (value: string) => void;
  activeZipCode: string;
  region: ZipRegionInfo;
  onFetchOffers: (zipCode?: string) => void;
  onLiveScrape: () => void;
  isSyncing: boolean;
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
  onLiveScrape,
  isSyncing,
  isLiveScraping,
  feedback,
  chainStatuses,
}: ZipOffersPanelProps) => {
  const busy = isSyncing || isLiveScraping;

  return (
    <section aria-labelledby="zip-offers-title">
      <h1 id="zip-offers-title" className="text-[26px] leading-tight font-black tracking-tight">
        Angebote für deine Postleitzahl
      </h1>
      <p className="mt-2 max-w-[70ch] text-[15px]">
        Aktuell PLZ {activeZipCode}: {region.regionLabel}, {region.aldiVariant}. Alle Angebote
        werden den {CATEGORIES.length} Kategorien des Sortiments zugeordnet.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1.5 text-[15px] font-bold">
          Postleitzahl
          <input
            type="text"
            value={zipCode}
            onChange={(event) => onZipCodeChange(event.target.value)}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            className="h-12 w-32 rounded border border-line-strong bg-paper px-3 pt-0.5 text-[17px] font-semibold tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={() => onFetchOffers(zipCode)}
          disabled={busy}
          className={cn(PRIMARY_BUTTON, "disabled:opacity-60")}
        >
          {isSyncing ? "Angebote werden abgerufen…" : "Angebote abrufen"}
        </button>
        <button
          type="button"
          onClick={onLiveScrape}
          disabled={busy}
          className={cn(SECONDARY_BUTTON, "disabled:opacity-60")}
        >
          {isLiveScraping ? "Ketten werden abgefragt…" : "Live bei den Ketten abrufen"}
        </button>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-[15px] font-bold">Region ausprobieren</legend>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_GERMAN_ZIPS.map((entry) => (
            <ToggleChip
              key={entry.zipCode}
              active={activeZipCode === entry.zipCode}
              onToggle={() => onFetchOffers(entry.zipCode)}
            >
              {entry.zipCode} {entry.city}, {resolveZipRegion(entry.zipCode).aldiVariant}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      {feedback && (
        <p role="status" className="mt-4 max-w-[70ch] text-[15px] font-bold">
          {feedback}
        </p>
      )}

      {chainStatuses.length > 0 && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {chainStatuses.map((chain) => {
            const isLive = chain.status === "live_scraped";
            return (
              <li
                key={chain.storeId}
                className={cn("rounded-md px-3.5 py-3", isLive ? "bg-panel" : "border border-line")}
              >
                <p className="flex items-center justify-between gap-2">
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
                <p className="mt-1 text-[13px] text-muted">{chain.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
