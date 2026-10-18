import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { passwordPolicyChecks, passwordResetConfirmSuccessSchema, resetTokenSchema, type PasswordResetConfirmSuccess } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";

function tokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

/**
 * Seeker password reset (D-049), from the link WorkOS emails. WorkOS checks the token and sets the password;
 * this page says "You're signed in" only when the server actually signed this browser in. No request is made
 * before the person submits: WorkOS is the only judge of the token.
 */
export default function ResetPassword() {
  const [token] = useState(tokenFromUrl);
  const [linkValid, setLinkValid] = useState(() => resetTokenSchema.safeParse(token).success);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<PasswordResetConfirmSuccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rules = passwordPolicyChecks(password, confirm);
  const ok = rules.every(rule => rule.passed);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    const result = await postPasswordAuth("/api/auth/password/reset/confirm", { token, password, confirm }, passwordResetConfirmSuccessSchema);
    setBusy(false);
    if (result.ok) { setDone(result.data); return; }
    if (result.code === "expired" || result.code === "invalid_input") { setLinkValid(false); return; }
    setError(result.message);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <main data-skipwait-screen="reset-password" className="w-full max-w-md">
        <Link href="/" className="wordmark" aria-label="SkipWait home">
          SkipWait<span className="brand-dot">.</span>
        </Link>
        {!linkValid ? (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-[-.02em]">This link has expired.</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Reset links work once and expire after a while. Request a new one.</p>
            <Link href="/forgot-password" className="brand-button mt-6 w-full">
              Send a new link
            </Link>
          </section>
        ) : done ? (
          <section className="mt-10 text-center">
            <Check className="mx-auto size-12 text-[var(--primary)]" />
            <h1 className="mt-4 text-2xl font-semibold">Password updated.</h1>
            {done.signedIn ? (
              <>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">You&apos;re signed in. Other devices were signed out for safety.</p>
                {/* A full page load, so the app starts with the new session instead of the signed-out one it rendered. */}
                <a href={done.redirectTo} className="brand-button mt-6 w-full">
                  Continue
                </a>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Sign in to continue.</p>
                <Link href={done.redirectTo} className="brand-button mt-6 w-full">
                  Sign in
                </Link>
              </>
            )}
          </section>
        ) : (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-[-.02em]">Set a new password</h1>
            <label className="mt-6 block text-sm font-medium">
              New password
              <span className="relative block">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={event => { setPassword(event.target.value); setError(""); }}
                  className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 pr-12"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(value => !value)}
                  className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center"
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </label>
            <label className="mt-4 block text-sm font-medium">
              Confirm password
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={event => { setConfirm(event.target.value); setError(""); }}
                className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4"
              />
            </label>
            <ul className="mt-4 space-y-1 text-sm">
              {rules.map(rule => (
                <li key={rule.label} className={`flex items-center gap-2 ${rule.passed ? "" : "text-[var(--muted-foreground)]"}`}>
                  {rule.passed ? <Check className="size-4 text-[var(--primary)]" /> : <Circle className="size-4" />}
                  {rule.label}
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">
                {error}
              </p>
            ) : null}
            <button type="button" disabled={!ok || busy} onClick={() => void submit()} className="brand-button mt-6 w-full disabled:cursor-not-allowed">
              {busy ? "Updating…" : "Update password"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
