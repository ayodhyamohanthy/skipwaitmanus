// MOBILE-both-prompt (D-414 (2)): GET /api/account/both-roles-prompt. The decision runs on an in-memory store with
// the drizzle store's meaning; the drizzle store's own SQL is pinned with drizzle.mock() (no database); the route test
// pins the switch, sign-in, the query edge, the private no-store answer and that nothing is written.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BOTH_ROLES_PROMPT_PATH } from "../shared/bothRolesPrompt";
import { bothRolesPromptFor, bothRolesPromptQueries, registerBothRolesPromptRoutes, type BothRolesPromptStore } from "./bothRolesPrompt";

type World = {
  users: { id: number; person: number | null }[];
  profiles: { userId: number; domain: string | null; verifiedAt: Date | null }[];
  requests: { id: number; seeker: number }[];
};

/** The drizzle store's meaning over plain rows. */
function memoryStore(world: World): BothRolesPromptStore {
  return {
    async personUserIds(userId) {
      const own = world.users.find(row => row.id === userId);
      if (!own || own.person === null) return [userId];
      return Array.from(new Set([userId, ...world.users.filter(row => row.person === own.person).map(row => row.id)]));
    },
    async hasVerifiedWorkEmail(userIds) {
      return world.profiles.some(row => userIds.includes(row.userId) && row.verifiedAt !== null && Boolean(row.domain));
    },
    async firstRequestIds(userIds) {
      return world.requests.filter(row => userIds.includes(row.seeker)).map(row => row.id).sort((a, b) => a - b).slice(0, 2);
    },
  };
}

const VERIFIED = new Date("2026-11-01T00:00:00Z");
const world = (overrides: Partial<World> = {}): World => ({
  users: [{ id: 1, person: 10 }, { id: 2, person: 10 }, { id: 3, person: 30 }, { id: 4, person: null }],
  profiles: [],
  requests: [{ id: 501, seeker: 1 }],
  ...overrides,
});

describe("bothRolesPromptFor (the decision over the account's own facts)", () => {
  it("shows right after the person's first request when no account of theirs holds a verified work email", async () => {
    expect(await bothRolesPromptFor(memoryStore(world()), { userId: 1, requestId: 501 })).toBe(true);
    // An unverified work email (a code never finished) does not count.
    expect(await bothRolesPromptFor(memoryStore(world({ profiles: [{ userId: 1, domain: "acme.com", verifiedAt: null }] })), { userId: 1, requestId: 501 })).toBe(true);
  });

  it("never shows once any account of the canonical person holds a verified work email", async () => {
    expect(await bothRolesPromptFor(memoryStore(world({ profiles: [{ userId: 1, domain: "acme.com", verifiedAt: VERIFIED }] })), { userId: 1, requestId: 501 })).toBe(false);
    // A linked login (D-057) of the same person carries the verification.
    expect(await bothRolesPromptFor(memoryStore(world({ profiles: [{ userId: 2, domain: "acme.com", verifiedAt: VERIFIED }] })), { userId: 1, requestId: 501 })).toBe(false);
  });

  it("never shows past the first request, counted across the whole person", async () => {
    expect(await bothRolesPromptFor(memoryStore(world({ requests: [{ id: 501, seeker: 1 }, { id: 502, seeker: 1 }] })), { userId: 1, requestId: 502 })).toBe(false);
    expect(await bothRolesPromptFor(memoryStore(world({ requests: [{ id: 501, seeker: 1 }, { id: 502, seeker: 1 }] })), { userId: 1, requestId: 501 })).toBe(false);
    // A request from the person's other login came first.
    expect(await bothRolesPromptFor(memoryStore(world({ requests: [{ id: 400, seeker: 2 }, { id: 501, seeker: 1 }] })), { userId: 1, requestId: 501 })).toBe(false);
  });

  it("answers only for the asker's own request, and isolates other people", async () => {
    // Someone else's first request id never opens the sheet for this account.
    expect(await bothRolesPromptFor(memoryStore(world({ requests: [{ id: 601, seeker: 3 }] })), { userId: 1, requestId: 601 })).toBe(false);
    // Another person's verified work email does not close this person's sheet.
    expect(await bothRolesPromptFor(memoryStore(world({ profiles: [{ userId: 3, domain: "acme.com", verifiedAt: VERIFIED }] })), { userId: 1, requestId: 501 })).toBe(true);
    // An account with no canonical person is only itself.
    expect(await bothRolesPromptFor(memoryStore(world({ requests: [{ id: 701, seeker: 4 }], profiles: [{ userId: 1, domain: "acme.com", verifiedAt: VERIFIED }] })), { userId: 4, requestId: 701 })).toBe(true);
  });

  it("skips the verification read when it is not the first request", async () => {
    const store = memoryStore(world({ requests: [{ id: 501, seeker: 1 }, { id: 502, seeker: 1 }] }));
    const verified = vi.spyOn(store, "hasVerifiedWorkEmail");
    await bothRolesPromptFor(store, { userId: 1, requestId: 502 });
    expect(verified).not.toHaveBeenCalled();
  });
});

