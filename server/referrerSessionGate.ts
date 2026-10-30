// D-057-session-gate (packet §0b.5): the referrer session gate. Contract only
// in this commit (red first); the gate itself lands in the next one.
import type { Express, Request } from "express";
import type { ReferrerStepUpStore, StepUpAccount, StepUpProfile } from "./referrerStepUp";

export type GateIdentity = { account: { id: number; openId: string }; sessionAmr?: "work_email_otp"; sessionKey?: string };
export type ReferrerSessionGateDeps = {
  store: ReferrerStepUpStore;
  now?: () => number;
  verifySessionCookie: (token: string | undefined) => Promise<{ openId: string; amr?: "work_email_otp" } | null>;
  getAccountByOpenId: (openId: string) => Promise<StepUpAccount | undefined>;
  getProfile: (userId: number) => Promise<StepUpProfile>;
  isReferrerOfRequest?: (userId: number, requestId: number) => Promise<boolean>;
};
export type ReferrerRoute = { method: "get" | "post" | "put" | "patch" | "delete"; path: string; when?: "referrer_actor" };
export type AllowlistedRoute = { method: "get" | "post" | "put" | "patch" | "delete"; path: string; reason: string };

export const REFERRER_ACTION_FUNCTIONS: readonly string[] = [];
export const REFERRER_ACTION_ROUTES: readonly ReferrerRoute[] = [];
export const REFERRER_GATE_ALLOWLIST: readonly AllowlistedRoute[] = [];

export function installReferrerSessionGate(_app: Express, _deps: { resolveIdentity: (req: Request) => Promise<GateIdentity | undefined>; gate: ReferrerSessionGateDeps }): void {
  /* contract only (red first) */
}
