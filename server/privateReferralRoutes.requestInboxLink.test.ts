// D-089.server (packet docs/plans/D-089-request-inbox.md §5.1; rulings D-327 and D-398): the
// request-inbox link's server half, through the real routes and real server/db.ts calls over the
// in-memory database. The switch is forced each way with a getter mock, so one file proves both
// "off is byte-identical to before" (T4) and the behaviour once the release row turns it on.
import express from "express";
import request from "supertest";
import { eq, getTableColumns, getTableName, type Column } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askInviteLinks, jobs, operationalActivityLogs, profiles, referralAvailabilitySlots, referralRequestPasses, referralRequests, referralTransitionEvents, referrerFastTrackLinks, users, verifiedLoginAliases } from "../drizzle/schema";
import { publicReferralLinkSchema } from "../shared/requestInboxLink";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { deactivateReferrerFastTrackLink, getOrCreateReferrerFastTrackLink, getPublicReferrerFastTrackLink, getPublicReferrerFastTrackVanityLink, listCompanyReferralInboxByState, resumeReferrerFastTrackLink } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { setReferrerScreenName } from "./referrerScreenName";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), switchOn: false }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("../shared/requestInboxLink", async importOriginal => {
  const actual = await importOriginal<typeof import("../shared/requestInboxLink")>();
  return { ...actual, get REQUEST_INBOX_LINK_ENABLED() { return mocks.switchOn; } };
});

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
/** Signed in, but not a verified employee anywhere. */
const OUTSIDER = 6;
const LINK_CODE = "a".repeat(32);
const GENERATED = "ref-a1b2c3d4e5";
const HOUR_MS = 60 * 60 * 1000;

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const verifiedAt = new Date("2026-09-01T00:00:00Z");
const employee = (id: number, userId: number, domain = "acme.com"): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: domain, workEmailVerifiedAt: verifiedAt, paused: false });
const person = (id: number, name: string, email: string): Row => full(users, { id, openId: `person-${id}`, name, email, suspended: false });
const link = (over: Row = {}): Row => full(referrerFastTrackLinks, { id: 1, referrerId: REFERRER, companyDomain: "acme.com", linkCode: LINK_CODE, vanityAlias: GENERATED, isActive: true, deactivatedAt: null, ...over });
const recent = () => new Date(Date.now() - HOUR_MS);
const ask = (id: number, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId: SEEKER, referrerId: REFERRER, personalPitch: "A specific note about the role.", status: "pending", revision: 0, waitingForCoverage: false, coverageVisibleAt: recent(), opportunityId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: recent(), updatedAt: recent(), ...over });
const claimEvent = (id: number, requestId: number, action = "claim"): Row => full(referralTransitionEvents, { id, referralRequestId: requestId, operationKey: `${action}:${requestId}`, actorUserId: REFERRER, action, fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: recent() });
const allocated = (id: number, requestId: number): Row => full(referralAvailabilitySlots, { id, referrerId: REFERRER, companyDomain: "acme.com", referralRequestId: requestId, status: "allocated", activeRequestKey: `request:${requestId}`, openedAt: recent() });
const invite = (id: number, requestId: number, over: Row = {}): Row => full(askInviteLinks, { id, referralRequestId: requestId, linkTokenHash: `${id}`.padStart(64, "0"), status: "delivered", claimedByUserId: REFERRER, ...over });

function seed(over: { asks?: Row[]; events?: Row[]; slots?: Row[]; invites?: Row[]; links?: Row[]; referrerDomain?: string } = {}) {
  store.reset([
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(REFERRER, "Riya Referrer", "riya.referrer@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com"), person(OUTSIDER, "Olive Outsider", "olive@example.com")]],
    [profiles, [employee(31, REFERRER, over.referrerDomain), employee(33, COLLEAGUE)]],
    [verifiedLoginAliases, [full(verifiedLoginAliases, { id: 1, canonicalUserId: REFERRER, normalizedVerifiedEmail: "riya.referrer@acme.com" })]],
    [referrerFastTrackLinks, over.links ?? [link()]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design" })]],
    [referralRequests, over.asks ?? []],
    [referralTransitionEvents, over.events ?? []],
    [referralAvailabilitySlots, over.slots ?? []],
    [askInviteLinks, over.invites ?? []],
    [referralRequestPasses, []],
    [operationalActivityLogs, []],
  ]);
}

