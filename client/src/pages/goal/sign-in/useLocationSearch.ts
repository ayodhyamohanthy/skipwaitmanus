// The current query string, re-read on every in-app navigation (review F1 on
// the goal sign-in): "Back to sign-in" from ?passkeys=manage changes only the
// query, so the /sign-in switch must subscribe to it rather than read it once.
// Same events Wouter's browser location listens to (it patches history to fire
// pushState/replaceState), without importing wouter, so the kit page's pins
// that mock wouter keep rendering unchanged.
import { useSyncExternalStore } from "react";

const LOCATION_EVENTS = ["popstate", "pushState", "replaceState", "hashchange"] as const;

function subscribe(onChange: () => void): () => void {
  for (const event of LOCATION_EVENTS) window.addEventListener(event, onChange);
  return () => { for (const event of LOCATION_EVENTS) window.removeEventListener(event, onChange); };
}

const currentSearch = (): string => window.location.search;
const serverSearch = (): string => "";

export function useLocationSearch(): string {
  return useSyncExternalStore(subscribe, currentSearch, serverSearch);
}
