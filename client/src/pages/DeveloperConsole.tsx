import { AppWindow, Bot, CircleAlert, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Link, useLocation, useSearch } from "wouter";
import type { DeveloperApp } from "@shared/assistant";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { AppDetails } from "@/components/developers/AppDetails";
import { RegisterAppForm, type RegisterAppInput } from "@/components/developers/RegisterAppForm";
import { KIND_ICON, STATUS_META, appSubtitle } from "@/components/developers/consoleMeta";
import { consoleHref, readConsoleView, type ConsoleView } from "@/components/developers/consoleRoute";
import { goalSurfaceOn } from "@/lib/goalSurfaces";

function ConsoleHeader({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
      <Link href="/developers" className="wordmark text-xl"><img src="/brand/lockup-horizontal-v2.svg" alt="skipwait.me" className="wordmark-logo" /> <small className="font-mono text-xs text-muted-foreground">developers</small></Link>
      {signedIn ? <Link href="/settings" className="min-w-0 truncate text-sm text-muted-foreground">{email ?? "Account"}</Link> : null}
    </header>
  );
}

function LoadingApps() {
  return <ul role="status" aria-label="Loading your apps…" className="mt-6 space-y-3">{[0, 1].map(index => <li key={index} className="flex items-center gap-3 rounded-3xl border border-border p-5 sm:p-6"><span className="size-11 animate-pulse rounded-xl bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/3 animate-pulse rounded bg-muted" /><span className="block h-3 w-1/2 animate-pulse rounded bg-muted" /></span></li>)}</ul>;
}

function LoadErrorLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <p role="alert" className="mt-6 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{message} <button type="button" className="text-link" onClick={onRetry}>Try again</button></span></p>;
}

// Goal-UI migration (D-048-p3-dev): the goal page replaces this one when the
// "developers" surface flag is on; off, the kit page below is unchanged.
const GoalDeveloperConsole = lazy(() => import("./goal/developers/GoalDeveloperConsole"));

