// Synthetic, signed-out UI proof only. No real account, provider, request or payment.
import { expect, test } from "playwright/test";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import type { PublicCompany } from "../shared/companies";
import type { CompanyJobsResponse } from "../shared/jobCatalog";

let preview: ViteDevServer;
const PREVIEW_ORIGIN = "http://127.0.0.1:3187";
const COMPANY: PublicCompany = {
  slug: "example-works", name: "Example Works", initials: "EW", industry: "Technology",
  location: "Remote", functions: ["Engineering"], blurb: "Synthetic careers-list browser fixture.", domains: ["example.com"],
};
const CATALOG: CompanyJobsResponse = {
  jobs: [
    { id: 701, companyId: 7, sourceId: 3, externalId: "platform-1", title: "Senior Platform Engineer", rawLocation: "Bengaluru · Remote", locations: ["Bengaluru", "Remote"], workMode: "hybrid", department: "Platform", jobFunction: "Engineering", level: 5, applyUrl: "https://careers.example.com/platform-engineer", snippet: "Build reliable infrastructure and developer tooling for product teams.", publishedAt: "2026-11-19T09:00:00.000Z" },
    { id: 702, companyId: 7, sourceId: 3, externalId: "design-2", title: "Product Designer, Developer Experience", rawLocation: "Remote", locations: ["Remote"], workMode: "remote", department: "Product", jobFunction: "Design", level: 4, applyUrl: "https://careers.example.com/product-designer", snippet: "Make complex developer workflows understandable and accessible.", publishedAt: null },
  ],
  nextCursor: null,
  facets: { locations: { Bengaluru: 1, Remote: 2 }, levels: { "4": 1, "5": 1 }, functions: { Engineering: 1, Design: 1 } },
  source: { companyId: 7, provider: "greenhouse", boardToken: "example", evidenceUrl: "https://careers.example.com", status: "verified" },
  syncedAt: "2026-11-20T12:00:00.000Z", completeness: "complete",
};

test.beforeAll(async () => {
  preview = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    mode: "production",
    plugins: [{
      name: "synthetic-company-jobs-preview",
      enforce: "pre",
      transform(code, id) {
        if (!id.split("?")[0].endsWith("/pages/explore/companyJobsApi.ts")) return;
        const offSwitch = "export const COMPANY_JOBS_ENABLED = false;";
        if (!code.includes(offSwitch)) throw new Error("Company jobs source must remain off for this synthetic preview");
        return { code: code.replace(offSwitch, "export const COMPANY_JOBS_ENABLED = true;"), map: null };
      },
    }],
    server: { host: "127.0.0.1", port: 3187, strictPort: true },
  });
  await preview.listen();
});
test.afterAll(async () => { await preview?.close(); });

for (const width of [1280, 390]) {
  test(`company careers jobs and truthful states at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    let presence: PublicCompany["referrerPresence"] = "present";
    let catalog = CATALOG;
    let failJobs = false;
    const unexpected: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (body: object | null, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (request.method() !== "GET") {
        unexpected.push(`${request.method()} ${url.pathname}`);
        return json({ error: "Synthetic browse must not write" }, 405);
      }
      if (url.pathname === "/api/trpc/auth.me") return json([{ result: { data: { json: null } } }]);
      if (url.pathname === "/api/companies/example-works") return json({ company: { ...COMPANY, ...(presence ? { referrerPresence: presence } : {}) } });
      if (url.pathname === "/api/companies/example-works/jobs") return failJobs ? json({ error: "Synthetic unavailable source" }, 503) : json(catalog);
      if (url.pathname === "/api/companies/example-works/opportunities") return json({ opportunities: [{ id: 91, companyDomain: "example.com", kind: "hiring_now", roleTitle: "Employee-shared software role", targetRoleUrl: "https://careers.example.com/employee-role", location: "Remote", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-11-19T09:00:00.000Z", expiresAt: "2026-12-19T09:00:00.000Z", poster: { kind: "anonymous" } }] });
      if (url.pathname === "/api/company-demand/example-works") return json({ demand: { state: "none" } });
      unexpected.push(`${request.method()} ${url.pathname}`);
      return json({ error: "Unregistered synthetic read" }, 501);
    });
    const section = page.getByRole("region", { name: "Jobs from the company careers site" });
    await page.goto(`${PREVIEW_ORIGIN}/explore/example-works`);
    await expect(section.getByRole("heading", { name: "Senior Platform Engineer" })).toBeVisible();
    await expect(section.getByText("Verified referrers have joined", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "Request a referral" })).toHaveCount(0);
    await expect(section.getByRole("link", { name: "View posting for Senior Platform Engineer" })).toHaveAttribute("href", CATALOG.jobs[0].applyUrl);
    await expect(page.getByText("Employee-shared software role", { exact: true })).toBeVisible();
    expect(await page.getByText("Employee-shared software role", { exact: true }).evaluate((element, selector) => {
      const list = document.querySelector(selector);
      return Boolean(list && (element.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, '[aria-label="Jobs from the company careers site"]')).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`company-jobs-present-${width}.png`), fullPage: true });

    presence = "none";
    await page.reload();
    await expect(section.getByText("No referrers yet", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "Copy company link" })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Senior Platform Engineer" })).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath(`company-jobs-none-${width}.png`) });

    presence = undefined;
    catalog = { ...CATALOG, completeness: "partial" };
    await page.reload();
    await expect(section.getByText("This list is partial and may omit openings.")).toBeVisible();
    await expect(section.getByText("No referrers yet", { exact: true })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Copy company link" })).toHaveCount(0);
    await section.screenshot({ path: testInfo.outputPath(`company-jobs-unknown-partial-${width}.png`) });

    catalog = { ...CATALOG, jobs: [] };
    await page.reload();
    await expect(section.getByText("No jobs were returned by this careers source.")).toBeVisible();
    await section.getByLabel("Location", { exact: true }).selectOption("Remote");
    await expect(section.getByText("No listed jobs match these filters.")).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath(`company-jobs-filter-empty-${width}.png`) });
    await section.getByRole("button", { name: "Clear filters" }).click();
    await expect(section.getByText("No jobs were returned by this careers source.")).toBeVisible();

    catalog = { ...CATALOG, jobs: [], source: null, completeness: "unavailable" };
    await page.reload();
    await expect(section.getByText(/We can’t list careers-site jobs right now/)).toBeVisible();
    await expect(section.getByRole("button", { name: "Paste a job link" })).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath(`company-jobs-unavailable-${width}.png`) });

    failJobs = true;
    await page.reload();
    await expect(section.getByText("We couldn’t load jobs from the careers site.", { exact: true })).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath(`company-jobs-error-${width}.png`) });
    failJobs = false;
    catalog = CATALOG;
    await section.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(section.getByRole("heading", { name: "Senior Platform Engineer" })).toBeVisible();
    expect(await section.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    expect(unexpected).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