/** MySQL refuses an update that would duplicate a unique key; the in-memory client only does so on insert. */
function enforceUniqueAliasOnUpdate() {
  const original = store.db.update.bind(store.db);
  vi.spyOn(store.db, "update").mockImplementation(((table: MySqlTable) => {
    const chain = original(table);
    if (getTableName(table) !== "referrerFastTrackLinks") return chain;
    return { set: (values: Row) => ({ where: async (where: unknown) => {
      const before = store.rows(referrerFastTrackLinks).map(row => ({ id: Number(row.id), alias: row.vanityAlias }));
      const result = await chain.set(values as never).where(where as never);
      const aliases = store.rows(referrerFastTrackLinks).map(row => row.vanityAlias);
      if (new Set(aliases).size !== aliases.length) {
        // Undo the write, as MySQL would never have made it.
        for (const item of before) await original(referrerFastTrackLinks).set({ vanityAlias: item.alias as string }).where(eq(referrerFastTrackLinks.id, item.id));
        throw Object.assign(new Error("Duplicate entry for referrerFastTrackLinks"), { code: "ER_DUP_ENTRY", errno: 1062 });
      }
      return result;
    } }) };
  }) as typeof store.db.update);
}

const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
function appFor() {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: `person-${req.header("x-test-user")}` } } : undefined),
    getOrCreateReferrerFastTrackLink, getPublicReferrerFastTrackLink, getPublicReferrerFastTrackVanityLink, deactivateReferrerFastTrackLink, resumeReferrerFastTrackLink,
    setReferrerScreenName: (userId: number, input: { screenName: string }) => setReferrerScreenName(userId, input),
    listCompanyReferralInbox: async () => [],
    recordActivity: async (input: { action: string; metadata?: Record<string, unknown> }) => { activity.push(input); },
  } as unknown as PrivateReferralRouteDeps);
  return app;
}
const as = (userId: number) => ({ "x-test-user": String(userId) });
const linkRow = () => store.rows(referrerFastTrackLinks).find(row => row.referrerId === REFERRER);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  mocks.switchOn = false;
  activity.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  seed();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("T4: with the switch off nothing changes", () => {
  it("answers 404 on both new write routes and writes nothing", async () => {
    const app = appFor();
    expect((await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send({ screenName: "skyline-dev" })).status).toBe(404);
    await deactivateReferrerFastTrackLink(REFERRER);
    expect((await request(app).post("/api/referrer-fast-track/me/resume").set(as(REFERRER)).send({})).status).toBe(404);
    expect(linkRow()).toMatchObject({ vanityAlias: GENERATED, isActive: false, linkCode: LINK_CODE });
  });

  it("keeps both public payloads exactly { companyDomain, isActive } and GET /me without a screenName", async () => {
    const app = appFor();
    expect((await request(app).get(`/api/referrer-fast-track/${LINK_CODE}`)).body).toEqual({ link: { companyDomain: "acme.com", isActive: true } });
    expect((await request(app).get(`/api/referrer-fast-track/vanity/acme/${GENERATED}`)).body).toEqual({ link: { companyDomain: "acme.com", isActive: true } });
    const me = await request(app).get("/api/referrer-fast-track/me").set(as(REFERRER));
    expect(me.status).toBe(200);
    expect(me.body.link).not.toHaveProperty("screenName");
    expect(activity.filter(item => item.action.endsWith("_resolved")).map(item => item.metadata)).toEqual([{ public: true }, { public: true }]);
  });

  it("adds no askedYouDirectly (and no opportunityId) key to inbox rows", async () => {
    seed({ asks: [ask(501)] });
    const [row] = await listCompanyReferralInboxByState(REFERRER, "new");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("askedYouDirectly");
    expect(row).not.toHaveProperty("opportunityId");
  });
});

