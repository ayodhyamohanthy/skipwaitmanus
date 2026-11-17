// The job seeker's side of the goal /sign-in (D-048-p3-signin, packet section
// 6 step 6). FOUNDER-LOCKED login rule (D-030 as amended by D-049): personal
// email by six-digit code, every social provider straight to WorkOS on
// skipwait.me, and the device-saved passkey (DEVICE-SIGNIN-passkeys) offered
// exactly as the landed goal sign-in offers it: a "Use a saved passkey"
// action, conditional UI on the email field's autofill, and a one-time offer
// to save this device after a code sign-in. Referrers never render this.
//
// Same server contract as components/SeekerSignIn.tsx (send, verify, the
// remembered email); that file stays untouched because the kit page renders
// it. The email field comes first so it is reachable without a tap (D-095).
import { CircleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { PasskeyAutofill, PasskeyEnrollmentOffer, PasskeySignInButton, usePasskeyAvailability } from "@/components/goal/GoalPasskeySignIn";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";
import { NETWORK_MESSAGE, serverWords } from "./GoalAuthFrame";
import { GOAL_SEEKER_SOCIAL, goalSeekerSocialUrl } from "./seekerSocial";

export const SEEKER_EMAIL_FIELD_ID = "seeker-email";
const OFFLINE_REASON = "You are offline. Your email is kept; send the code when you are back online.";

type Stage = "email" | "code" | "enroll";

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

const flag = (data: unknown, key: string) => Boolean(data && typeof data === "object" && (data as Record<string, unknown>)[key]);

function FormError({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{text}
    </p>
  ) : null;
}

/** "Manage saved passkeys", shown only where the server has passkeys on. */
export function GoalPasskeyManageLink() {
  const passkeys = usePasskeyAvailability();
  if (!passkeys.enabled) return null;
  return <a href="/sign-in?passkeys=manage" className="inline-flex min-h-11 items-center text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Manage saved passkeys</a>;
}

export function GoalSeekerForm({ returnTo }: { returnTo: string }) {
  const passkeys = usePasskeyAvailability();
  const online = useOnlineStatus();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(() => rememberedSignInEmail("seeker"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("seeker") !== "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cleanEmail = email.trim().toLowerCase();

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !cleanEmail || !online) return;
    setBusy(true); setError("");
    try {
      const { ok, data } = await post("/api/auth/workos/email-code/send", { email: cleanEmail });
      if (!ok || !flag(data, "sent")) { setError(serverWords(data, "We could not send the code. Try again shortly.")); return; }
      setStage("code");
    } catch { setError(NETWORK_MESSAGE); } finally { setBusy(false); }
  }

  async function verify(event?: FormEvent) {
    event?.preventDefault();
    if (busy || code.length !== 6 || !online) return;
    setBusy(true); setError("");
    try {
      const { ok, data } = await post("/api/auth/workos/email-code/verify", { email: cleanEmail, code: code.trim() });
      if (!ok || !flag(data, "signedIn")) { setError(serverWords(data, "That code could not be verified.")); return; }
      rememberSignInEmail("seeker", email);
      let alreadyOffered = false;
      try {
        alreadyOffered = Boolean(localStorage.getItem(`skipwait_passkey_enrolled_${cleanEmail}`) || localStorage.getItem(`skipwait_passkey_dismissed_${cleanEmail}`));
      } catch { /* storage restricted: offer again */ }
      if (passkeys.enabled && typeof window.PublicKeyCredential !== "undefined" && !alreadyOffered) { setStage("enroll"); return; }
      window.location.assign(returnTo);
    } catch { setError(NETWORK_MESSAGE); } finally { setBusy(false); }
  }

  if (stage === "enroll") {
    return <div data-testid="seeker-sign-in" className="mt-4"><PasskeyEnrollmentOffer enabled={passkeys.enabled} email={cleanEmail} returnTo={returnTo} /></div>;
  }

  if (stage === "code") {
    return (
      <form data-testid="seeker-sign-in" className="mt-4 grid gap-3" onSubmit={verify} noValidate>
        <p className="text-g-label text-g-ink">Code sent to <span className="break-all">{cleanEmail}</span></p>
        <GoalField label="Six-digit code" htmlFor="seeker-code" help="It can take a minute to arrive. Check spam if you do not see it.">
          <GoalTextInput id="seeker-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus placeholder="123456" value={code}
            onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} className="font-g-mono tracking-[0.3em]" />
        </GoalField>
        <FormError text={error} />
        {!online ? <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p> : null}
        <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Checking…" disabledReason={!online ? OFFLINE_REASON : code.length !== 6 ? "Enter the six-digit code" : undefined}>Sign in</GoalButton>
        <GoalButton type="button" variant="ghost" className="w-full" onClick={() => { setStage("email"); setCode(""); setError(""); }}>Use a different email</GoalButton>
      </form>
    );
  }

  return (
    <form data-testid="seeker-sign-in" className="mt-4 grid gap-3" onSubmit={send} noValidate>
      <PasskeyAutofill enabled={passkeys.enabled} returnTo={returnTo} />
      <GoalField label="Email address" htmlFor={SEEKER_EMAIL_FIELD_ID} help="We'll email you a six-digit code. New here? That creates your account.">
        <GoalTextInput id={SEEKER_EMAIL_FIELD_ID} name="email" type="email" placeholder="you@example.com" autoComplete={passkeys.enabled ? "username webauthn" : "email"} autoCapitalize="none" spellCheck={false} required value={email}
          onChange={event => { setEmail(event.target.value); setError(""); }} />
      </GoalField>
      {remembered ? (
        <button type="button" className="min-h-11 self-start text-g-meta text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:text-g-ink" onClick={() => { forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); document.getElementById(SEEKER_EMAIL_FIELD_ID)?.focus(); }}>Not you? Forget this email</button>
      ) : null}
      <FormError text={error} />
      {!online ? <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p> : null}
      <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Sending code…" disabledReason={!online ? OFFLINE_REASON : !cleanEmail ? "Enter your email" : undefined}>Send sign-in code</GoalButton>
      <div className="flex items-center gap-3 text-g-meta text-g-ink-3" aria-hidden="true"><span className="h-px flex-1 bg-g-hairline" />or<span className="h-px flex-1 bg-g-hairline" /></div>
      <PasskeySignInButton enabled={passkeys.enabled} returnTo={returnTo} />
      <div className="grid gap-2 gdesk:grid-cols-2">
        {GOAL_SEEKER_SOCIAL.map((item, index) => (
          <GoalButton key={item.id} type="button" variant="outline" className={`w-full border-g-control-edge${index === 0 ? " gdesk:col-span-2" : ""}`} onClick={() => window.location.assign(goalSeekerSocialUrl(item.id, returnTo))}>
            Continue with {item.label}
          </GoalButton>
        ))}
      </div>
    </form>
  );
}
