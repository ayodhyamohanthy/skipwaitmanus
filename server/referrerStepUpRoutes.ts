// D-057-session-gate (packet §0b.4): POST /api/referrer/step-up/send|verify.
// Contract only in this commit (red first); the routes land in the next one.
import type { Express, Request } from "express";
import type { GateIdentity, ReferrerSessionGateDeps } from "./referrerSessionGate";

export type StepUpActivity = { actorUserId?: number; action: string; outcome?: "success" | "failure" | "denied"; resourceType?: string; metadata?: Record<string, unknown> };
export type ReferrerStepUpRouteDeps = {
  resolveIdentity: (req: Request) => Promise<GateIdentity | undefined>;
  gate?: ReferrerSessionGateDeps;
  now?: () => number;
  sendCode?: (input: { to: string; code: string }) => Promise<{ sent: boolean; reason: string }>;
  consumeLimits?: (keys: { ip: string; email: string; account: number }, now: number) => Promise<void>;
  lock?: { activeUntil: (key: string, ip: string, now: number) => Promise<Date | null>; recordFailure: (key: string, ip: string, now: number) => Promise<void> };
  reSignOwnCookie?: (req: Request, identity: GateIdentity) => Promise<{ token: string; sessionKey: string } | null>;
  recordActivity?: (entry: StepUpActivity) => Promise<void>;
  captureError?: (error: unknown, context: Record<string, unknown>) => void;
};

export function registerReferrerStepUpRoutes(_app: Express, _deps: ReferrerStepUpRouteDeps): void {
  /* contract only (red first) */
}