describe("with the switch on", () => {
  beforeEach(() => { mocks.switchOn = true; });

  it("T1: resume turns a paused link back on with a fresh code and the same alias; the old /fast/ code stays dead", async () => {
    const app = appFor();
    await deactivateReferrerFastTrackLink(REFERRER);
    expect((await request(app).get(`/api/referrer-fast-track/${LINK_CODE}`)).status).toBe(404);
    const resumed = await request(app).post("/api/referrer-fast-track/me/resume").set(as(REFERRER)).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body).toEqual({ resumed: true, isActive: true });
    expect(resumed.headers["cache-control"]).toBe("private, no-store");
    const row = linkRow();
    expect(row).toMatchObject({ isActive: true, deactivatedAt: null, vanityAlias: GENERATED });
    expect(row?.linkCode).not.toBe(LINK_CODE);
    expect((await request(app).get(`/api/referrer-fast-track/${LINK_CODE}`)).status).toBe(404);
    expect((await request(app).get(`/api/referrer-fast-track/${String(row?.linkCode)}`)).status).toBe(200);
    expect(activity.find(item => item.action === "referrer_fast_track.link_resumed")?.metadata).toEqual({ resumed: true });
    // Idempotent: a second resume changes nothing.
    expect((await request(app).post("/api/referrer-fast-track/me/resume").set(as(REFERRER)).send({})).body).toEqual({ resumed: false, isActive: true });
    expect(linkRow()?.linkCode).toBe(row?.linkCode);
  });

  it("T2: a chosen name is returned by GET /me, resolves at /refer, and the generated alias stops resolving", async () => {
    const app = appFor();
    const set = await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send({ screenName: "  Skyline Dev " });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ screenName: "skyline-dev", renamed: true });
    expect(activity.find(item => item.action === "referrer_fast_track.screen_name_set")?.metadata).toEqual({ renamed: true });
    const me = await request(app).get("/api/referrer-fast-track/me").set(as(REFERRER));
    expect(me.body.link).toMatchObject({ vanityAlias: "skyline-dev", screenName: "skyline-dev" });
    expect(me.body.link.vanityUrl).toMatch(/\/refer\/acme\/skyline-dev$/);
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/skyline-dev")).body).toEqual({ link: { companyDomain: "acme.com", isActive: true, screenName: "skyline-dev" } });
    expect((await request(app).get(`/api/referrer-fast-track/vanity/acme/${GENERATED}`)).status).toBe(404);
    expect(activity.find(item => item.action === "referrer_fast_track.vanity_resolved")?.metadata).toEqual({ public: true, named: true });
  });

  it("T3: refuses the person's own name, the generated form, a stray field and a taken name, writing nothing", async () => {
    enforceUniqueAliasOnUpdate();
    seed({ links: [link(), link({ id: 2, referrerId: COLLEAGUE, linkCode: "b".repeat(32), vanityAlias: "taken-name" })] });
    const app = appFor();
    const put = (body: Record<string, unknown>) => request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send(body);
    expect((await put({ screenName: "riya" })).body).toMatchObject({ code: "screen_name_identifying" });
    expect((await put({ screenName: "riya-referrer" })).status).toBe(422);
    expect((await put({ screenName: "ref-anything" })).body).toMatchObject({ code: "screen_name_invalid" });
    expect((await put({ screenName: "skyline-dev", extra: true })).body).toMatchObject({ code: "screen_name_invalid" });
    const taken = await put({ screenName: "taken-name" });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: "screen_name_taken" });
    expect(linkRow()?.vanityAlias).toBe(GENERATED);
  });

  it("T5: the public payload parses strictly, is null for a generated alias, and no person or name column is read for it", async () => {
    const select = vi.spyOn(store.db, "select");
    const byCode = await getPublicReferrerFastTrackLink(LINK_CODE);
    const byVanity = await getPublicReferrerFastTrackVanityLink("acme", GENERATED);
    expect(publicReferralLinkSchema.parse(byCode)).toEqual({ companyDomain: "acme.com", isActive: true, screenName: null });
    expect(publicReferralLinkSchema.parse(byVanity)).toEqual({ companyDomain: "acme.com", isActive: true, screenName: null });
    const columns = select.mock.calls.flatMap(call => Object.values((call[0] ?? {}) as Record<string, Column>));
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(getTableName(column.table)).not.toBe("users");
      expect(column.name).not.toMatch(/name/i);
    }
  });

  it("T6: askedYouDirectly is true only for an untouched link ask or a one-time-link ask delivered to you", async () => {
    seed({
      asks: [
        ask(501), // personal link, nothing done yet
        ask(502), // personal link the referrer then claimed
        ask(503), // queue allocation
        ask(504, { opportunityId: 55, firstLookReferrerId: REFERRER, firstLookUntil: new Date(Date.now() + HOUR_MS) }), // first-look post ask
        ask(505, { referrerId: null }), // open pool ask
        ask(506), // BYOR: delivered to this referrer through their one-time link (D-398)
        ask(507), // claimed, then released, then claimed again
      ],
      events: [claimEvent(1, 502), claimEvent(2, 507), claimEvent(3, 507, "claim_lapse"), claimEvent(4, 507)],
      slots: [allocated(91, 503), allocated(92, 506)],
      invites: [invite(71, 506), invite(72, 503, { status: "revoked", claimedByUserId: null })],
    });
    const rows = await listCompanyReferralInboxByState(REFERRER, "new");
    const direct = Object.fromEntries(rows.map(row => [row.id, row.askedYouDirectly]));
    expect(direct).toEqual({ 501: true, 502: false, 503: false, 504: false, 505: false, 506: true, 507: false });
    // isClaimedByYou keeps its meaning (§4.7, §6).
    expect(rows.find(row => row.id === 501)?.isClaimedByYou).toBe(true);
  });

  it("T6: a failed pickup-event read never shows an ask as direct", async () => {
    seed({ asks: [ask(501)] });
    const original = store.db.select.bind(store.db);
    vi.spyOn(store.db, "select").mockImplementation(((fields?: Record<string, Column>) => {
      if (fields && "action" in fields && "requestId" in fields) throw new Error("connection lost");
      return original(fields as never);
    }) as typeof store.db.select);
    const [row] = await listCompanyReferralInboxByState(REFERRER, "new");
    expect(row?.askedYouDirectly).toBe(false);
  });

  it("T7: a caller who is not a verified employee gets 403 on both routes and nothing is written", async () => {
    const app = appFor();
    const put = await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(OUTSIDER)).send({ screenName: "skyline-dev" });
    const resume = await request(app).post("/api/referrer-fast-track/me/resume").set(as(OUTSIDER)).send({});
    expect([put.status, resume.status]).toEqual([403, 403]);
    expect(store.rows(referrerFastTrackLinks)).toHaveLength(1);
    expect(linkRow()?.vanityAlias).toBe(GENERATED);
    expect((await request(app).put("/api/referrer-fast-track/me/screen-name").send({ screenName: "skyline-dev" })).status).toBe(401);
  });

  it("T9 (D-398): a chosen name cannot be renamed, so a link shared under it keeps reaching the same person", async () => {
    const app = appFor();
    await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send({ screenName: "skyline-dev" });
    const renamed = await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send({ screenName: "night-owl" });
    expect(renamed.status).toBe(409);
    expect(renamed.body).toMatchObject({ code: "screen_name_locked" });
    expect(linkRow()?.vanityAlias).toBe("skyline-dev");
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/skyline-dev")).status).toBe(200);
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/night-owl")).status).toBe(404);
    // Setting the same name again is a no-op, not a refusal.
    expect((await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(REFERRER)).send({ screenName: "skyline-dev" })).body).toEqual({ screenName: "skyline-dev", renamed: false });
  });

  it("T9 (D-398): a pause keeps the name, so nobody can take it while the link is off", async () => {
    enforceUniqueAliasOnUpdate();
    seed({ links: [link({ vanityAlias: "skyline-dev" }), link({ id: 2, referrerId: COLLEAGUE, linkCode: "b".repeat(32), vanityAlias: "ref-0000000002" })] });
    const app = appFor();
    await request(app).post("/api/referrer-fast-track/me/deactivate").set(as(REFERRER)).send({});
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/skyline-dev")).status).toBe(404);
    expect((await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(COLLEAGUE)).send({ screenName: "skyline-dev" })).status).toBe(409);
    await request(app).post("/api/referrer-fast-track/me/resume").set(as(REFERRER)).send({});
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/skyline-dev")).body.link).toMatchObject({ companyDomain: "acme.com", screenName: "skyline-dev" });
  });

  it("T10 (D-398): a chosen name moves with its person on a company change; the old company's URL refuses and no colleague can take the name", async () => {
    enforceUniqueAliasOnUpdate();
    // The referrer re-verified at globex.com; the link row still says acme.com.
    seed({ referrerDomain: "globex.com", links: [link({ vanityAlias: "skyline-dev" }), link({ id: 2, referrerId: COLLEAGUE, linkCode: "b".repeat(32), vanityAlias: "ref-0000000002" })] });
    const moved = await getOrCreateReferrerFastTrackLink(REFERRER);
    expect(moved).toMatchObject({ companyDomain: "globex.com", vanityAlias: "skyline-dev", isActive: true });
    expect(moved.linkCode).not.toBe(LINK_CODE);
    const app = appFor();
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme/skyline-dev")).status).toBe(404);
    expect((await request(app).get("/api/referrer-fast-track/vanity/globex/skyline-dev")).body).toEqual({ link: { companyDomain: "globex.com", isActive: true, screenName: "skyline-dev" } });
    expect((await request(app).put("/api/referrer-fast-track/me/screen-name").set(as(COLLEAGUE)).send({ screenName: "skyline-dev" })).body).toMatchObject({ code: "screen_name_taken" });
  });

  it("T10: a generated alias is still re-minted on a company change, as before", async () => {
    seed({ referrerDomain: "globex.com" });
    const moved = await getOrCreateReferrerFastTrackLink(REFERRER);
    expect(moved.companyDomain).toBe("globex.com");
    expect(moved.vanityAlias).toMatch(/^ref-[0-9a-f]{10}$/);
    expect(moved.vanityAlias).not.toBe(GENERATED);
  });

  it("T12 (regression pin): a company slug that does not match the alias's company refuses", async () => {
    const app = appFor();
    expect((await request(app).get(`/api/referrer-fast-track/vanity/globex/${GENERATED}`)).status).toBe(404);
    expect(await getPublicReferrerFastTrackVanityLink("globex", GENERATED)).toBeUndefined();
  });
});
