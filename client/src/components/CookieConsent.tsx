import Clarity from "@microsoft/clarity";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { isClarityActive } from "@/lib/clarity";

const STORAGE_KEY = "skipwait:cookie-consent";

export type CookieConsentChoice = "essential" | "all";

function parseChoice(value: string | null): CookieConsentChoice | null {
  return value === "essential" || value === "all" ? value : null;
}

/** The visitor's stored choice; null before they choose or when storage is blocked. */
export function readCookieConsent(): CookieConsentChoice | null {
  try {
    return parseChoice(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Stores the choice on this device and applies it to Clarity. Used by the banner and by Settings > Privacy. */
export function saveCookieConsent(choice: CookieConsentChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies for this visit.
  }
  applyAnalyticsConsent(choice);
}

/**
 * Optional analytics are the Clarity replay cookies. They are granted only
 * after "Accept all"; until then (and after "Essential only") Clarity is told
 * analytics storage is denied. No-op when Clarity is not configured.
 */
export function applyAnalyticsConsent(choice: CookieConsentChoice | null): void {
  if (!isClarityActive()) return;
  try {
    Clarity.consentV2({ ad_Storage: "denied", analytics_Storage: choice === "all" ? "granted" : "denied" });
  } catch {
    // Analytics is best-effort; the visitor's choice is still stored.
  }
}

/**
 * Cookie consent banner for the public launch page (first visit). Essential
 * cookies keep sign-in working; optional analytics stay off unless the visitor
 * accepts all. The choice is stored on-device only.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(() => readCookieConsent() === null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => { applyAnalyticsConsent(readCookieConsent()); }, []);

  // The banner is fixed, so reserve the same height in flow: footer content and
  // links stay reachable and nothing renders underneath the dialog.
  useLayoutEffect(() => {
    if (!visible) return;
    const node = bannerRef.current;
    if (!node) return;
    const measure = () => setBannerHeight(node.getBoundingClientRect().height + 24);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [visible]);

  if (!visible) return null;

  const save = (choice: CookieConsentChoice) => {
    saveCookieConsent(choice);
    setVisible(false);
  };

  return (
    <>
      <div aria-hidden="true" style={{ height: bannerHeight }} data-testid="cookie-consent-spacer" />
      <div ref={bannerRef} role="dialog" aria-label="Cookie choices" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl rounded-2xl border border-g-control-edge bg-g-surface p-5 shadow-xl md:bottom-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-sm text-g-ink"><strong>Cookies, honestly.</strong> Essential ones keep you signed in. Optional analytics help us improve - never sold, never ads. <Link href="/privacy" className="underline">Privacy</Link></p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => save("essential")} className="rounded-full border border-g-control-edge bg-g-surface px-4 py-2 text-sm font-medium text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover">Essential only</button>
          <button type="button" onClick={() => save("all")} className="rounded-full bg-g-ink px-4 py-2 text-sm font-medium text-g-ink-inverse transition-colors duration-(--g-dur-hover) ease-g-out hover:opacity-90">Accept all</button>
        </div>
      </div>
    </>
  );
}
