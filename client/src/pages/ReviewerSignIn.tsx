import { useEffect, useState } from "react";

/** Unlinked sign-in for review accounts (Razorpay website review, our own QA). Hidden from search; the server route is off unless enabled. */
export default function ReviewerSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reviewer/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(typeof body.error === "string" ? body.error : "We could not sign in."); setBusy(false); return; }
      window.location.assign(typeof body.redirectTo === "string" && body.redirectTo.startsWith("/") ? body.redirectTo : "/plans");
    } catch { setError("We could not sign in."); setBusy(false); }
  }
  const field = "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 focus:border-neutral-900 focus:outline-none";
  return <main data-skipwait-screen="reviewer-sign-in" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
    <p className="text-sm font-semibold text-neutral-900">SkipWait.me</p>
    <h1 className="mt-2 text-3xl font-semibold text-neutral-900">Review account sign-in</h1>
    <p className="mt-2 text-sm text-neutral-600">For website and payment review. These accounts hold demo data only.</p>
    <form onSubmit={submit} className="mt-6" noValidate>
      <label className="block text-sm font-medium text-neutral-900">Email
        <input className={field} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="mt-4 block text-sm font-medium text-neutral-900">Password
        <input className={field} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {error ? <p role="alert" className="mt-3 text-sm text-neutral-900">{error}</p> : null}
      <button type="submit" disabled={busy || !email || !password} className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">{busy ? "Signing in" : "Sign in"}</button>
    </form>
  </main>;
}
