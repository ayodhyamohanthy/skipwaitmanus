// Skippy step 5 (D-141), draft-only: a seeker's own AI agents.
//
// Two surfaces, both off unless SKIPPIE_AGENT_ENABLED:
// - /api/seeker/agents*  (seeker's session): grant, list, revoke, pause-all,
//   drafts and the audit log. The key is returned exactly once at grant time.
// - /api/agent/v1/*      (agent key only): look up companies and prices, draft
//   an ask. There is NO send path in this step and no path to any purchase:
//   an agent key is never a session, and checkout routes resolve only sessions.
//
// Anything inside user data (the note, a job page URL) is data, never an
// instruction (D-140). The key is never logged or echoed back.
import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  AGENT_DAILY_CALL_CAP,
  AGENT_ERROR,
  AGENT_EXPIRY_DEFAULT_DAYS,
  AGENT_HOURLY_CALL_CAP,
  AGENT_KEY_PATTERN,
  AGENT_KEY_PREFIX,
  AGENT_LIMIT_DEFAULTS,
  type AgentDraftView,
  type AgentEventView,
  type AgentGrantView,
  type AgentLimits,
  type AgentScope,
  createAgentGrantInputSchema,
  agentDraftInputSchema,
} from "../shared/seekerAgents";
import type { PlanCatalogResponse } from "../shared/billingCatalog";
import type { PublicCompany } from "../shared/companies";

export type GrantRow = {
  id: number;
  userId: number;
  name: string;
  keyPrefix: string;
  canLookup: boolean;
  canDraft: boolean;
  maxCreditsPerAsk: number;
  maxCreditsPerDay: number;
  maxCreditsPerWeek: number;
  maxAsksPerDay: number;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};
export type DraftRow = { id: number; grantId: number; userId: number; companySlug: string; targetRoleUrl: string; note: string; jobLevel: number; creditCost: number; status: "draft" | "discarded"; createdAt: Date };
export type EventRow = { id: number; grantId: number | null; agentName: string; action: string; outcome: "success" | "denied" | "failure"; detail: string | null; createdAt: Date };

export type SeekerAgentStore = {
  createGrant: (input: { userId: number; name: string; keyPrefix: string; keyHash: string; canLookup: boolean; canDraft: boolean; limits: AgentLimits; expiresAt: Date }) => Promise<GrantRow>;
  listGrants: (userId: number) => Promise<GrantRow[]>;
  getGrantForUser: (userId: number, id: number) => Promise<GrantRow | undefined>;
  findGrantByKeyHash: (keyHash: string) => Promise<GrantRow | undefined>;
  revokeGrant: (userId: number, id: number, now: Date) => Promise<boolean>;
  touchLastUsed: (id: number, now: Date) => Promise<void>;
  isPaused: (userId: number) => Promise<boolean>;
  setPaused: (userId: number, paused: boolean, now: Date) => Promise<void>;
  createDraft: (input: { grantId: number; userId: number; companySlug: string; targetRoleUrl: string; note: string; jobLevel: number; creditCost: number }) => Promise<DraftRow>;
  listDraftsByGrant: (grantId: number, limit: number) => Promise<DraftRow[]>;
  sumDraftCreditsSince: (grantId: number, since: Date) => Promise<number>;
  countDraftsSince: (grantId: number, since: Date) => Promise<number>;
  listEvents: (userId: number, grantId: number, limit: number) => Promise<EventRow[]>;
  recordEvent: (input: { userId: number; grantId: number | null; agentName: string; action: string; outcome: "success" | "denied" | "failure"; detail?: string | null }) => Promise<void>;
};

export type SeekerAgentRouteDeps = {
  enabled: () => boolean;
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  store: SeekerAgentStore;
  /** Live company directory (public view only). */
  listCompanies: () => Promise<PublicCompany[]>;
  /** Live price book for one region; throws when prices cannot be read. */
  prices: (req: Request, region: "IN" | "INTL") => Promise<PlanCatalogResponse>;
  /** The same level/cost the pre-send quote route computes. */
  quoteCost: (targetRoleUrl: string) => { level: number; cost: number };
  /** Directory entry lookup, for validating a draft's company. */
  getCompanyDirectoryEntry: (slug: string) => Promise<{ name: string } | undefined>;
  now?: () => number;
};

