import { Bot } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { ActivityPanel, AssistantsPanel, PlanGate, TokensPanel } from "@/components/assistants/AssistantPanels";
import type { AssistantConnection, AssistantEvent, AssistantToken } from "@/components/assistants/format";

const HEADING = { eyebrow: "Settings", title: "Connected assistants", text: "Use SkipWait from ChatGPT, Claude and your own tools. You stay in control of every ask and every credit." } as const;
const TABS = [{ id: "assistants", label: "Assistants" }, { id: "tokens", label: "API tokens" }, { id: "activity", label: "Activity" }] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Assistants() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [tab, setTab] = useState<Tab>("assistants");
  const [plan, setPlan] = useState<string | null>(null);
  const [connections, setConnections] = useState<AssistantConnection[]>([]);
  const [tokens, setTokens] = useState<AssistantToken[]>([]);
  const [activity, setActivity] = useState<AssistantEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [onceToken, setOnceToken] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setLoadError("");
    try {
      const [accessResponse, connectionsResponse, tokensResponse, activityResponse] = await Promise.all([
        fetch("/api/assistants/access", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/connections", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/tokens", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/activity", { credentials: "include", headers: await authHeaders() }),
      ]);
      const accessPayload = await readApiJson<{ plan?: string; error?: string }>(accessResponse, "We could not load assistant access");
      if (!accessResponse.ok) throw new Error(accessPayload.error || "We could not load assistant access");
      const connectionsPayload = await readApiJson<{ connections?: AssistantConnection[]; error?: string }>(connectionsResponse, "We could not load your assistants");
      if (!connectionsResponse.ok) throw new Error(connectionsPayload.error || "We could not load your assistants");
      const tokensPayload = await readApiJson<{ tokens?: AssistantToken[]; error?: string }>(tokensResponse, "We could not load your tokens");
      if (!tokensResponse.ok) throw new Error(tokensPayload.error || "We could not load your tokens");
      const activityPayload = await readApiJson<{ activity?: AssistantEvent[]; error?: string }>(activityResponse, "We could not load assistant activity");
      if (!activityResponse.ok) throw new Error(activityPayload.error || "We could not load assistant activity");
      setPlan(accessPayload.plan ?? null);
      setConnections(Array.isArray(connectionsPayload.connections) ? connectionsPayload.connections.filter(item => item.status === "connected") : []);
      setTokens(Array.isArray(tokensPayload.tokens) ? tokensPayload.tokens : []);
      setActivity(Array.isArray(activityPayload.activity) ? activityPayload.activity : []);
      setLoaded(true);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "We could not load assistant access");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const disconnect = async (connection: AssistantConnection) => {
    setWorkingId(connection.id); setActionError("");
    try {
      const response = await fetch(`/api/assistants/connections/${connection.id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ error?: string }>(response, "We could not disconnect this assistant");
      if (!response.ok) throw new Error(payload.error || "We could not disconnect this assistant");
      setConnections(current => current.filter(item => item.id !== connection.id));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "We could not disconnect this assistant");
    } finally {
      setWorkingId(null);
    }
  };

  const createToken = async (name: string): Promise<boolean> => {
    if (!name || creatingToken) return false;
    setCreatingToken(true); setActionError("");
    try {
      const response = await fetch("/api/assistants/tokens", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ name }) });
      const payload = await readApiJson<{ token?: { id: number; token: string }; error?: string }>(response, "We could not create this token");
      if (!response.ok || !payload.token) throw new Error(payload.error || "We could not create this token");
      setOnceToken(payload.token.token);
      await load();
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "We could not create this token");
      return false;
    } finally {
      setCreatingToken(false);
    }
  };

  const revokeToken = async (token: AssistantToken) => {
    setWorkingId(token.id); setActionError("");
    try {
      const response = await fetch(`/api/assistants/tokens/${token.id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ error?: string }>(response, "We could not revoke this token");
      if (!response.ok) throw new Error(payload.error || "We could not revoke this token");
      setTokens(current => current.filter(item => item.id !== token.id));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "We could not revoke this token");
    } finally {
      setWorkingId(null);
    }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="assistants" className="page-content mx-auto max-w-3xl">
        <Heading {...HEADING} />
        <Panel className="text-center">
          <Bot className="mx-auto size-8" />
          <h2 className="mt-2 font-semibold">Sign in to manage assistants</h2>
          <p className="mt-1 text-sm text-muted-foreground">Connections, tokens and approvals live on your account.</p>
          <SignInButton><button type="button" className={buttonVariants({ className: "mt-4" })}>Sign in</button></SignInButton>
        </Panel>
      </main>
    );
  }

  const onMax = plan === "max";

  return (
    <main data-skipwait-screen="assistants" className="page-content mx-auto max-w-3xl">
      <Heading {...HEADING} />

      {!loaded && loading ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your assistants…</p> : null}

      {loadError && !loaded ? (
        <Panel tone="muted" className="mb-4 text-center">
          <h2 className="font-semibold">We could not load your assistant settings.</h2>
          <p role="alert" className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-4" disabled={loading} onClick={() => { void load(); }}>{loading ? "Trying again…" : "Try again"}</Button>
        </Panel>
      ) : null}

      {loaded ? (
        <>
          <div role="tablist" aria-label="Assistant settings" className="mb-5 mt-5 flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
            {TABS.map(item => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-sm ${tab === item.id ? "bg-background font-semibold shadow-sm" : ""}`}>{item.label}</button>
            ))}
          </div>

          {actionError ? <p role="alert" className="mb-4 text-sm font-semibold text-destructive">{actionError}</p> : null}
          {loadError ? <p role="alert" className="mb-4 text-sm font-semibold text-destructive">{loadError} <Button variant="link" className="h-auto p-0" disabled={loading} onClick={() => { void load(); }}>Try again</Button></p> : null}

          {!onMax ? <PlanGate /> : null}
          {onMax && tab === "assistants" ? <AssistantsPanel connections={connections} workingId={workingId} onDisconnect={connection => { void disconnect(connection); }} /> : null}
          {onMax && tab === "tokens" ? <TokensPanel tokens={tokens} onceToken={onceToken} creating={creatingToken} workingId={workingId} onCreate={createToken} onRevoke={token => { void revokeToken(token); }} /> : null}
          {onMax && tab === "activity" ? <ActivityPanel activity={activity} /> : null}
        </>
      ) : null}
    </main>
  );
}
