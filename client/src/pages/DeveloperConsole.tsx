import { AppWindow, BadgeCheck, Bot, Clock, Copy, Plus, ShieldAlert, Webhook } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { DEVELOPER_APP_REVIEW_SCOPES } from "@shared/assistant";

type DeveloperApp = {
  id: number;
  name: string;
  kind: "web_app" | "agent_mcp" | "server_integration";
  description: string;
  website: string | null;
  redirectUrls: string[];
  scopes: string[];
  status: "test" | "in_review" | "live" | "rejected" | "suspended";
  rejectReasons: string[];
  webhookUrl: string | null;
  clientId: string;
  createdAt: string;
};

const KINDS = [
  { key: "web_app", label: "Web or mobile app", description: "Job trackers, career tools, ATS-like apps", Icon: AppWindow },
  { key: "agent_mcp", label: "AI agent or MCP client", description: "Assistants that apply on a user's behalf", Icon: Bot },
  { key: "server_integration", label: "Server integration", description: "Back-office sync with webhooks", Icon: Webhook },
] as const;

const ALL_SCOPES = [
  { key: "companies:read", label: "Search companies open to referrals" },
  { key: "requests:read", label: "Read the user's requests and replies" },
  { key: "asks:draft", label: "Create draft asks" },
  { key: "asks:send", label: "Send asks — user approves each one in SkipWait" },
  { key: "profile:read", label: "Basic profile and resume (with user consent)" },
  { key: "credits:spend", label: "Run paid tools — user approves cost each time" },
  { key: "webhooks", label: "Accepted / passed / message events" },
] as const;

const KIND_LABEL: Record<string, string> = { web_app: "Web or mobile app", agent_mcp: "AI agent or MCP client", server_integration: "Server integration" };
const STATUS_META: Record<string, { label: string; Icon: typeof Clock; tone: string }> = {
  test: { label: "Test", Icon: Clock, tone: "bg-[var(--muted)] text-[var(--muted-foreground)]" },
  in_review: { label: "In review", Icon: Clock, tone: "bg-[var(--primary)]/10 text-[var(--primary)]" },
  live: { label: "Live", Icon: BadgeCheck, tone: "bg-[var(--primary)]/10 text-[var(--primary)]" },
  rejected: { label: "Rejected", Icon: ShieldAlert, tone: "bg-[var(--destructive)]/10 text-[var(--destructive)]" },
  suspended: { label: "Suspended", Icon: ShieldAlert, tone: "bg-[var(--destructive)]/10 text-[var(--destructive)]" },
};

