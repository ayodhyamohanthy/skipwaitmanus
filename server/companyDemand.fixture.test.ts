// D-086.count fixture: the demand loaders read plain rows through the real
// drizzle query path, so the join, the status filter and the domain match are
// exercised rather than asserted. `jobs.company` holds a DOMAIN; a row whose
// company column carries the company NAME counts nothing (never fuzzy-matched).
import { describe, expect, it } from "vitest";
import { canonicalPeople, jobs, profiles, referralRequests, referralTransitionEvents, users, type Row } from "../drizzle/schema";
import { countDemandPeople, type DemandCompany } from "../shared/companyDemand";
import { isAskExpired } from "../shared/referral";
import { loadCompanyDemand, loadUnlistedDemand } from "./companyDemand";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-02T09:00:00Z");

const acme: DemandCompany = { slug: "acme", name: "Acme", domains: ["acme.com", "acme.io"] };
const globex: DemandCompany = { slug: "globex", name: "Globex", domains: ["globex.com"] };
const operator: DemandCompany = { slug: "skipwait", name: "SkipWait", domains: ["skipwait.me"] };

const user = (id: number, over: Row = {}): Row => ({ id, openId: `open-${id}`, canonicalPersonId: null, role: "user", suspended: false, ...over });
const person = (id: number, suspended = false): Row => ({ id, suspended });
const job = (id: number, company: string): Row => ({ id, title: "Engineer", company, location: "Remote", seniority: "mid", employmentType: "full-time", workMode: "remote", description: "Build things", createdAt: new Date(NOW - 30 * DAY) });
const ask = (id: number, jobId: number, jobSeekerId: number, over: Row = {}): Row => ({ id, jobId, jobSeekerId, personalPitch: "Please refer me", status: "pending", referrerId: null, waitingForCoverage: false, coverageVisibleAt: new Date(NOW - DAY), createdAt: new Date(NOW - 2 * DAY), ...over });
const referrer = (userId: number, domain: string): Row => ({ id: userId, userId, accountType: "referrer", workEmailDomain: domain, workEmailVerifiedAt: new Date(NOW - 20 * DAY) });

function store(over: { asks?: Row[]; jobs?: Row[]; users?: Row[]; people?: Row[]; referrers?: Row[]; events?: Row[] } = {}) {
  const db = createInMemoryDrizzle();
  db.reset([
    [users, over.users ?? [user(1), user(2), user(3)]],
    [canonicalPeople, over.people ?? []],
    [jobs, over.jobs ?? [job(10, "acme.com"), job(11, "acme.io"), job(12, "globex.com"), job(13, "Acme")]],
    [referralRequests, over.asks ?? [ask(100, 10, 1), ask(101, 12, 2)]],
    [profiles, over.referrers ?? []],
    [referralTransitionEvents, over.events ?? []],
  ]);
  return db;
}

