import express, { type Express, type Request, type RequestHandler } from "express";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { captureServerError } from "./sentry";
import { askInviteLandingSchema } from "../shared/askInvites";
import {
  AskInviteClaimError,
  AskInviteCapReachedError,
  AskInviteLinkActiveError,
  AskInviteNotFoundError,
  AskInviteNotWaitingError,
  byorLinkEnabled,
  claimAskInvite,
  createAskInvite,
  getAskInviteLanding,
  revokeAskInvite,
} from "./askInvites";

type AskInviteIdentity = { account: { id: number } };
type ActivityInput = {
  actorUserId?: number;
  action: "ask_invite.created" | "ask_invite.revoked" | "ask_invite.opened";
  outcome: "success" | "denied";
  resourceType: "ask_invite";
  resourceId?: number;
  metadata?: { requestId?: number; linkId?: number };
};

export type AskInviteRouteDeps = {
  resolveIdentity: (req: Request) => Promise<AskInviteIdentity | undefined>;
  createAskInvite?: typeof createAskInvite;
  revokeAskInvite?: typeof revokeAskInvite;
  getAskInviteLanding?: typeof getAskInviteLanding;
  claimAskInvite?: typeof claimAskInvite;
  recordActivity?: (input: ActivityInput) => Promise<void> | void;
};

