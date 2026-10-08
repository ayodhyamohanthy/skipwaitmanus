import { useEffect, useState } from "react";
import { RefreshCw, Signal } from "lucide-react";

export const SW_UPDATE_EVENT = "skipwait:sw-update";

/** Shown when a new deploy's worker is installed and waiting. Nothing reloads until the person taps Refresh. */
export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onUpdate = (event: Event) => { setWaiting((event as CustomEvent<ServiceWorker>).detail ?? null); setDismissed(false); };
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);
  if (!waiting || dismissed) return null;
  const refresh = () => {
    navigator.serviceWorker?.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg md:bottom-4">
      <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm">A new version of SkipWait is ready.</p>
      <button type="button" onClick={() => setDismissed(true)} className="min-h-11 px-2 text-sm text-[var(--muted-foreground)]">Later</button>
      <button type="button" onClick={refresh} className="brand-button min-h-11 px-4 text-sm">Refresh</button>
    </div>
  );
}

type NetworkInformation = { effectiveType?: string; saveData?: boolean; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void };
const connection = (): NetworkInformation | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { connection?: NetworkInformation }).connection);
export const isSlowConnection = (c: NetworkInformation | undefined) => Boolean(c && (c.effectiveType === "slow-2g" || c.effectiveType === "2g"));

/** Kit "Slow connection" state. Only claims what is true: the device reports a 2G-class link. */
export function SlowConnectionNotice() {
  const [slow, setSlow] = useState(() => isSlowConnection(connection()));
  useEffect(() => {
    const c = connection();
    if (!c?.addEventListener) return;
    const update = () => setSlow(isSlowConnection(c));
    c.addEventListener("change", update);
    return () => c.removeEventListener?.("change", update);
  }, []);
  if (!slow || (typeof navigator !== "undefined" && !navigator.onLine)) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-[var(--muted)] px-4 py-2 text-xs font-medium text-[var(--foreground)]">
      <Signal className="h-4 w-4 shrink-0" aria-hidden="true" />Slow connection. Pages may take a moment to load.
    </div>
  );
}
