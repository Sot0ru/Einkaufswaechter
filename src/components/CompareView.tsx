import type { ReactNode } from "react";
import type { NearbyStoreLocation, NearbyStoresResult } from "@/lib/providers/store-locator";
import type { StoreId } from "@/lib/rules/catalog";
import { evaluateOpeningHours } from "@/lib/rules/opening-hours";
import {
  formatEuroCents,
  type OfferRecord,
  type OptimizationOutput,
} from "@/lib/rules/optimizer";
import {
  assessOfferConfidence,
  buildVerifiedKey,
  evaluateOfferDeal,
  type PriceHistorySummary,
} from "@/lib/rules/price-intelligence";
import type { CustomBasePricesMap } from "@/lib/services/base-prices";
import { formatThreshold, itemShortName } from "./format";
import { type InStoreMode, type PlanLeg, resolvePlan } from "./plan";
import { DealRatingBadge, PriceConfidenceBadge, ShrinkflationAlert } from "./PriceBadges";
import { RoutePlan, type RoutePlanRow } from "./RoutePlan";
import { cn, InfoIcon, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

interface CompareViewProps {
  optimization: OptimizationOutput;
  offers: readonly OfferRecord[];
  shoppingDate: string;
  priceHistory?: PriceHistorySummary;
  customBasePrices?: CustomBasePricesMap;
  nearbyStores?: NearbyStoresResult | null;
  weekday: string;
  onStartRoute: (mode: InStoreMode) => void;
  onLoadPreset: () => void;
  onOpenList: () => void;
  /** Wochen-Radar der Stammprodukte, erscheint unter dem Linienplan */
  favoritesCard?: ReactNode;
}

/** Betrag, der nie zwischen Zahl und €-Zeichen umbricht */
const Euro = ({ cents }: { cents: number }) => (
  <span className="whitespace-nowrap">{formatEuroCents(cents)}</span>
);

const legCaption = (leg: PlanLeg, detourMinutes: number): string => {
  if (leg.role === "main") return `Hauptladen, ${leg.itemCount} Artikel`;
  if (leg.role === "detour") {
    return detourMinutes > 0
      ? `Abstecher, ${leg.itemCount} Artikel, ${detourMinutes} Min. Umweg`
      : `Abstecher, ${leg.itemCount} Artikel`;
  }
  return `${leg.itemCount} Artikel`;
};

export const CompareView = ({
  optimization,
  offers,
  shoppingDate,
  priceHistory,
  customBasePrices,
  nearbyStores,
  weekday,
  onStartRoute,
  onLoadPreset,
  onOpenList,
  favoritesCard,
}: CompareViewProps) => {
  const bestSingle = optimization.bestSingleStore;
  const plan = resolvePlan(optimization, "recommended");
  const locationByStore = new Map<StoreId, NearbyStoreLocation>(
    (nearbyStores?.stores ?? []).map((loc) => [loc.storeId, loc]),
  );

  if (!bestSingle || !plan) {
    return (
      <section className="rounded-md border border-line p-8">
        <h1 className="text-3xl font-black tracking-tight">Deine Einkaufsliste ist leer</h1>
        <p className="mt-2 max-w-prose text-lg">
          Lade eine Vorlage oder stell dir deine Liste selbst zusammen. Danach siehst du hier deine
          Route durch den günstigsten Markt.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button type="button" onClick={onLoadPreset} className={PRIMARY_BUTTON}>
            Typischen Wocheneinkauf laden
          </button>
          <button type="button" onClick={onOpenList} className={SECONDARY_BUTTON}>
            Einkaufsliste öffnen
          </button>
        </div>
      </section>
    );
  }

  const split = optimization.bestTwoStoreSplit;
  const isSplit = plan.kind === "split" && split != null;
  const planSavingsCents = isSplit ? split.totalSavingsCents : bestSingle.totalSavingsCents;
  const detourStoreName = isSplit ? split.secondaryStoreName : null;

  const rows: RoutePlanRow[] = plan.legs.map((leg) => ({
    variant: leg.variant,
    storeName: leg.storeName,
    caption: legCaption(leg, split?.detourMinutes ?? 0),
    totalCents: leg.totalCents,
    departments: leg.departments,
  }));

  return (
    <div className="flex flex-col gap-10">
      <section
        aria-labelledby="route-title"
        className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5"
      >
        <div className="min-w-0 flex-[1_1_420px]">
          <h1
            id="route-title"
            className="text-4xl leading-[1.05] font-black tracking-tight sm:text-[44px]"
          >
            Deine Route am {weekday}
          </h1>
          <p className="mt-3 max-w-[60ch] text-lg text-pretty">
            {isSplit ? (
              <>
                Zwei Läden,{" "}
                <strong>
                  <Euro cents={plan.totalCents} />
                </strong>{" "}
                an der Kasse. Das sind <Euro cents={split.extraSavingsVsBestSingleCents} /> weniger
                als alles bei {bestSingle.storeName}
                {planSavingsCents > 0 && (
                  <>
                    {" "}
                    und <Euro cents={planSavingsCents} /> weniger als zum Normalpreis
                  </>
                )}
                .
              </>
            ) : (
              <>
                Ein Laden reicht: alles bei {bestSingle.storeName} für{" "}
                <strong>
                  <Euro cents={plan.totalCents} />
                </strong>
                {planSavingsCents > 0 && (
                  <>
                    , <Euro cents={planSavingsCents} /> weniger als zum Normalpreis
                  </>
                )}
                .
                {split &&
                  split.extraSavingsVsBestSingleCents >= optimization.secondStoreThresholdCents &&
                  !split.meetsDetourEfficiency &&
                  split.savingsPerDetourMinuteCents != null && (
                    <>
                      {" "}
                      Mit {split.primaryStoreName} und {split.secondaryStoreName} würdest du{" "}
                      <Euro cents={split.extraSavingsVsBestSingleCents} /> sparen, bei{" "}
                      {split.detourMinutes} Min. Umweg sind das nur{" "}
                      <Euro cents={split.savingsPerDetourMinuteCents} /> pro Minute. Dein Minimum liegt
                      bei <Euro cents={split.minSavingsPerDetourMinuteCents} />.
                    </>
                  )}
                {split &&
                  split.extraSavingsVsBestSingleCents > 0 &&
                  split.extraSavingsVsBestSingleCents < optimization.secondStoreThresholdCents && (
                  <>
                    {" "}
                    Mit {split.primaryStoreName} und {split.secondaryStoreName} würdest du nur{" "}
                    <Euro cents={split.extraSavingsVsBestSingleCents} /> sparen, deine Schwelle
                    liegt bei{" "}
                    <span className="whitespace-nowrap">
                      {formatThreshold(optimization.secondStoreThresholdCents)}
                    </span>
                    .
                  </>
                )}
                {split && split.extraSavingsVsBestSingleCents <= 0 && (
                  <> Ein zweiter Laden bringt diese Woche keinen Vorteil.</>
                )}
              </>
            )}
          </p>
          <a
            href="#einstellungen"
            className="mt-2 inline-flex min-h-11 items-center text-[15px] font-bold text-route underline underline-offset-4 lg:hidden"
          >
            Einkaufstag, Schwelle und Märkte anpassen
          </a>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => onStartRoute("recommended")} className={PRIMARY_BUTTON}>
            Route im Laden starten
          </button>
          {isSplit && (
            <button
              type="button"
              onClick={() => onStartRoute(bestSingle.storeId)}
              className={SECONDARY_BUTTON}
            >
              Nur bei {bestSingle.storeName} einkaufen
            </button>
          )}
          {!isSplit && split && split.extraSavingsVsBestSingleCents > 0 && (
            <button type="button" onClick={() => onStartRoute("split")} className={SECONDARY_BUTTON}>
              Route mit zwei Läden ansehen
            </button>
          )}
        </div>
      </section>

      <RoutePlan
        rows={rows}
        footer={
          detourStoreName
            ? `Die Haltestellen folgen der üblichen Laufroute im Markt. Gleich teure Artikel bleiben im Hauptladen, bei ${detourStoreName} stehen nur echte Angebote auf der Liste.`
            : "Die Haltestellen folgen der üblichen Laufroute im Markt."
        }
      />

      {nearbyStores && nearbyStores.osmMatchCount > 0 && (
        <section aria-label="Nächste Filialen und Öffnungszeiten" className="grid gap-3 sm:grid-cols-2">
          {plan.legs.map((leg) => {
            const loc = locationByStore.get(leg.storeId);
            if (!loc || loc.source !== "osm_overpass") return null;
            const opening = evaluateOpeningHours({
              openingHours: loc.openingHours,
              dateIso: shoppingDate,
              stateCode: nearbyStores.stateCode,
            });
            const isClosedOrHoliday =
              opening.state === "closed" || opening.state === "holiday_closed";

            return (
              <div
                key={`loc-${leg.role}-${leg.storeId}`}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border p-3.5 text-sm",
                  isClosedOrHoliday ? "border-detour bg-detour-soft" : "border-line bg-panel",
                )}
              >
                <div className="min-w-0">
                  <p className="font-extrabold">
                    {loc.branchName}{" "}
                    <span className="font-semibold text-muted tabular-nums">
                      · {loc.distanceKm.toFixed(1).replace(".", ",")} km ({loc.driveMinutes} Min.
                      Auto / {loc.walkMinutes} Min. zu Fuß)
                    </span>
                  </p>
                  <p className="mt-0.5 text-muted">{loc.address}</p>
                  <p className={cn("mt-1 font-bold", isClosedOrHoliday ? "text-ink" : "text-route")}>
                    {opening.label}
                  </p>
                </div>
                <a
                  href={loc.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-none rounded border border-line-strong bg-paper px-2.5 py-1.5 text-xs font-bold text-route transition hover:border-route"
                >
                  Karte
                </a>
              </div>
            );
          })}
        </section>
      )}

      {favoritesCard}

      {isSplit && (
        <section aria-labelledby="detour-title">
          <h2 id="detour-title" className="text-[26px] leading-tight font-black tracking-tight">
            Was du bei {split.secondaryStoreName} holst
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {split.secondaryItems.map((item) => {
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
                ? evaluateOfferDeal(
                    matchingOffer,
                    priceHistory?.categoryStats[item.categoryId],
                    customBasePrices,
                  )
                : null;
              const confidence = matchingOffer
                ? assessOfferConfidence(matchingOffer, shoppingDate, verified)
                : null;

              return (
                <li key={item.categoryId} className="flex items-start gap-4 py-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 size-3.5 flex-none rounded-full border-4 border-detour"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {item.requestedQuantity}× {itemShortName(item)}
                    </p>
                    <p className="text-sm text-muted">
                      {item.productLabel}
                      {item.loyaltyAppName && `, mit ${item.loyaltyAppName}`}
                    </p>
                    {(deal || confidence) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {deal && <DealRatingBadge deal={deal} />}
                        {confidence && <PriceConfidenceBadge confidence={confidence} />}
                      </div>
                    )}
                    {deal?.shrinkflationWarning && (
                      <div className="mt-1.5">
                        <ShrinkflationAlert warning={deal.shrinkflationWarning} />
                      </div>
                    )}
                    {item.stockUpHint && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[13px]">
                        <InfoIcon className="mt-px size-4 flex-none text-route" />
                        {item.stockUpHint}
                      </p>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-extrabold">{formatEuroCents(item.checkoutCents)}</p>
                    {item.savingsCents > 0 && (
                      <p className="text-sm text-muted">
                        statt <s>{formatEuroCents(item.regularCheckoutCents)}</s>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="ranking-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
          <h2 id="ranking-title" className="text-[26px] leading-tight font-black tracking-tight">
            Zum Vergleich: alles in einem Laden
          </h2>
          <p className="text-[15px] text-muted">Kassenpreis für alle Artikel deiner Liste</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="w-12 border-b-2 border-ink px-3 py-2.5 font-bold sm:w-[72px]">
                  Platz
                </th>
                <th scope="col" className="border-b-2 border-ink px-3 py-2.5 font-bold">
                  Markt
                </th>
                <th
                  scope="col"
                  className="hidden border-b-2 border-ink px-3 py-2.5 font-bold sm:table-cell"
                >
                  Angebote
                </th>
                <th scope="col" className="border-b-2 border-ink px-3 py-2.5 text-right font-bold">
                  Kassenpreis
                </th>
                <th scope="col" className="border-b-2 border-ink px-3 py-2.5 text-right font-bold">
                  <span className="sm:hidden">Mehr</span>
                  <span className="hidden sm:inline">Mehr als deine Route</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {optimization.singleStoreRankings.map((ranking, index) => {
                const differenceCents = ranking.totalCheckoutCents - plan.totalCents;
                const isTop = index === 0;
                return (
                  <tr key={ranking.storeId} className={cn(isTop && "bg-panel")}>
                    <td className="border-b border-line px-3 pb-2.5 pt-3 font-extrabold">{index + 1}</td>
                    <th
                      scope="row"
                      className={cn(
                        "border-b border-line px-3 pb-2.5 pt-3 text-left",
                        isTop ? "font-extrabold" : "font-bold",
                      )}
                    >
                      {ranking.storeName}
                    </th>
                    <td className="hidden border-b border-line px-3 pb-2.5 pt-3 sm:table-cell">
                      {ranking.offerCount}
                    </td>
                    <td
                      className={cn(
                        "border-b border-line px-3 pb-2.5 pt-3 text-right",
                        isTop ? "font-extrabold" : "font-bold",
                      )}
                    >
                      {formatEuroCents(ranking.totalCheckoutCents)}
                    </td>
                    <td className="border-b border-line px-3 pb-2.5 pt-3 text-right">
                      {differenceCents > 0 ? `+${formatEuroCents(differenceCents)}` : "deine Route"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
