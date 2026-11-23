import type { Express } from "express";
import { sendTransactionalEmail } from "../emailDelivery";
import { passwordEmailStanding } from "../passwordAccountLookup";
import { registerPasswordResetRoutes } from "../passwordResetRoutes";
import { passwordWitnessStore } from "../passwordWitness";
import type { DurableLimitStore } from "./durableRateLimit";
import { AUTH_RESPONSE_FLOOR_MS, reportPasswordFailure, type PasswordEmailStandingLookup, type PasswordRouteContext } from "./passwordResponses";
import { registerPasswordSignInRoutes } from "./passwordSignIn";
import type { PasswordWorkosClient } from "./passwordWorkosClient";

/**
 * Registers every seeker password route (D-049): /api/auth/password/sign-in, /sign-up, /forgot and /reset/confirm.
 * With no WorkOS client (local dev without WorkOS keys) each one answers 503 password_sign_in_unavailable. There is
 * no verification-code route: an unverified address gets an emailed link instead (D-078 ruling 2). The retired
 * seeker email code (server/_core/seekerEmailCode.ts) never sends again and stops verifying at
 * SEEKER_CODE_VERIFY_UNTIL (D-049, D-078 ruling 1).
 */
export type PasswordRouteOptions = {
  readonly client?: PasswordWorkosClient | null;
  readonly store?: DurableLimitStore | null;
  readonly now?: () => number;
  readonly defer?: (task: () => Promise<void>) => void;
  readonly emailStanding?: PasswordEmailStandingLookup;
  readonly sendEmail?: PasswordRouteContext["sendEmail"];
  readonly witness?: PasswordRouteContext["witness"];
  readonly responseFloorMs?: number;
};

function runAfterResponse(task: () => Promise<void>): void {
  setImmediate(() => { task().catch(error => reportPasswordFailure("deferred", "unexpected", error)); });
}

export function registerPasswordAuthRoutes(app: Express, options: PasswordRouteOptions & { readonly client: PasswordWorkosClient | null }): void {
  const ctx: PasswordRouteContext = {
    client: options.client,
    store: options.store,
    now: options.now ?? (() => Date.now()),
    defer: options.defer ?? runAfterResponse,
    emailStanding: options.emailStanding ?? passwordEmailStanding,
    sendEmail: options.sendEmail ?? sendTransactionalEmail,
    witness: options.witness ?? passwordWitnessStore,
    responseFloorMs: options.responseFloorMs ?? AUTH_RESPONSE_FLOOR_MS,
  };
  registerPasswordSignInRoutes(app, ctx);
  registerPasswordResetRoutes(app, ctx);
}
