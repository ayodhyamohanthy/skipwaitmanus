/**
 * Seeker Skippy routes (step 2, D-136..D-142). Off unless SKIPPIE_SEEKER_ENABLED=true
 * and even then only for the account ids in SKIPPIE_SEEKER_USER_IDS (the test
 * seeker). Daily caps are enforced server-side (D-138). Every turn is audited.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { regionFromHeader } from "../shared/billingRegion";
import { REFERRER_PURCHASE_REFUSED_CODE, REFERRER_PURCHASE_REFUSED_ERROR, isReferrerPurchaseRefused } from "../shared/referrerPurchases";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { bandedSalesEnabled } from "./billingSettings";
import { beginBandedReferralCheckout, customerOf } from "./bandedCheckoutRoutes";
import type { BandedCheckoutDeps } from "./bandedCheckout";
import { approveSkippieMoneyCard, createSkippieCardStore, type MoneyCardCheckoutResult, type SkippieCardStore } from "./skippieMoneyCards";
import { parseSkippieAllowedIds } from "./skippieAllowList";
import { captureServerError } from "./sentry";
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

type Identity = { account: { id: number; role?: "user" | "admin"; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };
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
  /** SKIPPY-3: the one-use money-card store; the same store the state machine creates cards in. */
  moneyCards?: SkippieCardStore;
  /** SKIPPY-3: the same banded checkout wiring the Chargebee routes use; unset answers 503. */
  bandedCheckout?: () => BandedCheckoutDeps | undefined;
  /** SKIPPY-3: SKIPPIE_PURCHASE_ENABLED; off means the approve route answers 404 and no card is offered. */
  purchaseEnabled?: () => boolean;
  now?: () => number;
};

const turnSchema = z.object({
  kind: z.enum(["text", "choose_resume", "consent", "submit_note", "confirm_suggested_note", "tailor_start", "tailor_skip", "tailor_skill", "tailor_build", "tailor_approve", "confirm_send", "buy_referrals", "confirm_referrals", "restart"]),
  text: z.string().max(SKIPPIE_SEEKER_TEXT_MAX).optional(),
  attachmentId: z.number().int().positive().optional(),
  allow: z.boolean().optional(),
  skill: z.string().max(300).optional(),
  knows: z.boolean().optional(),
  approve: z.boolean().optional(),
  send: z.boolean().optional(),
  outcome: z.enum(["pending", "cancelled"]).optional(),
});

function toTurn(body: z.infer<typeof turnSchema>, billingCountry: ReturnType<typeof regionFromHeader>): SkippieTurn | undefined {
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
    // The billing country is the server's own region, never a client value.
    case "buy_referrals": return { kind: "buy_referrals", billingCountry };
    case "confirm_referrals": return body.outcome === "pending" || body.outcome === "cancelled" ? { kind: "confirm_referrals", outcome: body.outcome } : undefined;
    case "restart": return { kind: "restart" };
  }
}

