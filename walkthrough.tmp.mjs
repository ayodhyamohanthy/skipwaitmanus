// Temporary role walkthrough harness (deleted after use).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.WALK_BASE || "http://localhost:3000";
const OUT = "/tmp/walk";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (role, page, kind, detail) => {
  findings.push({ role, page, kind, detail });
  console.log(`[${role}][${page}][${kind}] ${detail}`);
};

async function walkPage(browser, role, path, interact, cookies = []) {
  const context = await browser.newContext();
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedApis = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300)); });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) failedApis.push(`${res.status()} ${res.url().replace(BASE, "")}`);
  });
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 });
  } catch (e) {
    note(role, path, "NAV_FAIL", String(e).slice(0, 200));
  }
  await page.waitForTimeout(1500);
  const bodyText = (await page.textContent("body").catch(() => "")) || "";
  if (bodyText.trim().length < 30) note(role, path, "BLANK", `body text only ${bodyText.trim().length} chars`);
  if (/something broke|unexpected error|hit an error/i.test(bodyText)) note(role, path, "ERROR_BOUNDARY", bodyText.slice(0, 200));
  if (interact) {
    try { await interact(page, bodyText); } catch (e) { note(role, path, "INTERACT_FAIL", String(e).slice(0, 300)); }
  }
  for (const e of consoleErrors) note(role, path, "CONSOLE", e);
  for (const f of [...new Set(failedApis)]) note(role, path, "API_FAIL", f);
  const shot = `${OUT}/${role}-${path.replace(/[^a-z0-9]+/gi, "_") || "root"}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  await context.close();
  return bodyText;
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });

// ---- signed-out job seeker ----
await walkPage(browser, "seeker-out", "/", async (page) => {
  const btn = page.getByRole("button", { name: /I need a referral/i });
  if ((await btn.count()) === 0) note("seeker-out", "/", "MISSING_CTA", "no 'I need a referral' button");
});
await walkPage(browser, "seeker-out", "/start", async (page) => {
  const input = page.getByLabel(/Target Role URL/i);
  if ((await input.count()) === 0) { note("seeker-out", "/start", "MISSING", "no URL input"); return; }
  await input.fill("not-a-url");
  await page.waitForTimeout(400);
  const contDisabled = page.getByRole("button", { name: /Continue/i });
  if ((await contDisabled.count()) && await contDisabled.isDisabled()) { /* expected */ } else note("seeker-out", "/start", "WEAK_VALIDATION", "Continue enabled for invalid URL?");
  await input.fill("https://careers.acme.com/jobs/design-lead");
  await page.waitForTimeout(400);
  const cont = page.getByRole("button", { name: /Continue/i });
  if ((await cont.count()) === 0) note("seeker-out", "/start", "MISSING", "no Continue after valid URL");
  else if (await cont.isDisabled()) note("seeker-out", "/start", "STUCK", "Continue disabled for valid URL");
  else { await cont.click(); await page.waitForTimeout(1200); note("seeker-out", "/start", "NAV", `after continue: ${page.url()}`); }
});
await walkPage(browser, "seeker-out", "/request");
await walkPage(browser, "seeker-out", "/requests");
await walkPage(browser, "seeker-out", "/premium");
await walkPage(browser, "seeker-out", "/plans");
await walkPage(browser, "seeker-out", "/wall");
await walkPage(browser, "seeker-out", "/jobs");

// ---- sign in as seeker via dev-auth ----
const loginRes = await fetch(BASE + "/api/dev-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Walker Seeker", email: "walker@seeker.com" }) });
const setCookie = loginRes.headers.get("set-cookie") || "";
const m = setCookie.match(/app_session_id=([^;]+)/);
const seekerCookies = m ? [{ name: "app_session_id", value: m[1], domain: "localhost", path: "/" }] : [];
note("setup", "/api/dev-auth/login", "INFO", `seeker cookie ${m ? "captured" : "MISSING"}`);

await walkPage(browser, "seeker-in", "/request", async (page) => {
  // attach a fake resume through the hidden file input
  fs.writeFileSync("/tmp/walk-resume.pdf", "%PDF-1.4\n% walkthrough resume\n");
  const inputs = page.locator('input[type="file"]');
  if ((await inputs.count()) === 0) note("seeker-in", "/request", "MISSING", "no file input");
  else {
    await inputs.first().setInputFiles("/tmp/walk-resume.pdf");
    await page.waitForTimeout(1500);
    const t = (await page.textContent("body")) || "";
    if (/walk-resume|resume\.pdf/i.test(t)) note("seeker-in", "/request", "OK", "resume file shown pre-auth state");
    else note("seeker-in", "/request", "STATE", `after attach: ${(t.match(/Add your resume|Add supporting|Sign in|Send private|error|failed|unavailable/gi) || []).join("|")}`);
  }
}, seekerCookies);
await walkPage(browser, "seeker-in", "/requests", null, seekerCookies);
await walkPage(browser, "seeker-in", "/premium", null, seekerCookies);
await walkPage(browser, "seeker-in", "/conversation/1", null, seekerCookies);

// ---- signed-out referrer ----
await walkPage(browser, "referrer-out", "/referrer", async (page) => {
  const email = page.getByLabel(/Company email/i);
  if ((await email.count()) === 0) note("referrer-out", "/referrer", "MISSING", "no company email input");
  else {
    await email.fill("someone@gmail.com");
    await page.getByRole("button", { name: /Send sign-in code/i }).click();
    await page.waitForTimeout(1200);
    const t = (await page.textContent("body")) || "";
    if (/personal|company email/i.test(t)) note("referrer-out", "/referrer", "OK", "personal domain rejected with guidance");
    else note("referrer-out", "/referrer", "STATE", "no clear rejection for gmail");
  }
});
await walkPage(browser, "referrer-out", "/inbox");

// ---- sign in as referrer (dev-auth with company email) ----
const loginRes2 = await fetch(BASE + "/api/dev-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Walker Referrer", email: "walker@acme.com" }) });
const setCookie2 = loginRes2.headers.get("set-cookie") || "";
const m2 = setCookie2.match(/app_session_id=([^;]+)/);
const refCookies = m2 ? [{ name: "app_session_id", value: m2[1], domain: "localhost", path: "/" }] : [];
note("setup", "/api/dev-auth/login", "INFO", `referrer cookie ${m2 ? "captured" : "MISSING"}`);
await walkPage(browser, "referrer-in", "/referrer", null, refCookies);
await walkPage(browser, "referrer-in", "/inbox", null, refCookies);
await walkPage(browser, "referrer-in", "/settings", null, refCookies);
await walkPage(browser, "referrer-in", "/share", null, seekerCookies);

await browser.close();
fs.writeFileSync(OUT + "/findings.json", JSON.stringify(findings, null, 2));
console.log(`DONE: ${findings.length} findings -> ${OUT}/findings.json`);
