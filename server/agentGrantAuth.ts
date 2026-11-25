/**
 * D-178.grant (D-290 R1): one verifier for both agent transports.
 *
 * The canonical grant is the D-141 grant (`seekerAgentGrants`). An OAuth
 * connection creates one and returns its `swa_` key; the plain REST surface
 * (`/api/agent/v1`) mints the same key; MCP and REST both resolve through
 * this module, so scope, expiry and pause-all can never disagree.
 *
 * A legacy `sw_` token keeps exactly today's behaviour: it resolves to its
 * owner (read and propose for approval) and never carries a grant scope.
 * An agent key is never a session: nothing here returns or accepts a cookie.
 */
import { createHash, randomBytes } from "node:crypto";
import { AGENT_ERROR, AGENT_KEY_PATTERN, AGENT_KEY_PREFIX } from "../shared/seekerAgents";

/** One bearer shape check before any store read: a D-141 grant key or a legacy assistant token. */
export const AGENT_BEARER_RE = /^(?:swa_[0-9a-f]{64}|sw_[A-Za-z0-9_-]{32})$/;
export const LEGACY_BEARER_RE = /^sw_[A-Za-z0-9_-]{32}$/;

export const hashAgentKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Mints a D-141 grant key. Shown once; only its sha256 hash is stored. */
export function mintAgentKey(): string {
  return `${AGENT_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

/** The grant facts this verifier needs; the row type in seekerAgentRoutes has more. */
export type AgentGrantFacts = {
  id: number;
  userId: number;
  name: string;
  canLookup: boolean;
  canDraft: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AgentBearerStore = {
  findGrantByKeyHash: (keyHash: string) => Promise<AgentGrantFacts | undefined>;
  isPaused: (userId: number) => Promise<boolean>;
  touchGrantLastUsed: (grantId: number, now: Date) => Promise<void>;
  verifyLegacyBearer: (tokenHash: string) => Promise<{ userId: number; tokenId: number } | null>;
};

export type AgentPrincipal =
  | { kind: "grant"; grantId: number; userId: number; canLookup: boolean; canDraft: boolean }
  | { kind: "legacy"; userId: number; tokenId: number };

export type AgentAuthResult =
  | { ok: true; principal: AgentPrincipal; capKey: number }
  | { ok: false; status: number; error: string };

export type AgentBearerDeps = {
  store: AgentBearerStore;
  /** The switch plus the account allow-list, never a plan (D-290 R2). Fails closed. */
  allowed: (userId: number) => boolean | Promise<boolean>;
  /** Grants only: refused for a paused seeker. Legacy tokens keep today's behaviour. */
  enforcePause?: boolean;
  now?: () => number;
};

const badToken: AgentAuthResult = { ok: false, status: 401, error: "This token is not valid. It may have been revoked." };

/**
 * Resolves a bearer to its principal, or to the refusal the caller answers with.
 * Order: shape, store lookup, allow-list, pause, expiry, then last use.
 */
export async function resolveAgentBearer(token: string, deps: AgentBearerDeps): Promise<AgentAuthResult> {
  if (!AGENT_BEARER_RE.test(token)) return badToken;
  const nowMs = (deps.now ?? Date.now)();
  const hash = hashAgentKey(token);

  if (!AGENT_KEY_PATTERN.test(token)) {
    const legacy = await deps.store.verifyLegacyBearer(hash);
    if (!legacy) return badToken;
    if (!(await deps.allowed(legacy.userId))) return { ok: false, status: 404, error: "Not found" };
    return { ok: true, principal: { kind: "legacy", userId: legacy.userId, tokenId: legacy.tokenId }, capKey: legacy.tokenId };
  }

  const grant = await deps.store.findGrantByKeyHash(hash);
  if (!grant) return badToken;
  if (!(await deps.allowed(grant.userId))) return { ok: false, status: 404, error: "Not found" };
  if (grant.revokedAt) return { ok: false, status: 401, error: AGENT_ERROR.revoked };
  if (grant.expiresAt.getTime() <= nowMs) return { ok: false, status: 401, error: AGENT_ERROR.expired };
  if ((deps.enforcePause ?? true) && (await deps.store.isPaused(grant.userId))) return { ok: false, status: 403, error: AGENT_ERROR.paused };
  await deps.store.touchGrantLastUsed(grant.id, new Date(nowMs)).catch(() => undefined);
  return { ok: true, principal: { kind: "grant", grantId: grant.id, userId: grant.userId, canLookup: grant.canLookup, canDraft: grant.canDraft }, capKey: grant.id };
}