export function registerSkippieSeekerRoutes(app: Express, deps: SkippieSeekerRouteDeps) {
  const now = deps.now ?? Date.now;
  const sessions = new Map<number, SkippieSession>();
  const asks = new Map<number, { day: string; count: number }>();
  let globalCount = { day: "", count: 0 };
  // SKIPPY-3: one card store per registration; the turn creates cards in it and the approve route reads them.
  const cards = deps.moneyCards ?? createSkippieCardStore({ now });
  const stateDeps = (): SkippieSeekerDeps => ({ ...deps.deps(), createMoneyCard: input => cards.create(input) });

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
    const turn = parsed.success ? toTurn(parsed.data, regionFromHeader(req.headers["cf-ipcountry"])) : undefined;
    if (!turn) return res.status(400).json({ error: "That did not come through. Try again." });
    if (!underCaps(identity.account.id)) {
      deps.recordActivity({ actorUserId: identity.account.id, action: "skippie_seeker.capped", outcome: "denied", resourceType: "skippie", metadata: { kind: turn.kind } });
      return res.status(429).json({ error: `You've reached today's Skippy limit (${SKIPPIE_SEEKER_DAILY_CAP} messages). It resets tomorrow.` });
    }
    const userId = identity.account.id;
    const before = sessions.get(userId) ?? newSkippieSession();
    try {
      const out = await advanceSkippieSeeker(userId, before, turn, stateDeps());
      sessions.set(userId, out.session);
      if (sessions.size > 1000) sessions.clear(); // sessions are disposable; a cleared one just restarts
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.turn", outcome: "success", resourceType: "skippie", metadata: { kind: turn.kind, step: out.session.step } });
      if (out.session.createdRequestId && out.session.createdRequestId !== before.createdRequestId && !out.session.replayed) {
        deps.recordActivity({ actorUserId: userId, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: out.session.createdRequestId, companyDomain: out.session.companyDomain, metadata: { attachmentCount: 1, pinnedWorkCount: 0, notifiedEmployees: out.session.notifiedEmployees, creditReserved: out.session.coverageStatus !== "waiting_for_company_coverage", coverageStatus: out.session.coverageStatus ?? "covered", fastTrack: false, fromPost: false, firstLook: false, jobFunctionChosen: false, via: "skippy" } });
        deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.ask_created", outcome: "success", resourceType: "referral_request", resourceId: out.session.createdRequestId, companyDomain: out.session.companyDomain, metadata: { coverageStatus: out.session.coverageStatus ?? "covered", via: "skippy", noteSha256: out.session.noteSha256 } });
        deps.afterCreate?.(req, userId, { requestId: out.session.createdRequestId, companyDomain: out.session.companyDomain ?? "", replayed: out.session.replayed });
      }
      res.json({ replies: out.replies, session: publicSession(out.session) });
    } catch (error) {
      captureServerError(error, { area: "skippie_seeker_turn", kind: turn.kind });
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.turn", outcome: "failure", resourceType: "skippie", metadata: { kind: turn.kind } });
      res.status(500).json({ error: "Skippy could not confirm the result. Check My requests and your referral balance before retrying this request." });
    }
  });

  /**
   * SKIPPY-3: approve one money card. The client sends only the card id; every
   * amount comes from the card, which was built from the banded quote. The same
   * shared checkout function the banded route uses opens the provider page.
   */
  app.post("/api/skippie/cards/:id/approve", async (req, res) => {
    const identity = await gate(req, res);
    if (!identity) return;
    if (!(deps.purchaseEnabled?.() ?? false)) return res.status(404).json({ error: "Not found" });
    const userId = identity.account.id;
    // D-055: referrers never pay; refused before any provider call.
    if (isReferrerPurchaseRefused(req.body?.role)) {
      deps.recordActivity({ actorUserId: userId, action: "billing.banded_checkout_refused", outcome: "denied", resourceType: "banded_checkout", metadata: { kind: "referral", reason: REFERRER_PURCHASE_REFUSED_CODE, via: "skippy" } });
      return res.status(403).json({ error: REFERRER_PURCHASE_REFUSED_ERROR, code: REFERRER_PURCHASE_REFUSED_CODE });
    }
    const checkout = deps.bandedCheckout?.();
    const origin = publicOutboundOrigin(req);
    // The same on-sale answer the banded route gives: the wiring's own switch when it has one.
    const onSale = () => (checkout?.salesEnabled ?? bandedSalesEnabled)();
    let result: MoneyCardCheckoutResult;
    try {
      result = await approveSkippieMoneyCard({
        card: cards.get(String(req.params.id)),
        userId,
        deps: {
          offer: async () => ({ onSale: Boolean(checkout) && onSale() }),
          markUsed: (id, at) => cards.markUsed(id, at),
          now,
          startCheckout: async ({ userId: buyerId, request }) => {
            const started = await beginBandedReferralCheckout({
              userId: buyerId,
              request,
              customer: customerOf(identity),
              urls: { redirectUrl: `${origin}/skippy?payment=pending`, cancelUrl: `${origin}/skippy?payment=cancelled` },
              checkout,
            });
            return started.ok ? { ok: true, checkoutUrl: started.started.checkout.checkoutUrl, hostedPageId: started.started.checkout.hostedPageId } : started;
          },
        },
      });
    } catch (error) {
      captureServerError(error, { area: "skippie_seeker_card_approve" });
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.card_approve", outcome: "failure", resourceType: "skippie" });
      return res.status(502).json({ error: "Unable to start the secure checkout. Nothing has been charged." });
    }
    if (!result.ok) {
      deps.recordActivity({ actorUserId: userId, action: "skippie_seeker.card_approve", outcome: "denied", resourceType: "skippie", metadata: { reason: result.code ?? `http_${result.status}` } });
      return res.status(result.status).json(result.code ? { error: result.error, code: result.code } : { error: result.error });
    }
    deps.recordActivity({ actorUserId: userId, action: "billing.banded_checkout_started", outcome: "success", resourceType: "banded_referral_checkout", resourceId: result.hostedPageId, metadata: { kind: "referral", via: "skippy" } });
    return res.json({ checkoutUrl: result.checkoutUrl, hostedPageId: result.hostedPageId });
  });
}

/** Env parsing kept in one place for the wiring in _core/index.ts. */
export function skippieSeekerAllowedIds(env: NodeJS.ProcessEnv = process.env): ReadonlySet<number> {
  return parseSkippieAllowedIds(env.SKIPPIE_SEEKER_USER_IDS);
}
