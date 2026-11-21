"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeListSnapshot, encodeListSnapshot } from "@/lib/rules/list-snapshot";
import type { BasketItemInput } from "@/lib/rules/optimizer";

export interface ShareLink {
  /** live: per Code mit Abgleich; snapshot: Liste steckt offline im Link, ohne Abgleich */
  kind: "live" | "snapshot";
  url: string;
  expiresAt: string | null;
}

export interface ShareStatus {
  listName: string;
  syncedAt: number | null;
  error: string | null;
}

export interface LoadedSharedList {
  name: string;
  listId: string | null;
  items: BasketItemInput[];
  checkedCategoryIds: string[];
}

interface SharedListDto {
  listId: string;
  name: string;
  expiresAt: string;
  items: { categoryId: string; quantity: number; checked: boolean; updatedAt: string }[];
}

interface CheckChange {
  categoryId: string;
  checked: boolean;
  changedAt: string;
}

interface UseHouseholdShareOptions {
  onListLoaded: (list: LoadedSharedList) => void;
  /** Abgehakt-Status je Kategorie, der von anderen Haushaltsmitgliedern kommt */
  onRemoteChecks: (checks: Record<string, boolean>) => void;
}

const POLL_INTERVAL_MS = 5000;
const SHARE_PARAM = "teilen";
const SNAPSHOT_HASH = "#liste=";
const OFFLINE_MESSAGE = "Gerade keine Verbindung. Deine Haken werden abgeglichen, sobald du wieder online bist.";

const appBaseUrl = () => `${window.location.origin}${window.location.pathname}`;

