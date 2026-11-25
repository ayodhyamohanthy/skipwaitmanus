// D-048-admin-ops-mobile-width (D-150, D-167, D-332): the released admin ops
// surfaces must keep every figure and statement inside a phone viewport.
// Synthetic admin responses only: every /api call is answered in the browser by
// this file, so no production admin identity, database row or live reconcile is
// touched. The full-document PNG width is asserted as well as the scroll and
// element bounds, because a root-only scrollWidth check reports zero while the
// document is still wider than the viewport (packet §"Reproduction and proof").
import { expect, test } from "playwright/test";

const ADMIN = { id: 1, name: "Ops Admin", email: "ops@example.com", role: "admin", openId: "fixture", loginMethod: "fixture" };

type Answer = { method: string; path: string; status: number; body: unknown };
const ok = (path: string, body: unknown, method = "GET"): Answer => ({ method, path, status: 200, body });

const WEEKS = [
  { weekStart: "2026-09-14", asks: 18, accepted: 5, passed: 4, expired: 3, declined: 0, withdrawn: 1, waiting: 5, uncovered: 4, referredWithin7Days: 2 },
  { weekStart: "2026-09-21", asks: 24, accepted: 8, passed: 5, expired: 2, declined: 0, withdrawn: 2, waiting: 7, uncovered: 6, referredWithin7Days: 4 },
  { weekStart: "2026-09-28", asks: 31, accepted: 11, passed: 7, expired: 4, declined: 0, withdrawn: 1, waiting: 8, uncovered: 7, referredWithin7Days: 6 },
  { weekStart: "2026-10-05", asks: 27, accepted: 9, passed: 6, expired: 1, declined: 0, withdrawn: 0, waiting: 12, uncovered: 9, referredWithin7Days: 7 },
];

const BASELINE = {
  windowDays: 28,
  generatedAt: "2026-10-08T04:55:00.000Z",
  weeks: WEEKS,
  expiries: { total: 10, last7Days: 3 },
  decisionLatency: { sampleSize: 26, medianHours: 18.5, p90Hours: 61.2 },
  coverage: [
    { companyDomain: "acme.example", verifiedReferrers: 4, availableReferrers: 3, pausedOrFull: 1, waitingAsks: 6 },
    { companyDomain: "globex.example", verifiedReferrers: 2, availableReferrers: 1, pausedOrFull: 1, waitingAsks: 9 },
    { companyDomain: "initech.example", verifiedReferrers: 1, availableReferrers: 0, pausedOrFull: 1, waitingAsks: 4 },
  ],
  demand: [
    { companyDomain: "globex.example", waitingAsks: 9, oldestWaitingDays: 12, verifiedReferrers: 2 },
    { companyDomain: "acme.example", waitingAsks: 6, oldestWaitingDays: 5, verifiedReferrers: 4 },
    { companyDomain: "initech.example", waitingAsks: 4, oldestWaitingDays: 21, verifiedReferrers: 1 },
  ],
  externalReferrers: { activeLast7Days: 7, activeInWindow: 11, excludedOperatorDomains: ["skipwait.me"] },
  subscribers: { paid: 3, trialing: 0, byPlan: [{ plan: "mid_to_senior", count: 2 }, { plan: "senior_to_executive", count: 1 }] },
  referredWithin7DaysPct: 34,
  dataQuality: [{ id: "claim_without_pickup", label: "Claims with no pickup event", count: 2, hint: "Referred rows whose claim event is missing; check the D-038 reconcile." }],
};

const HEALTH = {
  health: {
    funnel: { requestsCreated: 100, requestsClaimed: 33, decisionsRecorded: 26, waitingForCoverage: 32 },
    coverageGaps: [
      { companyDomain: "globex.example", waitingRequests: 9, verifiedCoverage: 2 },
      { companyDomain: "initech.example", waitingRequests: 4, verifiedCoverage: 1 },
    ],
    instrumentation: { uploadedDocuments: 41, recordedFailures: 12 },
  },
  baseline: BASELINE,
};

const REVENUE = {
  revenue: {
    byProvider: [
      { provider: "chargebee", currency: "INR", totalAmount: 229000, count: 10 },
      { provider: "stripe", currency: "USD", totalAmount: 4490, count: 1 },
    ],
    totalsByCurrency: [
      { currency: "INR", totalAmount: 229000, count: 10 },
      { currency: "USD", totalAmount: 4490, count: 1 },
    ],
    refundedTotalByCurrency: [{ currency: "INR", totalAmount: 22900, count: 1 }],
    recordedAt: "2026-10-08T04:55:00.000Z",
  },
};

/** A long allowlisted statement: the real reconcile list has multi-column ALTERs this long. */
const LONG_STATEMENT = "ALTER TABLE referralTransitionEvents ADD COLUMN allocationSource VARCHAR(32) NULL, ADD COLUMN allocationExpiresAt DATETIME NULL, ADD COLUMN allocationReleasedAt DATETIME NULL, ADD INDEX referral_transition_allocation_idx (allocationSource, allocationExpiresAt)";

const SCHEMA_PENDING = {
  reconciled: false,
  firstError: "Unknown column 'jobFunction' in 'field list'",
  results: [
    { statement: LONG_STATEMENT, ok: false, error: "Unknown column 'allocationSource' in 'field list'" },
    { statement: "ALTER TABLE jobs ADD COLUMN jobFunction VARCHAR(64) NULL", ok: false, error: "Unknown column 'jobFunction' in 'field list'" },
    { statement: "CREATE TABLE IF NOT EXISTS partnerModules (id INT AUTO_INCREMENT PRIMARY KEY)", ok: true },
  ],
};
const SCHEMA_CLEAN = {
  reconciled: true,
  firstError: null,
  results: [
    { statement: LONG_STATEMENT, ok: true },
    { statement: "CREATE TABLE IF NOT EXISTS partnerModules (id INT AUTO_INCREMENT PRIMARY KEY)", ok: true },
  ],
};

