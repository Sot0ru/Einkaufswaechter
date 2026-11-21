import { useState } from "react";
import { formatEuroCents } from "@/lib/rules/optimizer";
import type { RecipeDefinition, RecipeScore } from "@/lib/rules/recipes";
import { cn, PRIMARY_BUTTON, SegmentedControl } from "./ui";

const SERVING_OPTIONS = [2, 4, 6].map((value) => ({ value, label: `${value} Portionen` }));
const COLLAPSED_COUNT = 5;

interface RecipesPanelProps {
  scores: readonly RecipeScore[];
  servings: number;
  onServingsChange: (servings: number) => void;
  onAddRecipe: (recipe: RecipeDefinition) => void;
  onDeleteRecipe: (recipeId: string) => void;
  canSaveBasket: boolean;
  onSaveBasketAsRecipe: (name: string, servings: number) => void;
  feedback: string | null;
}

export const RecipesPanel = ({
  scores,
  servings,
  onServingsChange,
  onAddRecipe,
  onDeleteRecipe,
  canSaveBasket,
  onSaveBasketAsRecipe,
  feedback,
}: RecipesPanelProps) => {
  const [showAll, setShowAll] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeServings, setRecipeServings] = useState(4);
  const visibleScores = showAll ? scores : scores.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-labelledby="recipes-title">
      <h2 id="recipes-title" className="text-xl font-black">
        Was ist diese Woche günstig zu kochen?
      </h2>
      <p className="mt-1 text-[15px] text-muted">
        Preis im günstigsten Markt, sortiert nach Ersparnis durch die Angebote dieser Woche.
      </p>
      <div className="mt-3 max-w-sm">
        <SegmentedControl
          label="Portionen"
          options={SERVING_OPTIONS}
          value={servings}
          onChange={onServingsChange}
        />
      </div>

      <ul className="mt-3 divide-y divide-line border-y border-line">
        {visibleScores.map((score) => (
          <li key={score.recipe.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-[1_1_220px]">
              <p className="font-bold">{score.recipe.name}</p>
              <p className="text-sm text-muted">
                {score.recipe.prepMinutes} Min.
                {score.recipe.tags.length > 0 && `, ${score.recipe.tags.join(", ")}`}
                {!score.recipe.isBuiltin && ", eigenes Gericht"}
              </p>
              <p className="text-sm">
                {score.savingsCents > 0 ? (
                  <>
                    <strong>{formatEuroCents(score.savingsCents)} günstiger</strong> durch{" "}
                    {score.offerCount === 1 ? "ein Angebot" : `${score.offerCount} Angebote`} bei{" "}
                    {score.bestStoreName}
                  </>
                ) : (
                  <>Diese Woche ohne Angebot, am günstigsten bei {score.bestStoreName}</>
                )}
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-extrabold">{formatEuroCents(score.checkoutCents)}</p>
              <p className="text-xs text-muted">{formatEuroCents(score.costPerServingCents)} je Portion</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAddRecipe(score.recipe)}
                aria-label={`Zutaten für ${score.recipe.name} auf die Liste`}
                className="min-h-11 rounded border-2 border-line-strong px-3.5 pt-0.5 text-[15px] font-bold transition hover:border-route"
              >
                Auf die Liste
              </button>
              {!score.recipe.isBuiltin && (
                <button
                  type="button"
                  onClick={() => onDeleteRecipe(score.recipe.id)}
                  aria-label={`Gericht ${score.recipe.name} löschen`}
                  className="flex size-11 items-center justify-center rounded text-muted transition hover:bg-panel hover:text-ink"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="size-5"
                  >
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {scores.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="mt-2 min-h-11 text-[15px] font-bold text-route underline underline-offset-4"
        >
          {showAll ? "Weniger anzeigen" : `Alle ${scores.length} Gerichte anzeigen`}
        </button>
      )}

      {feedback && (
        <p role="status" className="mt-2 text-[15px] font-bold">
          {feedback}
        </p>
      )}

      <details className="mt-3 rounded-md border border-line p-4">
        <summary className="cursor-pointer text-[15px] font-bold">Eigenes Gericht aus deiner Liste speichern</summary>
        <form
          className="mt-3 flex flex-wrap items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveBasketAsRecipe(recipeName, recipeServings);
            setRecipeName("");
          }}
        >
          <label className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5 text-sm font-bold">
            Name des Gerichts
            <input
              type="text"
              value={recipeName}
              onChange={(event) => setRecipeName(event.target.value)}
              placeholder="z. B. Omas Nudelauflauf"
              maxLength={80}
              required
              className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 font-semibold"
            />
          </label>
          <label className="flex w-28 flex-col gap-1.5 text-sm font-bold">
            Portionen
            <input
              type="number"
              min={1}
              max={20}
              value={recipeServings}
              onChange={(event) => setRecipeServings(Math.max(1, Number(event.target.value) || 1))}
              className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 font-semibold tabular-nums"
            />
          </label>
          <button
            type="submit"
            disabled={!canSaveBasket}
            className={cn(PRIMARY_BUTTON, "disabled:opacity-60")}
          >
            Als Gericht speichern
          </button>
        </form>
        <p className="mt-2 text-sm text-muted">
          {canSaveBasket
            ? "Alle Artikel deiner aktuellen Einkaufsliste werden zu den Zutaten des Gerichts."
            : "Leg zuerst die Zutaten auf deine Einkaufsliste."}
        </p>
      </details>
    </section>
  );
};
