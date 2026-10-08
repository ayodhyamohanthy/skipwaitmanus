import { useState } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "skipwait:cookie-consent";

type Consent = "essential" | "all";

/**
 * Cookie consent banner for the public launch page (first visit).
 * Essential cookies keep sign-in working; optional analytics are off
 * unless the visitor accepts all. Choice is stored on-device only.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const choose = (value: Consent) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage blocked (private mode): hide for this visit only.
    }
    setVisible(false);
  };

  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-[var(--foreground)] bg-[var(--background)] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--foreground)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6">
          <strong>Cookies, honestly.</strong> Essential ones keep you signed in. Optional analytics help us improve — never sold, never ads.{" "}
          <Link href="/privacy" className="font-semibold underline">Privacy</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose("essential")} className="brand-button min-h-11 border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Essential only</button>
          <button type="button" onClick={() => choose("all")} className="brand-button min-h-11">Accept all</button>
        </div>
      </div>
    </div>
  );
}
