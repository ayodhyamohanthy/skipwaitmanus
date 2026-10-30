#!/usr/bin/env node
// REL-release-verify (D-212): checks the live release end to end after a deploy.
// Read-only: no sign-in, no writes, no codes sent, no money. The rules live in
// scripts/releaseSmokeCore.mjs (pinned by scripts/releaseSmoke.test.ts).
//
//   node scripts/release-smoke.mjs --web-sha <sha> --api-sha <sha> [--base https://skipwait.me]
//        [--wait-minutes 45] [--no-browser] [--out <file>]
//     Waits for /api/health to serve the API SHA, runs the HTTP checks, then a
//     signed-out Playwright pass over the public pages. One line per check;
//     exits 1 on any failure. --out writes the lines for the incident issue.
//
//   node scripts/release-smoke.mjs --plan
//     In GitHub Actions: works out what this release-verify run does (verify,
//     superseded or skip) and the expected SHAs, from the triggering deploy run,
//     the newest successful Deploy Web run and refs/tags/api-runtime. Writes
//     action, reason, status_sha, web_sha and api_sha to $GITHUB_OUTPUT.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  ADMIN_GATE_PATH,
  API_WAIT_MINUTES,
  PUBLIC_PAGES,
  SIGNED_OUT_PROBE,
  checkAdminGate,
  checkCatalog,
  checkHealth,
  checkHome,
  checkLatency,
  checkReady,
  checkSignedOut,
  checkSitemap,
  evaluatePage,
  formatLine,
  isSha,
  parseJsonBody,
  planVerification,
  summarize,
} from "./releaseSmokeCore.mjs";

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const option = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  const inline = argv.find(arg => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};

const REQUEST_TIMEOUT_MS = 15_000;

async function get(url, { redirect = "follow" } = {}) {
  try {
    const response = await fetch(url, { redirect, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { "user-agent": "skipwait-release-verify" } });
    const body = await response.text().catch(() => "");
    return { status: response.status, body };
  } catch (error) {
    return { error: error instanceof Error ? error.name || error.message : String(error) };
  }
}

function adminEmail() {
  const text = readFileSync("wrangler.jsonc", "utf8");
  return /"SKIPWAIT_ADMIN_EMAIL":\s*"([^"]+)"/.exec(text)?.[1] || "";
}

async function waitForApi(base, apiSha, minutes) {
  const deadline = Date.now() + minutes * 60_000;
  for (let attempt = 1; ; attempt += 1) {
    const response = await get(`${base}/api/health`);
    const live = parseJsonBody(response.body)?.commitSha;
    if (live === apiSha) {
      console.log(`API serves ${apiSha.slice(0, 8)} (attempt ${attempt})`);
      return;
    }
    if (Date.now() >= deadline) {
      console.log(`API still serves ${String(live || response.status || response.error).slice(0, 8)} after ${minutes} min; checking anyway`);
      return;
    }
    console.log(`attempt ${attempt}: API serves ${String(live || response.status || response.error).slice(0, 8)}, waiting for ${apiSha.slice(0, 8)}`);
    await new Promise(resolve => setTimeout(resolve, 30_000));
  }
}

async function httpChecks(base, webSha, apiSha) {
  const email = adminEmail();
  const adminUrl = `${base}${ADMIN_GATE_PATH}?email=${encodeURIComponent(email)}`;
  const [home, health, ready, latency, catalog, sitemap, signedOut, admin] = await Promise.all([
    get(`${base}/`),
    get(`${base}/api/health`),
    get(`${base}/api/health/ready`),
    get(`${base}/api/health/latency`),
    get(`${base}/api/plans/catalog`),
    get(`${base}/sitemap.xml`),
    get(`${base}${SIGNED_OUT_PROBE}`),
    email ? get(adminUrl, { redirect: "manual" }) : Promise.resolve({ error: "SKIPWAIT_ADMIN_EMAIL not found in wrangler.jsonc" }),
  ]);
  return [
    checkHome(home, webSha),
    checkHealth(health, apiSha),
    checkReady(ready),
    checkLatency(latency),
    checkCatalog(catalog),
    checkSitemap(sitemap),
    checkSignedOut(signedOut),
    checkAdminGate(admin),
  ];
}

