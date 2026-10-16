import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { safeReturnTo } from "@/lib/referrerSignIn";

type Intent = "seeker" | "referrer";

/** Where each intent lands after AuthKit: the job search, or referrer setup (work-email verification). */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

/**
 * Kit v4 sign-in (app/src/components/sign-in-page.tsx). WorkOS AuthKit is the
 * only credential store, so every continuation hands off to the hosted AuthKit
 * screen: the email step only carries the address forward as a login hint and
 * the password is entered on that secure screen, never on this page. The
 * intent switch picks where the person lands once AuthKit returns.
 */
function workosAuthUrl(screen: "sign-in" | "sign-up", intent: Intent, email = "", provider = ""): string {
  const params = new URLSearchParams({ returnTo: INTENT_RETURN_TO[intent] });
  if (provider) params.set("provider", provider);
  const loginHint = email.trim().toLowerCase();
  if (loginHint) params.set("login_hint", loginHint);
  return `/api/auth/workos/${screen}?${params}`;
}

/** Providers enabled in WorkOS (server/_core/workosAuth.ts SOCIAL_PROVIDERS). */
const SOCIAL = [{ id: "google", label: "Google", mark: "G" }, { id: "microsoft", label: "Microsoft", mark: "M" }, { id: "github", label: "GitHub", mark: "H" }] as const;

/** Kit draws the legal names as plain muted text; they stay links, underlined only on hover or keyboard focus. */
const legalLink = "hover:underline focus-visible:underline";

export default function SignIn() {
  const [intent, setIntent] = useState<Intent>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intent") === "referrer" ? "referrer" : "seeker"));
  // Where the work-email OTP lands the referrer (same-origin path only).
  const referrerReturnTo = typeof window !== "undefined" ? safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), INTENT_RETURN_TO.referrer) : INTENT_RETURN_TO.referrer;
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");

  function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.assign(workosAuthUrl("sign-in", intent, email));
  }

  return <main data-skipwait-screen="sign-in" className="auth-page">
    <section className="auth-story" aria-label="SkipWait introduction">
      <Link className="wordmark auth-wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link>
      <img src="/launch-door.jpg" alt="An open blue door with a yellow path" width={1600} height={1008} />
      <div className="auth-story-copy"><span className="eyebrow">A WARMER WAY IN</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you’re ready to ask for—or <span className="whitespace-nowrap">offer—a</span> real introduction.</p></div>
      <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <Link className="auth-back" href="/"><ArrowLeft /> Back to home</Link>
      <div className="auth-heading"><span className="auth-step">YOUR DOOR STARTS HERE</span><h2>Welcome to SkipWait.</h2><p>Choose how you’ll use SkipWait. You can change this later.</p></div>
      <div className="intent-switch" role="group" aria-label="How do you want to use SkipWait?"><Button type="button" variant="ghost" className={intent === "seeker" ? "selected" : ""} aria-pressed={intent === "seeker"} onClick={() => setIntent("seeker")}><Sparkles />Find a referral</Button><Button type="button" variant="ghost" className={intent === "referrer" ? "selected" : ""} aria-pressed={intent === "referrer"} onClick={() => setIntent("referrer")}><ShieldCheck />Give a referral</Button></div>
      <div className="auth-context"><span>{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</span><Check /></div>
      {intent === "referrer"
        // FOUNDER-LOCKED (Oct 16 2026): referrers sign in with a work-email OTP only. No social, no personal email.
        ? <div className="auth-form" data-testid="referrer-work-email-otp"><ReferrerOtpSignIn onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
        : !emailMode ? <div className="auth-options">{SOCIAL.map(item => <Button key={item.id} type="button" variant="outline" className="google-button" onClick={() => window.location.assign(workosAuthUrl("sign-in", intent, "", item.id))}><span className="google-g" aria-hidden="true">{item.mark}</span>Continue with {item.label}</Button>)}<div className="auth-divider"><span>or</span></div><Button type="button" onClick={() => setEmailMode(true)}><Mail />Continue with email</Button></div>
        : <form className="auth-form" onSubmit={continueWithEmail}>
          <label htmlFor="email">Email address</label>
          <div className="auth-input"><Mail /><input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
          <p className="text-xs leading-relaxed text-muted-foreground">You’ll finish signing in on the next, secure screen.</p>
          <Button type="submit">Sign in <ArrowRight /></Button>
          <Button type="button" variant="ghost" onClick={() => setEmailMode(false)}>Use another method</Button>
        </form>}
      {intent === "referrer" ? <p className="auth-new">Work email only. We never use personal email or social logins for referrers.</p> : <p className="auth-new">New to SkipWait? <Button type="button" variant="link" onClick={() => window.location.assign(workosAuthUrl("sign-up", intent, emailMode ? email : ""))}>Create a free account</Button></p>}
      <p className="auth-terms">By continuing, you agree to the <Link href="/terms" className={legalLink}>Terms</Link> and acknowledge the <Link href="/privacy" className={legalLink}>Privacy Policy</Link>. Referrals are free and never guarantee an interview.</p>
    </div></section>
  </main>;
}
