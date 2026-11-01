// P1-client-error-boundary: what the tRPC adapter sends to the browser when a
// procedure fails. Synthetic fixtures only; no production probe, no real data.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { z } from "zod";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";

// Synthetic private-looking diagnostics that must never reach a response body.
const PRIVATE = "SYNTHETIC_PRIVATE_DIAGNOSTIC select * from users where email='seeker@example.test'";

type Trpc = typeof import("./_core/trpc");
let trpc: Trpc;
let appRouter: ReturnType<typeof buildRouter>;

function buildRouter(t: Trpc) {
  return t.router({
    plainThrow: t.publicProcedure.query(() => { throw new Error(PRIVATE); }),
    nestedCause: t.publicProcedure.query(() => {
      throw new Error("wrapper", { cause: new Error(PRIVATE) });
    }),
    nonError: t.publicProcedure.query(() => { throw { detail: PRIVATE }; }),
    internalTrpc: t.publicProcedure.query(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: PRIVATE });
    }),
    causeOnlyBadRequest: t.publicProcedure.query(() => {
      throw new TRPCError({ code: "BAD_REQUEST", cause: new Error(PRIVATE) });
    }),
    causeOnlyForbidden: t.publicProcedure.query(() => {
      throw new TRPCError({ code: "FORBIDDEN", cause: new Error(PRIVATE) });
    }),
    conflictWithPrivate: t.publicProcedure.query(() => {
      throw new TRPCError({ code: "CONFLICT", message: PRIVATE });
    }),
    needsUser: t.protectedProcedure.query(() => "ok"),
    needsAdmin: t.adminProcedure.query(() => "ok"),
    validated: t.publicProcedure
      .input(z.object({ title: z.string().min(1, "title is required") }))
      .query(({ input }) => input.title),
  });
}

async function call(path: string, input?: unknown, user: unknown = null) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`;
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(`http://localhost/api/trpc/${path}${qs}`),
    router: appRouter,
    createContext: () => ({ user, req: {}, res: {} }) as never,
    onError: () => undefined,
  });
  const text = await res.text();
  const body = JSON.parse(text);
  return { status: res.status, text, error: body.error?.json ?? body.error };
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  trpc = await import("./_core/trpc");
  appRouter = buildRouter(trpc);
});
afterAll(() => { vi.unstubAllEnvs(); });

describe("tRPC error boundary: unexpected failures are neutral", () => {
  for (const path of ["plainThrow", "nestedCause", "nonError", "internalTrpc"]) {
    it(`${path}: fixed neutral 500 with no private diagnostic`, async () => {
      const r = await call(path);
      expect(r.status).toBe(500);
      expect(r.text).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
      expect(r.text).not.toContain("example.test");
      expect(r.error.message).toBe(trpc.NEUTRAL_INTERNAL_ERROR_MESSAGE);
      expect(r.error.data.code).toBe("INTERNAL_SERVER_ERROR");
      expect(r.error.data.stack).toBeUndefined();
      expect(r.error.data.cause).toBeUndefined();
    });
  }

  it("a non-internal TRPCError whose message came from a nested cause is neutral too", async () => {
    for (const path of ["causeOnlyBadRequest", "causeOnlyForbidden", "conflictWithPrivate"]) {
      const r = await call(path);
      expect(r.text).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
      expect(r.error.data.stack).toBeUndefined();
    }
  });

  it("an unknown procedure path does not echo the path back in the message", async () => {
    const r = await call("doesNotExist_SYNTHETIC_PRIVATE_DIAGNOSTIC");
    expect(r.status).toBe(404);
    expect(r.error.message).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
  });
});

describe("tRPC error boundary: intentional safe responses are kept (explicit classification)", () => {
  it("signed-out keeps UNAUTHED_ERR_MSG, which the client's login redirect matches exactly", async () => {
    const r = await call("needsUser");
    expect(r.status).toBe(401);
    expect(r.error.message).toBe(UNAUTHED_ERR_MSG);
    expect(r.error.data.code).toBe("UNAUTHORIZED");
    expect(r.error.data.stack).toBeUndefined();
  });

  it("non-admin keeps NOT_ADMIN_ERR_MSG", async () => {
    const r = await call("needsAdmin", undefined, { id: 1, role: "user" });
    expect(r.status).toBe(403);
    expect(r.error.message).toBe(NOT_ADMIN_ERR_MSG);
    expect(r.error.data.code).toBe("FORBIDDEN");
  });

  it("the retired private-workflow FORBIDDEN line is kept", async () => {
    const t = trpc;
    const router = t.router({ retired: t.publicProcedure.query(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "Use the private company referral flow for this action" });
    }) });
    const res = await fetchRequestHandler({
      endpoint: "/api/trpc", req: new Request("http://localhost/api/trpc/retired"), router,
      createContext: () => ({ user: null, req: {}, res: {} }) as never, onError: () => undefined,
    });
    const body = JSON.parse(await res.text());
    expect(res.status).toBe(403);
    expect((body.error.json ?? body.error).message).toBe("Use the private company referral flow for this action");
  });

  it("every explicitly kept message is one the server really throws (no silent drift)", async () => {
    const { readFileSync } = await import("node:fs");
    const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    for (const message of trpc.SAFE_CLIENT_ERROR_MESSAGES) {
      if (message === UNAUTHED_ERR_MSG || message === NOT_ADMIN_ERR_MSG) continue;
      expect(routers).toContain(message);
    }
  });

  it("input validation keeps its 400 and the schema's own messages", async () => {
    const r = await call("validated", { title: "" });
    expect(r.status).toBe(400);
    expect(r.error.data.code).toBe("BAD_REQUEST");
    expect(r.error.message).toContain("title is required");
    expect(r.error.data.stack).toBeUndefined();
  });

  it("a valid call still succeeds", async () => {
    const res = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request(`http://localhost/api/trpc/validated?input=${encodeURIComponent(JSON.stringify(superjson.serialize({ title: "x" })))}`),
      router: appRouter, createContext: () => ({ user: null, req: {}, res: {} }) as never,
    });
    expect(res.status).toBe(200);
  });
});
