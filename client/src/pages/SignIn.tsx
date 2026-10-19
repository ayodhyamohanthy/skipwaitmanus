import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { SeekerSignIn } from "@/components/SeekerSignIn";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { PASSWORD_AUTH_COPY, USE_PASSWORD_SIGN_IN_COPY, USE_PASSWORD_SIGN_IN_REASON, USE_WORK_EMAIL_CODE_REASON } from "@shared/passwordAuth";

type Intent = "seeker" | "referrer";

/** Where each intent lands after signing in: the job search, or referrer setup (work-email verification). */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

/**
 * Kit v4 sign-in (app/src/components/sign-in-page.tsx), all on skipwait.me. Job seekers: SeekerSignIn (social
 * straight to the provider, or email + password checked by WorkOS, D-049). Referrers: work-email OTP only, never
 * a password. The intent switch picks where the person lands afterwards; every app "Sign in" arrives here with a
 * validated ?returnTo (signInPagePath).
 */
/** Kit draws the legal names as plain muted text; they stay links, underlined only on hover or keyboard focus. */
const legalLink = "hover:underline focus-visible:underline";

export default function SignIn() {
  const [intent, setIntent] = useState<Intent>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intent") === "referrer" ? "referrer" : "seeker"));
  // Where the work-email OTP lands the referrer (same-origin path only).
  const referrerReturnTo = typeof window !== "undefined" ? safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), INTENT_RETURN_TO.referrer) : INTENT_RETURN_TO.referrer;
  // Where a seeker lands: the page that sent them here when it is same-site and not an auth page, else the job search.
  const seekerReturnTo = typeof window !== "undefined" ? safeSignInReturnTo(new URLSearchParams(window.location.search).get("returnTo"), window.location.origin) ?? INTENT_RETURN_TO.seeker : INTENT_RETURN_TO.seeker;
  // A social sign-in with a verified work email is refused and sent here (D-078 ruling 4); say why, on the referrer side only.
  const reason = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reason") : null;
  const workEmailRefused = reason === USE_WORK_EMAIL_CODE_REASON;
  // A password finished on WorkOS's hosted page is refused at the callback (review F1); say where it works.
  const passwordElsewhere = reason === USE_PASSWORD_SIGN_IN_REASON;
  return <main data-skipwait-screen="sign-in" className="auth-page">
    <section className="auth-story" aria-label="SkipWait introduction">
      <Link className="wordmark auth-wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link>
      <img src="/launch-door.jpg" alt="An open blue door with a yellow path" width={1600} height={1008} />
      <div className="auth-story-copy"><span className="eyebrow">A WARMER WAY IN</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you’re ready to ask for—or <span className="whitespace-nowrap">offer—a</span> real introduction.</p></div>
      <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <Link className="auth-back" href="/"><ArrowLeft /> Back to home</Link>
      <div className="auth-heading"><span className="auth-step">YOUR DOOR STARTS HERE</span><h2>Welcome to SkipWait.</h2><p>Pick your side. You can switch any time on this screen.</p></div>
      <p className="intent-prompt" id="intent-prompt">I’m here to…</p>
      <div className="intent-switch intent-cards" role="group" aria-labelledby="intent-prompt">
        <Button type="button" variant="ghost" className={intent === "seeker" ? "selected" : ""} aria-pressed={intent === "seeker"} onClick={() => setIntent("seeker")}><Sparkles /><span className="intent-title">Find a referral</span><span className="intent-sub">I’m looking for a job</span>{intent === "seeker" && <Check className="intent-check" aria-hidden="true" />}</Button>
        <Button type="button" variant="ghost" className={intent === "referrer" ? "selected" : ""} aria-pressed={intent === "referrer"} onClick={() => setIntent("referrer")}><ShieldCheck /><span className="intent-title">Give a referral</span><span className="intent-sub">I work at a company</span>{intent === "referrer" && <Check className="intent-check" aria-hidden="true" />}</Button>
      </div>
      <div className="auth-context"><span>{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</span><Check /></div>
      {intent === "referrer"
        // FOUNDER-LOCKED (Oct 16 2026, D-049): referrers sign in with a work-email OTP only. No social, no personal email, no password.
        ? <div className="auth-form" data-testid="referrer-work-email-otp">{workEmailRefused ? <p role="status" className="auth-new">{PASSWORD_AUTH_COPY.use_work_email_code}</p> : null}<ReferrerOtpSignIn onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
        // Job seekers: every sign-in stays on skipwait.me. Social buttons go straight to the provider; email uses a password
        // (D-049). SeekerSignIn renders its own "New to SkipWait? Create a free account" line under the form.
        : <>{passwordElsewhere ? <p role="status" className="auth-new">{USE_PASSWORD_SIGN_IN_COPY}</p> : null}<SeekerSignIn returnTo={seekerReturnTo} /></>}
      {intent === "referrer" ? <p className="auth-new">Work email only. We never use personal email, passwords or social logins for referrers.</p> : null}
      <p className="auth-terms">By continuing, you agree to the <Link href="/terms" className={legalLink}>Terms</Link> and acknowledge the <Link href="/privacy" className={legalLink}>Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.</p>
    </div></section>
  </main>;
}
