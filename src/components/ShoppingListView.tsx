import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_MAP,
  type CategoryDefinition,
  DEPARTMENT_MAP,
  type DepartmentId,
  DEPARTMENTS,
  searchCatalogCategories,
  SHOPPING_PRESETS,
} from "@/lib/rules/catalog";
import { type BasketItemInput, formatEuroCents } from "@/lib/rules/optimizer";
import {
  ITEM_PREFERENCE_LABELS,
  ITEM_PREFERENCES,
  type ItemPreference,
} from "@/lib/rules/preferences";
import { categoryShortName } from "./format";
import {
  ChevronIcon,
  CloseIcon,
  cn,
  SECONDARY_BUTTON,
  SegmentedControl,
  StarIcon,
  ToggleChip,
} from "./ui";

export interface CustomBasketItem {
  id: string;
  name: string;
  department: DepartmentId;
  quantity: number;
  estimatedPriceCents: number | null;
}

interface ShoppingListViewProps {
  basketItems: readonly BasketItemInput[];
  customItems: readonly CustomBasketItem[];
  onAddCustomItem: (item: Omit<CustomBasketItem, "id" | "quantity">) => void;
  onChangeCustomItemQuantity: (id: string, delta: number) => void;
  onChangeQuantity: (categoryId: string, delta: number) => void;
  onClear: () => void;
  onLoadPreset: (presetId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onChangePreference: (categoryId: string, preference: ItemPreference) => void;
  favoriteIds: ReadonlySet<string>;
  onToggleFavorite: (categoryId: string) => void;
  savedListsCount?: number;
  hasActiveShare?: boolean;
  savedListsPanel: ReactNode;
  recipesPanel: ReactNode;
}

type CatalogFilter = DepartmentId | "all" | "favorites";
type ListToolDrawer = "catalog" | "presets" | "recipes" | "lists";

const PREFERENCE_OPTIONS = ITEM_PREFERENCES.map((option) => ({
  value: option,
  label: ITEM_PREFERENCE_LABELS[option],
}));

const cheapestBasePriceCents = (category: CategoryDefinition): number =>
  Math.min(...Object.values(category.defaultBasePrices).map((entry) => entry.priceCents));

const STEPPER_BUTTON =
  "flex size-10 items-center justify-center rounded-md border border-line-strong bg-paper text-lg font-bold transition hover:border-route";

export const ShoppingListView = ({
  basketItems,
  customItems,
  onAddCustomItem,
  onChangeCustomItemQuantity,
  onChangeQuantity,
  onClear,
  onLoadPreset,
  searchQuery,
  onSearchChange,
  onChangePreference,
  favoriteIds,
  onToggleFavorite,
  savedListsCount = 0,
  hasActiveShare = false,
  savedListsPanel,
  recipesPanel,
}: ShoppingListViewProps) => {
  const [activeDrawer, setActiveDrawer] = useState<ListToolDrawer | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<CatalogFilter>("all");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showAllSearchHits, setShowAllSearchHits] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [customNameInput, setCustomNameInput] = useState("");
  const [customDept, setCustomDept] = useState<DepartmentId>("trocken");
  const [customPriceInput, setCustomPriceInput] = useState("");

  const trimmedQuery = searchQuery.trim();
  const searchedCatalog = useMemo(() => searchCatalogCategories(searchQuery), [searchQuery]);
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
  const totalListCount = basketItems.length + customItems.length;

  const handleSubmitCustomItem = (event: FormEvent) => {
    event.preventDefault();
    const candidateName = (customNameInput.trim() || trimmedQuery).slice(0, 80);
    if (candidateName.length < 2) return;
    const parsedPrice = Number.parseFloat(customPriceInput.trim().replace(",", "."));
    const estimatedPriceCents =
      Number.isFinite(parsedPrice) && parsedPrice > 0 && parsedPrice < 500
        ? Math.round(parsedPrice * 100)
        : null;
    onAddCustomItem({
      name: candidateName,
      department: customDept,
      estimatedPriceCents,
    });
    setCustomNameInput("");
    setCustomPriceInput("");
    setShowCustomForm(false);
    if (trimmedQuery && !customNameInput.trim()) {
      onSearchChange("");
    }
  };

  const toggleDrawer = (drawer: ListToolDrawer) => {
    setActiveDrawer((current) => (current === drawer ? null : drawer));
  };

