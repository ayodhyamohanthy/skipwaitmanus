import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import GoalSeekerAgents from "./goal/assistants/GoalSeekerAgents";

/*
 * Skippy step 5 (D-141): the one screen where a seeker grants an AI agent
 * access. Draft-only: scope toggles, limits, expiry (7 days default, 30 max),
 * instant revoke, pause-all, and the audit log. The key is shown exactly once.
 */

type Limits = { creditsPerAsk: number; creditsPerDay: number; creditsPerWeek: number; asksPerDay: number };
type Agent = { id: number; name: string; keyPrefix: string; scopes: string[]; limits: Limits; status: "active" | "paused" | "expired" | "revoked"; expiresAt: string; lastUsedAt: string | null; createdAt: string };
type Draft = { id: number; companySlug: string; targetRoleUrl: string; note: string; jobLevel: number; creditCost: number; status: string; createdAt: string };
type AgentEvent = { id: number; agentName: string; action: string; outcome: string; detail: string | null; createdAt: string };

const DEFAULT_LIMITS: Limits = { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");

function LegacySeekerAgents() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [paused, setPaused] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopeLookup, setScopeLookup] = useState(true);
  const [scopeDraft, setScopeDraft] = useState(true);
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
    if (!isSignedIn) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/seeker/agents", { headers: await headers(), credentials: "include" });
      if (res.status === 404) { setLoadError("Agent access is not turned on yet."); return; }
      const body = await readApiJson<{ agents: Agent[]; paused: boolean }>(res, "Could not load your agents");
      setAgents(body.agents); setPaused(body.paused);
    } catch { setLoadError("Could not load your agents. Try again in a moment."); }
    finally { setLoading(false); }
  }, [isSignedIn, headers]);
  useEffect(() => { void load(); }, [load]);

  const createAgent = async () => {
    setBusy(true); setActionError("");
    try {
      const scopes = [...(scopeLookup ? ["lookup"] : []), ...(scopeDraft ? ["draft"] : [])];
      const res = await fetch("/api/seeker/agents", { method: "POST", headers: await headers(), credentials: "include", body: JSON.stringify({ name, scopes, limits, expiresInDays }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(body.error ?? "The agent could not be created"); return; }
      setOnceKey(body.key); setName(""); setScopeLookup(true); setScopeDraft(true); setExpiresInDays(7); setLimits(DEFAULT_LIMITS);
      await load();
    } finally { setBusy(false); }
  };

  const act = async (path: string) => {
    setBusy(true); setActionError("");
    try {
      const res = await fetch(path, { method: "POST", headers: await headers(), credentials: "include" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setActionError(body.error ?? "That did not work"); return; }
      await load();
    } finally { setBusy(false); }
  };

  const openDetail = async (id: number) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    const h = await headers();
    const [d, e] = await Promise.all([
      fetch(`/api/seeker/agents/${id}/drafts`, { headers: h, credentials: "include" }).then(r => (r.ok ? r.json() : { drafts: [] })),
      fetch(`/api/seeker/agents/${id}/events`, { headers: h, credentials: "include" }).then(r => (r.ok ? r.json() : { events: [] })),
    ]);
    setDrafts(d.drafts); setEvents(e.events);
  };

  if (!isLoaded) return <main className="mx-auto max-w-3xl px-4 py-8"><p className="text-sm text-muted-foreground">Checking sign-in…</p></main>;
  if (!isSignedIn) return <main className="mx-auto max-w-3xl px-4 py-8"><h1 className="text-2xl font-semibold">Your AI agents</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to let an AI assistant look things up and draft asks for you.</p><div className="mt-4"><SignInButton /></div></main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Your AI agents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Let your own AI assistant use skipwait.me for you. An agent can look up companies and prices and draft asks. It cannot send anything, it cannot buy credits or plans, and you can revoke it instantly.
      </p>

      {onceKey ? (
        <section className="mt-6 rounded-md border border-amber-500 bg-amber-50 p-4" role="status">
          <h2 className="text-sm font-semibold">Your new agent key - shown once</h2>
          <p className="mt-1 text-sm">Copy it now and paste it into your agent. We store only a hash, so we cannot show it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white p-2 text-xs" data-testid="agent-key">{onceKey}</code>
            <button type="button" className="min-h-11 rounded-md bg-black px-3 text-sm text-white" onClick={() => void navigator.clipboard?.writeText(onceKey)}>Copy</button>
          </div>
          <button type="button" className="mt-2 text-sm underline" onClick={() => setOnceKey(null)}>I saved it</button>
        </section>
      ) : null}

      <section className="mt-6 rounded-md border p-4">
        <h2 className="text-lg font-medium">Grant an agent</h2>
        <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void createAgent(); }}>
          <label className="block text-sm">Agent name
            <input className="mt-1 min-h-11 w-full rounded-md border px-3" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="My job-hunt bot" required />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">What it may do</legend>
            <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={scopeLookup} onChange={e => setScopeLookup(e.target.checked)} /> Look up companies and prices</label>
            <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={scopeDraft} onChange={e => setScopeDraft(e.target.checked)} /> Draft asks (never sends)</label>
          </fieldset>
          <fieldset className="grid grid-cols-2 gap-3 text-sm">
            <legend className="col-span-2 font-medium">Limits</legend>
            {([["creditsPerAsk", "Credits per ask", 200], ["creditsPerDay", "Credits per day", 500], ["creditsPerWeek", "Credits per week", 1000], ["asksPerDay", "Asks per day", 10]] as const).map(([key, label, max]) => (
              <label key={key} className="block">{label}
                <input type="number" min={1} max={max} className="mt-1 min-h-11 w-full rounded-md border px-3" value={limits[key]} onChange={e => setLimits({ ...limits, [key]: Number(e.target.value) })} />
              </label>
            ))}
          </fieldset>
          <label className="block text-sm">Access expires after (days, max 30)
            <input type="number" min={1} max={30} className="mt-1 min-h-11 w-full rounded-md border px-3" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} />
          </label>
          {actionError ? <p role="alert" className="text-sm text-red-700">{actionError}</p> : null}
          <button type="submit" disabled={busy || !name.trim() || (!scopeLookup && !scopeDraft)} className="min-h-11 rounded-md bg-black px-4 text-white disabled:opacity-50">Create agent key</button>
        </form>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Granted agents</h2>
          {agents.length > 0 ? (
            <button type="button" disabled={busy} onClick={() => void act(paused ? "/api/seeker/agents/resume-all" : "/api/seeker/agents/pause-all")} className="min-h-11 rounded-md border px-3 text-sm">
              {paused ? "Resume all agents" : "Pause all agents"}
            </button>
          ) : null}
        </div>
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}
        {loadError ? <p role="alert" className="mt-3 text-sm text-red-700">{loadError}</p> : null}
        {!loading && !loadError && agents.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No agents yet. Grant one above and your assistant can start drafting.</p> : null}
        <ul className="mt-3 space-y-3">
          {agents.map(agent => (
            <li key={agent.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{agent.name} <span className="text-xs text-muted-foreground">({agent.keyPrefix}…)</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {agent.status === "active" ? "Active" : agent.status === "paused" ? "Paused" : agent.status === "expired" ? "Expired" : "Revoked"} · expires {fmt(agent.expiresAt)} · last used {fmt(agent.lastUsedAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    May: {agent.scopes.includes("lookup") ? "look up" : ""}{agent.scopes.includes("lookup") && agent.scopes.includes("draft") ? " and " : ""}{agent.scopes.includes("draft") ? "draft asks" : ""} · limits: {agent.limits.creditsPerAsk}/ask, {agent.limits.creditsPerDay}/day, {agent.limits.creditsPerWeek}/week credits, {agent.limits.asksPerDay} asks/day
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button type="button" className="min-h-11 rounded-md border px-3 text-sm" onClick={() => void openDetail(agent.id)}>{openId === agent.id ? "Hide activity" : "Activity"}</button>
                  {agent.status === "active" || agent.status === "paused" ? (
                    <button type="button" disabled={busy} className="min-h-11 rounded-md border border-red-300 px-3 text-sm text-red-700" onClick={() => void act(`/api/seeker/agents/${agent.id}/revoke`)}>Revoke</button>
                  ) : null}
                </div>
              </div>
              {openId === agent.id ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div>
                    <h3 className="text-sm font-medium">Drafts by this agent</h3>
                    {drafts.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No drafts yet.</p> : (
                      <ul className="mt-1 space-y-1 text-xs">
                        {drafts.map(d => <li key={d.id} className="rounded border p-2">{d.companySlug} · {d.targetRoleUrl} · costs {d.creditCost} credit(s) · {fmt(d.createdAt)}{d.note ? ` · “${d.note.slice(0, 80)}”` : ""}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">What this agent did</h3>
                    {events.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Nothing yet.</p> : (
                      <ul className="mt-1 space-y-1 text-xs">
                        {events.map(ev => <li key={ev.id} className="rounded border p-2">{fmt(ev.createdAt)} · {ev.action} · {ev.outcome}{ev.detail ? ` · ${ev.detail}` : ""}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default function SeekerAgents() {
  return goalSurfaceOn("assistants") ? <GoalSeekerAgents /> : <LegacySeekerAgents />;
}
