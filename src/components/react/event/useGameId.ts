import { useSyncExternalStore } from "react";

const GAME_CHANGE_EVENT = "gdg:gamechange";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", callback);
  window.addEventListener(GAME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(GAME_CHANGE_EVENT, callback);
  };
}

const clientGameId = () =>
  new URLSearchParams(window.location.search).get("game");
const serverGameId = () => null;

export function useGameId(): string | null {
  return useSyncExternalStore(subscribe, clientGameId, serverGameId);
}

/**
 * Navigates between the game lobby (`gameId === null`) and a specific game
 * instance via History API without triggering a full page reload, keeping
 * anonymous auth and stage audio state intact.
 */
export function navigateToGame(gameId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (gameId) {
    url.searchParams.set("game", gameId);
  } else {
    url.searchParams.delete("game");
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new Event(GAME_CHANGE_EVENT));
}
