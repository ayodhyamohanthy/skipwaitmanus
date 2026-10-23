import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companies, companyDomains, jobs, profiles, referralRequests, referralTransitionEvents, referrerFastTrackLinks } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { loadImpactCard } from "./impactCard";

/*
 * D-106: the DB read behind the referrer impact card. The route test mocks
 * loadImpactCard away, so these are the only tests over the real queries:
 * the active fast-track link, the listed-company gate, the event query
 * (this referrer only), distinct-ask counting and the median measured from
 * the ask's coverageVisibleAt.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });

const REFERRER = 9;
const OTHER_REFERRER = 10;
const NOW = new Date("2026-10-22T12:00:00.000Z");
const at = (iso: string) => new Date(iso);

const link = (over: Row = {}): Row => full(referrerFastTrackLinks, { id: 1, referrerId: REFERRER, companyDomain: "acme.com", linkCode: "abc12345", vanityAlias: "QuietFalcon", isActive: true, ...over });
/** The referrer's profile: a verified employee at the link's company by default (F3). */
const profile = (over: Row = {}): Row => full(profiles, { id: 1, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: at("2026-01-05T00:00:00.000Z"), ...over });
const companyDomain = (): Row => full(companyDomains, { id: 1, companyId: 5, domain: "acme.com", isPrimary: true });
const company = (status = "listed"): Row => full(companies, { id: 5, slug: "acme", name: "Acme", initials: "AC", industry: "Software", location: "Remote", functions: "[]", blurb: "", status, sortOrder: 0 });
/** An answered ask. `visibleAt` is the coverage clock; null falls back to createdAt. */
const ask = (id: number, createdAt: string, visibleAt: string | null, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId: 7, referrerId: REFERRER, status: "approved", createdAt: at(createdAt), coverageVisibleAt: visibleAt === null ? null : at(visibleAt), ...over });
const event = (id: number, requestId: number, action: string, resultingStatus: string, createdAt: string, actorUserId = REFERRER): Row => full(referralTransitionEvents, { id, referralRequestId: requestId, operationKey: `${action}:${id}`, actorUserId, action, fromStatus: "pending", resultingStatus, resultingRevision: id, createdAt: at(createdAt) });

type Seed = { links?: Row[]; domains?: Row[]; companies?: Row[]; jobs?: Row[]; asks?: Row[]; events?: Row[]; profiles?: Row[] };
/** The employer an ask belongs to: `jobs.company` holds the canonical domain. */
const job = (id: number, companyDomain: string): Row => full(jobs, { id, title: "Designer", company: companyDomain, location: "Remote", seniority: "Mid", employmentType: "Full-time", workMode: "Remote", description: "x" });
function seed(over: Seed = {}) {
  store.reset([
    [referrerFastTrackLinks, over.links ?? [link()]],
    [profiles, over.profiles ?? [profile()]],
    [companyDomains, over.domains ?? [companyDomain()]],
    [companies, over.companies ?? [company()]],
    [jobs, over.jobs ?? [job(11, "acme.com")]],
    [referralRequests, over.asks ?? []],
    [referralTransitionEvents, over.events ?? []],
  ]);
}

