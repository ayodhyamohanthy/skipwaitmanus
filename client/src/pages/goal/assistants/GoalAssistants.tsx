

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { GoalButton as Button, useOnlineStatus } from "@/components/goal";
import { AssistantLayout, NextStep, Section as Panel } from "./AssistantLayout";

import { ActivityPanel, AssistantsPanel, PlanGate, TokensPanel } from "./ConnectionPanels";
import type { AssistantConnection, AssistantEvent, AssistantToken } from "@/components/assistants/format";

const HEADING = { eyebrow: "Settings", title: "Connected assistants", text: "Use skipwait.me from ChatGPT, Claude and your own tools. You stay in control of every ask and every referral." } as const;
const TABS = [{ id: "assistants", label: "Assistants" }, { id: "tokens", label: "API tokens" }, { id: "activity", label: "Activity" }] as const;
type Tab = (typeof TABS)[number]["id"];

export default function GoalAssistants() {
  const { isSignedIn, isLoaded, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [tab, setTab] = useState<Tab>("assistants");
  // The server decides who may use assistants (the plan gate lives in server/db.ts); the page only follows it.
  const [hasAccess, setHasAccess] = useState(false);
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
    if (!isSignedIn || !isLoaded) return;
    setLoading(true); setLoadError("");
    try {
      const [accessResponse, connectionsResponse, tokensResponse, activityResponse] = await Promise.all([
        fetch("/api/assistants/access", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/connections", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/tokens", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/assistants/activity", { credentials: "include", headers: await authHeaders() }),
      ]);
      const accessPayload = await readApiJson<{ plan?: string; hasAccess?: boolean; error?: string }>(accessResponse, "We could not load assistant access");
      if (!accessResponse.ok) throw new Error(accessPayload.error || "We could not load assistant access");
      const connectionsPayload = await readApiJson<{ connections?: AssistantConnection[]; error?: string }>(connectionsResponse, "We could not load your assistants");
      if (!connectionsResponse.ok) throw new Error(connectionsPayload.error || "We could not load your assistants");
      const tokensPayload = await readApiJson<{ tokens?: AssistantToken[]; error?: string }>(tokensResponse, "We could not load your tokens");
      if (!tokensResponse.ok) throw new Error(tokensPayload.error || "We could not load your tokens");
      const activityPayload = await readApiJson<{ activity?: AssistantEvent[]; error?: string }>(activityResponse, "We could not load assistant activity");
      if (!activityResponse.ok) throw new Error(activityPayload.error || "We could not load assistant activity");
      setHasAccess(accessPayload.hasAccess === true);
      setConnections(Array.isArray(connectionsPayload.connections) ? connectionsPayload.connections.filter(item => item.status === "connected") : []);
      setTokens(Array.isArray(tokensPayload.tokens) ? tokensPayload.tokens : []);
      setActivity(Array.isArray(activityPayload.activity) ? activityPayload.activity : []);
      setLoaded(true);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "We could not load assistant access");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, isLoaded, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const disconnect = async (connection: AssistantConnection) => {
    if (!online || workingId !== null) return;
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
    if (!name || creatingToken || !online) return false;
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
    if (!online || workingId !== null) return;
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

  if (!isLoaded) return <AssistantLayout title="Let your assistant prepare your next ask" description="Checking sign-in..."><p role="status">Please wait.</p></AssistantLayout>;

  if (!isSignedIn) {
    return (
      <AssistantLayout title="Let your assistant prepare your next ask" description={HEADING.text}>
        <Panel className="text-center">

          <h2 className="mt-2 font-semibold">Sign in to manage assistants</h2>
          <p className="mt-1 text-sm text-g-ink-2">Connections, tokens and approvals live on your account.</p>
          <Button variant="primary" className="mt-4" onClick={() => openSignIn()}>Sign in</Button>
        </Panel>
      </AssistantLayout>
    );
  }

  return (
    <AssistantLayout title="Let your assistant prepare your next ask" description={HEADING.text}>

      {!loaded && loading ? <p role="status">Loading your assistants...</p> : null}

      {loadError && !loaded ? (
        <Panel className="mb-4 text-center">
          <h2 className="font-semibold">We could not load your assistant settings.</h2>
          <p role="alert" className="mx-auto mt-1 max-w-md text-sm text-g-ink-2">{loadError}</p>
          <Button className="mt-4" disabledReason={loading ? "Loading assistants" : undefined} onClick={() => { void load(); }}>{loading ? "Trying again…" : "Try again"}</Button>
        </Panel>
      ) : null}

      {loaded ? (
        <>
          <div role="tablist" aria-label="Assistant settings" className="mb-5 flex flex-wrap gap-2 border-b border-g-hairline">
            {TABS.map(item => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 border-b-2 px-4 text-g-label ${tab === item.id ? "border-g-ink text-g-ink" : "border-transparent text-g-ink-3"}`}>{item.label}</button>
            ))}
          </div>

          {actionError ? <p role="alert" className="mb-4 text-sm font-semibold text-g-ink">{actionError}</p> : null}
          {loadError ? <p role="alert" className="mb-4 text-sm font-semibold text-g-ink">{loadError} <Button variant="ghost" className="h-auto p-0" disabledReason={loading ? "Loading assistants" : undefined} onClick={() => { void load(); }}>Try again</Button></p> : null}

          {!hasAccess ? <PlanGate /> : null}
          {hasAccess && tab === "assistants" ? <AssistantsPanel connections={connections} workingId={workingId} onDisconnect={connection => { void disconnect(connection); }} /> : null}
          {hasAccess && tab === "tokens" ? <TokensPanel tokens={tokens} onceToken={onceToken} creating={creatingToken} workingId={workingId} onCreate={createToken} onRevoke={token => { void revokeToken(token); }} /> : null}
          {hasAccess && tab === "activity" ? <ActivityPanel activity={activity} /> : null}
        </>
      ) : null}
    </AssistantLayout>
  );
}