describe("both-roles store SQL (drizzle store contract)", () => {
  it("reads at most the person's first two requests, oldest first", () => {
    expect(bothRolesPromptQueries(drizzle.mock()).firstRequests([1, 2]).toSQL()).toEqual({
      sql: "select `id` from `referralRequests` where `referralRequests`.`jobSeekerId` in (?, ?) order by `referralRequests`.`id` asc limit ?",
      params: [1, 2, 2],
    });
  });

  it("reuses the own-employer guard's canonical-person and verified-work-email reads, and writes nothing", () => {
    const source = readFileSync(new URL("./bothRolesPrompt.ts", import.meta.url), "utf8");
    expect(source).toContain("drizzleOwnEmployerStore(db)");
    expect(source).not.toMatch(/\.(insert|update|delete)\(|\.transaction\(|\.execute\(/);
  });
});

function harness({ enabled = true, signedIn = true, store = memoryStore(world()) as BothRolesPromptStore | null } = {}) {
  const resolveIdentity = vi.fn(async () => (signedIn ? { account: { id: 1 } } : undefined));
  const loadStore = vi.fn(async () => store);
  const app = express();
  registerBothRolesPromptRoutes(app, { enabled: () => enabled, resolveIdentity, store: loadStore });
  return { app, resolveIdentity, loadStore };
}

describe(`GET ${BOTH_ROLES_PROMPT_PATH}`, () => {
  it("answers 404 while the switch is off, before identity or any read", async () => {
    const h = harness({ enabled: false });
    const response = await request(h.app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`);
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(h.resolveIdentity).not.toHaveBeenCalled();
    expect(h.loadStore).not.toHaveBeenCalled();
  });

  it("requires sign-in and a single positive request id", async () => {
    expect((await request(harness({ signedIn: false }).app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`)).status).toBe(401);
    const h = harness();
    for (const query of ["", "?requestId=0", "?requestId=abc", "?requestId=1&requestId=2", "?requestId=501&userId=9"]) {
      expect((await request(h.app).get(`${BOTH_ROLES_PROMPT_PATH}${query}`)).status).toBe(400);
    }
    expect(h.loadStore).not.toHaveBeenCalled();
  });

  it("answers { show } privately for the signed-in person only", async () => {
    const yes = await request(harness().app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`);
    expect(yes.status).toBe(200);
    expect(yes.body).toEqual({ show: true });
    expect(yes.headers["cache-control"]).toBe("private, no-store");
    const verified = harness({ store: memoryStore(world({ profiles: [{ userId: 2, domain: "acme.com", verifiedAt: VERIFIED }] })) });
    expect((await request(verified.app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`)).body).toEqual({ show: false });
  });

  it("answers 503 without a database and 500 on a failed read, never a show", async () => {
    expect((await request(harness({ store: null }).app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`)).status).toBe(503);
    const failing: BothRolesPromptStore = { ...memoryStore(world()), firstRequestIds: async () => { throw new Error("db down"); } };
    const response = await request(harness({ store: failing }).app).get(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`);
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("show");
  });
});