const fetchSharedList = async (code: string): Promise<SharedListDto | null> => {
  const response = await fetch(`/api/v1/lists/share/${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { list?: SharedListDto };
  return data.list ?? null;
};

export const useHouseholdShare = ({ onListLoaded, onRemoteChecks }: UseHouseholdShareOptions) => {
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const callbacks = useRef({ onListLoaded, onRemoteChecks });
  const localChangeTimes = useRef<Record<string, string>>({});
  const pendingChanges = useRef<CheckChange[]>([]);

  useEffect(() => {
    callbacks.current = { onListLoaded, onRemoteChecks };
  });

  const applyRemote = useCallback((list: SharedListDto) => {
    const checks: Record<string, boolean> = {};
    for (const item of list.items) {
      const localChange = localChangeTimes.current[item.categoryId];
      // Eigene, noch nicht bestätigte Haken nicht vom älteren Serverstand überschreiben lassen
      if (!localChange || item.updatedAt >= localChange) checks[item.categoryId] = item.checked;
    }
    callbacks.current.onRemoteChecks(checks);
    setStatus({ listName: list.name, syncedAt: Date.now(), error: null });
  }, []);

  const flushPending = useCallback(
    async (code: string) => {
      const changes = pendingChanges.current;
      if (changes.length === 0) return false;
      try {
        const response = await fetch(`/api/v1/lists/share/${encodeURIComponent(code)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
        });
        if (!response.ok) throw new Error(String(response.status));
        pendingChanges.current = pendingChanges.current.filter((change) => !changes.includes(change));
        const data = (await response.json()) as { list: SharedListDto };
        applyRemote(data.list);
        return true;
      } catch {
        setStatus((prev) => (prev ? { ...prev, error: OFFLINE_MESSAGE } : prev));
        return false;
      }
    },
    [applyRemote],
  );

  // Beim Öffnen: geteilte Liste per ?teilen=CODE oder Offline-Schnappschuss per #liste=… laden
  useEffect(() => {
    const loadFromUrl = async () => {
      const url = new URL(window.location.href);
      if (url.hash.startsWith(SNAPSHOT_HASH)) {
        const snapshot = decodeListSnapshot(url.hash.slice(SNAPSHOT_HASH.length));
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        if (snapshot) {
          callbacks.current.onListLoaded({
            name: snapshot.name,
            listId: null,
            items: snapshot.items,
            checkedCategoryIds: [],
          });
          setNotice(`Liste „${snapshot.name}“ aus einem geteilten Link geladen.`);
        } else {
          setNotice("Der geteilte Link ist unvollständig. Bitte lass ihn dir noch einmal schicken.");
        }
        return;
      }

      const code = url.searchParams.get(SHARE_PARAM);
      if (!code) return;
      try {
        const list = await fetchSharedList(code);
        if (!list) throw new Error("not found");
        callbacks.current.onListLoaded({
          name: list.name,
          listId: list.listId,
          items: list.items.map((item) => ({ categoryId: item.categoryId, quantity: item.quantity })),
          checkedCategoryIds: list.items.filter((item) => item.checked).map((item) => item.categoryId),
        });
        setShareCode(code);
        setStatus({ listName: list.name, syncedAt: Date.now(), error: null });
        setNotice(`Gemeinsame Liste „${list.name}“ geöffnet. Abgehakte Artikel werden mit deinem Haushalt abgeglichen.`);
      } catch {
        url.searchParams.delete(SHARE_PARAM);
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        setNotice("Diese geteilte Liste gibt es nicht mehr oder sie ist abgelaufen.");
      }
    };
    void loadFromUrl();
  }, []);

  // Im Laden regelmäßig abgleichen, solange die Seite sichtbar ist
  useEffect(() => {
    if (!shareCode) return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      if (await flushPending(shareCode)) return;
      try {
        const list = await fetchSharedList(shareCode);
        if (list) applyRemote(list);
      } catch {
        setStatus((prev) => (prev ? { ...prev, error: OFFLINE_MESSAGE } : prev));
      }
    };
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shareCode, applyRemote, flushPending]);

  const pushCheckChange = useCallback(
    (categoryId: string, checked: boolean) => {
      if (!shareCode) return;
      const changedAt = new Date().toISOString();
      localChangeTimes.current[categoryId] = changedAt;
      pendingChanges.current = [
        ...pendingChanges.current.filter((change) => change.categoryId !== categoryId),
        { categoryId, checked, changedAt },
      ];
      void flushPending(shareCode);
    },
    [shareCode, flushPending],
  );

  /** Teilt eine gespeicherte Liste per Code; ohne Server als Schnappschuss im Link */
  const createShare = useCallback(
    async (params: { listId: string | null; name: string; items: BasketItemInput[] }) => {
      setIsSharing(true);
      try {
        if (params.listId && !params.listId.startsWith("local-")) {
          const response = await fetch("/api/v1/lists/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listId: params.listId }),
          });
          if (response.ok) {
            const data = (await response.json()) as { shareCode: string; expiresAt: string };
            setShareCode(data.shareCode);
            setStatus({ listName: params.name, syncedAt: Date.now(), error: null });
            setShareLink({
              kind: "live",
              url: `${appBaseUrl()}?${SHARE_PARAM}=${data.shareCode}`,
              expiresAt: data.expiresAt,
            });
            return;
          }
        }
      } catch {
        // Ohne Server: Schnappschuss-Link, siehe unten
      } finally {
        setIsSharing(false);
      }
      setShareLink({
        kind: "snapshot",
        url: `${appBaseUrl()}${SNAPSHOT_HASH}${encodeListSnapshot({ name: params.name, items: params.items })}`,
        expiresAt: null,
      });
    },
    [],
  );

  const stopSharing = useCallback(() => {
    setShareCode(null);
    setStatus(null);
    setShareLink(null);
    pendingChanges.current = [];
    const url = new URL(window.location.href);
    if (url.searchParams.has(SHARE_PARAM)) {
      url.searchParams.delete(SHARE_PARAM);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, []);

  return {
    shareLink,
    isSharing,
    shareStatus: shareCode ? status : null,
    shareNotice: notice,
    dismissShareNotice: () => setNotice(null),
    createShare,
    pushCheckChange,
    stopSharing,
  };
};
