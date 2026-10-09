import { AppWindow, ArrowLeft, Bot, CircleAlert, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Link } from "wouter";
import type { DeveloperApp } from "@shared/assistant";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { AppDetails } from "@/components/developers/AppDetails";
import { RegisterAppForm, type RegisterAppInput } from "@/components/developers/RegisterAppForm";
import { KIND_ICON, STATUS_META, appSubtitle } from "@/components/developers/consoleMeta";

type View = "list" | "new" | "details";

function ConsoleHeader({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
      <Link href="/developers" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span> <small className="font-mono text-xs text-muted-foreground">developers</small></Link>
      {signedIn ? <Link href="/settings" className="min-w-0 truncate text-sm text-muted-foreground">{email ?? "Account"}</Link> : null}
    </header>
  );
}

export default function DeveloperConsole() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const fetchToken = usePersistFn(getToken);
  const [view, setView] = useState<View>("list");
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [selected, setSelected] = useState<DeveloperApp | null>(null);
  const [editing, setEditing] = useState<DeveloperApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/developer-apps", { credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ apps?: DeveloperApp[]; error?: string }>(response, "We could not load your apps");
      if (!response.ok) throw new Error(payload.error || "We could not load your apps");
      setApps(Array.isArray(payload.apps) ? payload.apps : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not load your apps");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const createApp = async (input: RegisterAppInput) => {
    if (working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/developer-apps", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(input) });
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

  const saveWebhook = async (url: string) => {
    if (!selected || working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/developer-apps/${selected.id}/webhook`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ webhookUrl: url }) });
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
      const response = await fetch(`/api/developer-apps/${selected.id}/submit`, { method: "POST", credentials: "include", headers: await authHeaders() });
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

  const openNew = (from: DeveloperApp | null) => { setEditing(from); setError(""); setView("new"); };
  const openApp = (app: DeveloperApp) => { setSelected(app); setError(""); setView("details"); };
  const backToList = () => { setError(""); setView("list"); };

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

  return (
    <div data-skipwait-screen="developer-console" className="min-h-screen">
      <ConsoleHeader signedIn email={email} />
      <main className="mx-auto max-w-3xl px-4 pb-20">
        {view === "list" ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold">Your apps</h1><p className="mt-1 text-muted-foreground">Let your users find companies and apply for referrals without leaving your product.</p></div><Button onClick={() => openNew(null)}><Plus />New app</Button></div>
            {loading ? <ul role="status" aria-label="Loading your apps…" className="mt-6 space-y-3">{[0, 1].map(index => <li key={index} className="flex items-center gap-3 rounded-3xl border border-border p-5 sm:p-6"><span className="size-11 animate-pulse rounded-xl bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/3 animate-pulse rounded bg-muted" /><span className="block h-3 w-1/2 animate-pulse rounded bg-muted" /></span></li>)}</ul> : null}
            {!loading && error ? <p role="alert" className="mt-6 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{error} <button type="button" className="text-link" onClick={() => { void load(); }}>Try again</button></span></p> : null}
            {!loading && !error && apps.length === 0 ? <Panel tone="muted" className="mt-6 text-center"><AppWindow className="mx-auto size-8" /><h2 className="mt-3 text-lg font-semibold">No apps yet</h2><p className="mt-1 text-sm text-muted-foreground">Register an app to let its users search and apply for referrals.</p></Panel> : null}
            {!loading && !error && apps.length > 0 ? (
              <ul className="mt-6 space-y-3">{apps.map(app => {
                const status = STATUS_META[app.status];
                const KindIcon = KIND_ICON[app.kind];
                return <li key={app.id}><button type="button" onClick={() => openApp(app)} className="w-full text-left"><span className="flex items-center gap-3 rounded-3xl border border-border bg-card p-5 hover:border-primary sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><KindIcon className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">{app.name}</strong><small className="text-muted-foreground">{appSubtitle(app.kind, app.status)}</small></span><span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"><status.Icon className="size-3.5" />{status.label}</span></span></button></li>;
              })}</ul>
            ) : null}
          </>
        ) : null}

        {view === "new" ? <RegisterAppForm key={editing?.id ?? "new"} initial={editing} working={working} error={error} onCancel={backToList} onSubmit={input => { void createApp(input); }} /> : null}

        {view === "details" && selected ? (
          <>
            <button type="button" onClick={backToList} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Your apps</button>
            <AppDetails key={`${selected.id}-${selected.status}`} app={selected} working={working} error={error} onSubmitForReview={() => { void submitForReview(); }} onSaveWebhook={url => { void saveWebhook(url); }} onEditAndResubmit={() => openNew(selected)} />
          </>
        ) : null}
      </main>
    </div>
  );
}
