#!/usr/bin/env node
// OPS-live-qa-runner (D-373 (3), packet docs/plans/OPS-live-qa-runner.md section 3): signed-in live QA without anyone
// handing a password around. Run by .github/workflows/live-qa.yml after every production release and on demand.
//
// It signs in once per demo account on https://skipwait.me (and nowhere else), visits each signed-in route at 1280 and
// 390, and records the document status, title, uncaught errors, console errors, 5xx requests and sideways scroll, with a
// full-page screenshot. Navigation only: no click, no form, no request beyond the one sign-in, never /admin, no money.
// Output: live-qa/<role>/<route>-<width>.png, live-qa/summary.json and a Markdown table in the step summary.
// Exit 1 when a sign-in fails, a document answers 5xx, a page throws or does not load; 0 otherwise.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readGitCommitMeta } from "./releaseSmokeCore.mjs";

/** The only origin the passwords are ever sent to. Deliberately not configurable. */
export const ORIGIN = "https://skipwait.me";

/** The public demo accounts (server/_core/reviewerLogin.ts) and the repository secret holding each password. */
export const ACCOUNTS = Object.freeze({
  seeker: Object.freeze({ email: "seeker@reviewer.skipwait.me", secret: "REVIEWER_SEEKER_PASSWORD" }),
  referrer: Object.freeze({ email: "referrer@reviewer.skipwait.me", secret: "REVIEWER_REFERRER_PASSWORD" }),
});

/** Signed-in routes per role, each checked against client/src/App.tsx by the tests. */
export const ROUTES = Object.freeze({
  seeker: Object.freeze(["/plans", "/billing", "/requests", "/ask", "/explore", "/alerts", "/inbox", "/messages", "/profile", "/settings", "/invite", "/support"]),
  referrer: Object.freeze(["/referrer-home", "/queue", "/referrer/impact", "/inbox", "/invite", "/profile", "/settings"]),
});

export const VIEWPORTS = Object.freeze([Object.freeze({ width: 1280, height: 900 }), Object.freeze({ width: 390, height: 844 })]);

const NAV_TIMEOUT_MS = 30_000, QUIET_TIMEOUT_MS = 10_000, MAX_LINE = 300;

/** The workflow's `roles` input: both (default), seeker or referrer. */
export function parseRoles(value) {
  const v = value || "both";
  if (v === "both") return ["seeker", "referrer"];
  if (v === "seeker" || v === "referrer") return [v];
  throw new Error(`roles must be both, seeker or referrer, not "${v}"`);
}

/** A plain reason for a refused sign-in. The endpoint allows 8 tries per email in 15 minutes, so nothing retries. */
export function signInMessage(status) {
  if (status === 401) return "the repository secrets do not match the live release: run Actions > Reviewer QA passwords with reset (OPS-reviewer-plaintext-reset)";
  if (status === 404) return "REVIEWER_LOGIN_ENABLED is off in production";
  if (status === 429) return "rate limited (8 tries per email per 15 minutes); wait 15 minutes, never retry in a loop";
  return `sign-in answered ${status}`;
}

export const captureName = (route, width) => `${route.replace(/^\//, "").replace(/\//g, "-") || "home"}-${width}.png`;

/** A page's failures (which fail the run) and findings (listed only). */
export function judgeRoute(r) {
  const fails = [], findings = [];
  if (r.navigationError) fails.push(`navigation failed: ${r.navigationError}`);
  if (Number.isInteger(r.status) && r.status >= 500) fails.push(`document answered ${r.status}`);
  if (r.pageErrors.length) fails.push(`uncaught error: ${r.pageErrors[0]}`);
  if (Number.isInteger(r.status) && r.status >= 400 && r.status < 500) findings.push(`document answered ${r.status}`);
  if (r.consoleErrors.length) findings.push(`${r.consoleErrors.length} console error${r.consoleErrors.length === 1 ? "" : "s"}`);
  if (r.failedRequests.length) findings.push(`${r.failedRequests.length} request${r.failedRequests.length === 1 ? "" : "s"} answered 5xx`);
  if (r.sideways) findings.push("scrolls sideways at 390");
  if (r.finalPath && r.finalPath !== r.route && r.finalPath.startsWith("/sign-in")) findings.push(`redirected to ${r.finalPath}`);
  return { fails, findings };
}

