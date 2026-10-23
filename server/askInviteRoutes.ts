import express, { type Express, type Request } from "express";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { captureServerError } from "./sentry";
import {
  AskInviteCapReachedError,
  AskInviteLinkActiveError,
  AskInviteNotFoundError,
  AskInviteNotWaitingError,
  byorLinkEnabled,
  createAskInvite,
  revokeAskInvite,
} from "./askInvites";

type AskInviteIdentity = { account: { id: number } };
type ActivityInput = {
  actorUserId: number;
  action: "ask_invite.created" | "ask_invite.revoked";
  outcome: "success" | "denied";
  resourceType: "ask_invite";
  resourceId?: number;
  metadata?: { requestId?: number; linkId?: number };
};

export type AskInviteRouteDeps = {
  resolveIdentity: (req: Request) => Promise<AskInviteIdentity | undefined>;
  createAskInvite?: typeof createAskInvite;
  revokeAskInvite?: typeof revokeAskInvite;
  recordActivity?: (input: ActivityInput) => Promise<void> | void;
};

function requestIdOf(value: string): number | undefined {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function noStore(res: express.Response): void {
  res.set("Cache-Control", "private, no-store");
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
}