/** Three distinct answered asks: approve 4 h, pass 2 h and approve 10 h after visibility. */
const threeAnswers = () => ({
  asks: [ask(601, "2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z"), ask(602, "2026-10-11T00:00:00.000Z", "2026-10-11T00:00:00.000Z"), ask(603, "2026-10-12T00:00:00.000Z", null)],
  events: [
    event(1, 601, "approve", "approved", "2026-10-10T04:00:00.000Z"),
    event(2, 602, "pass", "pending", "2026-10-11T02:00:00.000Z"),
    event(3, 603, "approve", "approved", "2026-10-12T10:00:00.000Z"),
  ],
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("loadImpactCard: the gates", () => {
  it("insufficient without an active fast-track link", async () => {
    seed({ links: [link({ isActive: false })] });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({ state: "insufficient" });
  });

  it("F2: the inactive-link gate holds on its own, with three answered asks already seeded", async () => {
    const { asks, events } = threeAnswers();
    seed({ links: [link({ isActive: false })], asks, events });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({ state: "insufficient" });
  });

  it("F3: insufficient when the referrer is no longer a verified employee (no verified work email)", async () => {
    const { asks, events } = threeAnswers();
    seed({ profiles: [profile({ workEmailVerifiedAt: null })], asks, events });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toEqual({ state: "insufficient" });
    expect(card).not.toHaveProperty("screenName");
  });

  it("F3: insufficient when the verified work email is at a different company (job change, D-057)", async () => {
    const { asks, events } = threeAnswers();
    seed({ profiles: [profile({ workEmailDomain: "oldco.com" })], asks, events });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({ state: "insufficient" });
  });

  it("F3: a verified employee at the link's domain keeps the card ready, whatever the case", async () => {
    const { asks, events } = threeAnswers();
    seed({ profiles: [profile({ workEmailDomain: "ACME.com" })], asks, events });
    expect(await loadImpactCard(REFERRER, NOW)).toMatchObject({ state: "ready", screenName: "QuietFalcon" });
  });

  it("insufficient when the company is not listed", async () => {
    const { asks, events } = threeAnswers();
    seed({ companies: [company("hidden")], asks, events });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({ state: "insufficient" });
  });

  it("insufficient with two distinct answered asks, and the payload carries no stats field", async () => {
    seed({
      asks: [ask(601, "2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z"), ask(602, "2026-10-11T00:00:00.000Z", "2026-10-11T00:00:00.000Z")],
      events: [event(1, 601, "approve", "approved", "2026-10-10T04:00:00.000Z"), event(2, 602, "pass", "pending", "2026-10-11T02:00:00.000Z")],
    });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toEqual({ state: "insufficient" });
    expect(card).not.toHaveProperty("stats");
    expect(card).not.toHaveProperty("screenName");
  });
});

describe("loadImpactCard: the aggregates", () => {
  it("three answers: median from coverageVisibleAt, referred this month on distinct asks", async () => {
    const { asks, events } = threeAnswers();
    seed({
      asks,
      events: [
        ...events,
        // The same ask answered twice: the first decision sets the reply time.
        event(4, 601, "approve", "approved", "2026-10-10T06:00:00.000Z"),
        // Two referrals on one ask count once; last month's referral does not count.
        event(5, 602, "progress", "intro_made", "2026-10-15T00:00:00.000Z"),
        event(6, 602, "progress", "interview", "2026-10-16T00:00:00.000Z"),
        event(7, 603, "progress", "offer", "2026-10-17T00:00:00.000Z"),
        event(8, 601, "progress", "intro_made", "2026-09-20T00:00:00.000Z"),
        // Another referrer's answers never count towards this card.
        event(9, 604, "approve", "approved", "2026-10-18T00:00:00.000Z", OTHER_REFERRER),
      ],
    });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({
      state: "ready",
      screenName: "QuietFalcon",
      companyName: "Acme",
      companySlug: "acme",
      linkPath: "/refer/acme/quietfalcon",
      stats: { referredThisMonth: 2, medianFirstReplyHours: 4, acceptRatePct: 67 },
    });
  });

  it("F1: an accept recorded as review counts as answered and accepted, and its reply joins the median", async () => {
    seed({
      asks: [ask(601, "2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z"), ask(602, "2026-10-11T00:00:00.000Z", "2026-10-11T00:00:00.000Z"), ask(603, "2026-10-12T00:00:00.000Z", null)],
      events: [
        // The /referrer record action accepts with action "review" (reviewReferralRequest).
        event(1, 601, "review", "approved", "2026-10-10T04:00:00.000Z"),
        event(2, 602, "pass", "pending", "2026-10-11T02:00:00.000Z"),
        event(3, 603, "approve", "approved", "2026-10-12T10:00:00.000Z"),
      ],
    });
    expect(await loadImpactCard(REFERRER, NOW)).toMatchObject({ state: "ready", stats: { medianFirstReplyHours: 4, acceptRatePct: 67 } });
  });

  it("F2: a referral the seeker recorded counts; lapses, step-backs and a colleague's accept never do", async () => {
    // The rule is status-based, not actor-based: the seeker's own confirmation
    // (seeker_confirmed_referred, actor = seeker) moves the ask to intro_made.
    const { asks, events } = threeAnswers();
    seed({
      asks: [...asks, ask(604, "2026-10-13T00:00:00.000Z", "2026-10-13T00:00:00.000Z", { referrerId: OTHER_REFERRER })],
      events: [
        ...events,
        event(31, 601, "seeker_confirmed_referred", "intro_made", "2026-10-20T00:00:00.000Z", 7),
        event(32, 602, "referred_lapse", "pending", "2026-10-21T00:00:00.000Z"),
        event(33, 603, "step_back", "pending", "2026-10-21T00:00:00.000Z"),
        event(34, 604, "approve", "approved", "2026-10-21T00:00:00.000Z", OTHER_REFERRER),
        event(35, 604, "progress", "intro_made", "2026-10-21T00:00:00.000Z", OTHER_REFERRER),
      ],
    });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toMatchObject({ state: "ready", stats: { referredThisMonth: 1, acceptRatePct: 67 } });
  });

  it("F5: the referral count is route-agnostic; the copy claims no link attribution", async () => {
    // referralRequests carries no link attribution, so this count never proves
    // the referral came through the fast-track link. The published line (F5)
    // therefore no longer claims "through my link".
    const { asks, events } = threeAnswers();
    seed({ asks, events: [...events, event(21, 602, "progress", "intro_made", "2026-10-20T00:00:00.000Z")] });
    expect(await loadImpactCard(REFERRER, NOW)).toMatchObject({ state: "ready", stats: { referredThisMonth: 1 } });
  });

  it("falls back to the fast link when there is no vanity alias", async () => {
    const { asks, events } = threeAnswers();
    seed({ links: [link({ vanityAlias: null })], asks, events });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toMatchObject({ state: "ready", screenName: "your link", linkPath: "/fast/abc12345" });
  });
});

/*
 * D-106 review F1: the card is published as "{company} impact", so every number
 * must come from asks at THAT company. The link follows the referrer to their new
 * employer (getOrCreateReferrerFastTrackLink updates it), while their historical
 * asks keep their old employer in `jobs.company` — so filtering on actorUserId or
 * referrerId alone credits the old employer's work to the new one.
 */
describe("loadImpactCard: one company's work only (F1)", () => {
  it("is insufficient when every answered ask belongs to the previous employer", async () => {
    // The link and profile are verified at acme.com; all three asks are oldco.com jobs.
    const { asks, events } = threeAnswers();
    seed({ jobs: [job(11, "oldco.com")], asks, events });
    expect(await loadImpactCard(REFERRER, NOW)).toEqual({ state: "insufficient" });
  });

  it("never counts a referral made at the previous employer", async () => {
    // Three answered Acme asks plus one old-company ask that reached intro_made this month.
    seed({
      jobs: [job(11, "oldco.com"), job(12, "acme.com")],
      asks: [
        ask(601, "2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z", { jobId: 12 }),
        ask(602, "2026-10-11T00:00:00.000Z", "2026-10-11T00:00:00.000Z", { jobId: 12 }),
        ask(603, "2026-10-12T00:00:00.000Z", null, { jobId: 12 }),
        ask(604, "2026-10-13T00:00:00.000Z", "2026-10-13T00:00:00.000Z", { jobId: 11 }),
      ],
      events: [
        event(1, 601, "approve", "approved", "2026-10-10T04:00:00.000Z"),
        event(2, 602, "pass", "pending", "2026-10-11T02:00:00.000Z"),
        event(3, 603, "approve", "approved", "2026-10-12T10:00:00.000Z"),
        event(4, 604, "approve", "approved", "2026-10-13T04:00:00.000Z"),
        event(5, 604, "progress", "intro_made", "2026-10-20T00:00:00.000Z"),
      ],
    });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toMatchObject({ state: "ready", stats: { referredThisMonth: 0, acceptRatePct: 67 } });
  });

  it("uses the same company scope for min-3, referrals, accept rate and reply median", async () => {
    // Acme: approve 4 h, pass 2 h, approve 10 h -> 67%, median 4 h, one referral.
    // Oldco: three passes 100 h in, all referred, which would swamp every number.
    seed({
      jobs: [job(12, "acme.com"), job(11, "oldco.com")],
      asks: [
        ask(601, "2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z", { jobId: 12 }),
        ask(602, "2026-10-11T00:00:00.000Z", "2026-10-11T00:00:00.000Z", { jobId: 12 }),
        ask(603, "2026-10-12T00:00:00.000Z", null, { jobId: 12 }),
        ask(701, "2026-10-05T00:00:00.000Z", "2026-10-05T00:00:00.000Z", { jobId: 11 }),
        ask(702, "2026-10-06T00:00:00.000Z", "2026-10-06T00:00:00.000Z", { jobId: 11 }),
        ask(703, "2026-10-07T00:00:00.000Z", "2026-10-07T00:00:00.000Z", { jobId: 11 }),
      ],
      events: [
        event(1, 601, "approve", "approved", "2026-10-10T04:00:00.000Z"),
        event(2, 602, "pass", "pending", "2026-10-11T02:00:00.000Z"),
        event(3, 603, "approve", "approved", "2026-10-12T10:00:00.000Z"),
        event(4, 601, "progress", "intro_made", "2026-10-20T00:00:00.000Z"),
        event(5, 701, "pass", "pending", "2026-10-09T04:00:00.000Z"),
        event(6, 702, "pass", "pending", "2026-10-10T04:00:00.000Z"),
        event(7, 703, "pass", "pending", "2026-10-11T04:00:00.000Z"),
        event(8, 701, "progress", "intro_made", "2026-10-20T01:00:00.000Z"),
        event(9, 702, "progress", "intro_made", "2026-10-20T02:00:00.000Z"),
        event(10, 703, "progress", "intro_made", "2026-10-20T03:00:00.000Z"),
      ],
    });
    const card = await loadImpactCard(REFERRER, NOW);
    expect(card).toMatchObject({ state: "ready", stats: { referredThisMonth: 1, acceptRatePct: 67, medianFirstReplyHours: 4 } });
  });

  it("treats a second domain mapped to the same company as the same employer", async () => {
    // companyDomains holds several domains per company: acme.io is an alias of Acme.
    const { asks, events } = threeAnswers();
    seed({
      domains: [companyDomain(), full(companyDomains, { id: 2, companyId: 5, domain: "acme.io", isPrimary: false })],
      jobs: [job(11, "acme.io")],
      asks,
      events,
    });
    expect(await loadImpactCard(REFERRER, NOW)).toMatchObject({ state: "ready", stats: { acceptRatePct: 67 } });
  });
});
