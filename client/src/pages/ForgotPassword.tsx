import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "We could not send the link. Try again.");
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send the link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <main data-skipwait-screen="forgot-password" className="w-full max-w-md">
        <Link href="/" className="wordmark" aria-label="SkipWait home">
          SkipWait<span className="brand-dot">.</span>
        </Link>
        {!sent ? (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-[-.02em]">Forgot your password?</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Enter your account email. We&apos;ll send a link to set a new one.
            </p>
            <label className="mt-6 block text-sm font-medium">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
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
              If an account exists for <strong className="break-all text-[var(--foreground)]">{email}</strong>, a reset link is on
              its way. It works for 1 hour.
            </p>
            <button type="button" onClick={() => setSent(false)} className="brand-button-secondary mt-6">
              Use a different email
            </button>
          </section>
        )}
        <Link href="/sign-in" className="text-link mt-8 inline-flex min-h-11 items-center gap-1 text-sm">
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
