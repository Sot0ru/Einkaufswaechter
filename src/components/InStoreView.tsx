import { useState } from "react";
import type { NearbyStoreLocation, NearbyStoresResult } from "@/lib/providers/store-locator";
import { CATEGORY_MAP, DEPARTMENT_MAP, type StoreId } from "@/lib/rules/catalog";
import { evaluateOpeningHours } from "@/lib/rules/opening-hours";
import {
  formatEuroCents,
  type OfferRecord,
  type OptimizationOutput,
  type ResolvedStoreItem,
} from "@/lib/rules/optimizer";
import { ITEM_PREFERENCE_LABELS } from "@/lib/rules/preferences";
import {
  assessResolvedItemConfidence,
  buildVerifiedKey,
  evaluateOfferDeal,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import { itemShortName } from "./format";
import { type InStoreMode, type PlanLeg, resolvePlan } from "./plan";
import {
  DealRatingBadge,
  PriceConfidenceBadge,
  PrimaryItemBadge,
  resolvePrimaryItemBadge,
  ShrinkflationAlert,
} from "./PriceBadges";
import type { CustomBasketItem } from "./ShoppingListView";
import type { ShareStatus } from "./useHouseholdShare";
import { ChevronIcon, cn, InfoIcon, StorePlate, ToggleChip } from "./ui";

interface InStoreViewProps {
  optimization: OptimizationOutput;
  offers: readonly OfferRecord[];
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  nearbyStores?: NearbyStoresResult | null;
  customItems?: readonly CustomBasketItem[];
  mode: InStoreMode;
  onModeChange: (mode: InStoreMode) => void;
  checkedKeys: Record<string, boolean>;
  onToggleChecked: (key: string) => void;
  customBasePrices: CustomBasePricesMap;
  onAdjustBasePrice: (categoryId: string, storeId: StoreId, deltaCents: number) => void;
  onResetBasePrice: (categoryId: string, storeId: StoreId) => void;
  priceEditFeedback: string | null;
  /** Abgleich-Status, wenn die Liste mit dem Haushalt geteilt ist */
  shareStatus?: ShareStatus | null;
  /** Aktuelle Uhrzeit für „zuletzt vor X Sek. abgeglichen“ */
  now?: number;
}

const describeSyncAge = (syncedAt: number | null, now: number): string => {
  if (syncedAt == null) return "wird abgeglichen";
  const seconds = Math.max(0, Math.round((now - syncedAt) / 1000));
  if (seconds < 5) return "gerade abgeglichen";
  if (seconds < 60) return `zuletzt vor ${seconds} Sek. abgeglichen`;
  return `zuletzt vor ${Math.round(seconds / 60)} Min. abgeglichen`;
};

/** Werkzeuge, um den Normalpreis einer Eigenmarke direkt am Regal zu korrigieren */
interface BasePriceTools {
  customBasePrices: CustomBasePricesMap;
  offers: readonly OfferRecord[];
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  onAdjust: (categoryId: string, storeId: StoreId, deltaCents: number) => void;
  onReset: (categoryId: string, storeId: StoreId) => void;
}

const checkKeyFor = (item: ResolvedStoreItem): string => `${item.storeId}:${item.categoryId}`;

export const InStoreView = ({
  optimization,
  offers,
  shoppingDate,
  priceHistory,
  nearbyStores,
  customItems = [],
  mode,
  onModeChange,
  checkedKeys,
  onToggleChecked,
  customBasePrices,
  onAdjustBasePrice,
  onResetBasePrice,
  priceEditFeedback,
  shareStatus,
  now,
}: InStoreViewProps) => {
  const [routePickerOpen, setRoutePickerOpen] = useState(false);

  const plan = resolvePlan(optimization, mode);
  const priceTools: BasePriceTools = {
    customBasePrices,
    offers,
    shoppingDate,
    priceHistory,
    onAdjust: onAdjustBasePrice,
    onReset: onResetBasePrice,
  };
  const split = optimization.bestTwoStoreSplit;
  const customCombo = optimization.customStoreCombo;

  if (!plan) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-line bg-paper p-8">
        <h1 className="text-3xl font-black tracking-tight">Noch keine Route</h1>
        <p className="mt-2 text-base text-muted">Leg zuerst Artikel auf deine Einkaufsliste.</p>
      </section>
    );
  }

  const activeRouteLabel =
    plan.kind === "custom"
      ? `Eigene Kombi: ${plan.legs.map((leg) => leg.storeName).join(" + ")}`
      : plan.kind === "split"
        ? `Smart-Split: ${plan.legs.map((leg) => leg.storeName).join(" + ")}`
        : `Einzelmarkt: ${plan.legs[0].storeName}`;

  const selectRoute = (nextMode: InStoreMode) => {
    onModeChange(nextMode);
    setRoutePickerOpen(false);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Kompakte aktive Routen-Leiste mit eingeklapptem Routen-Wechsler */}
      <div className="rounded-xl border border-line bg-paper px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Aktive Laufroute</p>
            <p className="font-extrabold text-ink">
              {activeRouteLabel}{" "}
              <span className="font-bold text-muted tabular-nums">
                · {formatEuroCents(plan.totalCents)}
              </span>
            </p>
          </div>
          <button
            type="button"
            aria-expanded={routePickerOpen}
            onClick={() => setRoutePickerOpen((open) => !open)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 text-sm font-bold text-ink transition hover:border-route"
          >
            Route wechseln
            <ChevronIcon
              className={cn(
                "size-4 text-muted transition-transform duration-150",
                routePickerOpen && "rotate-180",
              )}
            />
          </button>
        </div>

        {routePickerOpen && (
          <fieldset className="mt-3.5 border-t border-line pt-3.5">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Route auswählen
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {customCombo && (
                <ToggleChip
                  active={plan.kind === "custom"}
                  onToggle={() => selectRoute("custom")}
                >
                  Kombi: {customCombo.legs.map((leg) => leg.storeName).join(" + ")} (
                  {formatEuroCents(customCombo.totalCheckoutCents)})
                </ToggleChip>
              )}
              {split && (
                <ToggleChip active={plan.kind === "split"} onToggle={() => selectRoute("split")}>
                  Smart-Split: {split.primaryStoreName} + {split.secondaryStoreName} (
                  {formatEuroCents(split.totalCheckoutCents)})
                </ToggleChip>
              )}
              {optimization.singleStoreRankings.map((ranking) => (
                <ToggleChip
                  key={ranking.storeId}
                  active={plan.kind === "single" && plan.legs[0].storeId === ranking.storeId}
                  onToggle={() => selectRoute(ranking.storeId)}
                >
                  Nur {ranking.storeName} ({formatEuroCents(ranking.totalCheckoutCents)})
                </ToggleChip>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {shareStatus && (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-lg border-2 border-route px-4 py-3 text-[15px]"
        >
          <span aria-hidden="true" className="mt-1.5 size-2.5 flex-none rounded-full bg-route" />
          <span>
            <strong>Gemeinsame Liste „{shareStatus.listName}“</strong>,{" "}
            {describeSyncAge(shareStatus.syncedAt, now ?? shareStatus.syncedAt ?? 0)}.
            {shareStatus.error && <span className="block text-muted">{shareStatus.error}</span>}
          </span>
        </p>
      )}

      {priceEditFeedback && (
        <p role="status" className="rounded-lg bg-panel px-4 py-3 text-sm font-bold">
          {priceEditFeedback}
        </p>
      )}

      <div
        className={cn(
          "grid items-start gap-6",
          plan.legs.length > 1 ? "lg:grid-cols-2" : "mx-auto w-full max-w-2xl",
        )}
      >
        {plan.legs.map((leg, index) => {
          const candidate = nearbyStores?.stores.find((loc) => loc.storeId === leg.storeId);
          const storeLocation = candidate?.source === "osm_overpass" ? candidate : undefined;
          const nextLeg = plan.legs[index + 1];
          const detourNumber = plan.legs.length > 2 && leg.role === "detour" ? index : undefined;
          return (
            <RouteChecklist
              key={`${leg.role}-${leg.storeId}`}
              leg={leg}
              detourNumber={detourNumber}
              nextStoreName={nextLeg?.storeName}
              storeLocation={storeLocation}
              stateCode={nearbyStores?.stateCode}
              customItems={index === 0 ? customItems : []}
              checkedKeys={checkedKeys}
              onToggleChecked={onToggleChecked}
              priceTools={priceTools}
            />
          );
        })}
      </div>
    </div>
  );
};

const legTitleFor = (role: PlanLeg["role"], detourNumber?: number): string => {
  if (role === "main") return "Hauptladen";
  if (role === "detour") {
    return detourNumber != null ? `Abstecher ${detourNumber} · Angebote` : "Abstecher · Angebote";
  }
  return "Dein Einkauf";
};

interface RouteChecklistProps {
  leg: PlanLeg;
  detourNumber?: number;
  nextStoreName?: string;
  storeLocation?: NearbyStoreLocation;
  stateCode?: NearbyStoresResult["stateCode"];
  customItems: readonly CustomBasketItem[];
  checkedKeys: Record<string, boolean>;
  onToggleChecked: (key: string) => void;
  priceTools: BasePriceTools;
}

/** Senkrechte Linie durch den Markt: Abteilungen als Haltestellen, ruhige Artikelzeilen zum Abhaken */
const RouteChecklist = ({
  leg,
  detourNumber,
  nextStoreName,
  storeLocation,
  stateCode,
  customItems,
  checkedKeys,
  onToggleChecked,
  priceTools,
}: RouteChecklistProps) => {
  const items = leg.departments.flatMap((department) => department.items);
  const doneCount =
    items.filter((item) => checkedKeys[checkKeyFor(item)]).length +
    customItems.filter((c) => checkedKeys[`custom:${c.id}`]).length;
  const totalCount = items.length + customItems.length;
  const nextStop = leg.departments.find((department) =>
    department.items.some((item) => !checkedKeys[checkKeyFor(item)]),
  );
  const isDetour = leg.variant === "detour";
  const opening =
    storeLocation && stateCode
      ? evaluateOpeningHours({
          openingHours: storeLocation.openingHours,
          dateIso: priceTools.shoppingDate,
          stateCode,
        })
      : null;

  return (
    <section
      aria-label={`Route bei ${leg.storeName}`}
      className="overflow-hidden rounded-xl border border-line bg-paper"
    >
      <header className="bg-sign px-4 pb-4 pt-3.5 text-sign-ink sm:px-5">
        <div className="flex items-center gap-3">
          <StorePlate variant={leg.variant} inverted>
            {leg.storeName}
          </StorePlate>
          <h2 className="flex-1 text-lg font-extrabold">{legTitleFor(leg.role, detourNumber)}</h2>
          <span className="text-lg font-extrabold tabular-nums">
            {formatEuroCents(leg.totalCents)}
          </span>
        </div>
        {storeLocation && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-sign-muted">
            <span>
              {storeLocation.address} · {storeLocation.distanceKm.toFixed(1).replace(".", ",")} km
              {opening ? ` · ${opening.label}` : ""}
            </span>
            <a
              href={storeLocation.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sign-ink underline underline-offset-2"
            >
              Route auf Karte
            </a>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-bold tabular-nums" aria-live="polite">
            {doneCount} von {totalCount} im Wagen
          </span>
          <span className="text-sign-muted">
            {nextStop ? `Nächster Halt: ${nextStop.departmentName}` : "Alles im Wagen, ab zur Kasse"}
          </span>
        </div>
      </header>

      <ol className="px-3 pb-5 pt-5 sm:px-5">
        {leg.departments.map((department) => {
          const isComplete = department.items.every((item) => checkedKeys[checkKeyFor(item)]);
          return (
            <li
              key={department.departmentId}
              className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 pb-6 sm:gap-x-3.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-0.5 left-[17px] top-[30px] w-1.5",
                  isComplete ? (isDetour ? "bg-detour" : "bg-route") : "bg-route-soft",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 flex size-10 items-center justify-center rounded-full border-[6px] pt-0.5 text-sm font-black",
                  isDetour ? "border-detour" : "border-route",
                  isComplete
                    ? isDetour
                      ? "bg-detour text-detour-plate-ink"
                      : "bg-route text-route-ink"
                    : "bg-paper",
                )}
              >
                {department.sortOrder}
              </span>
              <div className="min-w-0">
                <h3 className="mb-2.5 mt-2 text-base leading-tight font-extrabold">
                  {department.departmentName}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {department.items.map((item) => (
                    <ChecklistItem
                      key={checkKeyFor(item)}
                      item={item}
                      checked={Boolean(checkedKeys[checkKeyFor(item)])}
                      onToggle={() => onToggleChecked(checkKeyFor(item))}
                      priceTools={priceTools}
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
        {customItems.length > 0 && (
          <li className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 pb-6 sm:gap-x-3.5">
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 left-[17px] top-[30px] w-1.5 bg-route-soft"
            />
            <span
              aria-hidden="true"
              className="relative z-10 flex size-10 items-center justify-center rounded-full border-[6px] border-route bg-paper pt-0.5 text-sm font-black"
            >
              +
            </span>
            <div className="min-w-0">
              <h3 className="mb-2.5 mt-2 text-base leading-tight font-extrabold">Eigene Artikel</h3>
              <ul className="flex flex-col gap-2.5">
                {customItems.map((custom) => {
                  const key = `custom:${custom.id}`;
                  const checked = Boolean(checkedKeys[key]);
                  return (
                    <li
                      key={key}
                      className={cn(
                        "rounded-lg border transition",
                        checked ? "border-line bg-paper" : "border-transparent bg-panel",
                      )}
                    >
                      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleChecked(key)}
                          className="size-6 flex-none accent-route"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={cn("font-bold", checked && "text-muted line-through")}>
                              {custom.quantity}× {custom.name}
                            </span>
                            {custom.estimatedPriceCents != null && (
                              <span className="flex-none text-sm font-bold text-muted tabular-nums">
                                ca. {formatEuroCents(custom.estimatedPriceCents * custom.quantity)}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted">
                            {DEPARTMENT_MAP[custom.department]?.name}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        )}
        <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 sm:gap-x-3.5">
          <span
            aria-hidden="true"
            className={cn("size-10 rounded-lg", isDetour ? "bg-detour" : "bg-route")}
          />
          <div className="flex items-center justify-between gap-3">
            <h3 className="pt-1 text-lg font-extrabold">Kasse</h3>
            <span className="text-lg font-extrabold tabular-nums">
              {formatEuroCents(leg.totalCents)}
            </span>
          </div>
        </li>
      </ol>

      {nextStoreName && (
        <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 px-3 pb-5 sm:gap-x-3.5 sm:px-5">
          <span
            aria-hidden="true"
            className="h-9 justify-self-center border-l-[5px] border-dashed border-detour"
          />
          <span />
          <span aria-hidden="true" className="size-10 rounded-full border-[6px] border-detour bg-paper" />
          <p className="self-center rounded-lg bg-detour-soft px-3.5 py-2.5 text-sm">
            <strong>Danach: Abstecher zu {nextStoreName}.</strong> Dort holst du nur die günstigeren
            Artikel.
          </p>
        </div>
      )}
    </section>
  );
};

interface ChecklistItemProps {
  item: ResolvedStoreItem;
  checked: boolean;
  onToggle: () => void;
  priceTools: BasePriceTools;
}

const CORRECTION_BUTTON =
  "min-h-10 rounded-md border border-line-strong bg-paper px-3 text-sm font-bold tabular-nums transition hover:border-route";

/** Ruhige Abhak-Zeile: max. 1 Haupt-Badge auf den ersten Blick, Details & Preiskorrektur beim Antippen */
const ChecklistItem = ({ item, checked, onToggle, priceTools }: ChecklistItemProps) => {
  const [expanded, setExpanded] = useState(false);

  const defaultPackCents =
    CATEGORY_MAP[item.categoryId]?.defaultBasePrices[item.storeId]?.priceCents ?? 0;
  const customEntry = priceTools.customBasePrices[item.categoryId]?.[item.storeId];
  const currentPackCents = customEntry?.priceCents ?? defaultPackCents;
  const isCustomized = customEntry != null && customEntry.priceCents !== defaultPackCents;

  const matchingOffer = item.isOffer
    ? priceTools.offers.find(
        (offer) =>
          offer.storeId === item.storeId &&
          offer.categoryId === item.categoryId &&
          offer.validFrom <= priceTools.shoppingDate &&
          offer.validTo >= priceTools.shoppingDate,
      )
    : undefined;
  const verifiedRecord =
    priceTools.priceHistory?.verifiedPrices[buildVerifiedKey(item.categoryId, item.storeId)];
  const confidence = assessResolvedItemConfidence({
    item,
    matchingOffer,
    isUserCustomized: isCustomized,
    verifiedRecord,
    referenceDate: priceTools.shoppingDate,
  });
  const deal = matchingOffer
    ? evaluateOfferDeal(
        matchingOffer,
        priceTools.priceHistory?.categoryStats[item.categoryId],
        priceTools.customBasePrices,
      )
    : null;
  const primaryBadge = resolvePrimaryItemBadge({
    isOffer: item.isOffer,
    usedLoyaltyApp: item.usedLoyaltyApp,
    loyaltyAppName: item.loyaltyAppName,
    deal,
  });

  const shortName = itemShortName(item);

  return (
    <li
      className={cn(
        "rounded-lg border transition",
        checked ? "border-line bg-paper" : "border-transparent bg-panel",
      )}
    >
      <div className="flex items-start gap-1 px-2 py-2.5 sm:px-3">
        <label className="flex size-11 flex-none cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`${shortName} abhaken`}
            className="size-6 accent-route"
          />
        </label>

        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 py-1 pr-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className={cn("block font-bold leading-snug", checked && "text-muted line-through")}>
              {item.requestedQuantity}× {shortName}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="truncate">{item.productLabel}</span>
              {primaryBadge && <PrimaryItemBadge badge={primaryBadge} />}
            </span>
          </span>

          <span className="flex flex-none items-center gap-1.5 text-right tabular-nums">
            <span>
              <span className={cn("block font-extrabold", checked && "text-muted")}>
                {formatEuroCents(item.checkoutCents)}
              </span>
              {item.savingsCents > 0 && (
                <span className="block text-xs text-muted">
                  statt <s>{formatEuroCents(item.regularCheckoutCents)}</s>
                </span>
              )}
            </span>
            <ChevronIcon
              className={cn(
                "size-4 text-muted transition-transform duration-150",
                expanded && "rotate-180",
              )}
            />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-line/70 px-3.5 pb-3.5 pt-3 text-sm sm:pl-14">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums">
            <span>
              Grundpreis: {formatEuroCents(item.unitPriceCents)}/{item.unitLabel}
            </span>
            {item.packsToBuy !== item.requestedQuantity && (
              <span>· {item.packsToBuy} Packungen</span>
            )}
            {item.preference !== "cheapest" && (
              <span className="rounded border border-line-strong bg-paper px-1.5 py-0.5 font-bold text-ink">
                {ITEM_PREFERENCE_LABELS[item.preference]}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <PriceConfidenceBadge confidence={confidence} />
            {deal && <DealRatingBadge deal={deal} />}
            {item.loyaltyAppName && (
              <span className="rounded border border-route bg-paper px-1.5 pt-0.5 text-xs font-bold text-route">
                Mit {item.loyaltyAppName} scannen
              </span>
            )}
          </div>

          {deal?.shrinkflationWarning && <ShrinkflationAlert warning={deal.shrinkflationWarning} />}

          {item.bulkPackHint && (
            <p className="flex items-start gap-1.5 text-[13px]">
              <InfoIcon className="mt-px size-4 flex-none text-route" />
              {item.bulkPackHint}
            </p>
          )}
          {item.stockUpHint && (
            <p className="flex items-start gap-1.5 text-[13px]">
              <InfoIcon className="mt-px size-4 flex-none text-route" />
              {item.stockUpHint}
            </p>
          )}

          {/* 1-Klick-Preiskorrektur am Regal */}
          <div className="border-t border-line pt-2.5">
            <p className="text-xs text-muted">
              Normalpreis Eigenmarke bei {item.storeName}:{" "}
              <strong className="text-ink tabular-nums">{formatEuroCents(currentPackCents)}</strong>
              {isCustomized && ` (Standard ${formatEuroCents(defaultPackCents)})`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => priceTools.onAdjust(item.categoryId, item.storeId, -10)}
                aria-label={`Normalpreis für ${shortName} um 10 Cent senken`}
                className={CORRECTION_BUTTON}
              >
                −10 ct
              </button>
              <button
                type="button"
                onClick={() => priceTools.onAdjust(item.categoryId, item.storeId, 10)}
                aria-label={`Normalpreis für ${shortName} um 10 Cent erhöhen`}
                className={CORRECTION_BUTTON}
              >
                +10 ct
              </button>
              {isCustomized && (
                <button
                  type="button"
                  onClick={() => priceTools.onReset(item.categoryId, item.storeId)}
                  className={CORRECTION_BUTTON}
                >
                  Standard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
};
