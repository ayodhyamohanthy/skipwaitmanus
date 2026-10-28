import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import GoalSignIn from "@/pages/GoalSignIn";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { Button } from "@/components/kit/button";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { SeekerSignIn } from "@/components/SeekerSignIn";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";

type Intent = "seeker" | "referrer";

/** Where each intent lands after AuthKit: the job search, or referrer setup (work-email verification). */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

/**
 * Kit v4 sign-in (app/src/components/sign-in-page.tsx), all on skipwait.me. Job seekers: SeekerSignIn (social
 * straight to the provider, email by six-digit code). Referrers: work-email OTP only. The intent switch picks
 * where the person lands afterwards.
 */
/** Kit draws the legal names as plain muted text; they stay links, underlined only on hover or keyboard focus. */
const legalLink = "hover:underline focus-visible:underline";

export default function SignIn() {
  // Goal-UI migration (D-120): the goal sign-in replaces this page when its
  // build flag is on; the kit page below stays the default until QA passes.
  if (goalSurfaceOn("sign-in")) return <GoalSignIn />;
  const [intent, setIntent] = useState<Intent>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intent") === "referrer" ? "referrer" : "seeker"));
  // Where the work-email OTP lands the referrer (same-origin path only).
  const referrerReturnTo = typeof window !== "undefined" ? safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), INTENT_RETURN_TO.referrer) : INTENT_RETURN_TO.referrer;
  // D-095: a seeker arriving from a purchase returns to it (same-origin path only; flag off keeps /explore).
  const requestedReturnTo = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("returnTo") : null;
  const seekerReturnTo = (ONE_TAP_PAY_SIGNIN || requestedReturnTo?.startsWith("/admin")) && typeof window !== "undefined" ? safeReturnTo(requestedReturnTo, INTENT_RETURN_TO.seeker) : INTENT_RETURN_TO.seeker;
  return <main data-skipwait-screen="sign-in" className="auth-page">
    <section className="auth-story" aria-label="skipwait.me introduction">
      <Link className="wordmark auth-wordmark" href="/"><img src="/brand/lockup.svg" alt="SkipWait.me" className="wordmark-logo" /></Link>
      <img src="/launch-door.jpg" alt="An open blue door with a yellow path" width={1600} height={1008} />
      <div className="auth-story-copy"><span className="eyebrow">A WARMER WAY IN</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you’re ready to ask for—or <span className="whitespace-nowrap">offer—a</span> real introduction.</p></div>
      <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <Link className="auth-back" href="/"><ArrowLeft /> Back to home</Link>
      <div className="auth-heading"><span className="auth-step">YOUR DOOR STARTS HERE</span><h2>Welcome to skipwait.me.</h2><p>Pick your side. You can switch any time on this screen.</p></div>
      <BetaNoticeLine tone="kit" />
      <p className="intent-prompt" id="intent-prompt">I’m here to…</p>
      <div className="intent-switch intent-cards" role="group" aria-labelledby="intent-prompt">
        <Button type="button" variant="ghost" className={intent === "seeker" ? "selected" : ""} aria-pressed={intent === "seeker"} onClick={() => setIntent("seeker")}><Sparkles /><span className="intent-title">Find a referral</span><span className="intent-sub">I’m looking for a job</span>{intent === "seeker" && <Check className="intent-check" aria-hidden="true" />}</Button>
        <Button type="button" variant="ghost" className={intent === "referrer" ? "selected" : ""} aria-pressed={intent === "referrer"} onClick={() => setIntent("referrer")}><ShieldCheck /><span className="intent-title">Give a referral</span><span className="intent-sub">I work at a company</span>{intent === "referrer" && <Check className="intent-check" aria-hidden="true" />}</Button>
      </div>
      <div className="auth-context"><span>{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</span><Check /></div>
      {intent === "referrer"
        // FOUNDER-LOCKED (Oct 16 2026): referrers sign in with a work-email OTP only. No social, no personal email.
        ? <div className="auth-form" data-testid="referrer-work-email-otp"><ReferrerOtpSignIn onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
        // Job seekers: every sign-in stays on skipwait.me. Social buttons go straight to the provider; email uses a six-digit code.
        : <SeekerSignIn returnTo={seekerReturnTo} />}
      {intent === "referrer" ? <p className="auth-new">Work email only. We never use personal email or social logins for referrers.</p> : <p className="auth-new">New to skipwait.me? Enter your email and we’ll create your account.</p>}
      <p className="auth-terms">By continuing, you agree to the <Link href="/terms" className={legalLink}>Terms</Link> and acknowledge the <Link href="/privacy" className={legalLink}>Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.</p>
    </div></section>
  </main>;
}