export function exitCodeOf(summary) {
  return summary.roles.some(role => !role.signIn?.ok || role.routes.some(r => r.fails.length)) ? 1 : 0;
}

/** Replaces every occurrence of each non-empty secret with [redacted]: applied to everything the run prints or writes. */
export function redactor(secrets) {
  const values = secrets.filter(s => typeof s === "string" && s.length > 0);
  return text => values.reduce((out, value) => out.split(value).join("[redacted]"), String(text));
}

const short = sha => (typeof sha === "string" && sha ? sha.slice(0, 8) : "unknown");
const cell = text => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
// A request's path only: query strings may carry tokens and are never recorded.
const pathOf = url => { try { const u = new URL(url); return u.origin === ORIGIN ? u.pathname : `${u.origin}/…`; } catch { return "?"; } };
const messageOf = error => (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, MAX_LINE);

export function markdownOf(summary) {
  const rows = ["## Live QA (signed in)", "", `Origin ${summary.origin} · API \`${short(summary.release.api)}\` · web \`${short(summary.release.web)}\``, "",
    "| Role | Route | Width | Status | Title | Result |", "|---|---|---|---|---|---|"];
  for (const role of summary.roles) {
    if (!role.signIn?.ok) { rows.push(`| ${role.role} | sign-in | | ${role.signIn?.status ?? ""} | | FAILED: ${cell(role.signIn?.message)} |`); continue; }
    for (const r of role.routes) {
      const result = r.fails.length ? `FAIL: ${r.fails.join("; ")}` : r.findings.length ? r.findings.join("; ") : "ok";
      rows.push(`| ${role.role} | ${r.route} | ${r.width} | ${r.status ?? ""} | ${cell(r.title)} | ${cell(result)} |`);
    }
  }
  return `${rows.join("\n")}\n`;
}

async function releaseOf(fetchText) {
  const release = { api: null, web: null };
  try { const health = JSON.parse(await fetchText(`${ORIGIN}/api/health/ready`)); release.api = typeof health.commitSha === "string" ? health.commitSha : null; } catch { /* recorded as unknown */ }
  try { release.web = readGitCommitMeta(await fetchText(`${ORIGIN}/`)); } catch { /* recorded as unknown */ }
  return release;
}

async function visit(page, role, route, viewport, current, io, redact) {
  try {
    const response = await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: QUIET_TIMEOUT_MS }).catch(() => {});
    current.status = response?.status() ?? null;
    current.title = redact(await page.title());
    current.finalPath = pathOf(page.url());
    if (viewport.width === 390) current.sideways = Boolean(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
    const file = path.join(io.outDir, role, captureName(route, viewport.width));
    await page.screenshot({ path: file, fullPage: true });
    current.capture = path.relative(io.outDir, file);
  } catch (error) {
    current.navigationError = redact(messageOf(error));
  }
}

/**
 * The whole run with its I/O injected: launch() -> a Playwright-like browser, fetchText(url), mkdir, writeFile,
 * appendSummary, setOutput, log and outDir. Returns { code, summary } (summary is null when nothing ran).
 */
