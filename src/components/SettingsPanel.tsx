import type { ZipRegionInfo } from "@/lib/providers/zip-offer-fetcher";
import { STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import { formatThreshold } from "./format";
import { SegmentedControl, ToggleChip } from "./ui";

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
}

export const SettingsPanel = ({
  zipCode,
  onZipCodeChange,
  region,
  isSyncingZip,
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
}: SettingsPanelProps) => (
  <aside
    id="einstellungen"
    aria-label="Einstellungen"
    className="flex min-w-0 scroll-mt-6 flex-col gap-6 rounded-md bg-panel p-5 sm:p-6"
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
          : `${region.regionLabel}, ${region.aldiVariant}`}
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
    </div>

    {enabledStores.length >= 2 && (
      <details className="border-t border-line-strong pt-5">
        <summary className="min-h-11 cursor-pointer text-[15px] font-bold">Umwege zu den Märkten</summary>
        <p className="mt-1 text-sm text-muted">
          Wie viele Minuten Umweg bedeutet ein Markt für dich? Ein Abstecher kommt nur dazu, wenn er pro
          Minute genug spart. Leer lassen heißt: kein Umweg.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {enabledStores.map((storeId) => (
            <label key={storeId} className="flex items-center justify-between gap-2 text-sm font-semibold">
              {STORE_MAP[storeId].shortName}
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={120}
                  inputMode="numeric"
                  value={storeDetourMinutes[storeId] ?? ""}
                  onChange={(event) =>
                    onDetourMinutesChange(storeId, Math.max(0, Math.min(120, Number(event.target.value) || 0)))
                  }
                  aria-label={`Umweg zu ${STORE_MAP[storeId].shortName} in Minuten`}
                  className="h-11 w-16 rounded border border-line-strong bg-paper px-2 pt-0.5 text-right font-semibold tabular-nums"
                />
                <span aria-hidden="true" className="text-muted">
                  Min.
                </span>
              </span>
            </label>
          ))}
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
