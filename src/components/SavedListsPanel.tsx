import { useState } from "react";
import type { SavedShoppingList } from "@/lib/services/shopping-lists";
import { formatShortDate } from "./format";
import { QrCode } from "./QrCode";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";
import type { ShareLink } from "./useHouseholdShare";

interface SavedListsPanelProps {
  savedLists: readonly SavedShoppingList[];
  activeListId: string | undefined;
  listName: string;
  onListNameChange: (name: string) => void;
  onSave: (asNew: boolean) => void;
  onLoad: (list: SavedShoppingList) => void;
  onDelete: (listId: string) => void;
  feedback: string | null;
  canShare: boolean;
  onShare: () => void;
  isSharing: boolean;
  shareLink: ShareLink | null;
  onStopSharing: () => void;
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
  canShare,
  onShare,
  isSharing,
  shareLink,
  onStopSharing,
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
      <button
        type="button"
        onClick={onShare}
        disabled={!canShare || isSharing}
        className={cn(SECONDARY_BUTTON, "disabled:opacity-60")}
      >
        {isSharing ? "Link wird erstellt…" : "Liste teilen"}
      </button>
    </div>
    {feedback && (
      <p role="status" className="mt-2.5 text-[15px] font-bold">
        {feedback}
      </p>
    )}
    {shareLink && <ShareLinkBox shareLink={shareLink} listName={listName} onStop={onStopSharing} />}

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

interface ShareLinkBoxProps {
  shareLink: ShareLink;
  listName: string;
  onStop: () => void;
}

/** Link, QR-Code und Teilen-Knopf für die gemeinsame Haushaltsliste */
const ShareLinkBox = ({ shareLink, listName, onStop }: ShareLinkBoxProps) => {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const shareNatively = async () => {
    try {
      await navigator.share({ title: `Einkaufsliste „${listName}“`, url: shareLink.url });
    } catch {
      // Abgebrochen oder nicht erlaubt: Link bleibt zum Kopieren sichtbar
    }
  };

  return (
    <div className="mt-4 rounded-md border-2 border-route bg-paper p-4">
      <h3 className="text-[17px] font-extrabold">
        {shareLink.kind === "live" ? "Gemeinsame Liste ist aktiv" : "Liste als Link teilen"}
      </h3>
      <p className="mt-1 text-[15px]">
        {shareLink.kind === "live"
          ? `Wer den Link öffnet, sieht deine Liste und hakt im Laden mit ab. Kein Konto nötig. Gültig bis ${formatShortDate((shareLink.expiresAt ?? "").slice(0, 10))}`
          : "Ohne Serververbindung steckt die Liste direkt im Link. Abgehakte Artikel werden dabei nicht abgeglichen."}
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <QrCode value={shareLink.url} label={`QR-Code für die Liste ${listName}`} />
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Link
            <input
              type="text"
              readOnly
              value={shareLink.url}
              onFocus={(event) => event.target.select()}
              className="h-11 rounded border border-line-strong bg-panel px-3 pt-0.5 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyLink()} className={SECONDARY_BUTTON}>
              {copyState === "copied" ? "Kopiert" : "Link kopieren"}
            </button>
            {canNativeShare && (
              <button type="button" onClick={() => void shareNatively()} className={SECONDARY_BUTTON}>
                Teilen über …
              </button>
            )}
          </div>
          {copyState === "failed" && (
            <p role="status" className="text-sm">
              Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand.
            </p>
          )}
          {shareLink.kind === "live" && (
            <button
              type="button"
              onClick={onStop}
              className="min-h-11 self-start text-left text-[15px] font-bold text-route underline underline-offset-4"
            >
              Abgleich auf diesem Gerät beenden
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
