import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientGameId = () =>
  new URLSearchParams(window.location.search).get("game");
const serverGameId = () => null;

export function useGameId(): string | null {
  return useSyncExternalStore(subscribe, clientGameId, serverGameId);
}
