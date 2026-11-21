import { type ReactNode, useMemo, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_MAP,
  type CategoryDefinition,
  type DepartmentId,
  DEPARTMENTS,
  SHOPPING_PRESETS,
} from "@/lib/rules/catalog";
import { type BasketItemInput, formatEuroCents } from "@/lib/rules/optimizer";
import {
  ITEM_PREFERENCE_LABELS,
  ITEM_PREFERENCES,
  type ItemPreference,
} from "@/lib/rules/preferences";
import { categoryShortName } from "./format";
import { cn, StarIcon, ToggleChip } from "./ui";

interface ShoppingListViewProps {
  basketItems: readonly BasketItemInput[];
  onChangeQuantity: (categoryId: string, delta: number) => void;
  onClear: () => void;
  onLoadPreset: (presetId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onChangePreference: (categoryId: string, preference: ItemPreference) => void;
  favoriteIds: ReadonlySet<string>;
  onToggleFavorite: (categoryId: string) => void;
  savedListsPanel: ReactNode;
  recipesPanel: ReactNode;
}

type CatalogFilter = DepartmentId | "all" | "favorites";

const cheapestBasePriceCents = (category: CategoryDefinition): number =>
  Math.min(...Object.values(category.defaultBasePrices).map((entry) => entry.priceCents));

const matchesQuery = (category: CategoryDefinition, query: string): boolean =>
  category.name.toLowerCase().includes(query) ||
  category.subtitle.toLowerCase().includes(query) ||
  category.includeKeywords.some((keyword) => keyword.includes(query));

const STEPPER_BUTTON =
  "flex size-11 items-center justify-center rounded border border-line-strong bg-paper text-lg font-bold transition hover:border-route";

interface FavoriteToggleProps {
  active: boolean;
  label: string;
  onToggle: () => void;
}

const FavoriteToggle = ({ active, label, onToggle }: FavoriteToggleProps) => (
  <button
    type="button"
    aria-pressed={active}
    aria-label={`${label} als Stammprodukt merken`}
    onClick={onToggle}
    className={cn(
      "flex size-11 flex-none items-center justify-center self-center rounded transition hover:bg-panel",
      active ? "text-route" : "text-muted",
    )}
  >
    <StarIcon className="size-5" filled={active} />
  </button>
);

export const ShoppingListView = ({
  basketItems,
  onChangeQuantity,
  onClear,
  onLoadPreset,
  searchQuery,
  onSearchChange,
  onChangePreference,
  favoriteIds,
  onToggleFavorite,
  savedListsPanel,
  recipesPanel,
}: ShoppingListViewProps) => {
  const [selectedFilter, setSelectedFilter] = useState<CatalogFilter>("all");

  const searchedCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? CATEGORIES.filter((category) => matchesQuery(category, query)) : CATEGORIES;
  }, [searchQuery]);
  const filteredCatalog =
    selectedFilter === "favorites"
      ? searchedCatalog.filter((category) => favoriteIds.has(category.id))
      : searchedCatalog;
  const favoriteCount = searchedCatalog.filter((category) => favoriteIds.has(category.id)).length;

  const quantityById = new Map(basketItems.map((item) => [item.categoryId, item.quantity]));
  const visibleDepartments = DEPARTMENTS.filter(
    (department) =>
      selectedFilter === "all" || selectedFilter === "favorites" || selectedFilter === department.id,
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 rounded-md bg-panel p-5 sm:p-6 lg:col-span-5">
        <section aria-labelledby="list-title">
          <div className="flex items-baseline justify-between gap-3">
            <h1 id="list-title" className="text-[26px] leading-tight font-black tracking-tight">
              Deine Einkaufsliste
            </h1>
            {basketItems.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="min-h-11 text-[15px] font-bold text-route underline underline-offset-4"
              >
                Liste leeren
              </button>
            )}
          </div>
          <p className="text-[15px] text-muted">{basketItems.length} Artikel</p>

          {basketItems.length === 0 ? (
            <p className="mt-5 text-[17px]">
              Noch leer. Wähle Artikel aus dem Sortiment oder starte mit einer Vorlage.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line-strong">
              {basketItems.map((item) => {
                const category = CATEGORY_MAP[item.categoryId];
                if (!category) return null;
                const shortName = categoryShortName(category);
                const preference = item.preference ?? "cheapest";
                return (
                  <li key={item.categoryId} className="flex items-start gap-1.5 py-2.5">
                    <FavoriteToggle
                      active={favoriteIds.has(item.categoryId)}
                      label={shortName}
                      onToggle={() => onToggleFavorite(item.categoryId)}
                    />
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="font-bold">{category.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm text-muted">{category.subtitle}</p>
                        <label className="flex items-center text-sm">
                          <select
                            value={preference}
                            onChange={(event) =>
                              onChangePreference(item.categoryId, event.target.value as ItemPreference)
                            }
                            aria-label={`Qualität für ${shortName}`}
                            className="h-9 rounded border border-line-strong bg-paper px-2 pt-0.5 font-semibold"
                          >
                            {ITEM_PREFERENCES.map((option) => (
                              <option key={option} value={option}>
                                {ITEM_PREFERENCE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeQuantity(item.categoryId, -1)}
                        aria-label={`${shortName} reduzieren`}
                        className={STEPPER_BUTTON}
                      >
                        −
                      </button>
                      <span className="w-7 pt-0.5 text-center font-extrabold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQuantity(item.categoryId, 1)}
                        aria-label={`${shortName} erhöhen`}
                        className={STEPPER_BUTTON}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {savedListsPanel}
      </div>

      <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
        <section aria-labelledby="presets-title">
          <h2 id="presets-title" className="text-xl font-black">
            Vorlagen
          </h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {SHOPPING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onLoadPreset(preset.id)}
                className="rounded-md border-2 border-line p-3.5 text-left transition hover:border-route"
              >
                <span className="block font-extrabold">{preset.name}</span>
                <span className="mt-1 block text-sm text-muted">{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        {recipesPanel}

        <section aria-labelledby="catalog-title">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 id="catalog-title" className="text-xl font-black">
              Sortiment{" "}
              <span className="font-semibold text-muted tabular-nums">
                ({CATEGORIES.length} Kategorien)
              </span>
            </h2>
            <label className="sm:w-72">
              <span className="sr-only">Artikel suchen</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Suchen, z. B. Butter oder Kaffee"
                className="h-11 w-full rounded border border-line-strong bg-paper px-3 pt-0.5"
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="sr-only">Nach Abteilung filtern</legend>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip active={selectedFilter === "all"} onToggle={() => setSelectedFilter("all")}>
                Alle ({searchedCatalog.length})
              </ToggleChip>
              <ToggleChip
                active={selectedFilter === "favorites"}
                onToggle={() => setSelectedFilter("favorites")}
              >
                Stammprodukte ({favoriteCount})
              </ToggleChip>
              {DEPARTMENTS.map((department) => {
                const count = searchedCatalog.filter((c) => c.department === department.id).length;
                if (count === 0) return null;
                return (
                  <ToggleChip
                    key={department.id}
                    active={selectedFilter === department.id}
                    onToggle={() => setSelectedFilter(department.id)}
                  >
                    {department.shortName} ({count})
                  </ToggleChip>
                );
              })}
            </div>
          </fieldset>

          {filteredCatalog.length === 0 && (
            <p className="mt-5 text-[17px]">
              {selectedFilter === "favorites" && favoriteIds.size === 0
                ? "Noch keine Stammprodukte. Tippe auf den Stern neben einem Artikel, den du regelmäßig kaufst."
                : `Kein Artikel passt zu „${searchQuery}“. Versuch es mit einem allgemeineren Begriff.`}
            </p>
          )}

          <ol className="mt-6 flex flex-col gap-6">
            {visibleDepartments.map((department) => {
              const categories = filteredCatalog.filter((c) => c.department === department.id);
              if (categories.length === 0) return null;
              return (
                <li key={department.id}>
                  <h3 className="flex items-center gap-2.5 text-[15px] font-extrabold">
                    <span
                      aria-hidden="true"
                      className="flex size-7 items-center justify-center rounded-full border-4 border-route pt-0.5 text-xs font-black"
                    >
                      {department.sortOrder}
                    </span>
                    {department.name}
                  </h3>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    {categories.map((category) => {
                      const quantity = quantityById.get(category.id);
                      return (
                        <div
                          key={category.id}
                          className={cn(
                            "flex items-stretch rounded-md border-2 transition",
                            quantity ? "border-route bg-panel" : "border-line hover:border-route",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onChangeQuantity(category.id, 1)}
                            aria-label={`${category.name} hinzufügen${quantity ? `, ${quantity} auf der Liste` : ""}`}
                            className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-3 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block font-bold">{category.name}</span>
                              <span className="block text-sm text-muted">
                                {category.subtitle}, ab {formatEuroCents(cheapestBasePriceCents(category))}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-8 min-w-8 flex-none items-center justify-center rounded px-1.5 pt-0.5 text-sm font-black tabular-nums",
                                quantity ? "bg-route text-route-ink" : "bg-panel",
                              )}
                            >
                              {quantity ? `${quantity}×` : "+"}
                            </span>
                          </button>
                          <FavoriteToggle
                            active={favoriteIds.has(category.id)}
                            label={categoryShortName(category)}
                            onToggle={() => onToggleFavorite(category.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
};
