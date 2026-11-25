// ADMIN-activity-log (D-393): the admin activity log. Admin role only, `private, no-store`, and every read or
// export of the log is itself logged. Filters: person (account id or email; an email also matches sign-in
// attempts with no account through their HMAC key), family, outcome, free text, action, date range; pages go
// back by id (`before`), and an export returns the filtered range as CSV, at most ACTIVITY_EXPORT_MAX rows.
// A person's referral-request history (referralTransitionEvents, which includes the transitions scheduled jobs
// make) is its own read beside the log.
import type { Express, Request, Response } from "express";
import {
  ACTIVITY_EXPORT_MAX, ACTIVITY_PAGE_MAX, activityFilterSchema, csvCell,
  type ActivityFamily, type ActivityFilter, type ActivityPersonMatch,
} from "../shared/adminActivity";

type Outcome = "success" | "failure" | "denied";
type Identity = { account: { id: number; role?: string } } | null | undefined;

export type ActivityListInput = {
  limit: number;
  action?: string;
  query?: string;
  outcome?: Outcome;
  family?: ActivityFamily;
  userIds?: number[];
  emailKey?: string;
  from?: Date;
  to?: Date;
  before?: number;
};

export type AdminActivityDeps = {
  resolveIdentity: (req: Request) => Promise<Identity>;
  listOperationalActivity?: (input: ActivityListInput) => Promise<unknown[]>;
  resolveActivityPerson?: (person: string) => Promise<ActivityPersonMatch>;
  listPersonRequestTransitions?: (userIds: number[], limit: number) => Promise<unknown[]>;
  record: (input: { actorUserId: number; action: string; outcome: Outcome; resourceType: string; metadata: Record<string, string | number | boolean | null> }) => void;
};

const DAY_MS = 86_400_000;
const idOf = (row: unknown): number | undefined => {
  const id = typeof row === "object" && row !== null ? (row as { id?: unknown }).id : undefined;
  return typeof id === "number" ? id : undefined;
};

async function personMatch(deps: AdminActivityDeps, person: string): Promise<ActivityPersonMatch> {
  if (/^\d{1,10}$/.test(person)) return { userIds: [Number(person)] };
  return deps.resolveActivityPerson ? deps.resolveActivityPerson(person) : { userIds: [] };
}

/** The list query for a parsed filter, or null when the person filter matches nobody. */
export async function activityListInput(deps: AdminActivityDeps, filter: ActivityFilter, limit: number): Promise<ActivityListInput | null> {
  const input: ActivityListInput = { limit };
  if (filter.action) input.action = filter.action;
  if (filter.query) input.query = filter.query;
  if (filter.outcome) input.outcome = filter.outcome;
  if (filter.family) input.family = filter.family;
  if (filter.from) input.from = new Date(`${filter.from}T00:00:00.000Z`);
  if (filter.to) input.to = new Date(Date.parse(`${filter.to}T00:00:00.000Z`) + DAY_MS);
  if (filter.before) input.before = filter.before;
  if (filter.person) {
    const match = await personMatch(deps, filter.person);
    if (!match.userIds.length && !match.emailKey) return null;
    input.userIds = match.userIds;
    if (match.emailKey) input.emailKey = match.emailKey;
  }
  return input;
}

const filtered = (filter: ActivityFilter) => Boolean(filter.action || filter.query || filter.outcome || filter.family || filter.person || filter.from || filter.to);

async function requireAdmin(deps: AdminActivityDeps, req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const identity = await deps.resolveIdentity(req);
  if (!identity || identity.account.role !== "admin") { res.status(403).json({ error: "Administrator access is required" }); return undefined; }
  return identity;
}

function parseFilter(req: Request, res: Response): ActivityFilter | undefined {
  const parsed = activityFilterSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Check the activity filters and try again" }); return undefined; }
  return parsed.data;
}

const CSV_COLUMNS = ["id", "createdAt", "actorUserId", "actorEmail", "action", "outcome", "resourceType", "resourceId", "companyDomain", "metadata"] as const;

export function registerAdminActivityRoutes(app: Express, deps: AdminActivityDeps): void {
  app.get("/api/admin/activity", async (req, res) => {
    try {
      const identity = await requireAdmin(deps, req, res);
      if (!identity) return;
      const filter = parseFilter(req, res);
      if (!filter) return;
      const limit = filter.limit ?? 100;
      const input = await activityListInput(deps, filter, limit + 1);
      const rows = input ? await deps.listOperationalActivity?.(input) ?? [] : [];
      const events = rows.slice(0, limit);
      const nextBefore = rows.length > limit ? idOf(events[events.length - 1]) ?? null : null;
      deps.record({ actorUserId: identity.account.id, action: "admin.activity_viewed", outcome: "success", resourceType: "activity_log", metadata: { limit, filtered: filtered(filter), family: filter.family ?? null, person: Boolean(filter.person), page: Boolean(filter.before) } });
      res.json({ events, nextBefore });
    } catch {
      res.status(500).json({ error: "We could not load operational activity" });
    }
  });

  app.get("/api/admin/activity/export", async (req, res) => {
    try {
      const identity = await requireAdmin(deps, req, res);
      if (!identity) return;
      const filter = parseFilter(req, res);
      if (!filter) return;
      const rows: unknown[] = [];
      let before = filter.before;
      while (rows.length < ACTIVITY_EXPORT_MAX) {
        const input = await activityListInput(deps, { ...filter, before }, ACTIVITY_PAGE_MAX);
        const page = input ? await deps.listOperationalActivity?.(input) ?? [] : [];
        rows.push(...page.slice(0, ACTIVITY_EXPORT_MAX - rows.length));
        const last = idOf(page[page.length - 1]);
        if (page.length < ACTIVITY_PAGE_MAX || last === undefined) break;
        before = last;
      }
      const lines = [CSV_COLUMNS.join(","), ...rows.map(row => CSV_COLUMNS.map(column => csvCell((row as Record<string, unknown>)[column])).join(","))];
      deps.record({ actorUserId: identity.account.id, action: "admin.activity_exported", outcome: "success", resourceType: "activity_log", metadata: { rows: rows.length, filtered: filtered(filter), family: filter.family ?? null, person: Boolean(filter.person) } });
      res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="skipwait-activity-${new Date().toISOString().slice(0, 10)}.csv"`).send(`${lines.join("\r\n")}\r\n`);
    } catch {
      res.status(500).json({ error: "We could not export operational activity" });
    }
  });

  app.get("/api/admin/activity/requests", async (req, res) => {
    try {
      const identity = await requireAdmin(deps, req, res);
      if (!identity) return;
      const filter = parseFilter(req, res);
      if (!filter) return;
      if (!filter.person) return res.status(400).json({ error: "Choose a person to see their referral requests" });
      const match = await personMatch(deps, filter.person);
      const transitions = match.userIds.length ? await deps.listPersonRequestTransitions?.(match.userIds, 200) ?? [] : [];
      deps.record({ actorUserId: identity.account.id, action: "admin.person_requests_viewed", outcome: "success", resourceType: "activity_log", metadata: { matched: match.userIds.length, rows: transitions.length } });
      res.json({ transitions });
    } catch {
      res.status(500).json({ error: "We could not load this person's referral requests" });
    }
  });
}
