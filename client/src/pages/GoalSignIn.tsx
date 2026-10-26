import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { SeekerSignIn } from "@/components/SeekerSignIn";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { cn } from "@/lib/utils";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";

type Intent = "seeker" | "referrer";

/** Same post-sign-in destinations as the kit sign-in. */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

const INTENT_COPY: Readonly<Record<Intent, { goal: string; sub: string; kicker: string }>> = {
  seeker: { kicker: "SIGN IN", goal: "Get referred.", sub: "Sign in to send your ask - or keep exploring first, no account needed." },
  // FOUNDER-LOCKED (Oct 16 2026): referrers sign in with a work-email OTP only.
  referrer: { kicker: "SIGN IN", goal: "Help the right person in.", sub: "Your work email verifies your company and stays private. You choose every ask." },
};

/** Goal-UI sign-in (doctrine: opens with the goal, one commit per step, ink on
 *  white, no kit colours). The functional cores stay shared: SeekerSignIn
 *  (social + email code) and ReferrerOtpSignIn (work-email OTP), restyled by
 *  their `goal` prop. Intent switch keeps both paths one tap away. */
export default function GoalSignIn() {
  const [intent, setIntent] = useState<Intent>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intent") === "referrer" ? "referrer" : "seeker"));
  const referrerReturnTo = typeof window !== "undefined" ? safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), INTENT_RETURN_TO.referrer) : INTENT_RETURN_TO.referrer;
  const requestedReturnTo = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("returnTo") : null;
  const seekerReturnTo = (ONE_TAP_PAY_SIGNIN || requestedReturnTo?.startsWith("/admin")) && typeof window !== "undefined" ? safeReturnTo(requestedReturnTo, INTENT_RETURN_TO.seeker) : INTENT_RETURN_TO.seeker;
  const copy = INTENT_COPY[intent];
  return (
    <div data-skipwait-screen="sign-in" className="min-h-screen bg-white font-g-sans text-g-ink">
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 gdesk:px-8">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center gap-2.5"><GoalBrandMark /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-g-small font-medium text-g-ink-2 hover:text-g-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[520px] px-5 py-12 gdesk:py-20">
        <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{copy.kicker}</p>
        <h1 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] gdesk:text-[56px]">{copy.goal}</h1>
        <p className="mt-4 text-g-body leading-[1.6] text-g-ink-2">{copy.sub}</p>
        <div className="mt-6"><BetaNoticeLine tone="goal" /></div>
        <div className="mt-8 grid grid-cols-2 gap-3" role="group" aria-label="I am here to">
          {([["seeker", "Find a referral", "I am looking for a job", Sparkles], ["referrer", "Give a referral", "I work at a company", ShieldCheck]] as const).map(([id, title, sub, Icon]) => (
            <button key={id} type="button" aria-pressed={intent === id} onClick={() => setIntent(id)} className={cn("relative rounded-[10px] border p-4 text-left transition-colors", intent === id ? "border-g-ink" : "border-g-hairline hover:border-g-control-edge")}>
              <Icon className="h-4 w-4 text-g-ink-2" aria-hidden="true" />
              <span className="mt-2 block text-g-small font-semibold">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-[1.5] text-g-ink-3">{sub}</span>
              {intent === id && <Check className="absolute right-3 top-3 h-4 w-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
        {intent === "seeker" && <GoogleOneTap returnTo={seekerReturnTo} />}
        <div className="mt-6 rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          {intent === "referrer"
            ? <div data-testid="referrer-work-email-otp"><ReferrerOtpSignIn onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
            : <SeekerSignIn goal returnTo={seekerReturnTo} />}
        </div>
        <p className="mt-5 text-[13px] leading-[1.6] text-g-ink-3">
          {intent === "referrer" ? "Work email only. We never use personal email or social logins for referrers." : "New to skipwait.me? Enter your email and we will create your account."}
        </p>
        <p className="mt-6 border-t border-g-hairline pt-5 text-[13px] leading-[1.6] text-g-ink-3">
          By continuing, you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-g-ink">Terms</Link> and acknowledge the <Link href="/privacy" className="underline underline-offset-2 hover:text-g-ink">Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.
        </p>
      </main>
    </div>
  );
}
