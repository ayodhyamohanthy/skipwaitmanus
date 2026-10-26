/**
 * Goal-native job-seeker sign-in (frozen comp: design/goal-ui/captures/signin).
 * FOUNDER-LOCKED login rule (Oct 16 2026): seekers get social + personal email
 * code; referrers never render this. One commit per step; social options
 * first, email behind its own commit. Device-saved sign-in (owner, Oct 26):
 * the browser-owned passkey action beside the social options, conditional UI
 * in the email field's autofill, and a one-time save-this-device offer after
 * a code sign-in. No kit imports - the legacy page keeps its own component.
 */
import { ArrowLeft, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField } from "@/components/goal/GoalField";
import { PasskeyAutofill, PasskeyEnrollmentOffer, PasskeySignInButton } from "@/components/goal/GoalPasskeySignIn";
import { SEEKER_SOCIAL, seekerSocialUrl } from "@/components/SeekerSignIn";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";

const inputClass = "h-(--g-control-h) w-full rounded-[10px] border border-g-control-edge bg-white px-3 text-g-body text-g-ink placeholder:text-g-ink-3 focus:border-g-ink focus:outline-none";

export function GoalSeekerSignIn({ returnTo = "/explore" }: { returnTo?: string }) {
  const [stage, setStage] = useState<"choose" | "email" | "code" | "enroll">("choose");
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
      if (window.PublicKeyCredential) { setStage("enroll"); return; }
      window.location.assign(returnTo);
    } catch { setError("That code could not be verified."); } finally { setBusy(false); }
  }

  if (stage === "enroll") return <PasskeyEnrollmentOffer email={email.trim().toLowerCase()} returnTo={returnTo} />;

  if (stage === "choose") {
    return (
      <div data-testid="seeker-sign-in" className="grid gap-3">
        <PasskeySignInButton returnTo={returnTo} />
        {SEEKER_SOCIAL.map(item => (
          <GoalButton key={item.id} type="button" variant="outline" className="w-full rounded-full!" onClick={() => window.location.assign(seekerSocialUrl(item.id, returnTo))}>
            <span className="google-g" aria-hidden="true">{item.mark}</span>Continue with {item.label}
          </GoalButton>
        ))}
        <div className="flex items-center gap-3 text-g-meta text-g-ink-3" aria-hidden="true"><span className="h-px flex-1 bg-g-hairline" />or<span className="h-px flex-1 bg-g-hairline" /></div>
        <GoalButton type="button" variant="primary" className="w-full rounded-full! bg-g-ink" leadingIcon={Mail} onClick={() => setStage("email")}>Continue with email</GoalButton>
      </div>
    );
  }

  if (stage === "email") {
    return (
      <form data-testid="seeker-sign-in" className="grid gap-3" onSubmit={send}>
        <PasskeyAutofill returnTo={returnTo} />
        <GoalField label="Email address" htmlFor="seeker-email" help="We'll email you a six-digit code. New here? That creates your account." error={error || undefined}>
          <input id="seeker-email" name="email" type="email" placeholder="you@example.com" autoComplete="username webauthn" required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} className={inputClass} />
        </GoalField>
        {remembered && <button type="button" className="self-start text-g-meta font-semibold text-g-ink-2 underline underline-offset-2 hover:text-g-ink" onClick={() => { forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); document.getElementById("seeker-email")?.focus(); }}>Not you? Forget this email</button>}
        <GoalButton type="submit" variant="primary" className="w-full rounded-full!" busy={busy} busyLabel="Sending code…" disabledReason={!email.trim() ? "Enter your email" : undefined}>Send sign-in code</GoalButton>
        <GoalButton type="button" flush onClick={() => { setStage("choose"); setError(""); }}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />All sign-in options</GoalButton>
      </form>
    );
  }

  return (
    <form data-testid="seeker-sign-in" className="grid gap-3" onSubmit={verify}>
      <p className="text-g-small font-semibold text-g-ink">Code sent to {email.trim().toLowerCase()}</p>
      <GoalField label="Six-digit code" htmlFor="seeker-code" error={error || undefined}>
        <input id="seeker-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus placeholder="123456" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} className={inputClass} />
      </GoalField>
      <GoalButton type="submit" variant="primary" className="w-full rounded-full!" busy={busy} busyLabel="Checking…" disabledReason={code.length !== 6 ? "Enter the six-digit code" : undefined}>Sign in</GoalButton>
      <GoalButton type="button" flush onClick={() => { setStage("email"); setCode(""); setError(""); }}>Use a different email</GoalButton>
    </form>
  );
}
