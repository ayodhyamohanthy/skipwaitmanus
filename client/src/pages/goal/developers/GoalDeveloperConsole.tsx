// Goal /developer-console (D-048-p3-dev; packet docs/plans/D-048-admin.md).
// Same calls as the kit console: GET/POST /api/developer-apps,
// PUT /api/developer-apps/:id/webhook, POST /api/developer-apps/:id/submit;
// the view stays in the URL (components/developers/consoleRoute, read-only).
// No-secret rule (Tier 1): an app is rendered only through the fields named
// in shared DeveloperApp; the client secret line is the literal "Not issued
// yet". Whatever else the server sends with an app never reaches the screen.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, CircleAlert, Copy } from "lucide-react";
import type { AppKind, DeveloperApp, DeveloperAppStatus } from "@shared/assistant";
import { DEVELOPER_APP_REVIEW_SCOPES } from "@shared/assistant";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { GoalButton, GoalNextStep, useOnlineStatus } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { ALL_SCOPES, DEFAULT_SCOPES, KINDS, KIND_SHORT, STATUS_META, appSubtitle } from "@/components/developers/consoleMeta";
import { consoleHref, readConsoleView, type ConsoleView } from "@/components/developers/consoleRoute";

export const GOAL_PAGE = { goalLine: "Register your app." } as const;
/** The register body, the same shape the kit form posts (components/developers/RegisterAppForm, which imports the kit and so is not imported here). */
type RegisterAppInput = { name: string; kind: AppKind; description: string; website?: string; redirectUrls: string[]; scopes: string[]; agreeToTerms: boolean };
const LOAD_ERROR = "We could not load your apps";
const NETWORK_ERROR = "We could not reach skipwait.me. Check your connection and try again.";
const link = "text-g-ink underline underline-offset-[3px] hover:no-underline";

/** The app fields this page may render: an allowlist, so an unexpected field (a secret) is dropped on arrival. */
function pickApp(raw: DeveloperApp): DeveloperApp {
  return {
    id: raw.id, name: raw.name, kind: raw.kind, description: raw.description, website: raw.website ?? null,
    redirectUrls: Array.isArray(raw.redirectUrls) ? raw.redirectUrls : [], scopes: Array.isArray(raw.scopes) ? raw.scopes : [],
    status: raw.status, rejectReasons: Array.isArray(raw.rejectReasons) ? raw.rejectReasons : [], webhookUrl: raw.webhookUrl ?? null,
    clientId: raw.clientId, createdAt: raw.createdAt,
  };
}

/** Status as dot + text (token colours only): filled when it needs the developer, hollow otherwise. */
function StatusDot({ status }: { status: DeveloperAppStatus }) {
  const needsYou = status === "test" || status === "rejected";
  const tone = status === "rejected" || status === "suspended" ? "bg-g-crimson" : status === "live" ? "bg-g-emerald" : needsYou ? "bg-g-ink" : "border-[1.5px] border-g-control-edge";
  return <span className="inline-flex shrink-0 items-center gap-1.5 text-g-meta text-g-ink-2"><span aria-hidden="true" className={`size-(--g-dot) rounded-full ${tone}`} />{STATUS_META[status].label}</span>;
}

function Alert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 border border-g-hairline p-4">
      <p className="flex items-start gap-2 text-g-label text-g-ink"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{message}</p>
      {onRetry ? <GoalButton className="mt-3" size="sm" variant="outline" onClick={onRetry}>Try again</GoalButton> : null}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return message ? <p role="alert" className="mt-4 flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{message}</p> : null;
}

function Loading() {
  return (
    <div className="mt-6" aria-busy="true">
      <p role="status" aria-label="Loading your apps…" className="text-g-meta text-g-ink-2">Loading your apps…</p>
      <div aria-hidden="true" className="mt-3 grid gap-2"><div className="h-14 rounded-g-tile bg-g-surface-hover" /><div className="h-14 rounded-g-tile bg-g-surface-hover" /></div>
    </div>
  );
}

function BackToList() {
  return <Link href={consoleHref({ kind: "list" })} className="inline-flex min-h-11 items-center gap-1 self-start text-g-meta text-g-ink-2 hover:text-g-ink"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Your apps</Link>;
}

/** The app that needs the developer first: a rejected app, then one still in test mode. */
function needsYou(apps: readonly DeveloperApp[]) {
  return apps.find(item => item.status === "rejected") ?? apps.find(item => item.status === "test") ?? null;
}

