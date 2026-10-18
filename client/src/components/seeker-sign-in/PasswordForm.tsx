import { ArrowRight, Check, Circle, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { passwordPolicyChecks, passwordStepSchema } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";

export type PasswordMode = "sign_in" | "sign_up";

type PasswordFormProps = {
  readonly mode: PasswordMode;
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  readonly returnTo: string;
  /** WorkOS needs the email confirmed with a six-digit code before a session is issued. */
  readonly onVerify: (email: string, mode: PasswordMode) => void;
  readonly onBack: () => void;
};

/**
 * Seeker email + password on skipwait.me (D-049), in the kit's sign-in form layout (app/src/components/
 * sign-in-page.tsx). Sign-in never applies the password rules (older WorkOS passwords may be shorter);
 * creating an account shows them live and waits for them. Errors come back in plain words from the server.
 */
export function PasswordForm({ mode, email, onEmailChange, returnTo, onVerify, onBack }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = mode === "sign_up";
  const rules = passwordPolicyChecks(password, password).slice(0, 2);
  const ready = email.trim() !== "" && password !== "" && (!creating || rules.every(rule => rule.passed));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const normalized = email.trim().toLowerCase();
    const result = await postPasswordAuth(creating ? "/api/auth/password/sign-up" : "/api/auth/password/sign-in", { email: normalized, password, returnTo }, passwordStepSchema);
    if (!result.ok) { setError(result.message); setBusy(false); return; }
    // Stay busy while the browser leaves for the signed-in page, so the button cannot submit twice.
    if (result.data.step === "signed_in") { window.location.assign(result.data.redirectTo); return; }
    setBusy(false);
    onVerify(normalized, mode);
  }

  return <form className="auth-form" data-testid="seeker-sign-in" onSubmit={event => { void submit(event); }} noValidate>
    <label htmlFor="seeker-email">Email address</label>
    <div className="auth-input"><Mail /><input id="seeker-email" name="email" type="email" inputMode="email" placeholder="you@example.com" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={event => { onEmailChange(event.target.value); setError(""); }} /></div>
    <label htmlFor="seeker-password">Password</label>
    <div className="auth-input">
      <LockKeyhole />
      <input id="seeker-password" name="password" type={show ? "text" : "password"} placeholder={creating ? "Create a password" : "Enter your password"} autoComplete={creating ? "new-password" : "current-password"} required value={password} aria-describedby={creating ? "seeker-password-rules" : undefined} onChange={event => { setPassword(event.target.value); setError(""); }} />
      <Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff /> : <Eye />}</Button>
    </div>
    {creating
      ? <ul id="seeker-password-rules" className="grid gap-1 text-xs" aria-live="polite">{rules.map(rule => <li key={rule.label} className={`flex items-center gap-2 ${rule.passed ? "" : "text-muted-foreground"}`}>{rule.passed ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}{rule.label}</li>)}</ul>
      : <div className="auth-form-meta"><Button type="button" variant="link" asChild><Link href="/forgot-password">Forgot password?</Link></Button></div>}
    {error ? <p role="alert" className="text-sm text-[#B91C1C]">{error}</p> : null}
    <Button type="submit" disabled={busy || !ready}>{busy ? (creating ? "Creating account…" : "Signing in…") : (creating ? "Create account" : "Sign in")} <ArrowRight /></Button>
    {creating ? null : <p className="text-xs leading-relaxed text-muted-foreground">Signed in with a code before? Create a password with the same email — it’s the same account.</p>}
    <Button type="button" variant="ghost" onClick={onBack}>Use another method</Button>
  </form>;
}