export async function runLiveQa({ roles, passwords, trigger, launch, fetchText, mkdir: makeDir, writeFile: write, appendSummary, setOutput, log, outDir }) {
  const io = { outDir };
  const redact = redactor(Object.values(passwords));
  const say = line => log(redact(line));
  const missing = roles.filter(role => !passwords[role]).map(role => ACCOUNTS[role].secret);
  if (missing.length) {
    const why = `${missing.join(" and ")} not set: the owner adds them on Settings > Secrets and variables > Actions (OPS-live-qa-runner section 4)`;
    if (trigger === "workflow_dispatch") { say(`::error::${why}`); return { code: 1, summary: null }; }
    say(`::notice::live QA skipped: ${why}`);
    return { code: 0, summary: null };
  }
  const summary = { origin: ORIGIN, release: await releaseOf(fetchText), roles: [] };
  say(`release: API ${short(summary.release.api)}, web ${short(summary.release.web)}`);
  const browser = await launch();
  try {
    for (const role of roles) {
      const result = { role, signIn: null, routes: [] };
      summary.roles.push(result);
      const context = await browser.newContext();
      try {
        const response = await context.request.post(`${ORIGIN}/api/auth/reviewer/sign-in`, { data: { email: ACCOUNTS[role].email, password: passwords[role] }, failOnStatusCode: false, maxRedirects: 0 });
        const status = response.status();
        if (status !== 200) {
          result.signIn = { ok: false, status, message: signInMessage(status) };
          say(`${role}: sign-in failed (${status}): ${result.signIn.message}`);
          continue;
        }
        result.signIn = { ok: true, status };
        say(`${role}: signed in`);
        await makeDir(path.join(outDir, role), { recursive: true });
        for (const viewport of VIEWPORTS) {
          const page = await context.newPage();
          await page.setViewportSize(viewport);
          let current = null;
          page.on("pageerror", error => current?.pageErrors.push(redact(messageOf(error))));
          page.on("console", msg => { if (msg.type() === "error") current?.consoleErrors.push(redact(msg.text()).slice(0, MAX_LINE)); });
          page.on("response", res => { if (res.status() >= 500) current?.failedRequests.push(`${res.status()} ${pathOf(res.url())}`); });
          for (const route of ROUTES[role]) {
            current = { route, width: viewport.width, status: null, title: null, finalPath: null, sideways: false, capture: null, navigationError: null, pageErrors: [], consoleErrors: [], failedRequests: [] };
            await visit(page, role, route, viewport, current, io, redact);
            Object.assign(current, judgeRoute(current));
            result.routes.push(current);
            say(`${role} ${route} @${viewport.width}: ${current.status ?? "-"} ${current.fails.length ? `FAIL ${current.fails.join("; ")}` : current.findings.join("; ") || "ok"}`);
          }
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  await write(path.join(outDir, "summary.json"), redact(JSON.stringify(summary, null, 2)));
  await appendSummary(redact(markdownOf(summary)));
  if (summary.release.web) await setOutput(`web_sha=${summary.release.web}`);
  return { code: exitCodeOf(summary), summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passwords = { seeker: process.env.REVIEWER_SEEKER_PASSWORD ?? "", referrer: process.env.REVIEWER_REFERRER_PASSWORD ?? "" };
  try {
    const { chromium } = await import("playwright");
    const { code } = await runLiveQa({
      roles: parseRoles(process.env.LIVE_QA_ROLES),
      passwords,
      trigger: process.env.LIVE_QA_TRIGGER ?? "",
      launch: () => chromium.launch(),
      fetchText: async url => (await fetch(url, { signal: AbortSignal.timeout(NAV_TIMEOUT_MS), headers: { "cache-control": "no-cache" } })).text(),
      mkdir: (p, o) => mkdir(p, o),
      writeFile: (p, text) => writeFile(p, text),
      appendSummary: text => (process.env.GITHUB_STEP_SUMMARY ? appendFile(process.env.GITHUB_STEP_SUMMARY, text) : Promise.resolve()),
      setOutput: text => (process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, `${text}\n`) : Promise.resolve()),
      log: line => console.log(line),
      outDir: "live-qa",
    });
    process.exitCode = code;
  } catch (error) {
    console.error(`live-qa: ${redactor(Object.values(passwords))(messageOf(error))}`);
    process.exitCode = 1;
  }
}