export default function DeveloperConsole() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [view, setView] = useState<"list" | "new" | "details">("list");
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [selected, setSelected] = useState<DeveloperApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("web_app");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [redirectUrls, setRedirectUrls] = useState("");
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<string[]>(["companies:read", "requests:read", "asks:draft"]);
  const [agreed, setAgreed] = useState(true);
  const [webhook, setWebhook] = useState("");

  const headers = useCallback(async () => {
    const token = await fetchToken();
    return { credentials: "include" as const, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/developer-apps", await headers());
      const payload = await readApiJson<{ apps?: DeveloperApp[]; error?: string }>(response, "We could not load your apps");
      if (!response.ok) throw new Error(payload.error || "We could not load your apps");
      setApps(Array.isArray(payload.apps) ? payload.apps : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not load your apps");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, headers]);

  useEffect(() => { void load(); }, [load]);

  const createApp = async () => {
    if (working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/developer-apps", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await headers()).headers },
        body: JSON.stringify({
          name, kind, description,
          website: website.trim() || undefined,
          redirectUrls: redirectUrls.split(/[\n,]/).map(url => url.trim()).filter(Boolean),
          scopes, agreeToTerms: agreed,
        }),
      });
      const payload = await readApiJson<{ app?: DeveloperApp; error?: string }>(response, "We could not register this app");
      if (!response.ok || !payload.app) throw new Error(payload.error || "We could not register this app");
      setSelected(payload.app);
      setView("details");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not register this app");
    } finally {
      setWorking(false);
    }
  };

  const saveWebhook = async () => {
    if (!selected || working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/developer-apps/${selected.id}/webhook`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await headers()).headers },
        body: JSON.stringify({ webhookUrl: webhook.trim() || "" }),
      });
      const payload = await readApiJson<{ webhookUrl?: string | null; error?: string }>(response, "We could not save that webhook");
      if (!response.ok) throw new Error(payload.error || "We could not save that webhook");
      setSelected({ ...selected, webhookUrl: payload.webhookUrl ?? null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not save that webhook");
    } finally {
      setWorking(false);
    }
  };

  const submitForReview = async () => {
    if (!selected || working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/developer-apps/${selected.id}/submit`, { method: "POST", ...(await headers()) });
      const payload = await readApiJson<{ app?: { status: string }; error?: string }>(response, "We could not submit this app");
      if (!response.ok) throw new Error(payload.error || "We could not submit this app");
      setSelected({ ...selected, status: "in_review" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not submit this app");
    } finally {
      setWorking(false);
    }
  };

  const resetForm = () => {
    setKind("web_app"); setName(""); setWebsite(""); setRedirectUrls(""); setDescription("");
    setScopes(["companies:read", "requests:read", "asks:draft"]); setAgreed(true); setError("");
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="developer-console" className="mx-auto max-w-3xl px-4 pb-20">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span> <small className="font-mono text-xs text-[var(--muted-foreground)]">developers</small></Link>
        </header>
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
          <Bot className="mx-auto mb-3 size-8" />
          <h1 className="text-lg font-semibold">Sign in to the developer console</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Register your app, agent or MCP client.</p>
          <div className="mt-4"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
        </section>
      </main>
    );
  }

  return (
    <div data-skipwait-screen="developer-console" className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/developers" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span> <small className="font-mono text-xs text-[var(--muted-foreground)]">developers</small></Link>
        <Link href="/settings" className="text-sm text-[var(--muted-foreground)]">Account</Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20">
        {view === "list" ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold">Your apps</h1>
                <p className="mt-1 text-[var(--muted-foreground)]">Let your users find companies and apply for referrals without leaving your product.</p>
              </div>
              <button type="button" onClick={() => { resetForm(); setView("new"); }} className="brand-button inline-flex items-center gap-1"><Plus className="size-4" />New app</button>
            </div>
            {loading ? <div className="mt-6"><LoadingSkeleton title="Loading your apps…" caption="Checking the developer console." /></div> : null}
            {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error} <button type="button" className="font-bold underline" onClick={() => { void load(); }}>Try again</button></p> : null}
            {!loading && !error && apps.length === 0 ? (
              <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
                <AppWindow className="mx-auto mb-3 size-8" />
                <h2 className="text-lg font-semibold">No apps yet</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Register an app to let its users search and apply for referrals.</p>
              </section>
            ) : null}
            {!loading && !error && apps.length > 0 ? (
              <ul className="mt-6 grid gap-3">
                {apps.map(app => {
                  const meta = STATUS_META[app.status] ?? STATUS_META.test;
                  return (
                    <li key={app.id}>
                      <button type="button" onClick={() => { setSelected(app); setWebhook(app.webhookUrl ?? ""); setView("details"); }} className="w-full text-left">
                        <span className="flex items-center gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--primary)]">
                          <span className="grid size-11 place-items-center rounded-xl bg-[var(--muted)]"><Bot className="size-5" /></span>
                          <span className="min-w-0 flex-1">
                            <strong className="block">{app.name}</strong>
                            <small className="text-[var(--muted-foreground)]">{KIND_LABEL[app.kind]} · {app.status === "test" ? "Test mode" : meta.label}</small>
                          </span>
                          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${meta.tone}`}><meta.Icon className="size-3.5" />{meta.label}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}

        {view === "new" ? (
          <>
            <h1 className="text-3xl font-semibold">Register an app</h1>
            {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error}</p> : null}
            <fieldset className="mt-6">
              <legend className="font-semibold">What are you building?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {KINDS.map(option => (
                  <button key={option.key} type="button" onClick={() => setKind(option.key)} aria-pressed={kind === option.key} className={`rounded-2xl border p-4 text-left ${kind === option.key ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                    <option.Icon className="mb-2 size-5" />
                    <strong className="block text-sm">{option.label}</strong>
                    <small className="text-[var(--muted-foreground)]">{option.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">App name
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Instinct" className="mt-1 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
              </label>
              <label className="text-sm font-medium">Website
                <input value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://instinct.app" className="mt-1 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Redirect URLs
                <input value={redirectUrls} onChange={event => setRedirectUrls(event.target.value)} placeholder="https://instinct.app/oauth/skipwait" className="mt-1 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">What does your app do for job seekers?
                <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Shown to users on the approval screen" className="mt-1 min-h-24 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] p-4 text-base" />
              </label>
            </div>
            {kind === "agent_mcp" ? (
              <p className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm">MCP clients can also connect with no registration through <code className="rounded bg-[var(--background)] px-1">skipwait.me/mcp</code> (dynamic registration). Registering gets you a verified badge, your logo on the approval screen and higher limits.</p>
            ) : null}
            <fieldset className="mt-6">
              <legend className="font-semibold">Permissions</legend>
              <p className="text-sm text-[var(--muted-foreground)]">Ask only for what you need. Items marked review are checked by our team.</p>
              <ul className="mt-2">
                {ALL_SCOPES.map(scope => (
                  <li key={scope.key}>
                    <label className="flex min-h-12 items-center gap-3 border-b border-[var(--border)] py-2">
                      <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={scopes.includes(scope.key)} onChange={() => setScopes(current => (current.includes(scope.key) ? current.filter(item => item !== scope.key) : [...current, scope.key]))} />
                      <span className="flex-1"><code className="text-xs">{scope.key}</code><small className="block text-[var(--muted-foreground)]">{scope.label}</small></span>
                      {DEVELOPER_APP_REVIEW_SCOPES.includes(scope.key) ? <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)]">review</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <label className="mt-4 flex gap-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
              I agree to the developer terms: no bulk asks, no selling user data, no automating referrer decisions, show users what is sent.
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setView("list")} className="inline-flex min-h-12 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={working || !name.trim() || !description.trim() || !agreed} onClick={() => { void createApp(); }} className="brand-button inline-flex min-h-12 items-center px-4">{working ? "Registering…" : "Create app"}</button>
            </div>
          </>
        ) : null}

        {view === "details" && selected ? (
          <>
            <h1 className="flex items-center gap-2 text-3xl font-semibold">{selected.name} {selected.status === "live" ? <BadgeCheck className="text-[var(--primary)]" /> : null}</h1>
            <p className="text-[var(--muted-foreground)]">{KIND_LABEL[selected.kind]} · {STATUS_META[selected.status]?.label ?? selected.status}</p>
            {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error}</p> : null}

            {selected.status === "in_review" ? (
              <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
                <Clock className="mx-auto size-8" />
                <h2 className="mt-3 text-2xl font-semibold">{selected.name} is in review</h2>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">Test mode works now for up to 10 test users. Review for send and profile permissions usually takes 2–5 business days.</p>
              </section>
            ) : null}

            {selected.status === "rejected" ? (
              <section className="mt-6 rounded-3xl border border-[var(--destructive)]/40 bg-[var(--card)] p-6">
                <ShieldAlert className="size-8 text-[var(--destructive)]" />
                <h2 className="mt-3 text-2xl font-semibold">Changes needed</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {selected.rejectReasons.length > 0 ? selected.rejectReasons.map(reason => <li key={reason}>{reason}</li>) : <li>Our team asked for changes. Check your email for details.</li>}
                </ul>
                <button type="button" onClick={() => { resetForm(); setView("new"); }} className="brand-button mt-4 inline-block">Edit and resubmit</button>
              </section>
            ) : null}

            {selected.status === "suspended" ? (
              <section className="mt-6 rounded-3xl border border-[var(--destructive)]/40 bg-[var(--card)] p-6">
                <ShieldAlert className="size-8 text-[var(--destructive)]" />
                <h2 className="mt-3 text-2xl font-semibold">App suspended</h2>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">Referrers reported repeated asks sent through your app. Connected users have been notified. Reply to the safety team to appeal.</p>
                <Link href="/help" className="brand-button mt-4 inline-block">Contact safety team</Link>
              </section>
            ) : null}

            {selected.status === "test" || selected.status === "rejected" ? (
              <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
                <p className="text-sm text-[var(--muted-foreground)]">Test mode works now for up to 10 test users.</p>
                <button type="button" disabled={working} onClick={() => { void submitForReview(); }} className="brand-button mt-4 inline-flex items-center gap-1"><BadgeCheck className="size-4" />Submit for review</button>
              </section>
            ) : null}

            <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="font-semibold">Credentials</h2>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <small className="text-[var(--muted-foreground)]">Client ID</small>
                  <div className="mt-1 flex gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2">{selected.clientId}</code>
                    <button type="button" onClick={async () => { try { await navigator.clipboard?.writeText(selected.clientId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } }} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-sm"><Copy className="size-4" />{copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
                <div>
                  <small className="text-[var(--muted-foreground)]">Client secret</small>
                  <div className="mt-1 flex gap-2">
                    <code className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2">••••••••••••</code>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[["Connected users", "Shown once live"], ["Asks sent via app", "Shown once live"], ["Approval rate", "Shown once live"]].map(([label, hint]) => (
                <section key={label} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <small className="text-[var(--muted-foreground)]">{label}</small>
                  <strong className="block text-lg">—</strong>
                  <small className="text-[var(--muted-foreground)]">{hint}</small>
                </section>
              ))}
            </div>

            <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="font-semibold">Webhooks</h2>
              <input value={webhook} onChange={event => setWebhook(event.target.value)} aria-label="Webhook URL" placeholder="https://instinct.app/hooks/skipwait" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Events are signed. Verify the signature header before trusting them.</p>
              <button type="button" disabled={working} onClick={() => { void saveWebhook(); }} className="brand-button mt-3 inline-flex min-h-11 items-center px-4">{working ? "Saving…" : "Save webhook"}</button>
            </section>

            <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-6 text-sm">
              <strong>Limits:</strong> per user, the same open-request and daily-ask limits as the SkipWait app. Per app: 600 requests/min. Users on any plan can connect; what they can do follows their own plan.
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
