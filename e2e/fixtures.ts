// Shared journey helpers (GATE-e2e-journeys, D-212). Every journey fails on any
// page error or any 5xx response in any browser context it opens, and signs
// people in only through the dev plane (/api/dev-auth/login) or the sessions
// scripts/seed-test-accounts.ts minted (e2e/.auth/seed.json).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type BrowserContext, type Page, type Request } from "playwright/test";

export { expect };

export const SEEDED_REFERRER_EMAIL = "qa.referrer@acme.example";
export const REFERRER_COMPANY = "acme.example";

type Seed = { accounts: Record<string, string> };

function seededCookie(email: string): string {
  const seed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), ".auth", "seed.json"), "utf8")) as Seed;
  const cookie = seed.accounts[email];
  if (!cookie) throw new Error(`no seeded session for ${email}; run node scripts/e2e-server.mjs start`);
  return cookie;
}

type Fixtures = {
  /** Page errors and 5xx responses seen in every context of this journey. */
  breakage: string[];
  /** A fresh, watched, signed-out browser context. */
  newContext: () => Promise<BrowserContext>;
  /** A watched page signed in as the seeded verified referrer at acme.example. */
  referrerPage: Page;
};

function watch(context: BrowserContext, breakage: string[]) {
  const pageWatch = (page: Page) => page.on("pageerror", error => breakage.push(`page error on ${page.url()}: ${error.message}`));
  context.pages().forEach(pageWatch);
  context.on("page", pageWatch);
  context.on("response", response => { if (response.status() >= 500) breakage.push(`${response.status()} ${response.request().method()} ${response.url()}`); });
}

export const test = base.extend<Fixtures>({
  breakage: async ({}, use) => { await use([]); },
  context: async ({ context, breakage }, use) => { watch(context, breakage); await use(context); },
  newContext: async ({ browser, breakage, contextOptions }, use) => {
    const opened: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ ...contextOptions, serviceWorkers: "block" });
      watch(context, breakage);
      opened.push(context);
      return context;
    });
    for (const context of opened) await context.close();
  },
  referrerPage: async ({ newContext, baseURL }, use) => {
    const context = await newContext();
    await context.addCookies([{ name: "app_session_id", value: seededCookie(SEEDED_REFERRER_EMAIL), url: baseURL! }]);
    await use(await context.newPage());
  },
});

// Runs after each journey's own body: a page error or a 5xx anywhere fails it.
test.afterEach(async ({ breakage }) => {
  expect(breakage, "page errors or 5xx responses during the journey").toEqual([]);
});

let unique = 0;
export function uniqueSuffix(): string { unique += 1; return `${Date.now().toString(36)}${unique}`; }

/** Signs a fresh seeker in on the dev plane (the cookie lands in the context). */
export async function devSignIn(context: BrowserContext, name = "E2E Seeker"): Promise<{ email: string }> {
  const email = `seeker.${uniqueSuffix()}@example.com`;
  const response = await context.request.post("/api/dev-auth/login", { data: { name, email } });
  expect(response.ok(), `dev sign-in answered ${response.status()}`).toBeTruthy();
  return { email };
}

/**
 * The app's sign-in buttons go to /api/auth/workos/sign-in?returnTo=..., which
 * does not exist on the dev plane. This stands in for the provider: it signs a
 * fresh seeker in on the dev plane and returns to the page's own returnTo, as
 * the WorkOS callback does.
 */
export async function routeSignInThroughDevPlane(context: BrowserContext): Promise<{ signedIn: () => boolean; returnTo: () => string | null }> {
  let returnTo: string | null = null;
  await context.route(/\/api\/auth\/workos\/sign-in(\?|$)/, async route => {
    returnTo = new URL(route.request().url()).searchParams.get("returnTo");
    await devSignIn(context);
    await route.fulfill({ status: 302, headers: { location: returnTo ?? "/" } });
  });
  return { signedIn: () => returnTo !== null, returnTo: () => returnTo };
}

export const REASONS = [
  "Led a checkout redesign that cut drop-off 18%.",
  "Shipped a design system used by 40 teams.",
  "Built the onboarding flow end to end.",
];

export function acmeJobLink(): string {
  return `https://careers.${REFERRER_COMPANY}/jobs/${uniqueSuffix()}-product-designer`;
}

/** Fills the /ask composer: job link and three reasons. */
export async function writeAsk(page: Page, jobLink = acmeJobLink()): Promise<string> {
  const link = page.getByLabel("Job link");
  await link.fill(jobLink);
  await link.blur();
  await page.getByPlaceholder(/One result/).fill(REASONS[0]);
  await page.getByPlaceholder(/Another result/).fill(REASONS[1]);
  await page.getByPlaceholder(/A third reason/).fill(REASONS[2]);
  return jobLink;
}

/** Attaches a tiny PDF resume through the composer's own file input. */
export async function attachResume(page: Page) {
  await page.locator("[data-skipwait-screen='ask'] input[type=file]").first().setInputFiles({
    name: "e2e-resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% skipwait e2e resume\n%%EOF\n"),
  });
}

export function isAskPost(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/api/company-referrals";
}

/** Presses Send ask and returns the POST body and the server's answer. */
export async function sendAsk(page: Page): Promise<{ body: Record<string, unknown>; status: number }> {
  const posted = page.waitForRequest(isAskPost);
  const answered = page.waitForResponse(response => isAskPost(response.request()));
  await page.getByRole("button", { name: "Send ask" }).click();
  const body = JSON.parse((await posted).postData() ?? "{}") as Record<string, unknown>;
  const response = await answered;
  return { body, status: response.status() };
}

/** A signed-in seeker sends one ask to acme.example from /ask. */
export async function seekerSendsAcmeAsk(context: BrowserContext): Promise<void> {
  await devSignIn(context);
  const page = await context.newPage();
  await page.goto("/ask");
  await writeAsk(page);
  await attachResume(page);
  const { status } = await sendAsk(page);
  expect(status).toBe(200);
  await expect(page.getByText(`Ask sent to ${REFERRER_COMPANY}.`)).toBeVisible();
  await page.close();
}

/** The shell's balance chip, read as the screen labels it ("2 credits" / "2 referrals", D-180). */
export async function readBalance(page: Page): Promise<number> {
  const chip = page.getByRole("link", { name: /^\s*\d+\s+(credits?|referrals?)\s*$/i }).first();
  await expect(chip).toBeVisible();
  const value = Number((await chip.innerText()).match(/\d+/)?.[0]);
  expect(Number.isFinite(value)).toBeTruthy();
  return value;
}

/** The compose screen's cost line ("Uses 1 credit ..."), read as the number it quotes. */
export function costLine(page: Page) {
  return page.getByText(/^Uses \d+ (credit|referral)s?\b/i).first();
}

export async function quotedCost(page: Page): Promise<number> {
  const line = costLine(page);
  await expect(line).toBeVisible();
  return Number((await line.innerText()).match(/Uses (\d+)/i)?.[1]);
}