export default function DeveloperConsole() {
  if (goalSurfaceOn("developers")) return <Suspense fallback={null}><GoalDeveloperConsole /></Suspense>;
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const fetchToken = usePersistFn(getToken);
  // The view lives in the URL (?app=1, ?app=1&details=1, ?new=1), so browser back and deep links work.
  const search = useSearch();
  const view = readConsoleView(search);
  const [, navigate] = useLocation();
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);

  // An action error belongs to the screen it happened on; moving to another view (including browser back) clears it.
  useEffect(() => { setActionError(""); }, [search]);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const go = (next: ConsoleView, replace = false) => navigate(consoleHref(next), { replace });

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/developer-apps", { credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ apps?: DeveloperApp[]; error?: string }>(response, "We could not load your apps");
      if (!response.ok) throw new Error(payload.error || "We could not load your apps");
      setApps(Array.isArray(payload.apps) ? payload.apps : []);
      setLoaded(true);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "We could not load your apps");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  /** Runs one write; on success the server's answer updates the loaded apps, on failure the message stays on this screen. */
  const run = async (fallback: string, action: () => Promise<void>) => {
    if (working) return;
    setWorking(true); setActionError("");
    try { await action(); } catch (reason) { setActionError(reason instanceof Error ? reason.message : fallback); } finally { setWorking(false); }
  };
  const updateApp = (id: number, patch: Partial<DeveloperApp>) => setApps(current => current.map(app => (app.id === id ? { ...app, ...patch } : app)));

  const createApp = (input: RegisterAppInput) => run("We could not register this app", async () => {
    const response = await fetch("/api/developer-apps", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(input) });
    const payload = await readApiJson<{ app?: DeveloperApp; error?: string }>(response, "We could not register this app");
    const created = payload.app;
    if (!response.ok || !created) throw new Error(payload.error || "We could not register this app");
    setApps(current => [created, ...current.filter(app => app.id !== created.id)]);
    go({ kind: "app", id: created.id, details: false }, true);
  });

  const saveWebhook = (app: DeveloperApp, url: string) => run("We could not save that webhook", async () => {
    const response = await fetch(`/api/developer-apps/${app.id}/webhook`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ webhookUrl: url }) });
    const payload = await readApiJson<{ webhookUrl?: string | null; error?: string }>(response, "We could not save that webhook");
    if (!response.ok) throw new Error(payload.error || "We could not save that webhook");
    updateApp(app.id, { webhookUrl: payload.webhookUrl ?? null });
  });

  const submitForReview = (app: DeveloperApp) => run("We could not submit this app", async () => {
    const response = await fetch(`/api/developer-apps/${app.id}/submit`, { method: "POST", credentials: "include", headers: await authHeaders() });
    const payload = await readApiJson<{ error?: string }>(response, "We could not submit this app");
    if (!response.ok) throw new Error(payload.error || "We could not submit this app");
    updateApp(app.id, { status: "in_review" });
    go({ kind: "app", id: app.id, details: false }, true);
  });

  if (!isSignedIn) {
    return (
      <div data-skipwait-screen="developer-console" className="min-h-screen">
        <ConsoleHeader signedIn={false} email={null} />
        <main className="mx-auto max-w-3xl px-4 pb-20">
          <Panel className="text-center"><Bot className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">Sign in to the developer console</h1><p className="mt-2 text-sm text-muted-foreground">Register your app, agent or MCP client.</p><SignInButton><button type="button" className={buttonVariants({ size: "lg", className: "mt-5 w-full" })}>Sign in</button></SignInButton></Panel>
        </main>
      </div>
    );
  }

  // Deep links can arrive before the app list: wait for it, then show the app, the source of an edit, or an honest miss.
  const waiting = !loaded && (loading || !loadError);
  const selected = view.kind === "app" ? apps.find(app => app.id === view.id) ?? null : null;
  const editFrom = view.kind === "new" && view.fromId !== null ? apps.find(app => app.id === view.fromId) ?? null : null;
  const notFound = (
    <Panel tone="muted" className="text-center"><AppWindow className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">App not found</h1><p className="mt-2 text-sm text-muted-foreground">It may have been removed, or it belongs to another account.</p><Button asChild variant="outline" className="mt-4"><Link href={consoleHref({ kind: "list" })}>Your apps</Link></Button></Panel>
  );

  return (
    <div data-skipwait-screen="developer-console" className="min-h-screen">
      <ConsoleHeader signedIn email={email} />
      <main className="mx-auto max-w-3xl px-4 pb-20">
        {view.kind === "list" ? (
          <>
            {/* Kit: the New app button sits on its own row under the intro at every width. */}
            <div className="flex flex-col items-start gap-3"><div><h1 className="text-3xl font-semibold">Your apps</h1><p className="mt-1 text-muted-foreground">Let your users find companies and apply for referrals without leaving your product.</p></div><Button onClick={() => go({ kind: "new", fromId: null })}><Plus />New app</Button></div>
            {loading ? <LoadingApps /> : null}
            {!loading && loadError ? <LoadErrorLine message={loadError} onRetry={() => { void load(); }} /> : null}
            {!loading && !loadError && apps.length === 0 ? <Panel tone="muted" className="mt-6 text-center"><AppWindow className="mx-auto size-8" /><h2 className="mt-3 text-lg font-semibold">No apps yet</h2><p className="mt-1 text-sm text-muted-foreground">Register an app to let its users search and apply for referrals.</p></Panel> : null}
            {!loading && !loadError && apps.length > 0 ? (
              <ul className="mt-6 space-y-3">{apps.map(app => {
                const status = STATUS_META[app.status];
                const KindIcon = KIND_ICON[app.kind];
                return <li key={app.id}><button type="button" onClick={() => go({ kind: "app", id: app.id, details: false })} className="w-full text-left"><span className="flex items-center gap-3 rounded-3xl border border-border bg-card p-5 hover:border-primary sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><KindIcon className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">{app.name}</strong><small className="text-muted-foreground">{appSubtitle(app.kind, app.status)}</small></span><span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"><status.Icon className="size-3.5" />{status.label}</span></span></button></li>;
              })}</ul>
            ) : null}
          </>
        ) : null}

        {view.kind === "new" && view.fromId !== null && waiting ? <LoadingApps /> : null}
        {view.kind === "new" && view.fromId !== null && !waiting && !editFrom ? (loadError ? <LoadErrorLine message={loadError} onRetry={() => { void load(); }} /> : notFound) : null}
        {view.kind === "new" && (view.fromId === null || editFrom) ? <RegisterAppForm key={editFrom?.id ?? "new"} initial={editFrom} working={working} error={actionError} onCancel={() => go({ kind: "list" })} onSubmit={input => { void createApp(input); }} /> : null}

        {view.kind === "app" && !selected && waiting ? <LoadingApps /> : null}
        {view.kind === "app" && !selected && !waiting ? (loadError ? <LoadErrorLine message={loadError} onRetry={() => { void load(); }} /> : notFound) : null}
        {view.kind === "app" && selected ? (
          <AppDetails
            key={`${selected.id}-${selected.status}`}
            app={selected}
            showDetails={view.details}
            working={working}
            error={actionError}
            onOpenDetails={() => go({ kind: "app", id: selected.id, details: true })}
            onSubmitForReview={() => { void submitForReview(selected); }}
            onSaveWebhook={url => { void saveWebhook(selected, url); }}
            onEditAndResubmit={() => go({ kind: "new", fromId: selected.id })}
          />
        ) : null}
      </main>
    </div>
  );
}
