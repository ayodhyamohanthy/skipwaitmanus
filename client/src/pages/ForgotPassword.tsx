import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { EMAIL_PATTERN, passwordForgotAcceptedSchema } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";

/**
 * Seeker password reset request (D-049). SkipWait emails the link (D-078 ruling 6); the answer is the same whether or not the
 * email has an account, and it promises no fixed lifetime (WorkOS sets the expiry). Referrers have no password:
 * they sign in with a work-email code.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const normalized = email.trim().toLowerCase();
  const valid = normalized.length <= 320 && EMAIL_PATTERN.test(normalized);

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const result = await postPasswordAuth("/api/auth/password/forgot", { email: normalized }, passwordForgotAcceptedSchema);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setSentTo(normalized);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <main data-skipwait-screen="forgot-password" className="w-full max-w-md">
        <Link href="/" className="wordmark" aria-label="SkipWait home">
          SkipWait<span className="brand-dot">.</span>
        </Link>
        {!sentTo ? (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-[-.02em]">Set or reset your password</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Enter the email you sign in with. We&apos;ll send a link to set a new password.
            </p>
            <label className="mt-6 block text-sm font-medium">
              Email
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={event => { setEmail(event.target.value); setError(""); }}
                onKeyDown={event => {
                  if (event.key === "Enter" && valid) void send();
                }}
                className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4"
              />
            </label>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">
                {error}
              </p>
            ) : null}
            <button type="button" disabled={!valid || busy} onClick={() => void send()} className="brand-button mt-6 w-full disabled:cursor-not-allowed">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </section>
        ) : (
          <section className="mt-10 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--muted)]">
              <MailCheck className="size-8 text-[var(--primary)]" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold">Check your email.</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              If {sentTo} has a SkipWait account, we&apos;ve sent a link to set a new password. It can take a few minutes; check spam too.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              No email after a few minutes? Create an account with the same address; it joins your existing account.
            </p>
            <button type="button" onClick={() => setSentTo("")} className="brand-button-secondary mt-6">
              Use a different email
            </button>
          </section>
        )}
        <p className="mt-8 text-sm leading-6 text-[var(--muted-foreground)]">
          Give referrals? Referrers have no password: <Link href="/sign-in?intent=referrer" className="text-link">Sign in with your work email</Link>
        </p>
        <Link href="/sign-in" className="text-link mt-4 inline-flex min-h-11 items-center gap-1 text-sm">
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