  const quickSearchResults = showAllSearchHits ? searchedCatalog : searchedCatalog.slice(0, 8);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Fokus 1: Schnell suchen & hinzufügen */}
      <section aria-label="Artikel suchen und hinzufügen" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <label className="sr-only" htmlFor="list-quick-search">
              Artikel oder Marke suchen
            </label>
            <input
              id="list-quick-search"
              type="search"
              value={searchQuery}
              onChange={(event) => {
                onSearchChange(event.target.value);
                setShowAllSearchHits(false);
              }}
              placeholder="Artikel suchen, z. B. Butter, Nutella, Haferdrink…"
              className="h-12 w-full rounded-lg border-2 border-line-strong bg-paper pl-4 pr-11 text-base font-semibold transition focus:border-route"
            />
            {trimmedQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Suche leeren"
                className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-panel hover:text-ink"
              >
                <CloseIcon className="size-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-expanded={showCustomForm}
            onClick={() => setShowCustomForm((open) => !open)}
            className={cn(SECONDARY_BUTTON, "px-4 text-sm")}
          >
            + Eigener Artikel
          </button>
        </div>

        {/* Sofortige Suchtreffer direkt unter der Suche */}
        {trimmedQuery.length > 0 && (
          <div className="rounded-xl border border-line-strong bg-paper p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {searchedCatalog.length === 0
                  ? `Keine Kategorie für „${trimmedQuery}“`
                  : `${searchedCatalog.length} Treffer im Sortiment`}
              </p>
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="text-xs font-bold text-route underline underline-offset-4"
              >
                Schließen
              </button>
            </div>

            {searchedCatalog.length > 0 ? (
              <>
                <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {quickSearchResults.map((category) => {
                    const quantity = quantityById.get(category.id);
                    return (
                      <li key={category.id}>
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(category.id, 1)}
                          className={cn(
                            "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition",
                            quantity
                              ? "border-route bg-panel"
                              : "border-line bg-paper hover:border-route",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-bold">{category.name}</span>
                            <span className="block text-xs text-muted">
                              ab {formatEuroCents(cheapestBasePriceCents(category))}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-8 min-w-8 flex-none items-center justify-center rounded px-2 text-sm font-black tabular-nums",
                              quantity ? "bg-route text-route-ink" : "bg-panel text-ink",
                            )}
                          >
                            {quantity ? `${quantity}×` : "+"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {searchedCatalog.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSearchHits((open) => !open)}
                    className="mt-3 text-sm font-bold text-route underline underline-offset-4"
                  >
                    {showAllSearchHits
                      ? "Weniger Treffer anzeigen"
                      : `Alle ${searchedCatalog.length} Treffer anzeigen`}
                  </button>
                )}
              </>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Kein Problem – du kannst „{trimmedQuery}“ direkt als eigenen Artikel auf die Liste
                  setzen.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onAddCustomItem({
                      name: trimmedQuery.slice(0, 80),
                      department: customDept,
                      estimatedPriceCents: null,
                    });
                    onSearchChange("");
                  }}
                  className={cn(SECONDARY_BUTTON, "min-h-10 px-3.5 text-sm")}
                >
                  „{trimmedQuery}“ hinzufügen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Eingeklapptes Mini-Formular für eigene freie Artikel */}
        {showCustomForm && (
          <form
            onSubmit={handleSubmitCustomItem}
            className="flex flex-wrap items-end gap-2.5 rounded-xl border border-dashed border-line-strong bg-panel p-4"
          >
            <label className="min-w-[180px] flex-1 text-xs font-bold">
              Eigener Artikel
              <input
                type="text"
                value={customNameInput}
                onChange={(event) => setCustomNameInput(event.target.value)}
                placeholder={
                  trimmedQuery ? `z. B. ${trimmedQuery}` : "z. B. Kardamom-Kapseln oder Backform"
                }
                className="mt-1 h-10 w-full rounded-md border border-line-strong bg-paper px-3 text-sm font-semibold"
              />
            </label>
            <label className="w-36 text-xs font-bold">
              Abteilung
              <select
                value={customDept}
                onChange={(event) => setCustomDept(event.target.value as DepartmentId)}
                className="mt-1 h-10 w-full rounded-md border border-line-strong bg-paper px-2.5 text-sm font-semibold"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-24 text-xs font-bold">
              ca. € (opt.)
              <input
                type="text"
                inputMode="decimal"
                value={customPriceInput}
                onChange={(event) => setCustomPriceInput(event.target.value)}
                placeholder="2,50"
                className="mt-1 h-10 w-full rounded-md border border-line-strong bg-paper px-2.5 text-sm font-semibold tabular-nums"
              />
            </label>
            <button type="submit" className={cn(SECONDARY_BUTTON, "h-10 min-h-10 px-4 text-sm")}>
              Hinzufügen
            </button>
          </form>
        )}
      </section>

      {/* Fokus 2: Kompakte, ruhige Einkaufsliste */}
      <section
        aria-labelledby="list-title"
        className="rounded-xl border border-line bg-paper p-5 sm:p-6"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 id="list-title" className="text-2xl leading-tight font-black tracking-tight">
              Deine Einkaufsliste
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {totalListCount} Artikel · Antippen für Bio, Marke & Stammprodukt
            </p>
          </div>
          {totalListCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="min-h-10 text-sm font-bold text-route underline underline-offset-4"
            >
              Leeren
            </button>
          )}
        </div>

        {totalListCount === 0 ? (
          <div className="mt-5 rounded-lg bg-panel p-5">
            <p className="text-base font-semibold">Noch keine Artikel auf deiner Liste.</p>
            <p className="mt-1 text-sm text-muted">
              Nutze die Suche oben, wähle eine Vorlage oder blättere im Sortiment.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveDrawer("presets")}
                className={cn(SECONDARY_BUTTON, "min-h-10 px-4 text-sm")}
              >
                Vorlagen öffnen
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawer("catalog")}
                className={cn(SECONDARY_BUTTON, "min-h-10 px-4 text-sm")}
              >
                Sortiment durchblättern
              </button>
            </div>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {basketItems.map((item) => {
              const category = CATEGORY_MAP[item.categoryId];
              if (!category) return null;
              const shortName = categoryShortName(category);
              const preference = item.preference ?? "cheapest";
              const isFavorite = favoriteIds.has(item.categoryId);
              const isExpanded = expandedItemId === item.categoryId;

              // Max. 1 Haupt-Badge auf den ersten Blick: Qualität (Bio/Marke) vor Stammprodukt
              const primaryBadgeLabel =
                preference !== "cheapest"
                  ? ITEM_PREFERENCE_LABELS[preference]
                  : isFavorite
                    ? "Stammprodukt"
                    : null;

              return (
                <li key={item.categoryId} className="py-3.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedItemId((current) =>
                          current === item.categoryId ? null : item.categoryId,
                        )
                      }
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-bold text-ink">{category.name}</span>
                        {primaryBadgeLabel && (
                          <span className="inline-flex items-center gap-1 rounded border border-line-strong bg-panel px-1.5 pt-0.5 text-xs font-bold text-muted">
                            {primaryBadgeLabel === "Stammprodukt" && (
                              <StarIcon className="size-3 text-route" filled />
                            )}
                            {primaryBadgeLabel}
                          </span>
                        )}
                      </span>
                      <ChevronIcon
                        className={cn(
                          "size-4 flex-none text-muted transition-transform duration-150",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </button>

                    <div className="flex flex-none items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeQuantity(item.categoryId, -1)}
                        aria-label={`${shortName} reduzieren`}
                        className={STEPPER_BUTTON}
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-extrabold tabular-nums">
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
                  </div>

                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-3 rounded-lg bg-panel p-3.5">
                      <p className="text-xs text-muted">
                        Standardpackung: {category.subtitle} · ab{" "}
                        {formatEuroCents(cheapestBasePriceCents(category))}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold text-muted">Qualität</span>
                        <SegmentedControl
                          label={`Qualität für ${shortName}`}
                          options={PREFERENCE_OPTIONS}
                          value={preference}
                          onChange={(nextPref) => onChangePreference(item.categoryId, nextPref)}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-pressed={isFavorite}
                          onClick={() => onToggleFavorite(item.categoryId)}
                          className={cn(
                            "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition",
                            isFavorite
                              ? "border-route bg-paper text-route"
                              : "border-line-strong bg-paper text-ink hover:border-route",
                          )}
                        >
                          <StarIcon className="size-4 text-route" filled={isFavorite} />
                          {isFavorite ? "Stammprodukt gemerkt" : "Als Stammprodukt merken"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}

            {customItems.map((custom) => (
              <li key={custom.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{custom.name}</span>
                    <span className="rounded border border-line bg-panel px-1.5 pt-0.5 text-xs font-bold text-muted">
                      Eigener Artikel
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {DEPARTMENT_MAP[custom.department]?.shortName}
                    {custom.estimatedPriceCents != null &&
                      ` · ca. ${formatEuroCents(custom.estimatedPriceCents)}`}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeCustomItemQuantity(custom.id, -1)}
                    aria-label={`${custom.name} reduzieren`}
                    className={STEPPER_BUTTON}
                  >
                    −
                  </button>
                  <span className="w-7 text-center font-extrabold tabular-nums">
                    {custom.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeCustomItemQuantity(custom.id, 1)}
                    aria-label={`${custom.name} erhöhen`}
                    className={STEPPER_BUTTON}
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dezente Reiter / Schubladen für Zusatzfunktionen */}
      <section aria-label="Weitere Werkzeuge für die Liste" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <DrawerTabButton
            active={activeDrawer === "presets"}
            onClick={() => toggleDrawer("presets")}
            label="Vorlagen"
          />
          <DrawerTabButton
            active={activeDrawer === "recipes"}
            onClick={() => toggleDrawer("recipes")}
            label="Rezepte"
          />
          <DrawerTabButton
            active={activeDrawer === "lists"}
            onClick={() => toggleDrawer("lists")}
            label={
              hasActiveShare
                ? "Listen & Teilen · aktiv"
                : savedListsCount > 0
                  ? `Listen & Teilen (${savedListsCount})`
                  : "Listen & Teilen"
            }
          />
          <DrawerTabButton
            active={activeDrawer === "catalog"}
            onClick={() => toggleDrawer("catalog")}
            label={`Sortiment (${CATEGORIES.length})`}
          />
        </div>

        {activeDrawer === "presets" && (
          <div className="rounded-xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">Vorlagen laden</h2>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="text-sm font-bold text-muted hover:text-ink"
              >
                Schließen
              </button>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {SHOPPING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onLoadPreset(preset.id);
                    setActiveDrawer(null);
                  }}
                  className="rounded-lg border border-line-strong bg-paper p-3.5 text-left transition hover:border-route"
                >
                  <span className="block font-extrabold">{preset.name}</span>
                  <span className="mt-1 block text-sm text-muted">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeDrawer === "recipes" && (
          <div className="rounded-xl border border-line bg-paper p-5">{recipesPanel}</div>
        )}

        {activeDrawer === "lists" && (
          <div className="rounded-xl border border-line bg-paper p-5">{savedListsPanel}</div>
        )}

        {activeDrawer === "catalog" && (
          <div className="rounded-xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">
                Sortiment{" "}
                <span className="font-semibold text-muted tabular-nums">
                  ({CATEGORIES.length} Kategorien)
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="text-sm font-bold text-muted hover:text-ink"
              >
                Schließen
              </button>
            </div>

            <fieldset className="mt-3">
              <legend className="sr-only">Nach Abteilung filtern</legend>
              <div className="flex flex-wrap gap-1.5">
                <ToggleChip
                  active={selectedFilter === "all"}
                  onToggle={() => setSelectedFilter("all")}
                >
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

            {filteredCatalog.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                {selectedFilter === "favorites" && favoriteIds.size === 0
                  ? "Noch keine Stammprodukte. Tippe auf einen Artikel in deiner Liste, um ihn als Stammprodukt zu merken."
                  : `Kein Katalog-Artikel passt zu „${searchQuery}“.`}
              </p>
            ) : (
              <ol className="mt-5 flex flex-col gap-6">
                {visibleDepartments.map((department) => {
                  const categories = filteredCatalog.filter((c) => c.department === department.id);
                  if (categories.length === 0) return null;
                  return (
                    <li key={department.id}>
                      <h3 className="flex items-center gap-2 text-sm font-extrabold">
                        <span
                          aria-hidden="true"
                          className="flex size-6 items-center justify-center rounded-full border-[3px] border-route text-xs font-black"
                        >
                          {department.sortOrder}
                        </span>
                        {department.name}
                      </h3>
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {categories.map((category) => {
                          const quantity = quantityById.get(category.id);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => onChangeQuantity(category.id, 1)}
                              aria-label={`${category.name} hinzufügen${quantity ? `, ${quantity} auf der Liste` : ""}`}
                              className={cn(
                                "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition",
                                quantity
                                  ? "border-route bg-panel"
                                  : "border-line bg-paper hover:border-route",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-bold">{category.name}</span>
                                <span className="block text-xs text-muted">
                                  ab {formatEuroCents(cheapestBasePriceCents(category))}
                                </span>
                              </span>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex h-8 min-w-8 flex-none items-center justify-center rounded px-1.5 text-sm font-black tabular-nums",
                                  quantity ? "bg-route text-route-ink" : "bg-panel text-ink",
                                )}
                              >
                                {quantity ? `${quantity}×` : "+"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

interface DrawerTabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

const DrawerTabButton = ({ active, onClick, label }: DrawerTabButtonProps) => (
  <button
    type="button"
    aria-expanded={active}
    onClick={onClick}
    className={cn(
      "inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-bold transition",
      active
        ? "border-choice bg-choice text-choice-ink"
        : "border-line-strong bg-paper text-ink hover:border-route",
    )}
  >
    <span>{label}</span>
    <ChevronIcon
      className={cn(
        "size-4 transition-transform duration-150",
        active ? "rotate-180 text-choice-ink" : "text-muted",
      )}
    />
  </button>
);
