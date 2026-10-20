import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { passwordStepSchema } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import { referrerSignInHref } from "@/lib/referrerSignIn";

export type PasswordMode = "sign_in" | "sign_up";

export const LOCKED_SIGN_IN_HINT = "You can also use Forgot password, or continue with Google.";

type PasswordFormProps = {
  readonly mode: PasswordMode;
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  readonly returnTo: string;
  /** The server emailed a link (sign-up, or an address that must be confirmed first): show "check your email". */
  readonly onCheckEmail: (email: string, mode: PasswordMode) => void;
  readonly onBack: () => void;
};

/**
 * Seeker email + password on skipwait.me (D-049), in the kit's sign-in form layout (app/src/components/
 * sign-in-page.tsx). Sign-in sends the email and password and never applies the password rules (older WorkOS
 * passwords may be shorter). Creating an account asks only for the email (D-078 ruling 2): the emailed link sets
 * the password, with the rules, on /reset-password. Errors come back in plain words from the server.
 */
export function PasswordForm({ mode, email, onEmailChange, returnTo, onCheckEmail, onBack }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A referrer's work email is refused here; the way forward is the work-email code (D-030, D-049).
  const [workEmail, setWorkEmail] = useState(false);
  const creating = mode === "sign_up";
  const ready = email.trim() !== "" && (creating || password !== "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setWorkEmail(false);
    const normalized = email.trim().toLowerCase();
    const result = creating
      ? await postPasswordAuth("/api/auth/password/sign-up", { email: normalized }, passwordStepSchema)
      : await postPasswordAuth("/api/auth/password/sign-in", { email: normalized, password, returnTo }, passwordStepSchema);
    // S-8: a locked sign-in is never a dead end; a reset proves the inbox and lifts the lock.
    if (!result.ok) { setError(result.code === "rate_limited" && !creating ? `${result.message} ${LOCKED_SIGN_IN_HINT}` : result.message); setWorkEmail(result.code === "use_work_email_code"); setBusy(false); return; }
    // Stay busy while the browser leaves for the signed-in page, so the button cannot submit twice.
    if (result.data.step === "signed_in") { window.location.assign(result.data.redirectTo); return; }
    setBusy(false);
    onCheckEmail(normalized, mode);
  }

  return <form className="auth-form" data-testid="seeker-sign-in" onSubmit={event => { void submit(event); }} noValidate>
    <label htmlFor="seeker-email">Email address</label>
    <div className="auth-input"><Mail /><input id="seeker-email" name="email" type="email" inputMode="email" placeholder="you@example.com" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={event => { onEmailChange(event.target.value); setError(""); setWorkEmail(false); }} /></div>
    {creating
      ? <>
          <p className="text-xs leading-relaxed text-muted-foreground">We&apos;ll email you a link to set your password. It&apos;s how we know the address is yours.</p>
          {/* D-081: one static line for every address; it never says whether a given address has an account. */}
          <p className="text-xs leading-relaxed text-muted-foreground">Use a personal email address. Work emails at companies on skipwait.me sign in with a work-email code under Give a referral.</p>
        </>
      : <>
          <label htmlFor="seeker-password">Password</label>
          <div className="auth-input">
            <LockKeyhole />
            <input id="seeker-password" name="password" type={show ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); setError(""); setWorkEmail(false); }} />
            <Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff /> : <Eye />}</Button>
          </div>
          <div className="auth-form-meta"><Button type="button" variant="link" asChild><Link href="/forgot-password">Forgot password?</Link></Button></div>
        </>}
    {error ? <p role="alert" className="text-sm text-[#B91C1C]">{error}</p> : null}
    {/* A full page load, so /sign-in really opens on the referrer side (this form lives on /sign-in itself). */}
    {workEmail ? <p className="text-sm"><a href={referrerSignInHref()} className="py-2 font-semibold text-primary underline underline-offset-2">Sign in with your work-email code</a></p> : null}
    <Button type="submit" disabled={busy || !ready}>{busy ? (creating ? "Creating account…" : "Signing in…") : (creating ? "Create account" : "Sign in")} <ArrowRight /></Button>
    {/* D-078 ruling 8: the email code is retired; a code-only seeker sets a password through Forgot password. */}
    {creating ? null : <p className="text-xs leading-relaxed text-muted-foreground">Signed in with a code before? Use Forgot password to set one. It&apos;s the same account.</p>}
    <Button type="button" variant="ghost" onClick={onBack}>Use another method</Button>
  </form>;
}
