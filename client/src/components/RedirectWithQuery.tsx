import { Redirect, useSearch } from "wouter";

/**
 * A route alias that keeps the query string and hash. A plain <Redirect> drops
 * them, which lost a referrer's personal link on /request -> /ask (D-017).
 * Replaces the history entry so Back does not bounce through the alias.
 */
export function RedirectWithQuery({ to }: { to: string }) {
  const search = useSearch();
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return <Redirect to={`${to}${search ? `?${search}` : ""}${hash}`} replace />;
}