function RegisterForm({ initial, working, error, onCancel, onSubmit }: { initial: DeveloperApp | null; working: boolean; error: string; onCancel: () => void; onSubmit: (input: RegisterAppInput) => void }) {
  const [kind, setKind] = useState<AppKind>(initial?.kind ?? "web_app");
  const [name, setName] = useState(initial?.name ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [redirectUrls, setRedirectUrls] = useState(initial?.redirectUrls.join(", ") ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [scopes, setScopes] = useState<string[]>(initial ? [...initial.scopes] : [...DEFAULT_SCOPES]);
  // Kit parity: the terms box starts ticked (components/developers/RegisterAppForm).
  const [agreed, setAgreed] = useState(true);
  const [missing, setMissing] = useState("");
  const toggleScope = (key: string) => setScopes(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));
  const submit = () => {
    if (working) return;
    if (!name.trim() || !description.trim()) { setMissing("Add the app name and what your app does for job seekers."); return; }
    if (!agreed) { setMissing("Agree to the developer terms to register an app."); return; }
    setMissing("");
    onSubmit({ name, kind, description, website: website.trim() || undefined, redirectUrls: redirectUrls.split(/[\n,]/).map(url => url.trim()).filter(Boolean), scopes, agreeToTerms: agreed });
  };
  const input = "mt-1.5 h-12 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3";
  return (
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <BackToList />
      <h1 className="mt-2 text-g-display text-g-ink">Register an app</h1>
      <fieldset className="mt-6">
        <legend className="text-g-label text-g-ink">What are you building?</legend>
        <div className="mt-2 grid gap-2 gdesk:grid-cols-3">{KINDS.map(option => (
          <button key={option.key} type="button" onClick={() => setKind(option.key)} aria-pressed={kind === option.key}
            className={`rounded-g-tile border p-4 text-left ${kind === option.key ? "border-g-ink bg-g-surface-selected" : "border-g-hairline hover:bg-g-surface-hover"}`}>
            <span className="block text-g-label text-g-ink">{option.label}</span>
            <span className="mt-0.5 block text-g-meta text-g-ink-2">{option.description}</span>
          </button>
        ))}</div>
      </fieldset>
      <div className="mt-6 grid gap-4 gdesk:grid-cols-2">
        <label className="text-g-label text-g-ink">App name<input className={input} value={name} onChange={event => setName(event.target.value)} placeholder="Instinct" /></label>
        <label className="text-g-label text-g-ink">Website<input className={input} value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://instinct.app" /></label>
        <label className="text-g-label text-g-ink gdesk:col-span-2">Redirect URLs<input className={input} value={redirectUrls} onChange={event => setRedirectUrls(event.target.value)} placeholder="https://instinct.app/oauth/skipwait" /></label>
        <label className="text-g-label text-g-ink gdesk:col-span-2">What does your app do for job seekers?<textarea className="mt-1.5 min-h-24 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink placeholder:text-g-ink-3" value={description} onChange={event => setDescription(event.target.value)} placeholder="Shown to users on the approval screen" /></label>
      </div>
      {kind === "agent_mcp" ? <p className="mt-4 text-g-meta text-g-ink-2">MCP clients can also connect with no registration through <code className="font-g-mono">skipwait.me/api/mcp</code> (dynamic registration). Registering gets you a verified badge once your app passes review.</p> : null}
      <fieldset className="mt-6">
        <legend className="text-g-label text-g-ink">Permissions</legend>
        <p className="text-g-meta text-g-ink-2">Ask only for what you need. Items marked review are checked by our team.</p>
        <ul className="mt-2">{ALL_SCOPES.map(scope => (
          <li key={scope.key}><label className="flex min-h-12 items-center gap-3 border-b border-g-hairline py-2">
            <input type="checkbox" className="size-5 accent-g-primary" checked={scopes.includes(scope.key)} onChange={() => toggleScope(scope.key)} />
            <span className="min-w-0 flex-1"><code className="font-g-mono text-g-meta text-g-ink">{scope.key}</code><span className="block text-g-meta text-g-ink-2">{scope.label}</span></span>
            {DEVELOPER_APP_REVIEW_SCOPES.includes(scope.key) ? <span className="text-g-meta text-g-ink-2">review</span> : null}
          </label></li>
        ))}</ul>
      </fieldset>
      <label className="mt-4 flex gap-3 text-g-meta text-g-ink"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-0.5 size-5 accent-g-primary" />I agree to the developer terms: no bulk asks, no selling user data, no automating referrer decisions, show users what is sent.</label>
      <ErrorLine message={missing || error} />
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <GoalButton type="button" variant="ghost" onClick={onCancel}>Cancel</GoalButton>
        <GoalButton type="submit" variant="primary" touch="large" busy={working} busyLabel="Registering…">Create app</GoalButton>
      </div>
    </form>
  );
}

const STATS = ["Connected users", "Asks sent via app", "Approval rate"] as const;

function AppView({ app, showDetails, working, error, onOpenDetails, onSubmitForReview, onSaveWebhook, onEditAndResubmit }: {
  app: DeveloperApp; showDetails: boolean; working: boolean; error: string;
  onOpenDetails: () => void; onSubmitForReview: () => void; onSaveWebhook: (url: string) => void; onEditAndResubmit: () => void;
}) {
  const [webhook, setWebhook] = useState(app.webhookUrl ?? "");
  const [copied, setCopied] = useState(false);
  const online = useOnlineStatus();

  if (app.status === "in_review" && !showDetails) {
    return <><BackToList /><h1 className="mt-2 text-g-display text-g-ink">{app.name} is in review</h1>
      <div className="mt-5"><GoalNextStep reason="Review for send and profile permissions usually takes 2–5 business days. You can keep testing meanwhile.">
        <div className="mt-4"><GoalButton variant="primary" touch="large" onClick={onOpenDetails}>Open test credentials</GoalButton></div>
      </GoalNextStep></div></>;
  }
  if (app.status === "rejected" && !showDetails) {
    return <><BackToList /><h1 className="mt-2 text-g-display text-g-ink">Changes needed</h1>
      <div className="mt-5"><GoalNextStep reason={`Our team asked for changes to ${app.name} before it can go live.`}>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-g-body text-g-ink">{app.rejectReasons.length > 0 ? app.rejectReasons.map(reason => <li key={reason}>{reason}</li>) : <li>Our team asked for changes. Check your email for details.</li>}</ul>
        <div className="mt-4"><GoalButton variant="primary" touch="large" onClick={onEditAndResubmit}>Edit and resubmit</GoalButton></div>
      </GoalNextStep></div></>;
  }
  if (app.status === "suspended" && !showDetails) {
    return <><BackToList /><h1 className="mt-2 text-g-display text-g-ink">App suspended</h1>
      <div className="mt-5"><GoalNextStep reason="Our safety team suspended this app. Reply to the safety team to appeal.">
        <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/help">Contact safety team</Link></GoalButton></div>
      </GoalNextStep></div></>;
  }

  const copyClientId = async () => {
    try { await navigator.clipboard?.writeText(app.clientId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const canSubmit = app.status === "test" || app.status === "rejected";
  return (
    <>
      <BackToList />
      <h1 className="mt-2 text-g-display text-g-ink">{app.name}</h1>
      <p className="mt-1 flex items-center gap-2 text-g-meta text-g-ink-2">{KIND_SHORT[app.kind]} · <StatusDot status={app.status} />{app.status === "live" ? " · verified" : null}</p>
      <ErrorLine message={error} />
      {canSubmit ? (
        <div className="mt-5"><GoalNextStep reason="Your app is in test mode. Submit it for review to go live with a verified badge. Review usually takes 2–5 business days.">
          <div className="mt-4"><GoalButton variant="primary" touch="large" busy={working} disabledReason={!online ? "You're offline" : undefined} onClick={onSubmitForReview}>Submit for review</GoalButton></div>
        </GoalNextStep></div>
      ) : null}
      <section aria-labelledby="goal-dev-credentials" className="mt-6 border-t border-g-hairline pt-4">
        <h2 id="goal-dev-credentials" className="text-g-heading text-g-ink">Credentials</h2>
        <dl className="mt-3 grid gap-3">
          <div><dt className="text-g-meta text-g-ink-2">Client ID</dt>
            <dd className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-g-control border border-g-hairline bg-g-surface px-3 py-2.5 font-g-mono text-g-meta text-g-ink">{app.clientId}</code>
              <GoalButton variant="outline" size="sm" onClick={() => { void copyClientId(); }}><Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />{copied ? "Copied" : "Copy"}</GoalButton></dd></div>
          <div><dt className="text-g-meta text-g-ink-2">Client secret</dt>
            <dd className="mt-1"><span data-testid="goal-client-secret" className="block rounded-g-control border border-g-hairline px-3 py-2.5 text-g-meta text-g-ink-2">Not issued yet</span></dd></div>
        </dl>
      </section>
      <dl className="mt-6 grid gap-4 border-t border-g-hairline pt-4 gdesk:grid-cols-3">
        {STATS.map(label => <div key={label}><dt className="text-g-meta text-g-ink-2">{label}</dt><dd className="text-g-heading text-g-ink">—</dd><dd className="text-g-meta text-g-ink-3">Shown once live</dd></div>)}
      </dl>
      <section aria-labelledby="goal-dev-webhooks" className="mt-6 border-t border-g-hairline pt-4">
        <h2 id="goal-dev-webhooks" className="text-g-heading text-g-ink">Webhooks</h2>
        <input className="mt-3 h-12 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3" value={webhook} onChange={event => setWebhook(event.target.value)} placeholder="https://instinct.app/hooks/skipwait" aria-label="Webhook URL" />
        <p className="mt-2 text-g-meta text-g-ink-2">Events are not sent yet. When they are, each one is signed: verify the signature header before trusting it.</p>
        <GoalButton variant="outline" size="sm" className="mt-3" busy={working} busyLabel="Saving…" disabledReason={!online ? "You're offline" : undefined} onClick={() => onSaveWebhook(webhook.trim())}>Save webhook</GoalButton>
      </section>
      <p className="mt-6 border-t border-g-hairline pt-4 text-g-meta text-g-ink-2"><span className="text-g-ink">Limits:</span> per user, the same open-request limits as the skipwait.me app, and 120 requests/min per token. Members on Land and Concierge can connect; each ask still needs their own approval.</p>
    </>
  );
}

export default function GoalDeveloperConsole() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const fetchToken = usePersistFn(getToken);
  const search = useSearch();
  const view = readConsoleView(search);
  const [, navigate] = useLocation();
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);

  // An action error belongs to the screen it happened on (kit behaviour).
  useEffect(() => { setActionError(""); }, [search]);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await fetchToken();
    try {
      return await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch { throw new Error(NETWORK_ERROR); }
  }, [fetchToken]);

  const go = (next: ConsoleView, replace = false) => navigate(consoleHref(next), { replace });

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setLoadError("");
    try {
      const response = await authedFetch("/api/developer-apps");
      const payload = await readApiJson<{ apps?: DeveloperApp[]; error?: string }>(response, LOAD_ERROR);
      if (!response.ok) throw new Error(payload.error || LOAD_ERROR);
      setApps(Array.isArray(payload.apps) ? payload.apps.map(pickApp) : []);
      setLoaded(true);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : LOAD_ERROR);
    } finally { setLoading(false); }
  }, [isSignedIn, authedFetch]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fallback: string, action: () => Promise<void>) => {
    if (working) return;
    setWorking(true); setActionError("");
    try { await action(); } catch (reason) { setActionError(reason instanceof Error ? reason.message : fallback); } finally { setWorking(false); }
  };
  const updateApp = (id: number, patch: Partial<DeveloperApp>) => setApps(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));

  const createApp = (input: RegisterAppInput) => run("We could not register this app", async () => {
    const response = await authedFetch("/api/developer-apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const payload = await readApiJson<{ app?: DeveloperApp; error?: string }>(response, "We could not register this app");
    if (!response.ok || !payload.app) throw new Error(payload.error || "We could not register this app");
    const created = pickApp(payload.app);
    setApps(current => [created, ...current.filter(item => item.id !== created.id)]);
    go({ kind: "app", id: created.id, details: false }, true);
  });

  const saveWebhook = (target: DeveloperApp, url: string) => run("We could not save that webhook", async () => {
    const response = await authedFetch(`/api/developer-apps/${target.id}/webhook`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhookUrl: url }) });
    const payload = await readApiJson<{ webhookUrl?: string | null; error?: string }>(response, "We could not save that webhook");
    if (!response.ok) throw new Error(payload.error || "We could not save that webhook");
    updateApp(target.id, { webhookUrl: payload.webhookUrl ?? null });
  });

  const submitForReview = (target: DeveloperApp) => run("We could not submit this app", async () => {
    const response = await authedFetch(`/api/developer-apps/${target.id}/submit`, { method: "POST" });
    const payload = await readApiJson<{ error?: string }>(response, "We could not submit this app");
    if (!response.ok) throw new Error(payload.error || "We could not submit this app");
    updateApp(target.id, { status: "in_review" });
    go({ kind: "app", id: target.id, details: false }, true);
  });

  const shell = (children: ReactNode) => (
    <div data-skipwait-screen="developer-console" data-goal-page="developer-console" className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 gdesk:px-5">
          <Link href="/developers" className="inline-flex items-center gap-2"><img src="/brand/lockup-horizontal-v2.svg" alt="skipwait.me" className="h-5 w-auto" /><span className="font-g-mono text-g-meta text-g-ink-2">developers</span></Link>
          {isSignedIn ? <Link href="/settings" className="min-w-0 truncate text-g-meta text-g-ink-2 hover:text-g-ink">{email ?? "Account"}</Link> : null}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 pb-20 gdesk:px-5 gdesk:py-7">{children}</main>
    </div>
  );

  if (!isSignedIn) {
    return shell(<>
      <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">Register your app, agent or MCP client, so its users can find companies and apply for referrals without leaving your product.</p>
      <div className="mt-5"><GoalNextStep reason="Sign in to the developer console.">
        <div className="mt-4"><SignInButton><GoalButton variant="primary" touch="large">Sign in</GoalButton></SignInButton></div>
      </GoalNextStep></div>
    </>);
  }

  const waiting = !loaded && (loading || !loadError);
  const loadFailed = <Alert message={loadError} onRetry={() => { void load(); }} />;
  const notFound = <>
    <h1 className="text-g-display text-g-ink">App not found</h1>
    <p className="mt-2 text-g-meta text-g-ink-2">It may have been removed, or it belongs to another account.</p>
    <div className="mt-5"><GoalNextStep><div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href={consoleHref({ kind: "list" })}>Your apps</Link></GoalButton></div></GoalNextStep></div>
  </>;

  if (view.kind === "new") {
    if (view.fromId === null) return shell(<RegisterForm key="new" initial={null} working={working} error={actionError} onCancel={() => go({ kind: "list" })} onSubmit={input => { void createApp(input); }} />);
    const editFrom = apps.find(item => item.id === view.fromId) ?? null;
    if (editFrom) return shell(<RegisterForm key={editFrom.id} initial={editFrom} working={working} error={actionError} onCancel={() => go({ kind: "list" })} onSubmit={input => { void createApp(input); }} />);
    return shell(waiting ? <><h1 className="text-g-display text-g-ink">Register an app</h1><Loading /></> : loadError ? <><h1 className="text-g-display text-g-ink">Register an app</h1>{loadFailed}</> : notFound);
  }

  if (view.kind === "app") {
    const selected = apps.find(item => item.id === view.id) ?? null;
    if (selected) {
      return shell(<AppView key={`${selected.id}-${selected.status}`} app={selected} showDetails={view.details} working={working} error={actionError}
        onOpenDetails={() => go({ kind: "app", id: selected.id, details: true })}
        onSubmitForReview={() => { void submitForReview(selected); }}
        onSaveWebhook={url => { void saveWebhook(selected, url); }}
        onEditAndResubmit={() => go({ kind: "new", fromId: selected.id })} />);
    }
    // No heading until the app is known: the page's goal is that app's own.
    return shell(waiting ? <><BackToList /><Loading /></> : loadError ? <><BackToList />{loadFailed}</> : notFound);
  }

  const next = needsYou(apps);
  return shell(<>
    <Link href="/developers" className="inline-flex min-h-11 items-center gap-1 self-start text-g-meta text-g-ink-2 hover:text-g-ink"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Developers</Link>
    <h1 className="mt-2 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
    <p className="mt-2 text-g-meta text-g-ink-2">Let your users find companies and apply for referrals without leaving your product.</p>
    {loading ? <Loading /> : loadError ? loadFailed : apps.length === 0 ? (
      <div className="mt-5"><GoalNextStep reason="Register an app to let its users search and apply for referrals.">
        <p className="mt-3 text-g-label text-g-ink">No apps yet.</p>
        <div className="mt-4"><GoalButton variant="primary" touch="large" onClick={() => go({ kind: "new", fromId: null })}>Register an app</GoalButton></div>
      </GoalNextStep></div>
    ) : (<>
      <div className="mt-5"><GoalNextStep reason={next ? (next.status === "rejected" ? `Our team asked for changes to ${next.name}.` : `${next.name} is in test mode. Submit it for review to go live.`) : "Nothing needs you right now."}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next ? <GoalButton variant="primary" touch="large" onClick={() => go({ kind: "app", id: next.id, details: false })}>{next.status === "rejected" ? `Fix ${next.name}` : `Open ${next.name}`}</GoalButton> : null}
          <GoalButton variant={next ? "outline" : "primary"} touch="large" onClick={() => go({ kind: "new", fromId: null })}>New app</GoalButton>
        </div>
      </GoalNextStep></div>
      <ul aria-label="Your apps" className="mt-4 grid gap-1">
        {apps.map(item => (
          <li key={item.id}>
            <button type="button" onClick={() => go({ kind: "app", id: item.id, details: false })} className="flex w-full items-center gap-3 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover">
              <span className="min-w-0 flex-1"><span className="block truncate text-g-label text-g-ink">{item.name}</span><span className="block truncate text-g-meta text-g-ink-2">{appSubtitle(item.kind, item.status)}</span></span>
              <StatusDot status={item.status} />
            </button>
          </li>
        ))}
      </ul>
    </>)}
  </>);
}
