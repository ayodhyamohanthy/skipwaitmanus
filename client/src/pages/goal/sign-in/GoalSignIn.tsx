// Goal /sign-in (D-048-p3-signin; packet docs/plans/D-048-auth.md). Rebuilt
// around the person's goal (D-120, D-150, D-167): the page opens with that goal,
// the two D-033 role cards choose whose goal it is, and one "Your next step"
// block holds the single black commit. Nothing here changes who may sign in or
// how (D-030 with D-049 and D-057): seekers use personal email by code or a
// social login (GoalSeekerForm), referrers use a work-email code only
// (GoalReferrerForm). The landing targets are the kit page's own, unchanged.
// Supersedes the restyle at pages/GoalSignIn.tsx, which nothing renders now.
import { ArrowLeft, Check, Handshake, Search, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { cn } from "@/lib/utils";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { GoalReferrerForm } from "./GoalReferrerForm";
import { GoalSeekerForm } from "./GoalSeekerForm";

type Intent = "seeker" | "referrer";

/** The goal line follows the chosen role; a seeker is the default reader. */
export const GOAL_LINES: Readonly<Record<Intent, string>> = {
  seeker: "Get referred.",
  referrer: "Refer someone at your company.",
};
export const GOAL_PAGE = { goalLine: GOAL_LINES.seeker } as const;

const GOAL_SUBLINES: Readonly<Record<Intent, string>> = {
  seeker: "Sign in to request referrals from verified employees and track each request in one place.",
  referrer: "Review referral requests for your company and accept only the ones you can vouch for.",
};

const ROLE_CARDS: readonly { id: Intent; title: string; who: string; icon: LucideIcon }[] = [
  { id: "seeker", title: "Find a referral", who: "I’m looking for a job", icon: Search },
  { id: "referrer", title: "Give a referral", who: "I work at a company", icon: Handshake },
];

/** Where each role lands after signing in: the kit page's targets and rules (D-095), unchanged. */
const DEFAULT_RETURN: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

function readQuery(): { intent: Intent; seekerReturnTo: string; referrerReturnTo: string } {
  if (typeof window === "undefined") return { intent: "seeker", seekerReturnTo: DEFAULT_RETURN.seeker, referrerReturnTo: DEFAULT_RETURN.referrer };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("returnTo");
  return {
    intent: params.get("intent") === "referrer" ? "referrer" : "seeker",
    // A seeker keeps a returnTo only for a purchase in progress (one-tap flag) or an admin page; same-origin paths only.
    seekerReturnTo: ONE_TAP_PAY_SIGNIN || requested?.startsWith("/admin") ? safeReturnTo(requested, DEFAULT_RETURN.seeker) : DEFAULT_RETURN.seeker,
    referrerReturnTo: safeReturnTo(requested, DEFAULT_RETURN.referrer),
  };
}

const LINK = "underline decoration-g-control-edge underline-offset-[3px] transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink hover:decoration-g-ink";

export default function GoalSignIn() {
  const [query] = useState(readQuery);
  const [intent, setIntent] = useState<Intent>(query.intent);
  return (
    <div data-skipwait-screen="sign-in" className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-ink">
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 gdesk:px-8">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center rounded-g-control"><GoalBrandMark /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-g-control text-g-label text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-10 gdesk:pt-16">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_LINES[intent]}</h1>
        <p className="mt-3 text-pretty text-g-body text-g-ink-2">{GOAL_SUBLINES[intent]}</p>
        <BetaNoticeLine tone="goal" />

        <p id="goal-sign-in-role" className="mt-8 text-g-label text-g-ink">I’m here to</p>
        {/* D-033: two large selectable cards, switchable any time, never a small toggle. */}
        <div role="group" aria-labelledby="goal-sign-in-role" className="mt-3 grid grid-cols-2 gap-3">
          {ROLE_CARDS.map(card => {
            const selected = intent === card.id;
            const Icon = card.icon;
            return (
              <button key={card.id} type="button" aria-pressed={selected} onClick={() => setIntent(card.id)}
                className={cn(
                  "relative flex min-h-[96px] flex-col items-start rounded-g-tile border p-4 text-left transition-colors duration-(--g-dur-hover) ease-g-out",
                  selected ? "border-g-ink bg-g-surface-selected" : "border-g-control-edge bg-g-surface hover:bg-g-surface-hover",
                )}>
                <Icon aria-hidden="true" className="size-5 text-g-ink" strokeWidth={1.75} />
                <span className="mt-3 text-g-label text-g-ink">{card.title}</span>
                <span className="mt-0.5 text-g-meta text-g-ink-3">{card.who}</span>
                {selected ? <Check aria-hidden="true" className="absolute right-3 top-3 size-4 text-g-ink" strokeWidth={2} /> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {intent === "referrer"
            ? <GoalReferrerForm onSignedIn={() => window.location.assign(query.referrerReturnTo)} />
            : <GoalSeekerForm returnTo={query.seekerReturnTo} />}
        </div>

        <p className="mt-8 border-t border-g-hairline pt-5 text-g-meta text-g-ink-3">
          By continuing, you agree to the <Link href="/terms" className={LINK}>Terms</Link> and acknowledge the <Link href="/privacy" className={LINK}>Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.
        </p>
      </main>
    </div>
  );
}
