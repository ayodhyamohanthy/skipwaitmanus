import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

function tokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [linkValid, setLinkValid] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = tokenFromUrl();
    setToken(current);
    if (!current) {
      setLinkValid(false);
      setChecking(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/auth/password/reset/verify?token=${encodeURIComponent(current)}`, { credentials: "include" });
        const payload = (await response.json().catch(() => ({}))) as { valid?: boolean };
        if (active) setLinkValid(response.ok && payload.valid === true);
      } catch {
        if (active) setLinkValid(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const rules = [
    ["At least 10 characters", password.length >= 10],
    ["A number or symbol", /[\d\W]/.test(password)],
    ["Passwords match", password.length > 0 && password === confirm],
  ] as const;
  const ok = rules.every(rule => rule[1]);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password, confirm }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!response.ok) {
        if (payload.code === "expired" || payload.code === "consumed") setLinkValid(false);
        throw new Error(payload.error ?? "We could not update the password.");
      }
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not update the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <main data-skipwait-screen="reset-password" className="w-full max-w-md">
        <Link href="/" className="wordmark" aria-label="SkipWait home">
          SkipWait<span className="brand-dot">.</span>
        </Link>
        {checking ? (
          <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Checking this link…</p>
        ) : !linkValid ? (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-[-.02em]">This link has expired.</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Reset links work for 1 hour, once. Request a new one.</p>
            <Link href="/forgot-password" className="brand-button mt-6 w-full">
              Send a new link
            </Link>
          </section>
        ) : done ? (
          <section className="mt-10 text-center">
            <Check className="mx-auto size-12 text-[var(--primary)]" />
            <h1 className="mt-4 text-2xl font-semibold">Password updated.</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              You&apos;re signed in. Other devices were signed out for safety.
            </p>
            <Link href="/explore" className="brand-button mt-6 w-full">
              Continue
            </Link>
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
                  onChange={event => setPassword(event.target.value)}
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
                onChange={event => setConfirm(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4"
              />
            </label>
            <ul className="mt-4 space-y-1 text-sm">
              {rules.map(([label, passed]) => (
                <li key={label} className={`flex items-center gap-2 ${passed ? "" : "text-[var(--muted-foreground)]"}`}>
                  {passed ? <Check className="size-4 text-[var(--primary)]" /> : <Circle className="size-4" />}
                  {label}
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
