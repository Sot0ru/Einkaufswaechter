import type { SavedShoppingList } from "@/lib/services/shopping-lists";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

interface SavedListsPanelProps {
  savedLists: readonly SavedShoppingList[];
  activeListId: string | undefined;
  listName: string;
  onListNameChange: (name: string) => void;
  onSave: (asNew: boolean) => void;
  onLoad: (list: SavedShoppingList) => void;
  onDelete: (listId: string) => void;
  feedback: string | null;
}

export const SavedListsPanel = ({
  savedLists,
  activeListId,
  listName,
  onListNameChange,
  onSave,
  onLoad,
  onDelete,
  feedback,
}: SavedListsPanelProps) => (
  <section aria-labelledby="saved-lists-title" className="border-t border-line-strong pt-6">
    <h2 id="saved-lists-title" className="text-xl font-black">
      Gespeicherte Listen
    </h2>
    <p className="mt-1 text-[15px] text-muted">
      Speichere deine Liste, um sie nächste Woche mit einem Klick wieder zu laden.
    </p>

    <label className="mt-4 flex flex-col gap-1.5 text-[15px] font-bold">
      Name der Liste
      <input
        type="text"
        value={listName}
        onChange={(event) => onListNameChange(event.target.value)}
        className="h-11 rounded border border-line-strong bg-paper px-3 pt-0.5 font-semibold"
      />
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => onSave(false)} className={PRIMARY_BUTTON}>
        {activeListId ? "Änderungen speichern" : "Liste speichern"}
      </button>
      {activeListId && (
        <button type="button" onClick={() => onSave(true)} className={SECONDARY_BUTTON}>
          Als neue Liste speichern
        </button>
      )}
    </div>
    {feedback && (
      <p role="status" className="mt-2.5 text-[15px] font-bold">
        {feedback}
      </p>
    )}

    {savedLists.length > 0 && (
      <ul className="mt-5 flex flex-col gap-2">
        {savedLists.map((list) => {
          const isCurrent = list.id === activeListId;
          return (
            <li
              key={list.id}
              className={cn(
                "flex items-center gap-2 rounded-md border-2 py-2 pl-3.5 pr-2",
                isCurrent ? "border-route bg-paper" : "border-line-strong bg-paper",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{list.name}</p>
                <p className="text-sm text-muted">
                  {list.items.length} Artikel, PLZ {list.zipCode}
                  {isCurrent && ", gerade geladen"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(list)}
                className="min-h-11 rounded border-2 border-line-strong px-3.5 pt-0.5 text-[15px] font-bold transition hover:border-route"
              >
                Laden
              </button>
              <button
                type="button"
                onClick={() => onDelete(list.id)}
                aria-label={`Liste „${list.name}“ löschen`}
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
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
