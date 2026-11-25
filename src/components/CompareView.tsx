import { Fragment, type ReactNode, useState } from "react";
import type { NearbyStoreLocation, NearbyStoresResult } from "@/lib/providers/store-locator";
import type { ZipRegionInfo } from "@/lib/providers/zip-offer-fetcher";
import { STORE_MAP, STORES, type StoreId } from "@/lib/rules/catalog";
import {
  evaluateOpeningHours,
  getGermanHolidayForDate,
  resolveGermanStateForZip,
} from "@/lib/rules/opening-hours";
import {
  formatEuroCents,
  type OfferRecord,
  type OptimizationOutput,
  type ResolvedStoreItem,
} from "@/lib/rules/optimizer";
import { ITEM_PREFERENCE_LABELS } from "@/lib/rules/preferences";
import {
  assessOfferConfidence,
  buildVerifiedKey,
  evaluateOfferDeal,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import { formatThreshold, itemShortName } from "./format";
import { type InStoreMode, type PlanLeg, resolvePlan } from "./plan";
import {
  DealRatingBadge,
  PriceConfidenceBadge,
  PrimaryItemBadge,
  resolvePrimaryItemBadge,
  ShrinkflationAlert,
} from "./PriceBadges";
import { RoutePlan, type RoutePlanRow } from "./RoutePlan";
import {
  ChevronIcon,
  cn,
  CollapsibleCard,
  InfoIcon,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SegmentedControl,
  SlidersIcon,
  StarIcon,
  StorePlate,
  ToggleChip,
} from "./ui";

export type CompareStrategy = "auto" | "single" | "split" | "custom";
type VisibleCompareMode = "single" | "split" | "custom";

const STRATEGY_OPTIONS: readonly { value: VisibleCompareMode; label: string }[] = [
  { value: "single", label: "Einzelmarkt" },
  { value: "split", label: "Smart-Split" },
  { value: "custom", label: "Eigene Kombi" },
];

interface CompareViewProps {
  optimization: OptimizationOutput;
  offers: readonly OfferRecord[];
  shoppingDate: string;
  isWeekendShopping: boolean;
  activeZipCode: string;
  region: ZipRegionInfo;
  enabledStoresCount: number;
  totalListCount: number;
  strategy: CompareStrategy;
  onStrategyChange: (strategy: VisibleCompareMode) => void;
  customComboStores: readonly StoreId[];
  onToggleCustomComboStore: (storeId: StoreId) => void;
  priceHistory?: PriceHistorySummary;
  customBasePrices?: CustomBasePricesMap;
  nearbyStores?: NearbyStoresResult | null;
  isLoadingNearbyStores?: boolean;
  nearbyStoresFeedback?: string | null;
  onFetchNearbyStores: () => void;
  weekday: string;
  onStartRoute: (mode: InStoreMode) => void;
  onLoadPreset: () => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
  favoriteAlertCount: number;
  favoriteSavingsCents: number;
  favoritesCard?: ReactNode;
}

/** Betrag, der nie zwischen Zahl und €-Zeichen umbricht */
const Euro = ({ cents }: { cents: number }) => (
  <span className="whitespace-nowrap">{formatEuroCents(cents)}</span>
);

const legCaption = (leg: PlanLeg): string => {
  if (leg.role === "main") return `Hauptladen, ${leg.itemCount} Artikel`;
  if (leg.role === "detour") {
    return leg.detourMinutes > 0
      ? `Abstecher, ${leg.itemCount} Artikel, ${leg.detourMinutes} Min. Umweg`
      : `Abstecher, ${leg.itemCount} Artikel`;
  }
  return `${leg.itemCount} Artikel`;
};

export const CompareView = ({
  optimization,
  offers,
  shoppingDate,
  isWeekendShopping,
  activeZipCode,
  region,
  enabledStoresCount,
  totalListCount,
  strategy,
  onStrategyChange,
  customComboStores,
  onToggleCustomComboStore,
  priceHistory,
  customBasePrices,
  nearbyStores,
  isLoadingNearbyStores = false,
  nearbyStoresFeedback,
  onFetchNearbyStores,
  weekday,
  onStartRoute,
  onLoadPreset,
  onOpenList,
  onOpenSettings,
  favoriteAlertCount,
  favoriteSavingsCents,
  favoritesCard,
}: CompareViewProps) => {
  const bestSingle = optimization.bestSingleStore;
  const split = optimization.bestTwoStoreSplit;
  const customCombo = optimization.customStoreCombo;

  const stateInfo = resolveGermanStateForZip(activeZipCode);
  const holidayName = getGermanHolidayForDate(shoppingDate, stateInfo.code);

  const visibleMode: VisibleCompareMode =
    strategy === "auto" ? optimization.recommendedStrategy : strategy;

  const targetInStoreMode: InStoreMode =
    visibleMode === "custom"
      ? "custom"
      : visibleMode === "split" && split != null
        ? "split"
        : "single";

  const plan =
    visibleMode === "custom" && !customCombo
      ? null
      : resolvePlan(optimization, targetInStoreMode);

  const locationByStore = new Map<StoreId, NearbyStoreLocation>(
    (nearbyStores?.stores ?? [])
      .filter((loc) => loc.source === "osm_overpass")
      .map((loc) => [loc.storeId, loc]),
  );

  if (!bestSingle) {
    return (
      <div className="mx-auto max-w-3xl">
        <section className="rounded-xl border border-line bg-paper p-6 sm:p-8">
          <h1 className="text-3xl font-black tracking-tight">Deine Einkaufsliste ist leer</h1>
          <p className="mt-2 max-w-prose text-base text-muted">
            Starte mit einer Vorlage oder stelle deine Liste zusammen. Danach findest du hier auf
            einen Blick den günstigsten Markt oder deine eigene Kombination.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onLoadPreset} className={PRIMARY_BUTTON}>
              Typischen Wocheneinkauf laden
            </button>
            <button type="button" onClick={onOpenList} className={SECONDARY_BUTTON}>
              Liste öffnen
            </button>
          </div>
        </section>
      </div>
    );
  }

  const isRecommendedView = visibleMode === optimization.recommendedStrategy;
  const hasRealStoreLocations =
    plan != null && plan.legs.some((leg) => locationByStore.has(leg.storeId));

  const rows: RoutePlanRow[] =
    plan?.legs.map((leg) => ({
      variant: leg.variant,
      storeName: leg.storeName,
      caption: legCaption(leg),
      totalCents: leg.totalCents,
      departments: leg.departments,
    })) ?? [];

  const detourLegs = plan?.legs.filter((leg) => leg.role === "detour") ?? [];
  const routeStoreNames = plan ? plan.legs.map((leg) => leg.storeName).join(" + ") : "";
  const unusedStoreNames = (customCombo?.unusedStoreIds ?? [])
    .map((id) => STORE_MAP[id].shortName)
    .join(", ");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {/* Ruhige Kontext-Leiste + Einstellungs-Drawer-Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-bold text-ink tabular-nums">PLZ {activeZipCode}</span>
          {" · "}
          {weekday} ({isWeekendShopping ? "Do–Sa" : "Mo–Mi"})
          {" · "}
          {enabledStoresCount} Märkte
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-paper px-3.5 text-sm font-bold text-ink transition hover:border-route"
        >
          <SlidersIcon className="size-4 text-route" />
          Einstellungen
        </button>
      </div>

      {/* Zentrale, ruhige Ergebnis-Karte */}
      <section
        aria-labelledby="route-title"
        className="flex flex-col gap-5 rounded-xl border border-line-strong bg-paper p-5 shadow-xs sm:p-7"
      >
        <h1 id="route-title" className="sr-only">
          Dein Einkaufsergebnis am {weekday}
        </h1>

        <SegmentedControl
          label="Einkaufs-Strategie wählen"
          options={STRATEGY_OPTIONS}
          value={visibleMode}
          onChange={onStrategyChange}
        />

        {/* Freie Markt-Auswahl bei „Eigene Kombi“ */}
        {visibleMode === "custom" && (
          <div className="rounded-lg bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-extrabold">Wähle 2 oder mehr Märkte für deine Kombi</p>
              <span className="text-xs font-semibold text-muted tabular-nums">
                {customComboStores.length} ausgewählt
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {STORES.map((store) => (
                <ToggleChip
                  key={store.id}
                  active={customComboStores.includes(store.id)}
                  onToggle={() => onToggleCustomComboStore(store.id)}
                >
                  {store.shortName}
                </ToggleChip>
              ))}
            </div>
            {customComboStores.length < 2 && (
              <p role="status" className="mt-3 text-sm font-semibold text-detour-strong">
                Wähle mindestens 2 Supermärkte aus, damit die optimale Aufteilung berechnet wird.
              </p>
            )}
          </div>
        )}

        {plan && (
          <>
            {/* Routen-Kopf: Märkte + ruhiger Gesamtpreis + Ersparnis */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {plan.legs.map((leg, index) => (
                    <Fragment key={`${leg.role}-${leg.storeId}`}>
                      {index > 0 && (
                        <span aria-hidden="true" className="text-lg font-black text-muted">
                          +
                        </span>
                      )}
                      <StorePlate variant={leg.variant}>{leg.storeName}</StorePlate>
                    </Fragment>
                  ))}
                  {isRecommendedView && (
                    <span className="rounded-full bg-panel px-2.5 py-0.5 text-xs font-bold text-route">
                      Empfohlen
                    </span>
                  )}
                  {visibleMode === "custom" && (
                    <span className="rounded-full bg-panel px-2.5 py-0.5 text-xs font-bold text-route">
                      Eigene Kombi
                    </span>
                  )}
                </div>

                {/* Ersparnis-Zusammenfassung je Strategie */}
                <div className="mt-3 space-y-1 text-[15px] leading-relaxed">
                  {visibleMode === "single" && (
                    <>
                      <p className="font-semibold text-ink">
                        {bestSingle.totalSavingsCents > 0 ? (
                          <>
                            <span className="font-extrabold text-route">
                              <Euro cents={bestSingle.totalSavingsCents} /> gespart
                            </span>{" "}
                            gegenüber Normalpreis · {totalListCount} Artikel
                          </>
                        ) : (
                          <>Alle {totalListCount} Artikel in einem Markt</>
                        )}
                      </p>
                      {split && split.extraSavingsVsBestSingleCents > 0 && (
                        <p className="text-sm text-muted">
                          {split.worthSecondStore ? (
                            <>
                              Smart-Split ({split.primaryStoreName} + {split.secondaryStoreName})
                              spart zusätzlich <Euro cents={split.extraSavingsVsBestSingleCents} />.
                            </>
                          ) : !split.meetsDetourEfficiency &&
                            split.savingsPerDetourMinuteCents != null ? (
                            <>
                              Zweiter Laden spart{" "}
                              <Euro cents={split.extraSavingsVsBestSingleCents} /> (
                              <Euro cents={split.savingsPerDetourMinuteCents} />/Min. bei{" "}
                              {split.detourMinutes} Min. Umweg).
                            </>
                          ) : (
                            <>
                              Zweiter Laden würde nur{" "}
                              <Euro cents={split.extraSavingsVsBestSingleCents} /> extra sparen
                              (Schwelle {formatThreshold(optimization.secondStoreThresholdCents)}).
                            </>
                          )}
                        </p>
                      )}
                    </>
                  )}

                  {visibleMode === "split" && split && (
                    <>
                      <p className="font-semibold text-ink">
                        {split.extraSavingsVsBestSingleCents > 0 ? (
                          <>
                            <span className="font-extrabold text-route">
                              <Euro cents={split.extraSavingsVsBestSingleCents} /> gespart
                            </span>{" "}
                            gegenüber bestem Einzelmarkt ({bestSingle.storeName})
                          </>
                        ) : (
                          <>Gleich teuer wie bester Einzelmarkt ({bestSingle.storeName})</>
                        )}
                      </p>
                      <p className="text-sm text-muted">
                        {split.totalSavingsCents > 0 && (
                          <>
                            Insgesamt <Euro cents={split.totalSavingsCents} /> unter Normalpreis ·{" "}
                          </>
                        )}
                        {split.primaryStoreName} ({split.primaryItems.length} Artikel) +{" "}
                        {split.secondaryStoreName} ({split.secondaryItems.length} Angebote)
                        {!split.worthSecondStore && " · unter deiner Abstecher-Schwelle"}
                      </p>
                    </>
                  )}

                  {visibleMode === "split" && !split && (
                    <p className="text-sm text-muted">
                      Für einen Smart-Split müssen mindestens 2 Märkte in den Einstellungen aktiv
                      sein. Aktuell wird der günstigste Einzelmarkt gezeigt.
                    </p>
                  )}

                  {visibleMode === "custom" && customCombo && (
                    <>
                      <p className="font-semibold text-ink">
                        {customCombo.savingsVsBestSingleInComboCents > 0 ? (
                          <>
                            <span className="font-extrabold text-route">
                              <Euro cents={customCombo.savingsVsBestSingleInComboCents} /> gespart
                            </span>{" "}
                            gegenüber Einzelmarkt ({customCombo.bestSingleInComboStoreName})
                          </>
                        ) : (
                          <>
                            Gleicher Preis wie alles bei {customCombo.bestSingleInComboStoreName}
                          </>
                        )}
                      </p>
                      <p className="text-sm text-muted">
                        {customCombo.legs
                          .map(
                            (leg) =>
                              `${leg.storeName}: ${leg.items.length} Artikel (${formatEuroCents(leg.totalCheckoutCents)})`,
                          )
                          .join(" · ")}
                      </p>
                      {customCombo.savingsVsOverallBestSingleCents !==
                        customCombo.savingsVsBestSingleInComboCents && (
                        <p className="text-sm text-muted">
                          {customCombo.savingsVsOverallBestSingleCents > 0 ? (
                            <>
                              <Euro cents={customCombo.savingsVsOverallBestSingleCents} /> günstiger
                              als der insgesamt günstigste Einzelmarkt ({bestSingle.storeName}).
                            </>
                          ) : customCombo.savingsVsOverallBestSingleCents < 0 ? (
                            <>
                              <Euro cents={-customCombo.savingsVsOverallBestSingleCents} /> über dem
                              insgesamt günstigsten Einzelmarkt ({bestSingle.storeName}).
                            </>
                          ) : (
                            <>
                              Gleichauf mit dem insgesamt günstigsten Einzelmarkt (
                              {bestSingle.storeName}).
                            </>
                          )}
                        </p>
                      )}
                      {customCombo.unusedStoreIds.length > 0 && (
                        <p className="text-sm text-muted">
                          Bei {unusedStoreNames} ist diese Woche kein Artikel günstiger – alle
                          Artikel bleiben bei {customCombo.primaryStoreName}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Gesamtpreis</p>
                <p className="text-4xl leading-none font-black tracking-tight tabular-nums sm:text-[44px]">
                  <Euro cents={plan.totalCents} />
                </p>
              </div>
            </div>

            {/* Ruhiger Filial-Status direkt in der Ergebnis-Karte */}
            <div className="rounded-lg bg-panel px-4 py-3 text-sm">
              {holidayName && (
                <p
                  role="status"
                  className="mb-2 rounded bg-detour-soft px-2.5 py-1.5 text-xs font-bold text-ink"
                >
                  Feiertag ({stateInfo.name}): {holidayName} – Supermärkte sind i. d. R.
                  geschlossen.
                </p>
              )}

              {hasRealStoreLocations ? (
                <ul className="flex flex-col gap-2">
                  {plan.legs.map((leg) => {
                    const loc = locationByStore.get(leg.storeId);
                    if (!loc) return null;
                    const opening = evaluateOpeningHours({
                      openingHours: loc.openingHours,
                      dateIso: shoppingDate,
                      stateCode: nearbyStores?.stateCode ?? stateInfo.code,
                    });
                    const isClosed =
                      opening.state === "closed" || opening.state === "holiday_closed";
                    return (
                      <li
                        key={`status-${leg.role}-${leg.storeId}`}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-ink">{loc.branchName}</span>
                          <span className="text-muted tabular-nums">
                            {" · "}
                            {loc.distanceKm.toFixed(1).replace(".", ",")} km
                          </span>
                          <span
                            className={cn(
                              "ml-2 font-bold",
                              isClosed ? "text-detour-strong" : "text-route",
                            )}
                          >
                            {opening.label}
                          </span>
                        </div>
                        <a
                          href={loc.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-route underline underline-offset-4"
                        >
                          Karte
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    Filial-Status: {region.regionLabel} · {region.aldiVariant}
                  </span>
                  <button
                    type="button"
                    disabled={isLoadingNearbyStores}
                    onClick={onFetchNearbyStores}
                    className="text-sm font-bold text-route underline underline-offset-4 disabled:opacity-60"
                  >
                    {isLoadingNearbyStores
                      ? "Suche Filialen…"
                      : "Filialen & Öffnungszeiten prüfen"}
                  </button>
                </div>
              )}

              {nearbyStoresFeedback && !hasRealStoreLocations && (
                <p role="status" className="mt-1.5 text-xs font-semibold text-muted">
                  {nearbyStoresFeedback}
                </p>
              )}
            </div>

            {/* Klare Hauptaktion */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onStartRoute(targetInStoreMode)}
                className={cn(PRIMARY_BUTTON, "w-full sm:w-auto sm:min-w-52")}
              >
                Einkauf starten
              </button>
              <button
                type="button"
                onClick={onOpenList}
                className="min-h-11 px-2 text-sm font-bold text-route underline underline-offset-4"
              >
                Liste bearbeiten ({totalListCount})
              </button>
            </div>
          </>
        )}
      </section>

      {/* Nachgelagerte Bereiche: alle standardmäßig eingeklappt */}
      {plan && (
        <CollapsibleCard
          title="Laufroute & Artikel-Aufteilung"
          summary={`${routeStoreNames} · ${totalListCount} Artikel`}
        >
          <div className="flex flex-col gap-6">
            <RoutePlan
              rows={rows}
              footer={
                plan.legs.length > 1
                  ? "Die Haltestellen folgen der üblichen Laufroute im Markt. Gleich teure Artikel bleiben immer im Hauptladen."
                  : "Die Haltestellen folgen der üblichen Laufroute im Markt."
              }
            />

            {detourLegs.map((leg) => {
              const legItems = leg.departments.flatMap((department) => department.items);
              return (
                <div key={`detour-list-${leg.storeId}`}>
                  <h3 className="text-lg font-black tracking-tight">
                    Abstecher bei {leg.storeName} ({legItems.length} Artikel)
                  </h3>
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {legItems.map((item) => (
                      <QuietCompareItemRow
                        key={`${leg.storeId}-${item.categoryId}`}
                        item={item}
                        offers={offers}
                        shoppingDate={shoppingDate}
                        priceHistory={priceHistory}
                        customBasePrices={customBasePrices}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </CollapsibleCard>
      )}

      <CollapsibleCard
        title={`Alle ${optimization.singleStoreRankings.length} Märkte im Vergleich`}
        summary={`ab ${formatEuroCents(bestSingle.totalCheckoutCents)}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="w-12 border-b-2 border-ink px-2.5 py-2 font-bold">
                  #
                </th>
                <th scope="col" className="border-b-2 border-ink px-2.5 py-2 font-bold">
                  Markt
                </th>
                <th
                  scope="col"
                  className="hidden border-b-2 border-ink px-2.5 py-2 font-bold sm:table-cell"
                >
                  Angebote
                </th>
                <th scope="col" className="border-b-2 border-ink px-2.5 py-2 text-right font-bold">
                  Kassenpreis
                </th>
                <th scope="col" className="border-b-2 border-ink px-2.5 py-2 text-right font-bold">
                  Differenz
                </th>
              </tr>
            </thead>
            <tbody>
              {optimization.singleStoreRankings.map((ranking, index) => {
                const refTotal = plan?.totalCents ?? bestSingle.totalCheckoutCents;
                const diff = ranking.totalCheckoutCents - refTotal;
                const isTop = index === 0;
                return (
                  <tr key={ranking.storeId} className={cn(isTop && "bg-panel")}>
                    <td className="border-b border-line px-2.5 py-3 font-extrabold">
                      {index + 1}
                    </td>
                    <th
                      scope="row"
                      className={cn(
                        "border-b border-line px-2.5 py-3 text-left",
                        isTop ? "font-extrabold" : "font-bold",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onStartRoute(ranking.storeId)}
                        className="text-left underline-offset-4 hover:text-route hover:underline"
                      >
                        {ranking.storeName}
                      </button>
                    </th>
                    <td className="hidden border-b border-line px-2.5 py-3 sm:table-cell">
                      {ranking.offerCount}
                    </td>
                    <td
                      className={cn(
                        "border-b border-line px-2.5 py-3 text-right",
                        isTop ? "font-extrabold" : "font-bold",
                      )}
                    >
                      {formatEuroCents(ranking.totalCheckoutCents)}
                    </td>
                    <td className="border-b border-line px-2.5 py-3 text-right text-sm">
                      {diff > 0
                        ? `+${formatEuroCents(diff)}`
                        : diff < 0
                          ? `−${formatEuroCents(-diff)}`
                          : "deine Route"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      {favoriteAlertCount > 0 && favoritesCard && (
        <CollapsibleCard
          title="Stammprodukte im Angebot"
          icon={<StarIcon className="size-5 flex-none text-route" filled />}
          summary={`${favoriteAlertCount} Angebote · ${formatEuroCents(favoriteSavingsCents)} sparen`}
        >
          {favoritesCard}
        </CollapsibleCard>
      )}
    </div>
  );
};

interface QuietCompareItemRowProps {
  item: ResolvedStoreItem;
  offers: readonly OfferRecord[];
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  customBasePrices?: CustomBasePricesMap;
}

/** Ruhige Artikelzeile für Abstecher-Artikel: max. 1 Haupt-Badge sichtbar, Details per Antippen */
const QuietCompareItemRow = ({
  item,
  offers,
  shoppingDate,
  priceHistory,
  customBasePrices,
}: QuietCompareItemRowProps) => {
  const [expanded, setExpanded] = useState(false);

  const matchingOffer = offers.find(
    (offer) =>
      offer.storeId === item.storeId &&
      offer.categoryId === item.categoryId &&
      offer.validFrom <= shoppingDate &&
      offer.validTo >= shoppingDate,
  );
  const verified =
    priceHistory?.verifiedPrices[buildVerifiedKey(item.categoryId, item.storeId)];
  const deal = matchingOffer
    ? evaluateOfferDeal(matchingOffer, priceHistory?.categoryStats[item.categoryId], customBasePrices)
    : null;
  const confidence = matchingOffer
    ? assessOfferConfidence(matchingOffer, shoppingDate, verified)
    : null;
  const primaryBadge = resolvePrimaryItemBadge({
    isOffer: item.isOffer,
    usedLoyaltyApp: item.usedLoyaltyApp,
    loyaltyAppName: item.loyaltyAppName,
    deal,
  });

  return (
    <li className="py-3.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          aria-hidden="true"
          className="mt-1.5 size-3 flex-none rounded-full border-[3px] border-detour"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">
            {item.requestedQuantity}× {itemShortName(item)}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="truncate">{item.productLabel}</span>
            {primaryBadge && <PrimaryItemBadge badge={primaryBadge} />}
          </span>
        </span>
        <span className="flex flex-none items-center gap-2 text-right tabular-nums">
          <span>
            <span className="block font-extrabold">{formatEuroCents(item.checkoutCents)}</span>
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

      {expanded && (
        <div className="mt-3 ml-6 flex flex-col gap-2 rounded-md bg-panel px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums">
            <span>
              Grundpreis: {formatEuroCents(item.unitPriceCents)}/{item.unitLabel}
            </span>
            {item.preference !== "cheapest" && (
              <span className="rounded border border-line-strong bg-paper px-1.5 py-0.5 font-bold text-ink">
                {ITEM_PREFERENCE_LABELS[item.preference]}
              </span>
            )}
            {confidence && <PriceConfidenceBadge confidence={confidence} />}
            {deal && <DealRatingBadge deal={deal} />}
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
        </div>
      )}
    </li>
  );
};
