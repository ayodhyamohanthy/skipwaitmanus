// Local synthetic proof only: no request reaches a real API or payment provider.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.PREMIUM_CAPTURE_BASE ?? "http://127.0.0.1:4317";
const summary = { totalAvailable: 8, monthlyAllowance: 3, monthlyCreditsRemaining: 3, plan: "free", purchasedCreditsRemaining: 5, ledger: { buckets: { purchased: 5 } }, promoCreditsRemaining: 0, promoExpiresAt: null, promoStatus: null, promoOfferActive: false };
const scenarios = [
  { name: "paused", route: "/premium", signedIn: true },
  { name: "signed-out", route: "/premium", signedIn: false },
  { name: "balance-error", route: "/premium", signedIn: true, balanceError: true },
  { name: "referrer", route: "/premium?role=referrer", signedIn: true },
  { name: "pending", route: "/premium?payment=pending", signedIn: true, recovery: "pending" },
  { name: "credited", route: "/premium?payment=pending", signedIn: true, recovery: "credited" },
  { name: "review", route: "/premium?payment=pending", signedIn: true, recovery: "requires_review" },
  { name: "recovery-error", route: "/premium?payment=pending", signedIn: true, recovery: "error" },
];
const browser = await chromium.launch({ channel: "chrome", headless: true, timeout: 60000 });
const results = [];
try {
  await mkdir(here, { recursive: true });
  for (const scenario of scenarios) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, reducedMotion: "reduce", serviceWorkers: "block", locale: "en-US" });
      const apiCalls = [];
      const errors = [];
      const account = scenario.signedIn ? { id: 21, openId: "synthetic-premium", name: "Test Seeker", email: "seeker@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" } : null;
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        apiCalls.push(`${request.method()} ${url.pathname}`);
        let body = {};
        let status = 200;
        if (url.pathname.startsWith("/api/trpc/")) {
          const names = url.pathname.slice("/api/trpc/".length).split(",");
          const values = names.map(name => ({ result: { data: { json: name === "auth.me" ? account : null } } }));
          body = url.searchParams.has("batch") ? values : values[0];
        } else if (url.pathname === "/api/dev-auth/session") body = { signedIn: Boolean(account), account };
        else if (url.pathname === "/api/credits/summary") { body = scenario.balanceError ? { error: "Synthetic unavailable" } : { summary }; status = scenario.balanceError ? 503 : 200; }
        else if (url.pathname === "/api/chargebee/credit-recovery") { body = scenario.recovery === "credited" ? { status: "credited", tokenCount: 5, summary } : { status: scenario.recovery }; status = scenario.recovery === "error" ? 503 : 200; }
        else if (url.pathname === "/api/company-referrals/access") body = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
        else if (url.pathname === "/api/notifications") body = { notifications: [] };
        else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
        else { status = 404; body = { error: "Not in capture fixture" }; }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      if (scenario.recovery) await context.addInitScript(() => sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp-synthetic", role: "job_seeker" })));
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(new URL(scenario.route, base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Get more referral requests.", exact: true }).waitFor({ timeout: 60000 });
      if (scenario.recovery === "credited") await page.getByText("5 referral requests are ready.", { exact: true }).waitFor();
      if (scenario.recovery === "requires_review") await page.getByText("This payment needs a review.", { exact: true }).waitFor();
      if (scenario.recovery === "error") await page.getByText("We could not confirm this payment.", { exact: true }).waitFor();
      if (scenario.signedIn && !scenario.recovery && !scenario.route.includes("referrer")) await page.getByText(scenario.balanceError ? "Your balance did not load." : "referral requests left", { exact: false }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const file = `${scenario.name}-${width}.png`;
      await page.screenshot({ path: path.join(here, file), fullPage: true, animations: "disabled" });
      const proof = await page.evaluate(() => ({ horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth, primaries: document.querySelectorAll("[data-goal-page='premium'] [data-g-primary]").length, text: document.querySelector("[data-goal-page='premium']")?.textContent }));
      if (proof.horizontalOverflowPx || proof.primaries !== 1 || errors.length) throw new Error(JSON.stringify({ scenario: scenario.name, width, proof, errors }));
      results.push({ scenario: scenario.name, width, file, ...proof, apiCalls, errors });
      await context.close();
    }
  }
  await writeFile(path.join(here, "manifest.json"), JSON.stringify({ synthetic: true, base, results }, null, 2));
  console.log(JSON.stringify(results.map(({ text, ...result }) => result), null, 2));
} finally { await browser.close(); }
