import Clarity from "@microsoft/clarity";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
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

  useEffect(() => { applyAnalyticsConsent(readCookieConsent()); }, []);

  if (!visible) return null;

  const save = (choice: CookieConsentChoice) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Storage blocked (private mode): hide for this visit only.
    }
    applyAnalyticsConsent(choice);
    setVisible(false);
  };

  return (
    <div role="dialog" aria-label="Cookie choices" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl rounded-3xl border border-border bg-card p-5 shadow-xl md:bottom-[max(1.5rem,env(safe-area-inset-bottom))]">
      <p className="text-sm"><strong>Cookies, honestly.</strong> Essential ones keep you signed in. Optional analytics help us improve — never sold, never ads. <Link href="/privacy" className="text-link">Privacy</Link></p>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => save("essential")}>Essential only</Button><Button size="sm" onClick={() => save("all")}>Accept all</Button></div>
    </div>
  );
}
