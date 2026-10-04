/**
 * Live flow audit against https://skipwait.me
 *
 * Walks every pre-auth step of the core flows in a real browser, capturing:
 *  - console errors / unhandled rejections
 *  - failed or non-2xx network requests
 *  - rendered landmarks (does the SPA actually mount?)
 *  - screenshots per step
 *
 * Usage: node scripts/live-flow-audit.mjs [--base=https://skipwait.me]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = (process.argv.find(a => a.startsWith("--base=")) || "--base=https://skipwait.me").split("=")[1];
const outDir = "artifacts/live-audit";
mkdirSync(outDir, { recursive: true });

const MOBILE = { width: 390, height: 844 };

// Give the dev server (tsx watch + vite) time to finish booting before the
// first navigation; without this the audit races cold-start transforms and
// reports a false "landing renders" failure.
const BOOT_TIMEOUT_MS = Number(process.env.AUDIT_BOOT_TIMEOUT_MS || 0);
if (BOOT_TIMEOUT_MS > 0) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base);
      if (res.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
}

function stepLog(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const results = [];

async function newPage(browser, { mobile = true } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? MOBILE : { width: 1280, height: 900 },
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  const netFails = [];
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", e => errors.push(`PAGEERROR: ${String(e.message).slice(0, 300)}`));
  page.on("requestfailed", r => netFails.push(`${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`));
  page.on("response", r => {
    if (r.status() >= 400) netFails.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`);
  });
  return { context, page, errors, netFails };
}

/** Wait for the SPA to mount and return how many children #root has. */
async function mountInfo(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    return {
      children: root ? root.children.length : -1,
      textLength: document.body.innerText.trim().length,
      title: document.title,
    };
  });
}

const browser = await chromium.launch({ headless: true });

// ---------------------------------------------------------------- F1 landing
{
  const { context, page, errors, netFails } = await newPage(browser);
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 45000 }).catch(e => console.log("nav err", e.message));
  await page.waitForTimeout(2500).catch(() => {});
  const info = await mountInfo(page).catch(() => ({ children: -1, textLength: 0, title: "" }));
  await page.screenshot({ path: `${outDir}/01-landing.png`, fullPage: true }).catch(() => {});

  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const hasSeekerCta = /I need a referral/i.test(bodyText);
  // The referrer CTA shipped as "I can refer someone"; "I give referrals" is the
  // copy used on other surfaces. Both are accepted, so the label has to say so —
  // it previously read "I give referrals" while matching either string, which
  // would have reported PASS if the referrer CTA disappeared entirely and only
  // the other wording remained.
  const hasReferrerCta = /I give referrals|I can refer someone/i.test(bodyText);
  results.push(stepLog("F1 landing renders", info.children > 0 && info.textLength > 40, `root children=${info.children} text=${info.textLength}`));
  results.push(stepLog("F1 'I need a referral' CTA present", hasSeekerCta));
  results.push(stepLog("F1 referrer CTA present ('I can refer someone' or 'I give referrals')", hasReferrerCta));
  if (errors.length) console.log("   console errors:", errors.slice(0, 6));
  if (netFails.length) console.log("   network failures:", netFails.slice(0, 6));
  await context.close().catch(() => {});
}

// ---------------------------------------------------------------- F1 onboarding: paste job URL
{
  const { context, page, errors, netFails } = await newPage(browser);
  await page.goto(`${base}/start`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000).catch(() => {});
  const info = await mountInfo(page).catch(() => ({ children: -1, textLength: 0, title: "" }));
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  await page.screenshot({ path: `${outDir}/02-start.png`, fullPage: true }).catch(() => {});
  results.push(stepLog("F2 /start renders", info.children > 0 && info.textLength > 30, `text=${info.textLength}`));
  console.log("   /start body snippet:", bodyText.replace(/\s+/g, " ").slice(0, 220));

  // Try typing an invalid URL, then a real job URL, and see if the app reacts.
  const input = page.locator("input[type=url], input[name=url], input[placeholder*='link' i], input[placeholder*='URL' i]").first();
  if ((await input.count().catch(() => 0)) > 0) {
    // invalid first
    await input.fill("not-a-url").catch(() => {});
    const btn = page.locator("button", { hasText: /continue/i }).first();
    if ((await btn.count().catch(() => 0)) > 0) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(1800).catch(() => {});
      const afterInvalid = await page.evaluate(() => document.body.innerText).catch(() => "");
      const showsError = /valid|invalid|enter a|http/i.test(afterInvalid);
      results.push(stepLog("F2 invalid URL shows validation", showsError));
      await page.screenshot({ path: `${outDir}/03-start-invalid.png`, fullPage: true }).catch(() => {});
    }
    // valid job URL
    await input.fill("https://www.linkedin.com/jobs/view/4138190723").catch(() => {});
    const btn2 = page.locator("button", { hasText: /continue/i }).first();
    if ((await btn2.count().catch(() => 0)) > 0) {
      await btn2.click().catch(() => {});
      await page.waitForTimeout(6000).catch(() => {});
      const afterValid = await page.evaluate(() => document.body.innerText).catch(() => "");
      const urlNow = page.url();
      results.push(stepLog("F2 valid URL accepted / advanced", /company|identified|step 2|request/i.test(afterValid) || !urlNow.endsWith("/start"), `url=${urlNow}`));
      console.log("   after valid URL:", afterValid.replace(/\s+/g, " ").slice(0, 260));
      await page.screenshot({ path: `${outDir}/04-start-valid.png`, fullPage: true }).catch(() => {});
    }
  } else {
    results.push(stepLog("F2 URL input present", false, "no url input found"));
  }
  if (errors.length) console.log("   console errors:", errors.slice(0, 6));
  if (netFails.length) console.log("   network failures:", netFails.slice(0, 8));
  await context.close().catch(() => {});
}

