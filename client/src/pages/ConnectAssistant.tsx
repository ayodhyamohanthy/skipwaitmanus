import { Bot, Check, Clock, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

const PROVIDERS = ["chatgpt", "claude", "custom"] as const;
const PROVIDER_LABEL: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", custom: "this assistant" };

const CAN = [
  { label: "Search companies open to referrals", key: "read", locked: true },
  { label: "See your requests, alerts and replies", key: "read", locked: true },
  { label: "Draft asks for you to review", key: "draft", locked: false },
  { label: "Send an ask — only after you approve each one", key: "send", locked: false },
  { label: "Run paid tools — shows the credit cost, you approve first", key: "credits", locked: false },
] as const;

const NEVER = [
  "Accept, pass or refer on anyone's behalf",
  "See referrers' work emails or other people's data",
  "Skip the queue or go past your open-request limit",
  "Buy plans or credits",
] as const;

type Stage = "consent" | "approved" | "declined" | "expired" | "unverified" | "not-on-max" | "signed-out";

export default function ConnectAssistant() {
  const [location] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryString = location.split("?")[1] ?? "";
  const [stage, setStage] = useState<Stage>("consent");
  const [plan, setPlan] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>(["read", "draft"]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(queryString);
    if (query.get("state") === "expired") setStage("expired");
    else if (query.get("unverified") === "1") setStage("unverified");
  }, [queryString]);
  useEffect(() => {
    if (!isSignedIn) {
      setStage("signed-out");
      return;
    }
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/assistants/access", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ plan?: string }>(response, "");
        if (response.ok && typeof payload.plan === "string") setPlan(payload.plan);
        if (response.ok && payload.plan !== "max") setStage(current => (current === "consent" ? "not-on-max" : current));
      } catch { /* the consent screen still renders; the plan gate re-checks on approve */ }
    })();
  }, [isSignedIn, fetchToken]);

  const query = new URLSearchParams(queryString);
  const requestedProvider = PROVIDERS.includes((query.get("provider") ?? "") as (typeof PROVIDERS)[number]) ? (query.get("provider") as (typeof PROVIDERS)[number]) : "chatgpt";
  const provider = requestedProvider;
  const label = PROVIDER_LABEL[provider];

  const approve = async () => {
    if (working) return;
    setWorking(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/assistants/connections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ provider, appName: label, scopes: checked.length > 0 ? checked : ["read", "draft"] }),
      });
      const payload = await readApiJson<{ error?: string }>(response, "We could not connect this assistant");
      if (!response.ok) {
        if (response.status === 402) { setStage("not-on-max"); return; }
        throw new Error(payload.error || "We could not connect this assistant");
      }
      setStage("approved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not connect this assistant");
    } finally {
      setWorking(false);
    }
  };

  const toggle = (key: string, locked: boolean) => {
    if (locked) return;
    setChecked(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));
  };

  return (
    <main data-skipwait-screen="connect-assistant" className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:py-14">
      <Link href="/" className="wordmark mb-6 inline-block text-xl">SkipWait<span className="brand-dot">.</span></Link>

      {stage === "signed-out" ? (
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl sm:p-8">
          <Bot className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Sign in to connect {label}</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">You&apos;ll come straight back here after signing in.</p>
          <div className="mt-5"><SignInButton><button type="button" className="brand-button w-full">Sign in to SkipWait</button></SignInButton></div>
        </section>
      ) : null}

      {stage === "not-on-max" ? (
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl sm:p-8">
          <ShieldCheck className="mx-auto size-8 text-[var(--primary)]" />
          <h1 className="mt-3 text-2xl font-semibold">Assistants need Max</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Signing in, connecting and applying through ChatGPT, Claude, bots or your own tools is part of Max.</p>
          <div className="mt-5 grid gap-2">
            <Link href="/plans" className="brand-button w-full">Upgrade to Max</Link>
            <Link href="/explore" className="inline-flex min-h-12 items-center justify-center rounded-xl text-sm font-semibold">Keep using SkipWait yourself</Link>
          </div>
        </section>
      ) : null}

      {stage === "consent" ? (
        <>
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-[var(--muted)]"><Bot className="size-7" /></span>
            <span className="text-2xl text-[var(--muted-foreground)]">→</span>
            <span className="grid size-14 place-items-center rounded-2xl bg-[var(--primary)] text-xl font-bold text-[var(--primary-foreground)]">S</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Connect {label} to SkipWait</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">{label} will be able to use SkipWait as <strong className="text-[var(--foreground)]">you</strong>.</p>
          {error ? <p role="alert" className="mt-3 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm">{error}</p> : null}
          <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-semibold">It can</h2>
            <ul className="mt-2">
              {CAN.map(item => (
                <li key={`${item.label}-${item.key}`}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-[var(--border)] py-2 last:border-0">
                    <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked.includes(item.key)} disabled={item.locked} onChange={() => toggle(item.key, item.locked)} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-3 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-5">
            <h2 className="font-semibold">It can never</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {NEVER.map(item => (
                <li key={item} className="flex gap-2"><X className="size-4 shrink-0 text-[var(--destructive)]" />{item}</li>
              ))}
            </ul>
          </section>
          <p className="mt-4 flex gap-2 text-xs text-[var(--muted-foreground)]"><Lock className="size-4 shrink-0" />Asks it sends show “Sent with {label}” to the referrer. You can disconnect anytime in Settings → Connected assistants.</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setStage("declined")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-semibold">Cancel connection</button>
            <button type="button" disabled={working} onClick={() => { void approve(); }} className="brand-button inline-flex min-h-12 items-center justify-center gap-1">{working ? "Connecting…" : "Approve"}</button>
          </div>
        </>
      ) : null}

      {stage === "unverified" ? (
        <section className="rounded-[2rem] border border-[var(--destructive)]/40 bg-[var(--card)] p-6 shadow-xl sm:p-8">
          <ShieldAlert className="size-8 text-[var(--destructive)]" />
          <h1 className="mt-3 text-2xl font-semibold">This app isn&apos;t verified by SkipWait</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">It connected through the open MCP link. It can only read and draft until it&apos;s verified. Only continue if you trust it.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setStage("declined")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-semibold">Cancel</button>
            <button type="button" onClick={() => { setChecked(["read", "draft"]); void approve(); }} className="brand-button inline-flex min-h-12 items-center justify-center">Continue, read &amp; draft only</button>
          </div>
        </section>
      ) : null}

      {stage === "expired" ? (
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl sm:p-8">
          <Clock className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">This link has expired</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Go back to {label} and start the connection again. It takes a few seconds.</p>
        </section>
      ) : null}

      {stage === "approved" ? (
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl sm:p-8">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--primary)]/10"><Check className="size-8 text-[var(--primary)]" /></span>
          <h1 className="mt-3 text-2xl font-semibold">{label} is connected</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Taking you back to {label}…</p>
          <Link href="/assistants" className="brand-button mt-5 inline-block">Manage assistants</Link>
        </section>
      ) : null}

      {stage === "declined" ? (
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl sm:p-8">
          <ShieldAlert className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Connection cancelled</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{label} has no access to your SkipWait account.</p>
        </section>
      ) : null}
    </main>
  );
}