async function browserChecks(base) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return [{ name: "browser pass", ok: false, detail: `playwright unavailable: ${error instanceof Error ? error.message : error}` }];
  }
  const launch = () => chromium.launch({ headless: true });
  let browser;
  try {
    browser = await launch();
  } catch (error) {
    return [{ name: "browser pass", ok: false, detail: `chromium did not start: ${firstLine(error)}` }];
  }
  const origin = new URL(base).origin;
  const checks = [];
  try {
    for (const route of PUBLIC_PAGES) {
      const pageErrors = [];
      const consoleErrors = [];
      const responses = [];
      let navigationError = null;
      let context = null;
      try {
        // A crashed browser fails this page, never the whole run: relaunch once per page.
        if (!browser.isConnected()) browser = await launch();
        context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("response", response => {
          if (response.url().startsWith(origin)) responses.push({ status: response.status(), url: response.url() });
        });
        await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForTimeout(2_500);
      } catch (error) {
        navigationError = firstLine(error);
      }
      checks.push(evaluatePage({ route, pageErrors, responses, consoleErrors, navigationError }));
      if (context) await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return checks;
}

function firstLine(error) {
  return String(error instanceof Error ? error.message : error).split("\n")[0];
}

async function smoke() {
  const base = (option("base", process.env.RELEASE_BASE_URL || "https://skipwait.me") || "").replace(/\/+$/, "");
  const webSha = option("web-sha", process.env.EXPECTED_WEB_SHA);
  const apiSha = option("api-sha", process.env.EXPECTED_API_SHA);
  const out = option("out");
  if (!isSha(webSha) || !isSha(apiSha)) {
    console.error("release-smoke: --web-sha and --api-sha must be full 40-character SHAs");
    process.exit(2);
  }
  const waitMinutes = Number(option("wait-minutes", String(API_WAIT_MINUTES)));
  if (waitMinutes > 0) await waitForApi(base, apiSha, waitMinutes);
  const checks = await httpChecks(base, webSha, apiSha);
  if (!flag("no-browser")) checks.push(...(await browserChecks(base)));
  const summary = summarize(checks);
  for (const line of summary.lines) console.log(line);
  console.log(summary.ok ? `RELEASE VERIFIED: web ${webSha.slice(0, 8)}, API ${apiSha.slice(0, 8)}` : `RELEASE NOT VERIFIED: ${summary.failing.length} of ${checks.length} checks failed`);
  if (out) writeFileSync(out, `${summary.lines.join("\n")}\n`);
  process.exit(summary.ok ? 0 : 1);
}

async function github(path) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub ${path.split("?")[0]} answered ${response.status}`);
  return response.json();
}

async function plan() {
  const repo = process.env.GITHUB_REPOSITORY;
  const event = process.env.GITHUB_EVENT_NAME;
  const payload = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const trigger = payload.workflow_run ?? null;
  const dispatchSha = (process.env.DISPATCH_SHA || "").trim() || process.env.GITHUB_SHA || null;
  const runs = [];
  for (const file of ["deploy-pages.yml", "deploy-api.yml"]) {
    const page = await github(`/repos/${repo}/actions/workflows/${file}/runs?branch=main&per_page=50`);
    runs.push(...(page.workflow_runs || []));
  }
  const apiTagOutput = execFileSync("git", ["ls-remote", "origin", "refs/tags/api-runtime"], { encoding: "utf8" });
  const decision = planVerification({ event, trigger, dispatchSha, runs, apiTagOutput });
  const lines = {
    action: decision.action,
    reason: decision.reason || "",
    status_sha: decision.statusSha || "",
    web_sha: decision.webSha || "",
    api_sha: decision.apiSha || "",
  };
  for (const [key, value] of Object.entries(lines)) console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(lines).map(([key, value]) => `${key}=${String(value).replace(/\n/g, " ")}`).join("\n") + "\n");
}

if (flag("plan")) {
  plan().catch(error => {
    console.error(formatLine({ name: "release-verify plan", ok: false, detail: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  });
} else {
  smoke();
}
