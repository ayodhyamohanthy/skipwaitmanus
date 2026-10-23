#!/usr/bin/env node
/**
 * D-090 BYOR local QA runner.
 *
 * This runner is intentionally local-only: it executes the BYOR test suites with
 * test billing and both BYOR flags enabled, starts a Vite-only UI server without
 * WorkOS/provider credentials, and captures synthetic fixtures through the
 * Playwright network-intercept harness. It never connects to a database,
 * production app, payment provider, or real user account.
 *
 * Usage:
 *   node scripts/qa/d090-byor.mjs [--out artifacts/d090-c6]
 *
 * A local server-session-only auth diagnostic is recorded as an incomplete QA
 * gate (exit 2), not suppressed. A configured test WorkOS client/staging pass
 * must be performed separately before the feature can be declared done.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DUMMY_TOKEN = "A".repeat(43);
const OUT = path.resolve(ROOT, option("out", "artifacts/d090-c6"));
if (OUT === ROOT || !OUT.startsWith(`${ROOT}${path.sep}`)) throw new Error("--out must stay inside this repository");
const FIXTURES = path.join(ROOT, "scripts/qa/fixtures/d090-byor");
const EXPECTED_AUTH_FALLBACK = "[auth] VITE_WORKOS_CLIENT_ID is not set; falling back to server-session-only auth";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const cases = [
  { id: "waiting-row", route: "/requests", fixture: "waiting-row.json", name: "d090_c6_waiting-row", persona: "synthetic seeker; waiting ask" },
  { id: "invite-sheet", route: "/requests", fixture: "invite-sheet.json", name: "d090_c6_invite-sheet", persona: "synthetic seeker; invite sheet open" },
  { id: "sheet-revoke-confirmation", route: "/requests", fixture: "sheet-revoke-confirmation.json", name: "d090_c6_sheet-revoke-confirmation", persona: "synthetic seeker; revoke confirmation" },
  { id: "landing-signed-out", route: `/r/${DUMMY_TOKEN}`, fixture: "landing-signed-out.json", name: "d090_c6_landing-signed-out", persona: "signed-out synthetic viewer" },
  { id: "landing-verified", route: `/r/${DUMMY_TOKEN}`, fixture: "landing-verified.json", name: "d090_c6_landing-verified", persona: "verified same-company synthetic referrer" },
  { id: "landing-claimed", route: `/r/${DUMMY_TOKEN}`, fixture: "landing-claimed.json", name: "d090_c6_landing-claimed", persona: "synthetic claimer; claimed state" },
  { id: "landing-held", route: `/r/${DUMMY_TOKEN}`, fixture: "landing-held.json", name: "d090_c6_landing-held", persona: "synthetic claimer; held/reserved result" },
];

const testFiles = [
  "server/askInvites.test.ts",
  "server/askInvites.token.test.ts",
  "server/askInviteRoutes.test.ts",
  "server/askInvites.minePayload.test.ts",
  "server/askInviteClaim.test.ts",
  "server/askInviteReservation.test.ts",
  "server/askInviteSweep.test.ts",
  "server/privateReferralRoutes.integration.test.ts",
  "server/configContract.test.ts",
  "server/schemaReconcile.test.ts",
  "server/db.coverageDelivery.test.ts",
  "server/coverageDeliverySweep.test.ts",
  "server/askExpirySweep.test.ts",
  "server/db.referralPassReopen.test.ts",
  "server/blockEnforcement.test.ts",
  "client/src/components/requests/askInviteApi.test.ts",
  "client/src/pages/myRequests.invite.test.tsx",
  "client/src/pages/AskInviteLink.test.tsx",
  "client/src/metadataAndRouteLoading.test.ts",
  "client/src/components/goal/goalBoundary.test.ts",
  "client/src/pages/myRequests.goal.test.tsx",
];

function testEnvironment() {
  const env = {
    ...process.env,
    BILLING_ENV: "test",
    BYOR_LINK_ENABLED: "true",
    VITE_BYOR_LINK: "true",
    NODE_ENV: "test",
  };
  // Tests use fakes/in-memory fixtures. Never inherit live database or payment
  // credentials into this QA subprocess.
  for (const key of Object.keys(env)) {
    if (/^(DATABASE_URL|TEST_DATABASE_URL|MYSQL_URL|DB_URL)$/i.test(key)) delete env[key];
    if (/^(CHARGEBEE_|RAZORPAY_|PAYPAL_|STRIPE_|CASHFREE_)/i.test(key)) delete env[key];
    if (/^(VITE_(WORKOS|ANALYTICS|CLARITY|SENTRY|POSTHOG)_|WORKOS_|CLARITY_|SENTRY_|POSTHOG_)/i.test(key)) delete env[key];
  }
  delete env.WORKOS_API_KEY;
  delete env.WORKOS_CLIENT_ID;
  delete env.VITE_WORKOS_CLIENT_ID;
  return env;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  return result.stdout;
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForVite(child, base, logPath) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited ${child.exitCode}; inspect ${logPath}`);
    try {
      const response = await fetch(base, { redirect: "manual" });
      if (response.ok) return;
    } catch { /* wait for Vite to bind */ }
    await delay(250);
  }
  throw new Error(`Vite did not become ready; inspect ${logPath}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const signalGroup = signal => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { /* already exited */ }
  };
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      signalGroup("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    signalGroup("SIGTERM");
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const env = testEnvironment();
  const sourceCommit = run("git", ["rev-parse", "--short", "HEAD"], env).trim();
  const metadata = {
    task: "D-090-BYOR C6 local synthetic QA",
    sourceCommit,
    capturedAt: new Date().toISOString(),
    flags: { BILLING_ENV: "test", BYOR_LINK_ENABLED: "true", VITE_BYOR_LINK: "true" },
    build: { VITE_GOAL_SURFACES: "not used by D-090 captures", sourceCommit },
    environment: "local Vite only; fixture-intercepted API; no database, provider, production backend, or real account",
    personas: cases.map(({ id, persona, fixture }) => ({ id, persona, fixture })),
  };

  console.log("Running focused BYOR tests with test billing and both flags enabled.");
  run("pnpm", ["vitest", "run", ...testFiles], env);

  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;
  const viteLog = path.join(OUT, "vite.log");
  const viteEnv = { ...env, NODE_ENV: "development" };
  // Keep the local screenshot-only app on the deliberate server-session
  // fallback. A dummy WorkOS ID triggers real SDK network requests, so do not
  // add one here.
  const vite = spawn(path.join(ROOT, "node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: viteEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let viteOutput = "";
  vite.stdout.on("data", chunk => { viteOutput += chunk; });
  vite.stderr.on("data", chunk => { viteOutput += chunk; });

  const captures = [];
  const hardFailures = [];
  let authFallbackSeen = false;
  try {
    await waitForVite(vite, base, viteLog);
    for (const item of cases) {
      const fixturePath = path.join(FIXTURES, item.fixture);
      await readFile(fixturePath, "utf8");
      const stateOut = path.join(OUT, item.id);
      const relativeOut = path.relative(ROOT, stateOut).split(path.sep).join("/");
      const captureArgs = [
        "scripts/kit-screens/capture.mjs",
        "--route", item.route,
        "--name", item.name,
        "--fixture", path.relative(ROOT, fixturePath).split(path.sep).join("/"),
        "--base", base,
        "--out", relativeOut,
        "--viewport", "both",
      ];
      const capture = spawnSync(process.execPath, captureArgs, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const stderrPath = path.join(OUT, `${item.id}-stderr.log`);
      await writeFile(stderrPath, capture.stderr || "", "utf8");
      if (capture.error) throw capture.error;
      if (capture.status !== 0) throw new Error(`Capture ${item.id} exited ${capture.status}; inspect ${stderrPath}`);

      const report = JSON.parse(capture.stdout.trim());
      // This token is a fixed synthetic fixture value. Redact it from the
      // committed report so reports never look like usable invitation links.
      report.route = String(report.route || item.route).replace(DUMMY_TOKEN, ":token");
      const errors = [];
      for (const [viewport, data] of Object.entries(report.viewports || {})) {
        delete data.reference;
        delete data.refHeight;
        delete data.slices; // no designer reference images are present in repo
        if (data.horizontalOverflowPx !== 0) errors.push(`${item.id}/${viewport}: horizontal overflow ${data.horizontalOverflowPx}px`);
        if ((data.unmatchedApi || []).length) errors.push(`${item.id}/${viewport}: unmatched API ${data.unmatchedApi.join(", ")}`);
        const consoleErrors = data.consoleErrors || [];
        if (consoleErrors.length && consoleErrors.every(message => message === EXPECTED_AUTH_FALLBACK)) authFallbackSeen = true;
        else if (consoleErrors.length) errors.push(`${item.id}/${viewport}: console errors ${consoleErrors.join(" | ")}`);
      }
      if (errors.length) hardFailures.push(...errors);
      report.metadata = { persona: item.persona, fixture: item.fixture, sourceCommit, flags: metadata.flags, build: metadata.build, evidenceMode: metadata.environment };
      report.status = errors.length ? "failed" : "captured";
      await writeFile(path.join(OUT, `${item.id}-report.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await rm(path.join(stateOut, "compare"), { recursive: true, force: true });
      captures.push({ id: item.id, persona: item.persona, status: report.status, viewports: Object.keys(report.viewports || {}) });
      console.log(`${item.id}: ${report.status}`);
    }
  } finally {
    await writeFile(viteLog, viteOutput, "utf8");
    await stopChild(vite);
  }

  metadata.captures = captures;
  metadata.hardFailures = hardFailures;
  metadata.result = hardFailures.length ? "failed" : authFallbackSeen ? "incomplete-auth-config" : "passed";
  metadata.blocker = authFallbackSeen
    ? "The local server-session fallback emitted its expected missing VITE_WORKOS_CLIENT_ID console diagnostic. No dummy client ID was used because it caused an external WorkOS request in a probe. Capture screenshots are local/synthetic; a configured non-production auth environment is needed for zero-console-error acceptance."
    : null;
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  if (hardFailures.length) {
    console.error(`QA failed; see ${path.relative(ROOT, path.join(OUT, "manifest.json"))}`);
    process.exitCode = 1;
  } else if (authFallbackSeen) {
    console.error(`Screenshots captured, but the zero-console-error QA gate is incomplete; see ${path.relative(ROOT, path.join(OUT, "manifest.json"))}`);
    process.exitCode = 2;
  } else {
    console.log(`D-090 local synthetic QA passed; evidence: ${path.relative(ROOT, OUT)}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
