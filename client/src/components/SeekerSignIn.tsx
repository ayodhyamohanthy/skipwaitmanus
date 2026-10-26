import { ArrowRight, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/kit/button";
import { PasskeyEnrollmentOffer, PasskeySignInButton } from "@/components/PasskeySignIn";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";

/**
 * Job-seeker sign-in, fully on skipwait.me (no authkit.app screen). FOUNDER-LOCKED login rule, Oct 16 2026:
 * job seekers get personal email + every social login. Referrers never render this (see ReferrerOtpSignIn).
 * Social buttons go straight to the provider through /api/auth/workos/sign-in?provider=...; email uses a
 * six-digit code (/api/auth/workos/email-code/*), which also creates the account for a new person.
 */
/**
 * Providers whose WorkOS connection completes sign-in in production. Microsoft, LinkedIn and Slack are hidden
 * (Oct 16 2026) because each provider app rejects WorkOS's callback URL (redirect_uri mismatch), so a click
 * ends on a provider error page. Re-add the id here once the provider app has the WorkOS redirect URI registered.
 */
const ALL_SOCIAL = [
  { id: "google", label: "Google", mark: "G" },
  { id: "microsoft", label: "Microsoft", mark: "M" },
  { id: "github", label: "GitHub", mark: "H" },
  { id: "linkedin", label: "LinkedIn", mark: "in" },
  { id: "slack", label: "Slack", mark: "S" },
] as const;
const WORKING_SOCIAL_IDS: readonly string[] = ["google", "github", "microsoft", "linkedin", "slack"];
export const SEEKER_SOCIAL = ALL_SOCIAL.filter(p => WORKING_SOCIAL_IDS.includes(p.id));

export function seekerSocialUrl(provider: string, returnTo: string): string {
  return `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo, provider })}`;
}

// goal: under the goal sign-in the commits render ink (doctrine: no blue
// buttons); the kit sign-in keeps the kit default look.
export function SeekerSignIn({ returnTo = "/explore", goal = false }: { returnTo?: string; goal?: boolean }) {
  const commit = goal ? "bg-g-ink text-g-ink-inverse hover:bg-g-ink" : undefined;
  const [stage, setStage] = useState<"email" | "code" | "enroll">("email");
  const [email, setEmail] = useState(() => rememberedSignInEmail("seeker"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("seeker") !== "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError("");
    try {
      const { ok, data } = await post("/api/auth/workos/email-code/send", { email: email.trim().toLowerCase() });
      if (!ok || !data.sent) { setError(String(data.error || "We could not send the code. Try again shortly.")); return; }
      setStage("code");
    } catch { setError("We could not send the code. Try again shortly."); } finally { setBusy(false); }
  }

  async function verify(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError("");
    try {
      const { ok, data } = await post("/api/auth/workos/email-code/verify", { email: email.trim().toLowerCase(), code: code.trim() });
      if (!ok || !data.signedIn) { setError(String(data.error || "That code could not be verified.")); return; }
      rememberSignInEmail("seeker", email);
      if (goal && window.PublicKeyCredential) { setStage("enroll"); return; }
      window.location.assign(returnTo);
    } catch { setError("That code could not be verified."); } finally { setBusy(false); }
  }

  if (stage === "email") {
    return <form className="auth-form" data-testid="seeker-sign-in" onSubmit={send}>
      <label htmlFor="seeker-email">Email address</label>
      <div className="auth-input"><Mail /><input id="seeker-email" name="email" type="email" placeholder="you@example.com" autoComplete={goal ? "username webauthn" : "email"} required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} /></div>
      {remembered && <button type="button" className="self-start text-xs font-semibold underline underline-offset-2" onClick={() => { forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); document.getElementById("seeker-email")?.focus(); }}>Not you? Forget this email</button>}
      <p className="text-xs leading-relaxed text-muted-foreground">We’ll email you a six-digit code. New here? That creates your account.</p>
      {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
      <Button type="submit" className={commit} disabled={busy || !email.trim()}>{busy ? "Sending code…" : "Send sign-in code"} <ArrowRight /></Button>
      <Button type="button" variant="ghost" className={commit ? `sr-only ${commit}` : "sr-only"} onClick={() => document.getElementById("seeker-email")?.focus()}>Continue with email</Button>
      <div className="auth-divider"><span>or</span></div>
      <div className="auth-options">
        {goal && <PasskeySignInButton returnTo={returnTo} />}
        {SEEKER_SOCIAL.map(item => <Button key={item.id} type="button" variant="outline" className="google-button" onClick={() => window.location.assign(seekerSocialUrl(item.id, returnTo))}><span className="google-g" aria-hidden="true">{item.mark}</span>Continue with {item.label}</Button>)}
      </div>
    </form>;
  }
  return <form className="auth-form" data-testid="seeker-sign-in" onSubmit={verify}>
    <p className="text-sm font-semibold">Code sent to {email.trim().toLowerCase()}</p>
    <label htmlFor="seeker-code">Six-digit code</label>
    <div className="auth-input"><input id="seeker-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus placeholder="123456" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} /></div>
    {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
    <Button type="submit" className={commit} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"} <ArrowRight /></Button>
    <Button type="button" variant="ghost" onClick={() => { setStage("email"); setCode(""); setError(""); }}>Use a different email</Button>
  </form>;
}
