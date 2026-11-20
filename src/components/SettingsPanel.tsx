import { STORES, type StoreId } from "@/lib/rules/catalog";
import { formatThreshold } from "./format";
import { SegmentedControl, ToggleChip } from "./ui";

const THRESHOLD_OPTIONS = [250, 500, 750, 1000].map((cents) => ({
  value: cents,
  label: formatThreshold(cents),
}));

const SHOPPING_DAY_OPTIONS = [
  { value: "weekday", label: "Mo–Mi" },
  { value: "weekend", label: "Do–Sa" },
] as const;

type ShoppingDay = (typeof SHOPPING_DAY_OPTIONS)[number]["value"];

interface SettingsPanelProps {
  zipCode: string;
  onZipCodeChange: (zipCode: string) => void;
  isWeekendShopping: boolean;
  onShoppingDayChange: (day: ShoppingDay) => void;
  thresholdCents: number;
  onThresholdChange: (cents: number) => void;
  enabledStores: readonly StoreId[];
  onToggleStore: (storeId: StoreId) => void;
  enabledLoyaltyApps: readonly StoreId[];
  onToggleLoyaltyApp: (storeId: StoreId) => void;
}

export const SettingsPanel = ({
  zipCode,
  onZipCodeChange,
  isWeekendShopping,
  onShoppingDayChange,
  thresholdCents,
  onThresholdChange,
  enabledStores,
  onToggleStore,
  enabledLoyaltyApps,
  onToggleLoyaltyApp,
}: SettingsPanelProps) => (
  <aside
    id="einstellungen"
    aria-label="Einstellungen"
    className="flex min-w-0 scroll-mt-6 flex-col gap-6 rounded-md bg-panel p-5 sm:p-6"
  >
    <label className="flex flex-col gap-1.5 text-[15px] font-bold">
      Postleitzahl
      <input
        type="text"
        value={zipCode}
        onChange={(event) => onZipCodeChange(event.target.value)}
        inputMode="numeric"
        maxLength={5}
        autoComplete="postal-code"
        className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 text-[17px] font-semibold tabular-nums"
      />
    </label>

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
  </aside>
);
