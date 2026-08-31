import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { resolveWorkosIdentity, workosConfigured } from "./workosAuth";
import { resolveDevIdentity } from "./devAuth";
import { sdk } from "./sdk";

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
    } else if (process.env.CLERK_SECRET_KEY) {
      // Managed environment: authenticate the legacy session token (the
      // browser SDK session is validated by Clerk middleware on REST routes).
      user = await sdk.authenticateRequest(opts.req);
    } else {
      // Local development without provider keys: resolve the dev session.
      const identity = await resolveDevIdentity(opts.req);
      user = (identity?.account as User | undefined) ?? null;
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.req ? ({ ...opts.req } as typeof opts.req) : opts.req,
    user,
  };
}