type Case = { name: string; route: string; screen: string; api: Answer[] };

const CASES: Case[] = [
  { name: "flow-health-default", route: "/admin/flow-health", screen: "admin-flow-health", api: [ok("/api/admin/flow-health", HEALTH), ok("/api/admin/revenue", REVENUE)] },
  { name: "flow-health-no-baseline", route: "/admin/flow-health", screen: "admin-flow-health", api: [ok("/api/admin/flow-health", { ...HEALTH, baseline: null }), ok("/api/admin/revenue", REVENUE)] },
  { name: "schema-pending", route: "/admin/schema", screen: "admin-schema", api: [ok("/api/admin/schema/reconcile", SCHEMA_PENDING)] },
  { name: "schema-reconciled", route: "/admin/schema", screen: "admin-schema", api: [ok("/api/admin/schema/reconcile", SCHEMA_CLEAN)] },
];

/** The PNG header carries the pixel width the packet measures (bytes 16-19). */
function pngWidth(png: Buffer): number {
  expect(png.subarray(1, 4).toString("ascii"), "screenshot must be a PNG").toBe("PNG");
  return png.readUInt32BE(16);
}

async function mockApi(page: import("playwright/test").Page, answers: Answer[]) {
  await page.route("https://**", route => route.abort());
  await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/trpc/")) {
      const procedures = url.pathname.slice("/api/trpc/".length).split(",");
      const body = procedures.map(procedure => ({ result: { data: { json: procedure === "auth.me" ? ADMIN : null } } }));
      return json(200, url.searchParams.get("batch") ? body : body[0]);
    }
    if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: ADMIN });
    if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: null, dateFormat: null } });
    if (url.pathname === "/api/account/signup-language" && method === "POST") return json(200, {});
    const hit = answers.find(answer => answer.method.toUpperCase() === method && url.pathname.startsWith(answer.path));
    if (hit) return json(hit.status, hit.body);
    return json(404, { error: "not mocked" });
  });
}

for (const testCase of CASES) {
  test.describe(testCase.name, () => {
    // The packet's real phone viewport: 390x844 at scale 2, so a full-document
    // PNG is 780 pixels wide. setViewportSize cannot change the scale factor,
    // so the context is created with it.
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test(`${testCase.name} stays inside a 390x844 phone viewport`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error).slice(0, 200)));
      await mockApi(page, testCase.api);

      await page.goto(testCase.route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`[data-skipwait-screen="${testCase.screen}"]`, { timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

      const bounds = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        // Every table scrolls inside its own bounded panel; the panel must fit.
        tables: [...document.querySelectorAll<HTMLElement>('[data-testid="ops-table-scroll"]')].map(node => {
          const rect = node.getBoundingClientRect();
          return { left: Math.round(rect.left), right: Math.round(rect.right), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth };
        }),
        // A statement is readable only if it is present in full and inside the viewport.
        statements: [...document.querySelectorAll<HTMLElement>('[data-testid="schema-statement"]')].map(node => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent ?? "", left: Math.round(rect.left), right: Math.round(rect.right) };
        }),
      }));

      expect(bounds.innerWidth, "the real viewport width").toBe(390);
      expect(bounds.documentWidth, "document scrollWidth must not exceed the viewport").toBeLessThanOrEqual(390);
      expect(bounds.bodyWidth, "body scrollWidth must not exceed the viewport").toBeLessThanOrEqual(390);

      for (const table of bounds.tables) {
        expect(table.left, "a table panel starts inside the viewport").toBeGreaterThanOrEqual(0);
        expect(table.right, "a table panel ends inside the viewport").toBeLessThanOrEqual(390);
        expect(table.scrollWidth, "the table keeps its full width reachable by scrolling").toBeGreaterThanOrEqual(table.clientWidth);
      }

      if (testCase.screen === "admin-schema") {
        expect(bounds.statements.length, "every statement renders").toBeGreaterThan(0);
        for (const statement of bounds.statements) {
          expect(statement.left, "statement text starts inside the viewport").toBeGreaterThanOrEqual(0);
          expect(statement.right, "statement text ends inside the viewport").toBeLessThanOrEqual(390);
        }
        expect(bounds.statements.map(statement => statement.text), "no statement is truncated").toContain(LONG_STATEMENT);
      }

      const png = await page.screenshot({ fullPage: true, animations: "disabled" });
      expect(pngWidth(png), "the full-document PNG at 390x844@2x is 780 pixels wide").toBe(780);
      expect(errors, "no uncaught page errors").toEqual([]);
    });
  });
}

test.describe("desktop control", () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  test("desktop control keeps the admin ops surfaces inside 1280x900", async ({ page }) => {
    await mockApi(page, [ok("/api/admin/flow-health", HEALTH), ok("/api/admin/revenue", REVENUE)]);

    await page.goto("/admin/flow-health", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-skipwait-screen="admin-flow-health"]', { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const bounds = await page.evaluate(() => ({ innerWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
    expect(bounds.innerWidth).toBe(1280);
    expect(bounds.documentWidth).toBeLessThanOrEqual(1280);

    const png = await page.screenshot({ fullPage: true, animations: "disabled" });
    expect(pngWidth(png)).toBe(1280);
  });
});
