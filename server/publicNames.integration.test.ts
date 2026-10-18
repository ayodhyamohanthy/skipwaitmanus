import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companyOpportunities, profiles, users } from "../drizzle/schema";
import type { PublicCompany } from "../shared/companies";
import { companyOpportunitiesResponseSchema } from "../shared/companyOpportunities";
import { registerCompanyDirectoryRoutes } from "./companyDirectoryRoutes";
import { listMyCompanyOpportunities } from "./db";
import { createInMemoryDrizzle, type Row, type Seed } from "./inMemoryDrizzle.testkit";
import { registerProfileRoutes } from "./profileRoutes";

/*
 * P0-referrer-exposure, review round 1. Until 2a900614 a work-email sign-up
 * stored the part of the address before the @ as the account name, so most
 * referrers' names are exactly that. The two public pages that can name a
 * referrer with no acceptance are a company's openings (when the poster ticks
 * "Show my first name": "Your last name and work email never appear") and a
 * referrer's /p/:handle (beside "Verified at {domain} via work email"). The
 * real routes and the real store run here over an in-memory database, so the
 * owner's email reaching the guard is under test, not a stub.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const DOMAIN = "quasar-ledgers.com";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Legacy work-email sign-up: the name is the address's local part. */
const ZOYA = 41;
/** Signed up with a work Google account: a real name, but a first@ address, so "Ravi" alone rebuilds it. */
const RAVI = 42;
/** A real name with a first.last address: the first name is safe to show. */
const MAYA = 43;
/** Legacy work-email sign-up whose local part is a plain word: only the email comparison catches it. */
const QUINN = 44;

const company: PublicCompany = { slug: "quasar-ledgers", name: "Quasar Ledgers", initials: "QL", industry: "Fintech", location: "Lisbon", functions: ["Engineering"], blurb: "Payments infrastructure.", domains: [DOMAIN], openToReferrals: true };

const person = (id: number, name: string, email: string): Row => ({ id, name, email, role: "user", suspended: false, canonicalPersonId: null });
const referrer = (id: number, userId: number, handle: string): Row => ({ id, userId, accountType: "referrer", company: DOMAIN, workEmailDomain: DOMAIN, workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), handle, profileVisibility: "public", headline: "Payments engineer", location: "Lisbon", openTo: null });
const opening = (id: number, ownerId: number, roleTitle: string): Row => ({ id, ownerId, companyDomain: DOMAIN, kind: "hiring_now", roleTitle, targetRoleUrl: `https://careers.${DOMAIN}/jobs/${id}`, location: "Lisbon", compensation: null, walkInAt: null, walkInEndsAt: null, isActive: true, showPosterFirstName: true, expiresAt: new Date(Date.now() + 10 * DAY_MS), createdAt: new Date(Date.now() - id * 60_000) });

const seed = (): Seed => [
  [users, [person(ZOYA, "zoya.quill", `zoya.quill@${DOMAIN}`), person(RAVI, "Ravi Patel", `ravi@${DOMAIN}`), person(MAYA, "Maya Chen", `maya.chen@${DOMAIN}`), person(QUINN, "quinn", `quinn@${DOMAIN}`)]],
  [profiles, [referrer(1, ZOYA, "payments-lead"), referrer(2, RAVI, "ledger-builder"), referrer(3, MAYA, "maya-chen"), referrer(4, QUINN, "risk-desk")]],
  [companyOpportunities, [opening(1, ZOYA, "Principal Payments Engineer"), opening(2, RAVI, "Backend Engineer"), opening(3, MAYA, "Product Designer")]],
];
const store = createInMemoryDrizzle(seed());

function publicApp() {
  const app = express();
  const resolveIdentity = async (req: express.Request) => {
    const id = Number(req.header("x-test-user"));
    return Number.isInteger(id) && id > 0 ? { account: { id, openId: `test_${id}`, role: "user" as const } } : undefined;
  };
  registerCompanyDirectoryRoutes(app, { resolveIdentity, getCompanyDirectoryEntry: async slug => (slug === company.slug ? company : undefined) });
  registerProfileRoutes(app, { resolveIdentity });
  return app;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  store.reset(seed());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("a company's public openings", () => {
  it("shows a poster's chosen first name only when it cannot rebuild their work email", async () => {
    const response = await request(publicApp()).get(`/api/companies/${company.slug}/opportunities`);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    const posters = Object.fromEntries(companyOpportunitiesResponseSchema.parse(response.body).opportunities.map(post => [post.roleTitle, post.poster]));
    expect(posters).toEqual({
      "Principal Payments Engineer": { kind: "anonymous" },
      "Backend Engineer": { kind: "anonymous" },
      "Product Designer": { kind: "firstName", firstName: "Maya" },
    });
    expect(response.text).not.toMatch(/zoya|quill|ravi/i);
    expect(response.text).not.toContain("@");
  });

  it("shows the poster the same face on their own list", async () => {
    expect(await listMyCompanyOpportunities(ZOYA)).toEqual([expect.objectContaining({ roleTitle: "Principal Payments Engineer", poster: { kind: "anonymous" } })]);
    expect(await listMyCompanyOpportunities(MAYA)).toEqual([expect.objectContaining({ roleTitle: "Product Designer", poster: { kind: "firstName", firstName: "Maya" } })]);
  });
});

describe("a referrer's public profile", () => {
  it("never shows a name taken from the work email beside the verified company", async () => {
    const app = publicApp();
    for (const [handle, local] of [["payments-lead", /zoya|quill/i], ["risk-desk", /quinn/i]] as const) {
      for (const viewer of [undefined, String(MAYA)]) {
        const call = request(app).get(`/api/p/${handle}`);
        const response = await (viewer ? call.set("x-test-user", viewer) : call);
        expect(response.status, `${handle} for ${viewer ?? "anonymous"}`).toBe(200);
        expect(response.body.profile).toMatchObject({ visible: true, displayName: null, verifiedWork: { domain: DOMAIN } });
        expect(response.text).not.toMatch(local);
      }
    }
  });

  it("shows the owner's own preview the way visitors see it", async () => {
    const response = await request(publicApp()).get("/api/p/payments-lead").set("x-test-user", String(ZOYA));
    expect(response.body.profile).toMatchObject({ visible: true, isOwner: true, displayName: null });
    expect(response.text).not.toMatch(/zoya|quill/i);
  });

  it("keeps a real name exactly as before", async () => {
    const app = publicApp();
    expect((await request(app).get("/api/p/maya-chen")).body.profile).toMatchObject({ visible: true, displayName: "Maya Chen" });
    expect((await request(app).get("/api/p/ledger-builder")).body.profile).toMatchObject({ visible: true, displayName: "Ravi Patel" });
  });
});
