import type { Express } from "express";
import { passwordEmailStanding } from "../passwordAccountLookup";
import { registerPasswordResetRoutes, requestWorkosPasswordReset } from "../passwordResetRoutes";
import type { DurableLimitStore } from "./durableRateLimit";
import { reportPasswordFailure, type PasswordEmailStanding, type PasswordRouteContext } from "./passwordResponses";
import { registerPasswordSignInRoutes } from "./passwordSignIn";
import { registerPasswordVerificationRoutes } from "./passwordVerification";
import type { PasswordWorkosClient } from "./passwordWorkosClient";

/**
 * Registers every seeker password route (D-049): /api/auth/password/sign-in, /sign-up, /verify-email,
 * /verify-email/resend, /forgot and /reset/confirm. With no WorkOS client (local dev without WorkOS keys)
 * each one answers 503 password_sign_in_unavailable. The retired seeker email code (server/_core/seekerEmailCode.ts)
 * never sends again and stops verifying at SEEKER_CODE_VERIFY_UNTIL (D-049, D-078 ruling 1).
 */
export type PasswordRouteOptions = {
  readonly client?: PasswordWorkosClient | null;
  readonly store?: DurableLimitStore | null;
  readonly now?: () => number;
  readonly defer?: (task: () => Promise<void>) => void;
  readonly emailStanding?: (email: string) => Promise<PasswordEmailStanding>;
};

function runAfterResponse(task: () => Promise<void>): void {
  setImmediate(() => { task().catch(error => reportPasswordFailure("deferred", "unexpected", error)); });
}

export function registerPasswordAuthRoutes(app: Express, options: PasswordRouteOptions & { readonly client: PasswordWorkosClient | null }): void {
  const ticketSecret = process.env.WORKOS_COOKIE_PASSWORD ?? "";
  // The verification ticket is encrypted with a key derived from WORKOS_COOKIE_PASSWORD; without it, no password route runs.
  if (options.client && !ticketSecret) console.error("[password-auth] WORKOS_COOKIE_PASSWORD is missing; password sign-in is off");
  const ctx: PasswordRouteContext = {
    client: ticketSecret ? options.client : null,
    store: options.store,
    now: options.now ?? (() => Date.now()),
    ticketSecret,
    defer: options.defer ?? runAfterResponse,
    emailStanding: options.emailStanding ?? passwordEmailStanding,
  };
  registerPasswordSignInRoutes(app, ctx, requestWorkosPasswordReset);
  registerPasswordVerificationRoutes(app, ctx);
  registerPasswordResetRoutes(app, ctx);
}