function requestIdOf(value: string): number | undefined {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function noStore(res: express.Response): void {
  res.set("Cache-Control", "private, no-store");
}

export const askInviteFeatureGateMiddleware: RequestHandler = (req, res, next) => {
  if (byorLinkEnabled()) return next();
  const isLanding = req.method === "GET" && /^\/api\/ask-invites\/[^/]+\/?$/.test(req.path);
  const isClaim = req.method === "POST" && /^\/api\/ask-invites\/[^/]+\/claim\/?$/.test(req.path);
  const isCreateOrRevoke = req.method === "POST" && /^\/api\/company-referrals\/[^/]+\/invite-link(?:\/revoke)?\/?$/.test(req.path);
  if (!isLanding && !isClaim && !isCreateOrRevoke) return next();
  noStore(res);
  return res.status(404).json({ error: "This link is not available" });
};

/** Token-bearing URLs must not survive in ordinary request/access logs. */
function redactAskInviteTokenPath(req: Request): void {
  const redact = (value: string) => value.replace(/(\/api\/ask-invites\/)[^/?]+/, "$1[redacted]");
  req.url = redact(req.url);
  (req as Request & { originalUrl: string }).originalUrl = redact(req.originalUrl);
}

export function registerAskInviteRoutes(app: Express, deps: AskInviteRouteDeps): void {
  const recordActivity = async (input: ActivityInput): Promise<void> => {
    if (!deps.recordActivity) return;
    try { await deps.recordActivity(input); }
    catch (error) { captureServerError(error, { area: "ask_invite_activity", action: input.action, requestId: input.metadata?.requestId, linkId: input.metadata?.linkId }); }
  };

  app.post("/api/company-referrals/:id/invite-link", async (req, res) => {
    noStore(res);
    // This guard intentionally runs before identity resolution or any database access.
    if (!byorLinkEnabled()) return res.status(404).json({ error: "This link is not available" });
    const requestId = requestIdOf(req.params.id);
    if (!requestId) return res.status(400).json({ error: "Invalid ask reference" });
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create an invite link" });
      const created = await (deps.createAskInvite ?? createAskInvite)(identity.account.id, requestId);
      await recordActivity({ actorUserId: identity.account.id, action: "ask_invite.created", outcome: "success", resourceType: "ask_invite", resourceId: created.id, metadata: { requestId, linkId: created.id } });
      const url = new URL(`/r/${encodeURIComponent(created.token)}`, publicOutboundOrigin(req)).toString();
      noStore(res);
      return res.status(201).json({ token: created.token, url, expiresAt: created.expiresAt.toISOString() });
    } catch (error) {
      if (error instanceof AskInviteNotFoundError) return res.status(404).json({ error: "This link is not available" });
      if (error instanceof AskInviteNotWaitingError) return res.status(409).json({ error: "ask_not_waiting" });
      if (error instanceof AskInviteLinkActiveError) return res.status(409).json({ error: "link_active" });
      if (error instanceof AskInviteCapReachedError) return res.status(429).json({ error: "weekly_link_cap", nextSlotAt: error.nextSlotAt.toISOString() });
      captureServerError(error, { area: "ask_invite_create", requestId });
      return res.status(500).json({ error: "We could not create that invite link" });
    }
  });

  app.post("/api/company-referrals/:id/invite-link/revoke", async (req, res) => {
    noStore(res);
    // As above, a disabled BYOR feature reveals neither identity nor request state.
    if (!byorLinkEnabled()) return res.status(404).json({ error: "This link is not available" });
    const requestId = requestIdOf(req.params.id);
    if (!requestId) return res.status(400).json({ error: "Invalid ask reference" });
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to revoke an invite link" });
      const result = await (deps.revokeAskInvite ?? revokeAskInvite)(identity.account.id, requestId);
      if (result.linkId !== null) await recordActivity({ actorUserId: identity.account.id, action: "ask_invite.revoked", outcome: result.revoked ? "success" : "denied", resourceType: "ask_invite", resourceId: result.linkId, metadata: { requestId, linkId: result.linkId } });
      noStore(res);
      return res.status(200).json({ revoked: result.revoked });
    } catch (error) {
      if (error instanceof AskInviteNotFoundError) return res.status(404).json({ error: "This link is not available" });
      captureServerError(error, { area: "ask_invite_revoke", requestId });
      return res.status(500).json({ error: "We could not revoke that invite link" });
    }
  });

  app.get("/api/ask-invites/:token", async (req, res) => {
    redactAskInviteTokenPath(req);
    noStore(res);
    if (!byorLinkEnabled()) return res.status(404).json({ error: "This link is not available" });
    let identity: AskInviteIdentity | undefined;
    try { identity = await deps.resolveIdentity(req); }
    catch (error) {
      captureServerError(error, { area: "ask_invite_identity" });
      identity = undefined;
    }
    try {
      const result = await (deps.getAskInviteLanding ?? getAskInviteLanding)(req.params.token, identity?.account.id);
      if (!result) return res.status(404).json({ error: "This link is not available" });
      const invite = askInviteLandingSchema.parse(result.invite);
      await recordActivity({ actorUserId: identity?.account.id, action: "ask_invite.opened", outcome: invite.state === "open" || invite.state === "claimed_by_you" ? "success" : "denied", resourceType: "ask_invite", resourceId: result.linkId, metadata: { requestId: result.requestId, linkId: result.linkId } });
      noStore(res);
      return res.status(200).json({ invite });
    } catch (error) {
      captureServerError(error, { area: "ask_invite_landing" });
      return res.status(500).json({ error: "We could not open that invite" });
    }
  });

  app.post("/api/ask-invites/:token/claim", async (req, res) => {
    redactAskInviteTokenPath(req);
    noStore(res);
    if (!byorLinkEnabled()) return res.status(404).json({ error: "This link is not available" });
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to claim this ask" });
      const result = await (deps.claimAskInvite ?? claimAskInvite)(req.params.token, identity.account.id);
      noStore(res);
      return res.status(200).json({ outcome: result.outcome });
    } catch (error) {
      const code = error instanceof AskInviteClaimError ? error.code : error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined;
      if (code === "not_available") return res.status(404).json({ error: "This link is not available" });
      if (code === "company_email_required" || code === "referrer_unavailable") return res.status(403).json({ error: code });
      if (code === "link_used" || code === "link_expired" || code === "link_revoked" || code === "ask_unavailable") return res.status(409).json({ error: code });
      captureServerError(error, { area: "ask_invite_claim" });
      return res.status(500).json({ error: "We could not claim that ask" });
    }
  });
}
