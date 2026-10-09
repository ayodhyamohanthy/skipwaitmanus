import { BadgeCheck, Bot, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

type AssistantConnection = {
  id: number;
  provider: string;
  appName: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  connectedAt: string;
};

type AssistantToken = {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type AssistantEvent = {
  action: string;
  outcome: string;
  resourceType: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const PROVIDER_LABEL: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", custom: "Assistant" };

const SCOPE_LABEL: Record<string, string> = {
  read: "Read companies and requests",
  draft: "Draft asks for review",
  send: "Send asks — you approve each one",
  credits: "Run paid tools — you approve the cost",
};

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function eventSummary(event: AssistantEvent): string {
  if (event.action === "assistant.connected") return `Connected ${PROVIDER_LABEL[String(event.metadata.provider)] ?? "an assistant"}`;
  if (event.action === "assistant.disconnected") return "Disconnected an assistant";
  if (event.action === "assistant.token_created") return "Created an API token";
  if (event.action === "assistant.token_revoked") return "Revoked an API token";
  if (event.action === "assistant.approval_requested") return "Asked you to approve an action";
  if (event.action === "assistant.approval_approved") return "Approved an assistant action";
  if (event.action === "assistant.approval_declined") return "Declined an assistant action";
  if (event.action === "developer.app_registered") return "Registered a developer app";
  if (event.action === "developer.webhook_updated") return "Updated a webhook URL";
  return event.action;
}

export default function Assistants() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [tab, setTab] = useState<"assistants" | "tokens" | "activity">("assistants");
  const [plan, setPlan] = useState<string | null>(null);
  const [connections, setConnections] = useState<AssistantConnection[]>([]);
  const [tokens, setTokens] = useState<AssistantToken[]>([]);
  const [activity, setActivity] = useState<AssistantEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newTokenName, setNewTokenName] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [onceToken, setOnceToken] = useState<{ id: number; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const [accessResponse, connectionsResponse, tokensResponse, activityResponse] = await Promise.all([
        fetch("/api/assistants/access", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/connections", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/tokens", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/activity", { credentials: "include", headers: await authHeaders() }),
      ]);
      const accessPayload = await readApiJson<{ plan?: string; error?: string }>(accessResponse, "We could not load assistant access");
      if (!accessResponse.ok) throw new Error(accessPayload.error || "We could not load assistant access");
      setPlan(accessPayload.plan ?? null);
      const connectionsPayload = await readApiJson<{ connections?: AssistantConnection[]; error?: string }>(connectionsResponse, "We could not load your assistants");
      if (!connectionsResponse.ok) throw new Error(connectionsPayload.error || "We could not load your assistants");
      setConnections(Array.isArray(connectionsPayload.connections) ? connectionsPayload.connections.filter(item => item.status === "connected") : []);
      const tokensPayload = await readApiJson<{ tokens?: AssistantToken[]; error?: string }>(tokensResponse, "We could not load your tokens");
      if (!tokensResponse.ok) throw new Error(tokensPayload.error || "We could not load your tokens");
      setTokens(Array.isArray(tokensPayload.tokens) ? tokensPayload.tokens : []);
      const activityPayload = await readApiJson<{ activity?: AssistantEvent[]; error?: string }>(activityResponse, "We could not load assistant activity");
      if (!activityResponse.ok) throw new Error(activityPayload.error || "We could not load assistant activity");
      setActivity(Array.isArray(activityPayload.activity) ? activityPayload.activity : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not load assistant access");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const disconnect = async (connection: AssistantConnection) => {
    setWorkingId(connection.id);
    try {
      const response = await fetch(`/api/assistants/connections/${connection.id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ error?: string }>(response, "We could not disconnect this assistant");
      if (!response.ok) throw new Error(payload.error || "We could not disconnect this assistant");
      setConnections(current => current.filter(item => item.id !== connection.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not disconnect this assistant");
    } finally {
      setWorkingId(null);
    }
  };

  const createToken = async () => {
    const name = newTokenName.trim();
    if (!name || creatingToken) return;
    setCreatingToken(true);
    try {
      const response = await fetch("/api/assistants/tokens", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ name }) });
      const payload = await readApiJson<{ token?: { id: number; token: string }; error?: string }>(response, "We could not create this token");
      if (!response.ok || !payload.token) throw new Error(payload.error || "We could not create this token");
      setOnceToken({ id: payload.token.id, token: payload.token.token });
      setNewTokenName("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not create this token");
    } finally {
      setCreatingToken(false);
    }
  };

  const revokeToken = async (token: AssistantToken) => {
    setWorkingId(token.id);
    try {
      const response = await fetch(`/api/assistants/tokens/${token.id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ error?: string }>(response, "We could not revoke this token");
      if (!response.ok) throw new Error(payload.error || "We could not revoke this token");
      setTokens(current => current.filter(item => item.id !== token.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not revoke this token");
    } finally {
      setWorkingId(null);
    }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="assistants" className="page-content mx-auto max-w-2xl">
        <span className="eyebrow">Settings</span>
        <h1 className="mt-2 text-4xl font-semibold">Connected assistants<span className="brand-dot">.</span></h1>
        <p className="mt-2 text-[var(--muted-foreground)]">Use SkipWait from ChatGPT, Claude and your own tools. You stay in control of every ask and every credit.</p>
        <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
          <Bot className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">Sign in to manage assistants</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Connections, tokens and approvals live on your account.</p>
          <div className="mt-4"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
        </section>
      </main>
    );
  }

  const onMax = plan === "max";

  return (
    <main data-skipwait-screen="assistants" className="page-content mx-auto max-w-3xl">
      <span className="eyebrow">Settings</span>
      <h1 className="mt-2 text-4xl font-semibold">Connected assistants<span className="brand-dot">.</span></h1>
      <p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Use SkipWait from ChatGPT, Claude and your own tools. You stay in control of every ask and every credit.</p>

      {loading ? <div className="mt-6"><LoadingSkeleton title="Loading assistant settings…" caption="Checking your connections, tokens and activity." /></div> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error} <button type="button" className="font-bold underline" onClick={() => { void load(); }}>Try again</button></p> : null}

      {!loading && !error && !onMax ? (
        <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
          <Bot className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">Assistants and API tokens come with Max</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Max members can sign in, connect and apply from ChatGPT, Claude, bots and their own tools.</p>
          <Link href="/plans" className="brand-button mt-4 inline-block">Upgrade to Max</Link>
        </section>
      ) : null}

      {!loading && !error && onMax ? (
        <>
          <div className="mt-6 flex gap-2" role="tablist" aria-label="Assistant settings">
            {(["assistants", "tokens", "activity"] as const).map(value => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 rounded-full border px-4 text-sm ${tab === value ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{value === "assistants" ? "Assistants" : value === "tokens" ? "API tokens" : "Activity"}</button>
            ))}
          </div>

          {!loading && !error && tab === "assistants" ? (
            <section className="mt-4" aria-label="Connected assistants">
              {connections.length === 0 ? (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
                  <Bot className="mx-auto mb-3 size-8" />
                  <h2 className="text-lg font-semibold">No assistants connected</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">In ChatGPT or Claude, add SkipWait as a connector and approve it here.</p>
                </div>
              ) : (
                <ul className="grid gap-3">
                  {connections.map(connection => (
                    <li key={connection.id} className="flex items-start gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--muted)]"><Bot className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block">{PROVIDER_LABEL[connection.provider] ?? connection.appName}</strong>
                        <small className="block text-[var(--muted-foreground)]">{connection.scopes.map(scope => SCOPE_LABEL[scope] ?? scope).join(" · ")}</small>
                        <small className="text-[var(--muted-foreground)]">{connection.lastUsedAt ? `Used ${timeAgo(connection.lastUsedAt)}` : `Connected ${timeAgo(connection.connectedAt)}`}</small>
                      </span>
                      <button type="button" disabled={workingId === connection.id} onClick={() => { void disconnect(connection); }} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-sm"><Trash2 className="size-4" />Disconnect</button>
                    </li>
                  ))}
                </ul>
              )}
              <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h2 className="font-semibold">Safety</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--primary)]" />Ask me before any ask is sent — always on. Assistants can draft, you send.</li>
                  <li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--primary)]" />Ask me before credits are spent — always on.</li>
                </ul>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">Assistants follow the same limits as you: open-request slots, daily asks, quality checks. They never move you up a queue.</p>
              </section>
              <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-5">
                <h2 className="font-semibold">How to connect</h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  <li>In ChatGPT or Claude, open Connectors and add <code className="rounded bg-[var(--background)] px-1">skipwait.me/mcp</code></li>
                  <li>Sign in and approve what it can do</li>
                  <li>Ask: “Find companies open to referrals for product designers”</li>
                </ol>
                <Link href="/connect-assistant" className="mt-2 inline-block text-sm text-link">Preview the approval screen</Link>
              </section>
            </section>
          ) : null}

          {!loading && !error && tab === "tokens" ? (
            <section className="mt-4" aria-label="API tokens">
              {onceToken ? (
                <div className="mb-4 rounded-3xl border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-4">
                  <strong className="block">Copy your token now</strong>
                  <p className="text-sm text-[var(--muted-foreground)]">You won&apos;t see it again.</p>
                  <div className="mt-3 flex gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 font-mono text-sm">{onceToken.token}</code>
                    <button type="button" onClick={async () => { try { await navigator.clipboard?.writeText(onceToken.token); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } }} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-sm"><Copy className="size-4" />{copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h2 className="font-semibold">Your tokens</h2>
                {tokens.length === 0 ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">No tokens yet.</p> : (
                  <ul className="mt-2">
                    {tokens.map(token => (
                      <li key={token.id} className="flex min-h-14 items-center gap-3 border-b border-[var(--border)] py-2 last:border-0">
                        <KeyRound className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1 text-sm"><strong className="block">{token.name}</strong><small className="text-[var(--muted-foreground)]">{token.prefix}… · created {timeAgo(token.createdAt)}{token.lastUsedAt ? ` · used ${timeAgo(token.lastUsedAt)}` : ""}</small></span>
                        <button type="button" disabled={workingId === token.id} onClick={() => { void revokeToken(token); }} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-sm"><Trash2 className="size-4" />Revoke</button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={event => { event.preventDefault(); void createToken(); }} className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1"><span className="sr-only">Token name</span>
                    <input value={newTokenName} onChange={event => setNewTokenName(event.target.value)} placeholder="Name, e.g. Notion tracker" className="h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
                  </label>
                  <button type="submit" disabled={creatingToken || !newTokenName.trim()} className="brand-button inline-flex shrink-0 items-center justify-center gap-1"><Plus className="size-4" />{creatingToken ? "Creating…" : "Create token"}</button>
                </form>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">Tokens can read, draft and send with approval. They can&apos;t spend credits without you. <Link href="/developers" className="text-link">Developer docs</Link></p>
              </div>
            </section>
          ) : null}

          {!loading && !error && tab === "activity" ? (
            <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5" aria-label="Assistant activity">
              <h2 className="font-semibold">Everything assistants did</h2>
              {activity.length === 0 ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">No assistant activity yet.</p> : (
                <ul className="mt-2">
                  {activity.map((event, index) => (
                    <li key={`${event.action}-${index}`} className="border-b border-[var(--border)] py-3 last:border-0">
                      <span className="text-xs text-[var(--muted-foreground)]">{timeAgo(event.createdAt)}</span>
                      <strong className="block text-sm">{eventSummary(event)}</strong>
                      <small className={event.outcome === "failure" ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}>{event.outcome}</small>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/approve" className="mt-2 inline-block text-sm text-link">Review waiting approvals</Link>
            </section>
          ) : null}
        </>
      )}

      {!loading && !error && onMax && connections.length > 0 ? (
        <p className="mt-6 flex items-center gap-1 text-xs text-[var(--muted-foreground)]"><BadgeCheck className="size-3.5" />Every send and every credit spend asks you first.</p>
      ) : null}
    </main>
  );
}
