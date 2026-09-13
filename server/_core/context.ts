import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { resolveWorkosIdentity, workosConfigured } from "./workosAuth";
import { resolveDevIdentity } from "./devAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    if (workosConfigured()) {
      // Production WorkOS plane: the AuthKit SDK JWT (Bearer) or the
      // app_session_id cookie issued at the WorkOS/OTP callbacks.
      const identity = await resolveWorkosIdentity(opts.req);
      user = (identity?.account as User | undefined) ?? null;
    } else {
      // Local development without provider keys: resolve the dev session.
      const identity = await resolveDevIdentity(opts.req);
      user = (identity?.account as User | undefined) ?? null;
    }
  } catch (error) {
    // Authentication is optional for public procedures, so a failure here must not
    // throw. It must not be silent either: without a log, a JWKS fetch failure or a
    // database outage is indistinguishable from "not signed in" — every
    // protectedProcedure simply returns UNAUTHORIZED with nothing in the logs.
    console.error("[Auth] Identity resolution failed; treating this request as signed out:", error instanceof Error ? error.message : error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
