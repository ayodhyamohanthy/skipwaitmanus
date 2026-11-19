/**
 * Seeker Skippy routes (step 2, D-136..D-142). Off unless SKIPPIE_SEEKER_ENABLED=true
 * and even then only for the account ids in SKIPPIE_SEEKER_USER_IDS (the test
 * seeker). Daily caps are enforced server-side (D-138). Every turn is audited.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  SKIPPIE_SEEKER_DAILY_CAP,
  SKIPPIE_SEEKER_GLOBAL_DAILY_CAP,
  SKIPPIE_SEEKER_TEXT_MAX,
  advanceSkippieSeeker,
  newSkippieSession,
  publicSession,
  type SkippieSeekerDeps,
  type SkippieSession,
  type SkippieTurn,
} from "./skippieSeeker";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> };

export type SkippieSeekerRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity: (input: ActivityInput) => void;
  /** Flag + test-seeker allowlist. Off everywhere unless both allow it. */
  enabled: () => boolean;
  allowedUserIds: () => ReadonlySet<number>;
  deps: () => SkippieSeekerDeps;
  listOwnedResumes: (userId: number) => Promise<Array<{ id: number; fileName: string; mimeType?: string }>>;
  /** Runs after a covered ask is created (same referrer notifications as the normal page). */
  afterCreate?: (req: Request, userId: number, result: { requestId: number; companyDomain: string; replayed?: boolean }) => void;
  now?: () => number;
};

const turnSchema = z.object({
  kind: z.enum(["text", "choose_resume", "consent", "submit_note", "confirm_suggested_note", "tailor_start", "tailor_skip", "tailor_skill", "tailor_build", "tailor_approve", "confirm_send", "restart"]),
  text: z.string().max(SKIPPIE_SEEKER_TEXT_MAX).optional(),
  attachmentId: z.number().int().positive().optional(),
  allow: z.boolean().optional(),
  skill: z.string().max(300).optional(),
  knows: z.boolean().optional(),
  approve: z.boolean().optional(),
  send: z.boolean().optional(),
});

function toTurn(body: z.infer<typeof turnSchema>): SkippieTurn | undefined {
  switch (body.kind) {
    case "text": return typeof body.text === "string" ? { kind: "text", text: body.text } : undefined;
    case "choose_resume": return typeof body.attachmentId === "number" ? { kind: "choose_resume", attachmentId: body.attachmentId } : undefined;
    case "consent": return typeof body.allow === "boolean" ? { kind: "consent", allow: body.allow } : undefined;
    case "submit_note": return typeof body.text === "string" ? { kind: "submit_note", text: body.text } : undefined;
    case "confirm_suggested_note": return { kind: "confirm_suggested_note" };
    case "tailor_start": return { kind: "tailor_start" };
    case "tailor_skip": return { kind: "tailor_skip" };
    case "tailor_skill": return typeof body.skill === "string" && typeof body.knows === "boolean" ? { kind: "tailor_skill", skill: body.skill, knows: body.knows } : undefined;
    case "tailor_build": return { kind: "tailor_build" };
    case "tailor_approve": return typeof body.approve === "boolean" ? { kind: "tailor_approve", approve: body.approve } : undefined;
    case "confirm_send": return typeof body.send === "boolean" ? { kind: "confirm_send", send: body.send } : undefined;
    case "restart": return { kind: "restart" };
  }
}

export function registerSkippieSeekerRoutes(app: Express, deps: SkippieSeekerRouteDeps) {
  const now = deps.now ?? Date.now;
  const sessions = new Map<number, SkippieSession>();
  const asks = new Map<number, { day: string; count: number }>();
  let globalCount = { day: "", count: 0 };

  /** 404 while the flag is off or the caller is not the test seeker; 401 signed out. */
  async function gate(req: Request, res: Response): Promise<Identity | undefined> {
    res.set("Cache-Control", "private, no-store");
    if (!deps.enabled()) { res.status(404).json({ error: "Not found" }); return undefined; }
    const identity = await deps.resolveIdentity(req);
    if (!identity) { res.status(401).json({ error: "Sign in to continue" }); return undefined; }
    if (!deps.allowedUserIds().has(identity.account.id)) {
      deps.recordActivity({ actorUserId: identity.account.id, action: "skippie_seeker.denied", outcome: "denied", resourceType: "skippie" });
      res.status(404).json({ error: "Not found" });
      return undefined;
    }
    return identity;
  }

  function underCaps(userId: number): boolean {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (globalCount.day !== day) globalCount = { day, count: 0 };
    if (globalCount.count >= SKIPPIE_SEEKER_GLOBAL_DAILY_CAP) return false;
    const seen = asks.get(userId);
    const count = seen && seen.day === day ? seen.count : 0;
    if (count >= SKIPPIE_SEEKER_DAILY_CAP) return false;
    asks.set(userId, { day, count: count + 1 });
    globalCount.count += 1;
    return true;
  }

  app.get("/api/skippie/state", async (req, res) => {
    const identity = await gate(req, res);
    if (!identity) return;
    const session = sessions.get(identity.account.id) ?? newSkippieSession();
    const resumes = await deps.listOwnedResumes(identity.account.id).catch(() => []);
    res.json({ session: publicSession(session), resumes, dailyCap: SKIPPIE_SEEKER_DAILY_CAP });
  });

  app.post("/api/skippie/turn", async (req, res) => {
    const identity = await gate(req, res);
    if (!identity) return;
    const parsed = turnSchema.safeParse(req.body);
    const turn = parsed.success ? toTurn(parsed.data) : undefined;
    if (!turn) return res.status(400).json({ error: "That did not come through. Try again." });
    if (!underCaps(identity.account.id)) {
      deps.recordActivity({ actorUserId: identity.account.id, action: "skippie_seeker.capped", outcome: "denied", resourceType: "skippie", metadata: { kind: turn.kind } });
      return res.status(429).json({ error: `You've reached today's Skippy limit (${SKIPPIE_SEEKER_DAILY_CAP} messages). It resets tomorrow.` });
    }
    const userId = identity.account.id;
    const before = sessions.get(userId) ?? newSkippieSession();
    try {
      const out = await advanceSkippieSeeker(userId, before, turn, deps.deps());
      sessions.set(userId, out.session);
      if (sessions.size > 1000) sessions.clear(); // sessions are disposable; a cleared one just restarts
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.turn", outcome: "success", resourceType: "skippie", metadata: { kind: turn.kind, step: out.session.step } });
      if (out.session.createdRequestId && out.session.createdRequestId !== before.createdRequestId) {
        deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.ask_created", outcome: "success", resourceType: "referral_request", resourceId: out.session.createdRequestId, companyDomain: out.session.companyDomain, metadata: { coverageStatus: out.session.coverageStatus ?? "covered", via: "skippy", noteSha256: out.session.noteSha256 } });
        deps.afterCreate?.(req, userId, { requestId: out.session.createdRequestId, companyDomain: out.session.companyDomain ?? "", replayed: out.session.replayed });
      }
      res.json({ replies: out.replies, session: publicSession(out.session) });
    } catch (error) {
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.turn", outcome: "failure", resourceType: "skippie", metadata: { kind: turn.kind } });
      res.status(500).json({ error: "Skippy hit a snag. Nothing was sent or charged - try again." });
    }
  });
}

/** Env parsing kept in one place for the wiring in _core/index.ts. */
export function skippieSeekerAllowedIds(env: NodeJS.ProcessEnv = process.env): ReadonlySet<number> {
  return new Set((env.SKIPPIE_SEEKER_USER_IDS ?? "").split(",").map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v > 0));
}