const grantView = (grant: GrantRow, paused: boolean, nowMs: number): AgentGrantView => ({
  id: grant.id,
  name: grant.name,
  keyPrefix: grant.keyPrefix,
  scopes: [...(grant.canLookup ? ["lookup" as const] : []), ...(grant.canDraft ? ["draft" as const] : [])],
  limits: { creditsPerAsk: grant.maxCreditsPerAsk, creditsPerDay: grant.maxCreditsPerDay, creditsPerWeek: grant.maxCreditsPerWeek, asksPerDay: grant.maxAsksPerDay },
  status: grant.revokedAt ? "revoked" : grant.expiresAt.getTime() <= nowMs ? "expired" : paused ? "paused" : "active",
  expiresAt: grant.expiresAt.toISOString(),
  lastUsedAt: grant.lastUsedAt ? grant.lastUsedAt.toISOString() : null,
  createdAt: grant.createdAt.toISOString(),
});
const draftView = (row: DraftRow): AgentDraftView => ({ id: row.id, companySlug: row.companySlug, targetRoleUrl: row.targetRoleUrl, note: row.note, jobLevel: row.jobLevel, creditCost: row.creditCost, status: row.status, createdAt: row.createdAt.toISOString() });
const eventView = (row: EventRow): AgentEventView => ({ id: row.id, agentName: row.agentName, action: row.action, outcome: row.outcome, detail: row.detail, createdAt: row.createdAt.toISOString() });

