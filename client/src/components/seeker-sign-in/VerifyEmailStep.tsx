import { ArrowRight } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/kit/button";
import { PASSWORD_AUTH_COPY, passwordStepSchema } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import type { PasswordMode } from "./PasswordForm";

/** Matches the server's resend cooldown (server/_core/passwordLimits.ts). */
const RESEND_COOLDOWN_SECONDS = 30;

type VerifyEmailStepProps = { readonly email: string; readonly origin: PasswordMode; readonly onBack: () => void };

/**
 * WorkOS emails a six-digit code (free for SkipWait) before the first password session for an email; the
 * pending sign-in itself lives in an HttpOnly cookie, so this step only sends the code. A code was just sent
 * when this step appears, so the resend button starts on its cooldown.
 */
export function VerifyEmailStep({ email, origin, onBack }: VerifyEmailStepProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await postPasswordAuth("/api/auth/password/verify-email", { code }, passwordStepSchema);
    if (result.ok && result.data.step === "signed_in") { window.location.assign(result.data.redirectTo); return; }
    setBusy(false);
    setError(result.ok ? PASSWORD_AUTH_COPY.temporarily_unavailable : result.message);
  }

  async function resend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError("");
    setNotice("");
    const result = await postPasswordAuth("/api/auth/password/verify-email/resend", {}, passwordStepSchema);
    setResending(false);
    if (!result.ok) {
      setError(result.message);
      if (result.retryAfterSeconds) setCooldown(Math.min(result.retryAfterSeconds, 3600));
      return;
    }
    setNotice("We sent a new code. Use the newest email.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return <form className="auth-form" data-testid="seeker-verify-email" onSubmit={event => { void verify(event); }}>
    <p className="text-sm font-semibold">Check your email</p>
    <p className="text-xs leading-relaxed text-muted-foreground">We sent a six-digit code to <strong className="break-all text-foreground">{email}</strong>. It can take a minute to arrive, so check spam too.</p>
    {origin === "sign_up" ? <p className="text-xs leading-relaxed text-muted-foreground">If this email already had a SkipWait account, we sent a password reset link instead.</p> : null}
    <label htmlFor="seeker-verify-code">Six-digit code</label>
    <div className="auth-input"><input id="seeker-verify-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} /></div>
    {error ? <p role="alert" className="text-sm text-[#B91C1C]">{error}</p> : null}
    {notice ? <p role="status" className="text-xs text-muted-foreground">{notice}</p> : null}
    <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and continue"} <ArrowRight /></Button>
    <Button type="button" variant="ghost" disabled={resending || cooldown > 0} onClick={() => { void resend(); }}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : resending ? "Sending…" : "Send a new code"}</Button>
    <Button type="button" variant="ghost" onClick={onBack}>Use a different email</Button>
  </form>;
}
