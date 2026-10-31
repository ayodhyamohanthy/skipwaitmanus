// D-057-session-gate (D-057, D-245; packet docs/plans/D-057-session-gate.md
// §0b.5): the referrer session gate. A request reaches a referrer action only
// when (A) its own session was made by the work-email code login (the
// identity's own `amr`, or the request's own app_session_id code cookie of the
// SAME account, §0 item 8), or (B) a fresh in-session step-up proof exists for
// the request's account id and session key (§0b.3). Otherwise it is refused
// with 403 work_email_code_required before the route runs any database call
// (the proof lookup is the only read). Seeker routes never pass through here.
import { parse as parseCookieHeader } from "cookie";
import type { Express, NextFunction, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { workEmailCodeRequiredBody } from "../shared/referrerStepUp";
import { createDrizzleStepUpStore, isFreshStepUpProof, sha256Hex, type ReferrerStepUpStore, type StepUpAccount, type StepUpProfile } from "./referrerStepUp";
import * as db from "./db";

export type GateIdentity = { account: { id: number; openId: string }; sessionAmr?: "work_email_otp"; sessionKey?: string };
export type ReferrerSessionGateDeps = {
  store: ReferrerStepUpStore;
  now?: () => number;
  /** sdk.verifySession: verifies the request's own app_session_id cookie. */
  verifySessionCookie: (token: string | undefined) => Promise<{ openId: string; amr?: "work_email_otp" } | null>;
  /** db.getUserByOpenId: the canonical account with its merged suspension and revocation stamp. */
  getAccountByOpenId: (openId: string) => Promise<StepUpAccount | undefined>;
  getProfile: (userId: number) => Promise<StepUpProfile>;
  /** The progress route is a referrer action only when the actor is the ask's referrer. */
  isReferrerOfRequest?: (userId: number, requestId: number) => Promise<boolean>;
};
type Method = "get" | "post" | "put" | "patch" | "delete";
export type ReferrerRoute = { method: Method; path: string; when?: "referrer_actor" };
export type AllowlistedRoute = { method: Method; path: string; reason: string };

/** The functions §4.4 names (plus the router helper that wraps the inbox read). A route calling one is gated or allowlisted. */
export const REFERRER_ACTION_FUNCTIONS: readonly string[] = [
  "claimCompanyReferralRequest", "oneClickReviewReferralRequest", "reviewReferralRequest", "resolveReferrerReviewEmailLink", "consumeReferrerReviewEmailLink",
  "saveCompanyReferralRequest", "getUnclaimedCompanyReferralPreview", "listCompanyReferralInboxByState", "loadInbox", "getClaimedCompanyReferralDetail",
  "openCompanyReferralAvailability", "updateReferralProgress", "publishCompanyOpportunity", "renewCompanyOpportunity", "closeCompanyOpportunity",
  "updateReferrerPreferences", "saveReferrerSlackWebhook", "getReferrerSlackWebhookStatus", "deactivateReferrerSlackWebhook", "getOrCreateReferrerFastTrackLink",
  "getPrivateReferrerImpactSummary", "getReferrerImpactSummary",
];

/** Every referrer action route (§4.4), pinned against the routers' source by referrerSessionGate.test.ts. */
export const REFERRER_ACTION_ROUTES: readonly ReferrerRoute[] = [
  { method: "put", path: "/api/referrer/slack-webhook" },
  { method: "get", path: "/api/referrer/slack-webhook" },
  { method: "delete", path: "/api/referrer/slack-webhook" },
  { method: "post", path: "/api/opportunities" },
  { method: "post", path: "/api/opportunities/:id/renew" },
  { method: "post", path: "/api/opportunities/:id/close" },
  { method: "get", path: "/api/referrer-impact/me" },
  { method: "get", path: "/api/referrer/impact-summary" },
  { method: "get", path: "/api/referrer-fast-track/me" },
  { method: "get", path: "/api/company-referrals/inbox" },
  { method: "get", path: "/api/referrer/home-bundle" },
  { method: "post", path: "/api/company-referrals/availability/open" },
  { method: "post", path: "/api/company-referrals/:requestId/save" },
  { method: "post", path: "/api/company-referrals/:requestId/review" },
  { method: "post", path: "/api/company-referrals/:requestId/one-click-review" },
  { method: "get", path: "/api/referrer-review-links/:linkToken" },
  { method: "post", path: "/api/referrer-review-links/:linkToken/decision" },
  { method: "post", path: "/api/company-referrals/:requestId/progress", when: "referrer_actor" },
  { method: "get", path: "/api/company-referrals/:requestId/preview" },
  { method: "get", path: "/api/company-referrals/:requestId" },
  { method: "post", path: "/api/company-referrals/:requestId/claim" },
  { method: "put", path: "/api/referrer-preferences" },
];

/** Routes that call one of those functions but stay open, each with its reason. */
export const REFERRER_GATE_ALLOWLIST: readonly AllowlistedRoute[] = [];

/** The request's own app session cookie, never one the client names elsewhere. */
function appSessionCookie(req: Request): string | undefined {
  return parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME] || undefined;
}

