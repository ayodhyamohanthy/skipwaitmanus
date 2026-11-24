import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { GoalButton, GoalField, GoalTextInput, GoalNum, GoalStatus, useOnlineStatus } from "@/components/goal";
import { AssistantLayout, NetworkButton, NextStep, Section } from "./AssistantLayout";

/*
 * Skippy step 5 (D-141): the one screen where a seeker grants an AI agent
 * access. Draft-only: scope toggles, limits, expiry (7 days default, 30 max),
 * instant revoke, pause-all, and the audit log. The key is shown exactly once.
 */

type Limits = { creditsPerAsk: number; creditsPerDay: number; creditsPerWeek: number; asksPerDay: number };
type Agent = { id: number; name: string; keyPrefix: string; scopes: string[]; limits: Limits; autoSend?: boolean; status: "active" | "paused" | "expired" | "revoked"; expiresAt: string; lastUsedAt: string | null; createdAt: string };
type Draft = { id: number; companySlug: string; targetRoleUrl: string; note: string; jobLevel: number; creditCost: number; status: string; createdAt: string };
type AgentEvent = { id: number; agentName: string; action: string; outcome: string; detail: string | null; createdAt: string };

const DEFAULT_LIMITS: Limits = { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");

export default function GoalSeekerAgents() {
  const { isSignedIn, isLoaded, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoSendAvailable, setAutoSendAvailable] = useState(false);
  const [confirmAutoSendAgent, setConfirmAutoSendAgent] = useState<Agent | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopeLookup, setScopeLookup] = useState(true);
  const [scopeDraft, setScopeDraft] = useState(true);
  // SKIPPY-6 (D-290 (1)): off by default. Only lets the agent ask; the seeker approves every send.
  const [scopeSend, setScopeSend] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [onceKey, setOnceKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  const headers = useCallback(async () => {
    const token = await fetchToken();
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/seeker/agents", { headers: await headers(), credentials: "include" });
      if (res.status === 404) { setLoadError("Agent access is not turned on yet."); return; }
      const body = await readApiJson<{ agents: Agent[]; paused: boolean; autoSendAvailable?: boolean }>(res, "Could not load your agents");
      if (!res.ok || !Array.isArray(body.agents)) throw new Error();
      setAgents(body.agents); setPaused(body.paused); setAutoSendAvailable(Boolean(body.autoSendAvailable));
    } catch { setLoadError("Could not load your agents. Try again in a moment."); }
    finally { setLoading(false); }
  }, [isSignedIn, isLoaded, headers]);
  useEffect(() => { void load(); }, [load]);

  const createAgent = async () => {
    if (busy || loading || loadError || !online) return;
    setBusy(true); setActionError("");
    try {
      const scopes = [...(scopeLookup ? ["lookup"] : []), ...(scopeDraft ? ["draft"] : []), ...(scopeSend ? ["send"] : [])];
      const res = await fetch("/api/seeker/agents", { method: "POST", headers: await headers(), credentials: "include", body: JSON.stringify({ name, scopes, limits, expiresInDays }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(body.error ?? "The agent could not be created"); return; }
      setOnceKey(body.key); setName(""); setScopeLookup(true); setScopeDraft(true); setScopeSend(false); setExpiresInDays(7); setLimits(DEFAULT_LIMITS);
      await load();
    } catch { setActionError("That did not complete. Check your connection and try again."); } finally { setBusy(false); }
  };

  const act = async (path: string) => {
    if (busy || !online) return;
    setBusy(true); setActionError("");
    try {
      const res = await fetch(path, { method: "POST", headers: await headers(), credentials: "include" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setActionError(body.error ?? "That did not work"); return; }
      await load();
    } catch { setActionError("That did not complete. Check your connection and try again."); } finally { setBusy(false); }
  };

  const setAutoSend = async (agent: Agent, enabled: boolean) => {
    if (busy || !online) return;
    setBusy(true); setActionError("");
    try {
      const res = await fetch(`/api/seeker/agents/${agent.id}/auto-send`, {
        method: "POST",
        headers: await headers(),
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "That did not work");
        return;
      }
      setConfirmAutoSendAgent(null);
      await load();
    } catch {
      setActionError("That did not complete. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: number) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setDrafts([]); setEvents([]); setDetailError(""); setDetailLoading(true);
    try {
      const h = await headers();
      const [d,e] = await Promise.all([fetch(`/api/seeker/agents/${id}/drafts`, {headers:h,credentials:"include"}),fetch(`/api/seeker/agents/${id}/events`, {headers:h,credentials:"include"})]);
      if (!d.ok || !e.ok) throw new Error();
      const ds = await readApiJson<{drafts: Draft[]}>(d,"Could not load drafts");
      const es = await readApiJson<{events: AgentEvent[]}>(e,"Could not load activity");
      setDrafts(ds.drafts); setEvents(es.events);
    } catch { setDetailError("Activity did not load. Close and reopen it to try again."); }
    finally { setDetailLoading(false); }
  };
  const content = !isLoaded ? <p role="status">Checking sign-in...</p> : !isSignedIn ? <NextStep><p className="mb-3 text-g-body">Sign in to let your agent prepare referrals. It cannot send or buy referrals.</p><GoalButton variant="primary" onClick={() => openSignIn()}>Sign in</GoalButton></NextStep> : <>
    {onceKey ? <Section title="Save your agent key now"><p className="text-g-body text-g-ink-2">Shown once. We store only a hash, so we cannot show it again. Keep it private.</p><code data-testid="agent-key" className="mt-3 block break-all border border-g-control-edge p-3 font-g-mono text-g-mono">{onceKey}</code><GoalButton className="mt-2" onClick={() => { void navigator.clipboard?.writeText(onceKey).catch(() => setActionError("Select and copy your key. Clipboard access did not work.")); }}>Copy key</GoalButton><GoalButton onClick={() => setOnceKey(null)}>I saved it</GoalButton></Section> : null}
    {loading ? <p role="status" className="mb-5 text-g-body">Checking agent access...</p> : null}
    {loadError ? <NextStep><GoalStatus status="queue_new" label="Agent access unavailable" /><p role="alert" className="mt-3 text-g-body">{loadError}</p><p className="mt-2 text-g-meta text-g-ink-2">No key can be created until access is available. You can still find a referral yourself.</p><NetworkButton className="mt-3" onClick={() => void load()} busy={loading}>Check access again</NetworkButton><a className="g-hit ml-3 inline-block underline" href="/explore">Find a referral</a></NextStep> : null}
    {!loading && !loadError ? <NextStep><h2 className="text-g-heading">Give one agent only the access it needs</h2><p className="mt-2 text-g-body text-g-ink-2">Lookup and drafts. With the send permission it can ask you to approve a send; it never sends on its own and never buys referrals or plans.</p><form className="mt-5 grid gap-5" onSubmit={e => {e.preventDefault(); void createAgent();}}>
      <GoalField label="Agent name" htmlFor="agent-name"><GoalTextInput id="agent-name" maxLength={120} value={name} onChange={e => setName(e.target.value)} required /></GoalField>
      <fieldset className="grid gap-2 text-g-body"><legend className="mb-2 text-g-label">What it may do</legend><label className="flex min-h-11 items-center gap-3"><input className="size-5 accent-g-ink" type="checkbox" checked={scopeLookup} onChange={e => setScopeLookup(e.target.checked)} />Look up companies and prices</label><label className="flex min-h-11 items-center gap-3"><input className="size-5 accent-g-ink" type="checkbox" checked={scopeDraft} onChange={e => setScopeDraft(e.target.checked)} />Draft referrals (never sends)</label><label className="flex min-h-11 items-center gap-3"><input className="size-5 accent-g-ink" type="checkbox" checked={scopeSend} onChange={e => setScopeSend(e.target.checked)} />Ask me to approve a send (never sends on its own)</label></fieldset>
      <fieldset className="grid grid-cols-1 gap-4 gdesk:grid-cols-2"><legend className="mb-3 text-g-label">Drafting limits</legend>{([["creditsPerAsk","Referrals per send",200],["creditsPerDay","Referrals per day",500],["creditsPerWeek","Referrals per week",1000],["asksPerDay","Sends per day",10]] as const).map(([key,label,max]) => <GoalField key={key} label={label} htmlFor={`limit-${key}`}><GoalTextInput id={`limit-${key}`} type="number" min={1} max={max} required value={limits[key]} onChange={e => setLimits({...limits,[key]:Number(e.target.value)})}/></GoalField>)}</fieldset>
      <GoalField label="Access expires after (days, max 30)" htmlFor="agent-expiry"><GoalTextInput id="agent-expiry" type="number" min={1} max={30} required value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))}/></GoalField>
      <div><NetworkButton type="submit" variant="primary" busy={busy} blocked={!name.trim() || (!scopeLookup && !scopeDraft && !scopeSend) ? "Name the agent and select at least one permission" : undefined}>Create agent key</NetworkButton><p className="mt-3 text-g-meta text-g-ink-2">Expires automatically. You can pause every agent or revoke one below.</p></div>
    </form></NextStep> : null}
    {actionError ? <p role="alert" className="mb-5 text-g-meta">{actionError}</p> : null}
    {!loadError && !loading ? <Section title="Granted agents"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><GoalStatus status="queue_new" label={paused ? "All agents paused" : "You control each grant"}/>{agents.length ? <NetworkButton blocked={busy ? "An action is in progress" : undefined} onClick={() => void act(paused ? "/api/seeker/agents/resume-all" : "/api/seeker/agents/pause-all")}>{paused ? "Resume all agents" : "Pause all agents"}</NetworkButton> : null}</div>{!agents.length ? <p className="text-g-body text-g-ink-2">No agents yet. Create a key above when you are ready.</p> : null}<ul>{agents.map(agent => <li key={agent.id} className="border-t border-g-hairline py-5">
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-g-label">{agent.name}</h3><p className="mt-1 break-all font-g-mono text-g-mono text-g-ink-3">{agent.keyPrefix}...</p><GoalStatus status={agent.status === "expired" || agent.status === "revoked" ? "expired" : "queue_new"} label={agent.status}/></div><div className="flex flex-wrap items-start gap-2"><GoalButton onClick={() => void openDetail(agent.id)}>{openId === agent.id ? "Hide activity" : "Activity"}</GoalButton>{agent.status === "active" || agent.status === "paused" ? <NetworkButton blocked={busy ? "An action is in progress" : undefined} onClick={() => void act(`/api/seeker/agents/${agent.id}/revoke`)}>Revoke</NetworkButton> : null}</div></div>
      <p className="mt-3 text-g-meta text-g-ink-2">Expires <GoalNum>{fmt(agent.expiresAt)}</GoalNum> · last used <GoalNum>{fmt(agent.lastUsedAt)}</GoalNum></p><p className="mt-2 text-g-meta text-g-ink-2">May: {agent.scopes.join(", ")} · <GoalNum>{agent.limits.creditsPerAsk}</GoalNum> referrals/send, <GoalNum>{agent.limits.creditsPerDay}</GoalNum>/day, <GoalNum>{agent.limits.creditsPerWeek}</GoalNum>/week · <GoalNum>{agent.limits.asksPerDay}</GoalNum> sends/day</p>
      {autoSendAvailable && agent.scopes.includes("send") ? <div className="mt-3 flex flex-wrap items-center gap-3">
        {agent.autoSend ? <>
          <span className="text-g-meta text-g-ink-1">Auto-send is on</span>
          <NetworkButton blocked={busy ? "An action is in progress" : undefined} onClick={() => void setAutoSend(agent, false)}>Turn off auto-send</NetworkButton>
        </> : <>
          <GoalButton onClick={() => setConfirmAutoSendAgent(agent)}>Turn on auto-send</GoalButton>
        </>}
      </div> : null}
      {confirmAutoSendAgent?.id === agent.id ? <div className="mt-4 border border-g-control-edge bg-g-surface-2 p-4">
        <h4 className="text-g-label">Turn on auto-send for {agent.name}?</h4>
        <p className="mt-2 text-g-body">Your assistant will send referral requests without asking you each time, within this grant's limits:</p>
        <ul className="mt-2 list-disc pl-5 text-g-meta text-g-ink-2">
          <li><GoalNum>{agent.limits.creditsPerAsk}</GoalNum> referrals per send</li>
          <li><GoalNum>{agent.limits.creditsPerDay}</GoalNum> referrals per day, <GoalNum>{agent.limits.asksPerDay}</GoalNum> sends per day</li>
          <li>Access expires <GoalNum>{fmt(agent.expiresAt)}</GoalNum></li>
        </ul>
        <p className="mt-2 text-g-meta text-g-ink-2">Each send spends one of your referrals. It never buys referrals or plans. You can pause all agents or revoke access immediately at any time.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <NetworkButton variant="primary" busy={busy} onClick={() => void setAutoSend(agent, true)}>Confirm and turn on</NetworkButton>
          <GoalButton onClick={() => setConfirmAutoSendAgent(null)}>Cancel</GoalButton>
        </div>
      </div> : null}
      {openId === agent.id ? <div className="mt-5 border-t border-g-hairline pt-4">{detailLoading ? <p role="status">Loading activity...</p> : detailError ? <p role="alert">{detailError}</p> : <><h4 className="text-g-label">Drafts by this agent</h4>{!drafts.length ? <p className="mt-2 text-g-meta text-g-ink-2">No drafts yet.</p> : <ul>{drafts.map(d => <li className="mt-3 break-words text-g-meta" key={d.id}>{d.companySlug} · {d.targetRoleUrl} · <GoalNum>{d.creditCost}</GoalNum> {d.creditCost === 1 ? "referral" : "referrals"} · {d.status}{d.note ? <p className="mt-2 whitespace-pre-wrap">{d.note}</p> : null}</li>)}</ul>}<h4 className="mt-5 text-g-label">What this agent did</h4>{!events.length ? <p className="mt-2 text-g-meta text-g-ink-2">Nothing yet.</p> : <ul>{events.map(ev => <li key={ev.id} className="mt-3 break-words text-g-meta"><GoalNum>{fmt(ev.createdAt)}</GoalNum> · {ev.action} · {ev.outcome}{ev.detail ? ` · ${ev.detail}` : ""}</li>)}</ul>}</>}</div> : null}
    </li>)}</ul></Section> : null}
  </>;
  return <AssistantLayout screen="agents" title="Let your agent prepare a better referral" description="Give your own AI assistant limited, expiring access. It may look up companies and prices, draft referrals, and with the send permission ask you to approve a send. It never sends on its own and never buys referrals or plans.">{content}</AssistantLayout>;
}