const newKey = () => `${AGENT_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-agent call caps, kept in process memory (durable money/ask limits live in the store). */
const callWindows = new Map<number, { hourStart: number; hourCount: number; dayStart: number; dayCount: number }>();
export function agentCallLimited(grantId: number, nowMs: number): boolean {
  const hour = Math.floor(nowMs / 3_600_000);
  const day = Math.floor(nowMs / DAY_MS);
  const seen = callWindows.get(grantId);
  const state = {
    hourStart: hour,
    hourCount: seen && seen.hourStart === hour ? seen.hourCount : 0,
    dayStart: day,
    dayCount: seen && seen.dayStart === day ? seen.dayCount : 0,
  };
  if (state.hourCount >= AGENT_HOURLY_CALL_CAP || state.dayCount >= AGENT_DAILY_CALL_CAP) return true;
  state.hourCount += 1;
  state.dayCount += 1;
  callWindows.set(grantId, state);
  if (callWindows.size > 10_000) callWindows.clear();
  return false;
}

/** Tests only: drop every in-process rate window. */
export function resetAgentCallWindowsForTest(): void { callWindows.clear(); }

type AgentAuth =
  | { ok: true; grant: GrantRow }
  | { ok: false; status: number; error: string; grant?: GrantRow };

async function authenticateAgent(req: Request, deps: SeekerAgentRouteDeps, nowMs: number): Promise<AgentAuth> {
  const header = typeof req.get("Authorization") === "string" ? req.get("Authorization")! : "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  const key = match ? match[1] : "";
  if (!AGENT_KEY_PATTERN.test(key)) return { ok: false, status: 401, error: AGENT_ERROR.badKey };
  const grant = await deps.store.findGrantByKeyHash(hashKey(key));
  if (!grant) return { ok: false, status: 401, error: AGENT_ERROR.badKey };
  if (grant.revokedAt) return { ok: false, status: 401, error: AGENT_ERROR.revoked, grant };
  if (grant.expiresAt.getTime() <= nowMs) return { ok: false, status: 401, error: AGENT_ERROR.expired, grant };
  if (await deps.store.isPaused(grant.userId)) return { ok: false, status: 403, error: AGENT_ERROR.paused, grant };
  if (agentCallLimited(grant.id, nowMs)) return { ok: false, status: 429, error: AGENT_ERROR.rateLimited, grant };
  return { ok: true, grant };
}

export function registerSeekerAgentRoutes(app: Express, deps: SeekerAgentRouteDeps) {
  const nowMs = () => (deps.now ? deps.now() : Date.now());
  const noStore = (res: Response) => res.set("Cache-Control", "private, no-store");
  const event = (input: Parameters<SeekerAgentStore["recordEvent"]>[0]) => { void deps.store.recordEvent(input).catch(() => undefined); };

  /** Agent-key guard shared by every /api/agent/v1 route. Responds and returns undefined on refusal. */
  const agentGuard = async (req: Request, res: Response, action: string): Promise<GrantRow | undefined> => {
    const auth = await authenticateAgent(req, deps, nowMs());
    if (!auth.ok) {
      if (auth.grant) event({ userId: auth.grant.userId, grantId: auth.grant.id, agentName: auth.grant.name, action, outcome: "denied", detail: auth.error });
      noStore(res).status(auth.status).json({ error: auth.error });
      return undefined;
    }
    await deps.store.touchLastUsed(auth.grant.id, new Date(nowMs())).catch(() => undefined);
    return auth.grant;
  };

  // ---- Agent surface (key only; never a session) ----

  app.get("/api/agent/v1/me", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const grant = await agentGuard(req, res, "agent.me");
    if (!grant) return;
    event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.me", outcome: "success" });
    noStore(res).json({ agent: grantView(grant, false, nowMs()) });
  });

  app.get("/api/agent/v1/companies", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const grant = await agentGuard(req, res, "agent.companies");
    if (!grant) return;
    if (!grant.canLookup) { event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.companies", outcome: "denied", detail: AGENT_ERROR.scope }); return noStore(res).status(403).json({ error: AGENT_ERROR.scope }); }
    try {
      const q = (typeof req.query.q === "string" ? req.query.q : "").trim().toLowerCase();
      let companies = await deps.listCompanies();
      if (q) companies = companies.filter(c => c.name.toLowerCase().includes(q) || c.slug.includes(q));
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.companies", outcome: "success", detail: q ? `q=${q.slice(0, 80)}` : null });
      noStore(res).json({ companies: companies.slice(0, 50) });
    } catch {
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.companies", outcome: "failure" });
      noStore(res).status(500).json({ error: "Companies are unavailable right now" });
    }
  });

  app.get("/api/agent/v1/prices", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const grant = await agentGuard(req, res, "agent.prices");
    if (!grant) return;
    if (!grant.canLookup) { event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.prices", outcome: "denied", detail: AGENT_ERROR.scope }); return noStore(res).status(403).json({ error: AGENT_ERROR.scope }); }
    try {
      const region = req.query.region === "IN" ? "IN" : "INTL";
      const catalog = await deps.prices(req, region);
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.prices", outcome: "success", detail: `region=${region}` });
      noStore(res).json(catalog);
    } catch {
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.prices", outcome: "failure" });
      noStore(res).status(503).json({ error: "Prices are unavailable right now. Try again in a moment." });
    }
  });

  app.post("/api/agent/v1/drafts", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const grant = await agentGuard(req, res, "agent.draft_create");
    if (!grant) return;
    if (!grant.canDraft) { event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "denied", detail: AGENT_ERROR.scope }); return noStore(res).status(403).json({ error: AGENT_ERROR.scope }); }
    const parsed = agentDraftInputSchema.safeParse(req.body);
    if (!parsed.success) return noStore(res).status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the draft and try again" });
    const input = parsed.data;
    try {
      const company = await deps.getCompanyDirectoryEntry(input.companySlug);
      if (!company) return noStore(res).status(400).json({ error: "Choose a company from the list" });
      const { level, cost } = deps.quoteCost(input.targetRoleUrl);
      if (cost > grant.maxCreditsPerAsk) {
        event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "denied", detail: `cost ${cost} > per-ask limit ${grant.maxCreditsPerAsk}` });
        return noStore(res).status(400).json({ error: AGENT_ERROR.creditLimit, cost, limit: grant.maxCreditsPerAsk });
      }
      const [draftsToday, creditsDay, creditsWeek] = await Promise.all([
        deps.store.countDraftsSince(grant.id, new Date(nowMs() - DAY_MS)),
        deps.store.sumDraftCreditsSince(grant.id, new Date(nowMs() - DAY_MS)),
        deps.store.sumDraftCreditsSince(grant.id, new Date(nowMs() - 7 * DAY_MS)),
      ]);
      if (draftsToday >= grant.maxAsksPerDay) {
        event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "denied", detail: AGENT_ERROR.askLimit });
        return noStore(res).status(429).json({ error: AGENT_ERROR.askLimit, limit: grant.maxAsksPerDay });
      }
      if (creditsDay + cost > grant.maxCreditsPerDay || creditsWeek + cost > grant.maxCreditsPerWeek) {
        event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "denied", detail: "over daily/weekly credit limit" });
        return noStore(res).status(429).json({ error: AGENT_ERROR.creditLimit });
      }
      const draft = await deps.store.createDraft({ grantId: grant.id, userId: grant.userId, companySlug: input.companySlug, targetRoleUrl: input.targetRoleUrl, note: input.note?.trim() ?? "", jobLevel: level, creditCost: cost });
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "success", detail: `draft ${draft.id} for ${input.companySlug}, ${cost} credit(s)` });
      noStore(res).status(201).json({ draft: draftView(draft), company: { name: company.name } });
    } catch {
      event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_create", outcome: "failure" });
      noStore(res).status(500).json({ error: "The draft could not be saved" });
    }
  });

  app.get("/api/agent/v1/drafts", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const grant = await agentGuard(req, res, "agent.draft_list");
    if (!grant) return;
    if (!grant.canDraft) { event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_list", outcome: "denied", detail: AGENT_ERROR.scope }); return noStore(res).status(403).json({ error: AGENT_ERROR.scope }); }
    const drafts = await deps.store.listDraftsByGrant(grant.id, 100);
    event({ userId: grant.userId, grantId: grant.id, agentName: grant.name, action: "agent.draft_list", outcome: "success" });
    noStore(res).json({ drafts: drafts.map(draftView) });
  });

  // ---- Seeker surface (signed-in session) ----

  const seekerGuard = async (req: Request, res: Response): Promise<number | undefined> => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) { noStore(res).status(401).json({ error: "Sign in to continue" }); return undefined; }
    return identity.account.id;
  };

  app.get("/api/seeker/agents", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    const [grants, paused] = await Promise.all([deps.store.listGrants(userId), deps.store.isPaused(userId)]);
    noStore(res).json({ agents: grants.map(g => grantView(g, paused, nowMs())), paused });
  });

  app.post("/api/seeker/agents", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    const parsed = createAgentGrantInputSchema.safeParse(req.body);
    if (!parsed.success) return noStore(res).status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again" });
    const input = parsed.data;
    const scopes = new Set<AgentScope>(input.scopes ?? ["lookup", "draft"]);
    const limits: AgentLimits = { ...AGENT_LIMIT_DEFAULTS, ...(input.limits ?? {}) };
    const days = input.expiresInDays ?? AGENT_EXPIRY_DEFAULT_DAYS;
    const key = newKey();
    try {
      const grant = await deps.store.createGrant({
        userId,
        name: input.name,
        keyPrefix: key.slice(0, 12),
        keyHash: hashKey(key),
        canLookup: scopes.has("lookup"),
        canDraft: scopes.has("draft"),
        limits,
        expiresAt: new Date(nowMs() + days * DAY_MS),
      });
      event({ userId, grantId: grant.id, agentName: grant.name, action: "grant.create", outcome: "success", detail: `expires in ${days} day(s)` });
      // The one and only time the key is shown.
      noStore(res).status(201).json({ agent: grantView(grant, false, nowMs()), key });
    } catch {
      event({ userId, grantId: null, agentName: input.name.slice(0, 120), action: "grant.create", outcome: "failure" });
      noStore(res).status(500).json({ error: "The agent could not be created" });
    }
  });

  app.post("/api/seeker/agents/:id/revoke", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return noStore(res).status(400).json({ error: "Unknown agent" });
    const grant = await deps.store.getGrantForUser(userId, id); // ownership check: another seeker's agent is invisible
    if (!grant) return noStore(res).status(404).json({ error: "Unknown agent" });
    await deps.store.revokeGrant(userId, id, new Date(nowMs()));
    event({ userId, grantId: id, agentName: grant.name, action: "grant.revoke", outcome: "success" });
    noStore(res).json({ ok: true });
  });

  app.post("/api/seeker/agents/pause-all", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    await deps.store.setPaused(userId, true, new Date(nowMs()));
    event({ userId, grantId: null, agentName: "(all agents)", action: "agents.pause_all", outcome: "success" });
    noStore(res).json({ ok: true, paused: true });
  });

  app.post("/api/seeker/agents/resume-all", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    await deps.store.setPaused(userId, false, new Date(nowMs()));
    event({ userId, grantId: null, agentName: "(all agents)", action: "agents.resume_all", outcome: "success" });
    noStore(res).json({ ok: true, paused: false });
  });

  app.get("/api/seeker/agents/:id/drafts", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    const id = Number(req.params.id);
    const grant = Number.isInteger(id) && id > 0 ? await deps.store.getGrantForUser(userId, id) : undefined;
    if (!grant) return noStore(res).status(404).json({ error: "Unknown agent" });
    const drafts = await deps.store.listDraftsByGrant(grant.id, 100);
    noStore(res).json({ drafts: drafts.map(draftView) });
  });

  app.get("/api/seeker/agents/:id/events", async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ error: "Not found" });
    const userId = await seekerGuard(req, res);
    if (userId === undefined) return;
    const id = Number(req.params.id);
    const grant = Number.isInteger(id) && id > 0 ? await deps.store.getGrantForUser(userId, id) : undefined;
    if (!grant) return noStore(res).status(404).json({ error: "Unknown agent" });
    const events = await deps.store.listEvents(userId, grant.id, 100);
    noStore(res).json({ events: events.map(eventView) });
  });
}
