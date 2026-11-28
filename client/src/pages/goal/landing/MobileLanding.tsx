// MOBILE-landing-choice (D-414, packet docs/plans/MOBILE-app-flow.md): the
// signed-out landing on a phone is one screen. Both roles are chosen up front:
// the black "I want a referral" card holds the search itself, and "I can refer
// someone" opens the referrer work-email sign-in with the role carried. The
// long proof sections live on /how-it-works. Behind MOBILE_LANDING_V2 (off);
// desktop keeps GoalLandingV9.
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "wouter";
import CookieConsent from "@/components/CookieConsent";
import { BetaBadge } from "@/components/BetaNotice";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoalLanguageConsent } from "@/components/goal/GoalLanguageConsent";
import { trackClarityEvent } from "@/lib/clarity";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { MOBILE_LANDING as COPY } from "@shared/landingContent";

/** Phone = below the goal `gdesk` breakpoint (641px, client/src/index.css). */
export const PHONE_QUERY = "(max-width: 640.98px)";

/**
 * Clarity events for the comparison the switch waits on (packet rule 6):
 * landing -> search start, and landing -> referrer sign-in start.
 */
export const MOBILE_LANDING_EVENTS = {
  search: "mobile_landing_search",
  referrer: "mobile_landing_referrer",
  howItWorks: "mobile_landing_how_it_works",
} as const;

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isPhone(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** True on a phone-width viewport; follows rotation and resizes. */
export function usePhoneViewport(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}

export default function MobileLanding() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    trackClarityEvent(MOBILE_LANDING_EVENTS.search);
    const term = query.trim();
    setLocation(term ? `/explore?q=${encodeURIComponent(term)}` : "/explore");
  };
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white font-g-sans text-g-ink" data-testid="mobile-landing">
      <GoalLanguageConsent />
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-g-hairline px-4 [@media(max-height:640px)]:h-12">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center"><GoalBrandMark /></Link>
          <BetaBadge tone="goal" />
        </div>
        <Link href="/sign-in" className="inline-flex h-11 items-center px-1 text-g-small font-medium">Sign in</Link>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-3 pt-5 [@media(max-height:640px)]:pt-3">
        <h1 className="text-[28px] font-semibold leading-[1.06] tracking-[-0.03em] [@media(max-height:640px)]:text-[24px]">{COPY.h1}</h1>
        <p className="mt-1.5 text-[14px] leading-[1.45] text-g-ink-2 [@media(max-height:640px)]:text-[13px]">{COPY.lead}</p>

        <section aria-labelledby="mobile-landing-question" className="mt-5 flex flex-col gap-2.5 [@media(max-height:640px)]:mt-3 [@media(max-height:640px)]:gap-2">
          <h2 id="mobile-landing-question" className="font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">{COPY.question}</h2>

          <form onSubmit={submit} className="rounded-[16px] bg-g-ink p-4 text-g-ink-inverse [@media(max-height:640px)]:p-3" data-testid="goal-next-step">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[18px] font-semibold leading-tight">{COPY.seekerTitle}</p>
              <p className="shrink-0 text-[12px] opacity-70">{COPY.seekerNote}</p>
            </div>
            <div className="mt-2.5 flex gap-2">
              <label className="flex h-12 min-w-0 flex-1 items-center rounded-[10px] bg-white px-3 text-g-ink">
                <span className="sr-only">{COPY.seekerPlaceholder}</span>
                <input
                  type="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={COPY.seekerPlaceholder}
                  className="w-full min-w-0 bg-transparent text-[16px] text-g-ink outline-none placeholder:text-[15px] placeholder:text-g-ink-3 max-[359px]:placeholder:text-[13.5px]"
                />
              </label>
              <button type="submit" aria-label={COPY.seekerSubmit} className="inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-white/40 text-g-ink-inverse hover:bg-white/10">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="m14 14 3.5 3.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          </form>

          <Link
            href={referrerSignInHref()}
            onClick={() => trackClarityEvent(MOBILE_LANDING_EVENTS.referrer)}
            className="flex items-center justify-between gap-3 rounded-[16px] border border-g-ink p-4 hover:bg-g-surface-hover [@media(max-height:640px)]:p-3"
            data-testid="mobile-landing-referrer"
          >
            <span>
              <span className="block text-[18px] font-semibold leading-tight">{COPY.referrerTitle}</span>
              <span className="mt-1 block text-[13px] leading-[1.4] text-g-ink-2">{COPY.referrerBody}</span>
            </span>
            <span aria-hidden="true" className="text-[20px]">&rarr;</span>
          </Link>
        </section>

        <div className="mt-auto flex items-center justify-between gap-4 pt-3">
          <p className="text-[12px] leading-[1.4] text-g-ink-3">{COPY.smallPrint}</p>
          <Link href="/how-it-works" onClick={() => trackClarityEvent(MOBILE_LANDING_EVENTS.howItWorks)} className="inline-flex h-11 shrink-0 items-center text-[13px] font-medium underline underline-offset-4">{COPY.howItWorks}</Link>
        </div>
      </main>
      <CookieConsent layout="bar" />
    </div>
  );
}