// ---------------------------------------------------------------- signed-out gating on core surfaces
const gatedRoutes = [
  ["/requests", /sign in|secure sign/i],
  ["/inbox", /sign in|company email|verified employee/i],
  ["/notifications", /sign in|no updates/i],
  ["/referrer", /work email|company email|sign in|referral/i],
];
for (const [route, expectRe] of gatedRoutes) {
  let context, page, errors, netFails;
  try { ({ context, page, errors, netFails } = await newPage(browser)); } catch { results.push(stepLog(`route ${route} renders correct state`, false, "browser closed")); continue; }
  await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200).catch(() => {});
  const info = await mountInfo(page).catch(() => ({ children: -1, textLength: 0, title: "" }));
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const screen = await page.evaluate(() => {
    const el = document.querySelector("[data-skipwait-screen]");
    return el ? el.getAttribute("data-skipwait-screen") : null;
  }).catch(() => null);
  await page.screenshot({ path: `${outDir}/route${route.replace(/\//g, "_")}.png`, fullPage: true }).catch(() => {});
  const ok = info.children > 0 && info.textLength > 30 && expectRe.test(bodyText);
  results.push(stepLog(`route ${route} renders correct state`, ok, `children=${info.children} screen=${screen} text=${info.textLength}`));
  if (!ok) console.log("   body:", bodyText.replace(/\s+/g, " ").slice(0, 240));
  if (errors.length) console.log("   console errors:", errors.slice(0, 5));
  if (netFails.length) console.log("   network failures:", netFails.slice(0, 5));
  await context.close().catch(() => {});
}

// ---------------------------------------------------------------- public surfaces
for (const route of ["/wall", "/share", "/privacy", "/premium", "/plans", "/settings", "/components", "/post-opportunity"]) {
  let context, page, errors, netFails;
  try { ({ context, page, errors, netFails } = await newPage(browser)); } catch { results.push(stepLog(`route ${route} renders`, false, "browser closed")); continue; }
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200).catch(() => {});
  const info = await mountInfo(page).catch(() => ({ children: -1, textLength: 0, title: "" }));
  await page.screenshot({ path: `${outDir}/route${route.replace(/\//g, "_")}.png`, fullPage: true }).catch(() => {});
  const ok = info.children > 0 && info.textLength > 30;
  results.push(stepLog(`route ${route} renders`, ok, `children=${info.children} text=${info.textLength}`));
  if (errors.length) console.log("   console errors:", errors.slice(0, 4));
  if (netFails.length) console.log("   network failures:", netFails.slice(0, 4));
  await context.close().catch(() => {});
}

// ---------------------------------------------------------------- 404 route
{
  const { context, page } = await newPage(browser);
  await page.goto(`${base}/definitely-not-a-route`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000).catch(() => {});
  const info = await mountInfo(page).catch(() => ({ children: -1, textLength: 0, title: "" }));
  results.push(stepLog("unknown route shows NotFound (not blank)", info.children > 0 && info.textLength > 20, `text=${info.textLength}`));
  await context.close().catch(() => {});
}

await browser.close();

const passed = results.filter(Boolean).length;
console.log(`\n=== SUMMARY: ${passed}/${results.length} checks passed ===`);
process.exit(passed === results.length ? 0 : 1);