describe("loadCompanyDemand", () => {
  it("counts distinct people per listed company across its domains", async () => {
    const db = store({ asks: [ask(100, 10, 1), ask(101, 11, 1), ask(102, 12, 2), ask(103, 10, 2)] });
    expect(await loadCompanyDemand([acme, globex, operator], NOW, db.db)).toEqual([
      { slug: "acme", name: "Acme", people: 2 },
      { slug: "globex", name: "Globex", people: 1 },
      { slug: "skipwait", name: "SkipWait", people: 0 },
    ]);
  });

  it("counts a name-only jobs.company value as nothing, never fuzzy-matching it", async () => {
    const db = store({ asks: [ask(100, 10, 1), ask(101, 13, 2)] });
    expect(await loadCompanyDemand([acme], NOW, db.db)).toEqual([{ slug: "acme", name: "Acme", people: 1 }]);
  });

  it("excludes suspended accounts, suspended people, admins and non-pending requests", async () => {
    const db = store({
      users: [user(1), user(2, { suspended: true }), user(3, { canonicalPersonId: 5 }), user(4, { role: "admin" })],
      people: [person(5, true)],
      asks: [ask(100, 10, 1), ask(101, 10, 2), ask(102, 10, 3), ask(103, 10, 4), ask(104, 10, 1, { status: "declined" }), ask(105, 10, 2, { status: "withdrawn" })],
    });
    expect(await loadCompanyDemand([acme], NOW, db.db)).toEqual([{ slug: "acme", name: "Acme", people: 1 }]);
  });

  it("reads only slugs, names and numbers: no id, email, request text or domain leaves the loader", async () => {
    const db = store({ asks: [ask(100, 10, 1)] });
    const rows = await loadCompanyDemand([acme], NOW, db.db);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["name", "people", "slug"]);
    expect(JSON.stringify(rows)).not.toMatch(/acme\.com|acme\.io|open-1|Please refer me|jobSeekerId|canonicalPersonId/);
  });

  it("follows the app clock, not SQL NOW(): the same rows give two answers as time passes", async () => {
    // 85 days old and still waiting: live now, past the 90-day shelf life in ten days.
    const waiting = ask(100, 10, 1, { waitingForCoverage: true, coverageVisibleAt: null, createdAt: new Date(NOW - 85 * DAY) });
    // Visible eight days ago: already ended by the runtime.
    const stale = ask(101, 10, 2, { waitingForCoverage: false, coverageVisibleAt: new Date(NOW - 8 * DAY), createdAt: new Date(NOW - 9 * DAY) });
    const db = store({ asks: [waiting, stale] });
    expect(isAskExpired(waiting, NOW)).toBe(false);
    expect(isAskExpired(waiting, NOW + 10 * DAY)).toBe(true);
    expect(await loadCompanyDemand([acme], NOW, db.db)).toEqual([{ slug: "acme", name: "Acme", people: 1 }]);
    expect(await loadCompanyDemand([acme], NOW + 10 * DAY, db.db)).toEqual([{ slug: "acme", name: "Acme", people: 0 }]);
  });

  it("is coverage-neutral: verified referrers at the company change nothing", async () => {
    const asks = [ask(100, 10, 1), ask(101, 10, 2), ask(102, 10, 3)];
    const without = await loadCompanyDemand([acme], NOW, store({ asks }).db);
    const withReferrers = await loadCompanyDemand([acme], NOW, store({ asks, referrers: [referrer(1, "acme.com"), referrer(2, "acme.com"), referrer(3, "acme.com")] }).db);
    expect(withReferrers).toEqual(without);
  });

  it("counts a request awaiting reconfirm: the event does not hide the person", async () => {
    const waiting = ask(100, 10, 1, { waitingForCoverage: true, coverageVisibleAt: null, createdAt: new Date(NOW - 40 * DAY) });
    const reconfirm = { id: 900, referralRequestId: 100, operationKey: "reconfirm:100", actorUserId: 1, action: "reconfirm_requested", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, referenceId: null, createdAt: new Date(NOW - 2 * DAY) };
    expect(await loadCompanyDemand([acme], NOW, store({ asks: [waiting], events: [reconfirm] }).db)).toEqual([{ slug: "acme", name: "Acme", people: 1 }]);
  });

  it("matches the pure count on the same rows", async () => {
    const asks = [ask(100, 10, 1), ask(101, 11, 1), ask(102, 12, 2), ask(103, 13, 3)];
    const db = store({ asks });
    expect(await loadCompanyDemand([acme, globex], NOW, db.db)).toEqual(countDemandPeople(asks, [acme, globex], NOW));
  });
});

describe("loadUnlistedDemand", () => {
  it("lists live domains no company owns, by distinct people, with no id or name", async () => {
    const db = store({
      jobs: [job(10, "unlisted.example"), job(11, "gmail.com"), job(12, "acme.com"), job(13, "hidden.example")],
      asks: [ask(100, 10, 1), ask(101, 10, 2), ask(102, 11, 3), ask(103, 12, 1), ask(104, 13, 3)],
    });
    const rows = await loadUnlistedDemand(["acme.com", "acme.io", "hidden.example"], NOW, db.db);
    expect(rows).toEqual([{ domain: "unlisted.example", people: 2 }]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["domain", "people"]);
  });

  it("answers nothing when every live domain is owned", async () => {
    const db = store({ asks: [ask(100, 10, 1)] });
    expect(await loadUnlistedDemand(["acme.com", "acme.io"], NOW, db.db)).toEqual([]);
  });
});
