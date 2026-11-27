// D-406: the seeker's default sign-in. Enter any email, get one email with a six-digit code and a one-click link;
// either signs in (a new address creates the account). Password, passkeys and social stay one tap away.
import { CircleAlert, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { PasskeyAutofill } from "@/components/goal/GoalPasskeySignIn";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { apiFetch } from "@/lib/apiFetch";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { EMAIL_LINK_VERIFY_PATH } from "@shared/emailSignIn";

export const SEND_PATH = "/api/auth/workos/email-code/send";
const OFFLINE_REASON = "You are offline. Reconnect to sign in.";

function FormError({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{text}
    </p>
  ) : null;
}

async function postJson(path: string, payload: object): Promise<{ ok: boolean; status: number; body: { sent?: boolean; signedIn?: boolean; error?: string; code?: string } }> {
  const res = await apiFetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

export function GoalSeekerEmailCode({ returnTo, emailFieldId, passkeysEnabled, onUsePassword }: { returnTo: string; emailFieldId: string; passkeysEnabled: boolean; onUsePassword: () => void }) {
  const online = useOnlineStatus();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(() => rememberedSignInEmail("seeker"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("seeker") !== "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workEmail, setWorkEmail] = useState(false);
  const cleanEmail = email.trim().toLowerCase();

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !cleanEmail || !online) return;
    setBusy(true); setError(""); setWorkEmail(false);
    try {
      const result = await postJson(SEND_PATH, { email: cleanEmail });
      if (result.ok && result.body.sent) { setStage("code"); setCode(""); }
      else { setError(result.body.error || "We could not send the email. Try again shortly."); setWorkEmail(result.body.code === "use_work_email_code"); }
    } catch { setError("We could not send the email. Check your connection and try again."); }
    setBusy(false);
  }

  async function verify(event?: FormEvent) {
    event?.preventDefault();
    if (busy || code.length !== 6 || !online) return;
    setBusy(true); setError("");
    try {
      const result = await postJson(EMAIL_LINK_VERIFY_PATH.s, { email: cleanEmail, code });
      if (result.ok && result.body.signedIn) { rememberSignInEmail("seeker", email); window.location.assign(returnTo); return; }
      setError(result.body.error || "That code could not be verified. Check the latest email and try again.");
    } catch { setError("We could not sign you in. Check your connection and try again."); }
    setBusy(false);
  }

  if (stage === "code") {
    return (
      <form data-testid="seeker-email-code" className="mt-4 grid gap-3" onSubmit={verify} noValidate>
        <p className="flex items-center gap-2 text-g-label font-semibold text-g-ink"><MailCheck className="size-4 text-g-emerald" aria-hidden="true" />Check your email</p>
        <p className="text-g-meta leading-relaxed text-g-ink-2">
          We sent a sign-in link and a six-digit code to <strong className="break-all text-g-ink">{cleanEmail}</strong>. Tap the link, or enter the code here. Both work once, for 10 minutes. Check spam too.
        </p>
        <GoalField label="Six-digit code" htmlFor="seeker-email-code-input">
          <GoalTextInput id="seeker-email-code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus placeholder="123456"
            value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} className="font-semibold tracking-[.3em]" />
        </GoalField>
        <FormError text={error} />
        <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Signing in…"
          disabledReason={!online ? OFFLINE_REASON : code.length === 6 ? undefined : "Enter the six-digit code from your email"}>Sign in</GoalButton>
        <div className="flex flex-wrap justify-between gap-2">
          <GoalButton type="button" variant="ghost" onClick={() => { void send(); }}>Send a new email</GoalButton>
          <GoalButton type="button" variant="ghost" onClick={() => { setStage("email"); setCode(""); setError(""); }}>Use a different email</GoalButton>
        </div>
      </form>
    );
  }

  return (
    <form data-testid="seeker-sign-in" className="mt-4 grid gap-3" onSubmit={send} noValidate>
      <PasskeyAutofill enabled={passkeysEnabled} returnTo={returnTo} />
      <GoalField label="Email address" htmlFor={emailFieldId} help="We'll email you a sign-in link and a code. New here? This creates your free account.">
        <GoalTextInput id={emailFieldId} name="email" type="email" placeholder="you@example.com" autoComplete={passkeysEnabled ? "username webauthn" : "email"} autoCapitalize="none" spellCheck={false} required
          value={email} onChange={event => { setEmail(event.target.value); setError(""); setWorkEmail(false); }} />
      </GoalField>
      {remembered ? (
        <button type="button" className="min-h-11 self-start text-g-meta text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:text-g-ink"
          onClick={() => { forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); document.getElementById(emailFieldId)?.focus(); }}>
          Not you? Forget this email
        </button>
      ) : null}
      <FormError text={error} />
      {workEmail ? <p className="text-g-meta text-g-crimson"><a href={referrerSignInHref()} className="underline underline-offset-[3px]">Sign in with your work-email code</a></p> : null}
      {!online ? <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p> : null}
      <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Sending…"
        disabledReason={!online ? OFFLINE_REASON : cleanEmail ? undefined : "Enter your email"}>Email me a sign-in link</GoalButton>
      <button type="button" className="min-h-11 text-center text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink" onClick={onUsePassword}>
        Use a password instead
      </button>
    </form>
  );
}
