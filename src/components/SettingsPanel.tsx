import type { NearbyStoreLocation, NearbyStoresResult } from "@/lib/providers/store-locator";
import type { ZipRegionInfo } from "@/lib/providers/zip-offer-fetcher";
import { STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import {
  evaluateOpeningHours,
  getGermanHolidayForDate,
  resolveGermanStateForZip,
} from "@/lib/rules/opening-hours";
import { formatThreshold } from "./format";
import { cn, SECONDARY_BUTTON, SegmentedControl, ToggleChip } from "./ui";

const THRESHOLD_OPTIONS = [250, 500, 750, 1000].map((cents) => ({
  value: cents,
  label: formatThreshold(cents),
}));

const DETOUR_RATE_OPTIONS = [30, 50, 80, 100].map((cents) => ({
  value: cents,
  label: cents === 100 ? "1 €" : `${cents} ct`,
}));

const SHOPPING_DAY_OPTIONS = [
  { value: "weekday", label: "Mo–Mi" },
  { value: "weekend", label: "Do–Sa" },
] as const;

type ShoppingDay = (typeof SHOPPING_DAY_OPTIONS)[number]["value"];

interface SettingsPanelProps {
  zipCode: string;
  onZipCodeChange: (zipCode: string) => void;
  region: ZipRegionInfo;
  isSyncingZip: boolean;
  shoppingDate: string;
  isWeekendShopping: boolean;
  onShoppingDayChange: (day: ShoppingDay) => void;
  thresholdCents: number;
  onThresholdChange: (cents: number) => void;
  enabledStores: readonly StoreId[];
  onToggleStore: (storeId: StoreId) => void;
  enabledLoyaltyApps: readonly StoreId[];
  onToggleLoyaltyApp: (storeId: StoreId) => void;
  storeDetourMinutes: Partial<Record<StoreId, number>>;
  onDetourMinutesChange: (storeId: StoreId, minutes: number) => void;
  minSavingsPerDetourMinuteCents: number;
  onMinSavingsPerDetourMinuteChange: (cents: number) => void;
  nearbyStores?: NearbyStoresResult | null;
  isLoadingNearbyStores?: boolean;
  nearbyStoresFeedback?: string | null;
  onFetchNearbyStores?: () => void;
  onApplyNearbyDetours?: () => void;
  embedded?: boolean;
}

const formatKm = (km: number): string => `${km.toFixed(1).replace(".", ",")} km`;

export const SettingsPanel = ({
  zipCode,
  onZipCodeChange,
  region,
  isSyncingZip,
  shoppingDate,
  isWeekendShopping,
  onShoppingDayChange,
  thresholdCents,
  onThresholdChange,
  enabledStores,
  onToggleStore,
  enabledLoyaltyApps,
  onToggleLoyaltyApp,
  storeDetourMinutes,
  onDetourMinutesChange,
  minSavingsPerDetourMinuteCents,
  onMinSavingsPerDetourMinuteChange,
  nearbyStores,
  isLoadingNearbyStores,
  nearbyStoresFeedback,
  onFetchNearbyStores,
  onApplyNearbyDetours,
  embedded = false,
}: SettingsPanelProps) => {
  const stateInfo = resolveGermanStateForZip(region.zipCode);
  const holidayName = getGermanHolidayForDate(shoppingDate, stateInfo.code);
  const storeLocationById = new Map<StoreId, NearbyStoreLocation>(
    (nearbyStores?.stores ?? [])
      .filter((loc) => loc.source === "osm_overpass")
      .map((loc) => [loc.storeId, loc]),
  );

  return (
    <aside
      id="einstellungen"
      aria-label="Einstellungen"
      className={cn(
        "flex min-w-0 scroll-mt-6 flex-col gap-6",
        !embedded && "rounded-md bg-panel p-5 sm:p-6",
      )}
    >
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 text-[15px] font-bold">
          Postleitzahl
          <input
            type="text"
            value={zipCode}
            onChange={(event) => onZipCodeChange(event.target.value)}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            aria-describedby="zip-region"
            className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 text-[17px] font-semibold tabular-nums"
          />
        </label>
        <span id="zip-region" className="text-sm text-muted" aria-live="polite">
          {isSyncingZip
            ? "Angebote für diese Postleitzahl werden geladen…"
            : `${region.regionLabel} (${stateInfo.name}), ${region.aldiVariant}`}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-bold">Wann kaufst du ein?</span>
        <SegmentedControl
          label="Einkaufstag"
          options={SHOPPING_DAY_OPTIONS}
          value={isWeekendShopping ? "weekend" : "weekday"}
          onChange={onShoppingDayChange}
        />
        <span className="text-sm text-muted">
          {isWeekendShopping
            ? "Angebote ab Donnerstag sind dabei."
            : "Nur Angebote, die schon ab Montag gelten."}
        </span>
        {holidayName && (
          <p role="status" className="mt-1 rounded bg-detour-soft px-2.5 py-2 text-xs font-bold">
            Feiertag-Hinweis ({stateInfo.name}): {holidayName} – Supermärkte sind i. d. R.
            geschlossen.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-bold">Abstecher lohnt sich ab</span>
        <SegmentedControl
          label="Mindest-Ersparnis für einen zweiten Laden"
          options={THRESHOLD_OPTIONS}
          value={thresholdCents}
          onChange={onThresholdChange}
        />
        <span className="text-sm text-muted">
          Ein zweiter Laden kommt nur dazu, wenn er mindestens so viel extra spart.
        </span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-bold">Deine Kundenkarten</legend>
        <div className="flex flex-wrap gap-1.5">
          {STORES.filter((store) => store.loyaltyAppName != null).map((store) => (
            <ToggleChip
              key={store.id}
              active={enabledLoyaltyApps.includes(store.id)}
              onToggle={() => onToggleLoyaltyApp(store.id)}
            >
              {store.loyaltyAppName}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-line-strong pt-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[15px] font-bold">Märkte in deiner Nähe</legend>
          <span className="text-sm text-muted">
            {enabledStores.length} von {STORES.length} ausgewählt. Mindestens einer bleibt aktiv.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {STORES.map((store) => (
              <ToggleChip
                key={store.id}
                active={enabledStores.includes(store.id)}
                onToggle={() => onToggleStore(store.id)}
              >
                {store.shortName}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        {onFetchNearbyStores && (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={isLoadingNearbyStores}
              onClick={onFetchNearbyStores}
              className={cn(SECONDARY_BUTTON, "w-full justify-center text-sm disabled:opacity-60")}
            >
              {isLoadingNearbyStores
                ? "Suche echte Filialen (OSM)…"
                : "Echte Filialen & Öffnungszeiten laden"}
            </button>
            {nearbyStoresFeedback && (
              <p role="status" className="text-xs font-bold text-route">
                {nearbyStoresFeedback}
              </p>
            )}
          </div>
        )}
      </div>

      {enabledStores.length >= 2 && (
        <details className="border-t border-line-strong pt-5" open={nearbyStores?.source === "osm_overpass"}>
          <summary className="min-h-11 cursor-pointer text-[15px] font-bold">
            Filial-Entfernungen & Umwege
          </summary>
          <p className="mt-1 text-sm text-muted">
            Wie viele Minuten Umweg bedeutet ein Markt für dich? Ein Abstecher kommt nur dazu, wenn
            er pro Minute genug spart.
          </p>
          {onApplyNearbyDetours && nearbyStores && nearbyStores.osmMatchCount > 0 && (
            <button
              type="button"
              onClick={onApplyNearbyDetours}
              className="mt-2.5 text-left text-xs font-bold text-route underline underline-offset-4"
            >
              Ermittelte OSM-Wegzeiten als Umweg übernehmen
            </button>
          )}
          <div className="mt-3 flex flex-col gap-2.5">
            {enabledStores.map((storeId) => {
              const loc = storeLocationById.get(storeId);
              const openInfo = loc
                ? evaluateOpeningHours({
                    openingHours: loc.openingHours,
                    dateIso: shoppingDate,
                    stateCode: stateInfo.code,
                  })
                : null;
              return (
                <div key={storeId} className="flex flex-col gap-0.5">
                  <label className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span className="min-w-0 truncate">
                      {STORE_MAP[storeId].shortName}
                      {loc && (
                        <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
                          {formatKm(loc.distanceKm)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        inputMode="numeric"
                        value={storeDetourMinutes[storeId] ?? ""}
                        onChange={(event) =>
                          onDetourMinutesChange(
                            storeId,
                            Math.max(0, Math.min(120, Number(event.target.value) || 0)),
                          )
                        }
                        aria-label={`Umweg zu ${STORE_MAP[storeId].shortName} in Minuten`}
                        className="h-10 w-16 rounded border border-line-strong bg-paper px-2 pt-0.5 text-right font-semibold tabular-nums"
                      />
                      <span aria-hidden="true" className="text-muted">
                        Min.
                      </span>
                    </span>
                  </label>
                  {loc && openInfo && (
                    <p className="text-xs text-muted">
                      {openInfo.label} · {loc.address}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-bold">Mindestens so viel Ersparnis pro Minute</span>
            <SegmentedControl
              label="Mindest-Ersparnis pro Umweg-Minute"
              options={DETOUR_RATE_OPTIONS}
              value={minSavingsPerDetourMinuteCents}
              onChange={onMinSavingsPerDetourMinuteChange}
            />
          </div>
        </details>
      )}
    </aside>
  );
};