/** (A): this session itself is a work-email code session of this same account. */
export async function hasWorkEmailCodeSession(req: Request, identity: GateIdentity, deps: ReferrerSessionGateDeps): Promise<boolean> {
  if (identity.sessionAmr === "work_email_otp") return true;
  const token = appSessionCookie(req);
  if (!token) return false;
  const session = await deps.verifySessionCookie(token);
  if (session?.amr !== "work_email_otp") return false;
  // A cookie of a different account never counts (§0 item 8): it must resolve to this account id.
  const account = await deps.getAccountByOpenId(session.openId);
  return Boolean(account && !account.suspended && account.id === identity.account.id);
}

/** (B): a fresh step-up proof for this account id and this session key. */
export async function hasFreshStepUp(identity: GateIdentity, deps: ReferrerSessionGateDeps): Promise<boolean> {
  if (!identity.sessionKey) return false;
  const sessionKeyHash = sha256Hex(identity.sessionKey);
  const proof = await deps.store.latestProof(identity.account.id, sessionKeyHash);
  if (!proof) return false;
  const [account, profile] = await Promise.all([deps.getAccountByOpenId(identity.account.openId), deps.getProfile(identity.account.id)]);
  return isFreshStepUpProof(proof, { userId: identity.account.id, sessionKeyHash, account, profile, now: (deps.now ?? Date.now)() });
}

export async function referrerSessionPasses(req: Request, identity: GateIdentity, deps: ReferrerSessionGateDeps): Promise<boolean> {
  return (await hasWorkEmailCodeSession(req, identity, deps)) || (await hasFreshStepUp(identity, deps));
}

/** The production wiring: the session cookie verifier, the canonical account and profile reads, the MySQL store. */
export async function defaultReferrerSessionGateDeps(): Promise<ReferrerSessionGateDeps> {
  const { sdk } = await import("./_core/sdk");
  const store = createDrizzleStepUpStore();
  return {
    store,
    verifySessionCookie: token => sdk.verifySession(token),
    getAccountByOpenId: openId => db.getUserByOpenId(openId),
    getProfile: userId => db.getProfileByUserId(userId),
    isReferrerOfRequest: (userId, requestId) => store.isReferrerOfRequest(userId, requestId),
  };
}

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;
/** True when a route handler's Number() or parseInt() would read this path value as a positive request id. */
export function readableAsRequestId(raw: unknown): boolean {
  const value = String(raw ?? "");
  return isPositiveInteger(Number(value)) || isPositiveInteger(Number.parseInt(value, 10));
}

/** Where the /access verdict finds the gate's answer for its own request (privateReferralRoutes reads it). */
export const REFERRER_SESSION_LOCAL = "referrerSessionPasses";

/**
 * Installs the gate in front of every listed route and the /access verdict.
 * Register it before the routers it guards: Express runs these first.
 */
export function installReferrerSessionGate(app: Express, deps: { resolveIdentity: (req: Request) => Promise<GateIdentity | undefined>; gate: ReferrerSessionGateDeps | (() => Promise<ReferrerSessionGateDeps>); onDenied?: (req: Request, identity: GateIdentity) => void; onError?: (error: unknown, req: Request) => void }): void {
  let resolved: Promise<ReferrerSessionGateDeps> | undefined;
  const gateDeps = () => (resolved ??= typeof deps.gate === "function" ? deps.gate() : Promise.resolve(deps.gate));
  const guard = (route: ReferrerRoute) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The router's own pattern also matches sibling paths (/api/company-referrals/inbox for :requestId). Only a value
      // no handler could read as a request id is a sibling: anything Number() or parseInt() takes as a positive id
      // ("0x2bd", "701.0", "+701", " 701") is that request to the handler, so the gate guards it too.
      if (route.path.includes(":requestId") && !readableAsRequestId(req.params.requestId)) return next();
      const identity = await deps.resolveIdentity(req);
      // Signed out: the route answers its own 401, and the client offers the signed-out work-email sign-in.
      if (!identity) return next();
      const gate = await gateDeps();
      if (route.when === "referrer_actor" && !(await gate.isReferrerOfRequest?.(identity.account.id, Number(req.params.requestId)) ?? true)) return next();
      if (await referrerSessionPasses(req, identity, gate)) return next();
      deps.onDenied?.(req, identity);
      return res.status(403).json(workEmailCodeRequiredBody());
    } catch (error) {
      // Fail closed: a gate that cannot read its proof refuses the action, never waves it through.
      deps.onError?.(error, req);
      return res.status(403).json(workEmailCodeRequiredBody());
    }
  };
  for (const route of REFERRER_ACTION_ROUTES) app[route.method](route.path, guard(route));
  app.get("/api/company-referrals/access", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (identity) res.locals[REFERRER_SESSION_LOCAL] = await referrerSessionPasses(req, identity, await gateDeps());
    } catch (error) {
      deps.onError?.(error, req);
      res.locals[REFERRER_SESSION_LOCAL] = false;
    }
    next();
  });
}
