// REL-release-verify (D-212): the pure part of scripts/release-smoke.mjs.
// Everything here takes plain values (a status, a body, a list of runs) and
// returns a verdict, so scripts/releaseSmoke.test.ts can pin every rule
// without a network. Read-only by design: no check signs in, writes a row,
// sends a code or costs money.

export const DEPLOY_API_WORKFLOW = "Deploy API (Cloudflare Containers)";
export const DEPLOY_WEB_WORKFLOW = "Deploy Web (Cloudflare Pages)";
export const DEPLOY_WORKFLOWS = [DEPLOY_API_WORKFLOW, DEPLOY_WEB_WORKFLOW];
export const STATUS_CONTEXT = "release/verified";
export const INCIDENT_LABEL = "incident";
export const RELEASE_INCIDENT_PREFIX = "Release not verified: ";

/** The top-level keys client/src reads from GET /api/plans/catalog (shared/billingCatalog.ts planCatalogResponseSchema). */
export const CATALOG_KEYS = ["region", "currency", "priceNote", "free", "plans", "packs", "sessions", "creditCosts", "fairness"];

/**
 * A signed-out request to an API the client calls only when signed in
 * (NotificationBell, /notifications and /alerts fetch it behind isSignedIn).
 * It must answer 401: a 200 would leak, a 5xx means the private routes are down.
 */
export const SIGNED_OUT_PROBE = "/api/notifications";

/** The administrator sign-in redirect deploy-api.yml's admin gate checks. */
export const ADMIN_GATE_PATH = "/api/auth/workos/admin";

/**
 * The signed-out public pages scripts/live-flow-audit.mjs visits (landing,
 * /start and its "public surfaces" list), plus its unknown-route NotFound check.
 */
export const PUBLIC_PAGES = ["/", "/start", "/wall", "/share", "/privacy", "/premium", "/plans", "/settings", "/components", "/post-opportunity", "/definitely-not-a-route"];

/** Rollouts converge in 15 to 40 minutes (packet REL-release-verify). */
export const API_WAIT_MINUTES = 45;

const SHA_RE = /^[0-9a-f]{40}$/;

export function isSha(value) {
  return typeof value === "string" && SHA_RE.test(value);
}

function result(name, ok, detail) {
  return { name, ok: Boolean(ok), detail: detail || "" };
}

/** Parse a JSON body; an HTML page (a Cloudflare error, the SPA shell) or junk is null. */
export function parseJsonBody(body) {
  if (typeof body !== "string") return null;
  const text = body.trim();
  if (!text || text.startsWith("<")) return null;
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function statusDetail(response) {
  return `status ${response?.status ?? "none"}`;
}

/** A fetch that threw (DNS, timeout) arrives as { error }. */
function transportFailed(name, response) {
  if (!response || response.error) return result(name, false, response?.error ? `request failed: ${response.error}` : "no response");
  return null;
}

export function readGitCommitMeta(html) {
  if (typeof html !== "string") return null;
  const tag = /<meta\s+[^>]*name=["']git-commit["'][^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  return /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? null;
}

export function checkHome(response, webSha) {
  const name = "home serves the web release";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  if (response.status !== 200) return result(name, false, statusDetail(response));
  const live = readGitCommitMeta(response.body);
  if (!live) return result(name, false, "no git-commit meta on /");
  if (live !== webSha) return result(name, false, `git-commit ${live.slice(0, 8)}, expected ${String(webSha).slice(0, 8)}`);
  return result(name, true, `git-commit ${live.slice(0, 8)}`);
}

export function checkHealth(response, apiSha) {
  const name = "/api/health serves the API release";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  const json = parseJsonBody(response.body);
  if (response.status !== 200) return result(name, false, statusDetail(response));
  if (!json) return result(name, false, "body is not JSON");
  if (json.commitSha !== apiSha) return result(name, false, `commitSha ${String(json.commitSha).slice(0, 8)}, expected ${String(apiSha).slice(0, 8)}`);
  return result(name, true, `commitSha ${apiSha.slice(0, 8)}`);
}

export function checkReady(response) {
  const name = "/api/health/ready is ready";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  const json = parseJsonBody(response.body);
  if (!json) return result(name, false, `${statusDetail(response)}, body is not JSON`);
  if (response.status !== 200 || json.state !== "ready") return result(name, false, `${statusDetail(response)}, state ${json.state ?? "missing"}`);
  return result(name, true, "state ready");
}

export function checkLatency(response) {
  const name = "/api/health/latency reaches the database";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  const json = parseJsonBody(response.body);
  if (response.status !== 200) return result(name, false, statusDetail(response));
  if (!json) return result(name, false, "body is not JSON");
  if (typeof json.dbRoundTripMs !== "number" || !Number.isFinite(json.dbRoundTripMs)) return result(name, false, `dbRoundTripMs ${JSON.stringify(json.dbRoundTripMs ?? null)}`);
  return result(name, true, `dbRoundTripMs ${json.dbRoundTripMs}`);
}

export function checkCatalog(response) {
  const name = "/api/plans/catalog answers the client's shape";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  const json = parseJsonBody(response.body);
  if (response.status !== 200) return result(name, false, statusDetail(response));
  if (!json) return result(name, false, "body is not JSON");
  const missing = CATALOG_KEYS.filter(key => !(key in json));
  if (missing.length) return result(name, false, `missing ${missing.join(", ")}`);
  return result(name, true, `${CATALOG_KEYS.length} keys`);
}

export function checkSitemap(response) {
  const name = "/sitemap.xml answers";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  if (response.status !== 200) return result(name, false, statusDetail(response));
  if (!/<urlset[\s>]/.test(String(response.body))) return result(name, false, "no <urlset>");
  return result(name, true, "status 200");
}

export function checkSignedOut(response) {
  const name = `signed-out ${SIGNED_OUT_PROBE} is refused`;
  const failed = transportFailed(name, response);
  if (failed) return failed;
  const json = parseJsonBody(response.body);
  if (response.status !== 401) return result(name, false, `${statusDetail(response)}, expected 401`);
  if (!json) return result(name, false, "401 body is not JSON");
  return result(name, true, "status 401");
}

export function checkAdminGate(response) {
  const name = "administrator sign-in redirects";
  const failed = transportFailed(name, response);
  if (failed) return failed;
  if (response.status !== 302) return result(name, false, `${statusDetail(response)}, expected 302`);
  return result(name, true, "status 302");
}

/** Console lines the browser prints for a response this smoke expects: the signed-out 401s. */
export function isExpectedConsoleError(text) {
  return /^Failed to load resource: the server responded with a status of 401\b/.test(String(text));
}

/**
 * One signed-out page load. Fails on a page error, any 5xx response, a request
 * that never completed on this origin, or a console error other than the
 * browser's own line for an expected 401.
 */
export function evaluatePage({ route, pageErrors = [], responses = [], consoleErrors = [], navigationError = null }) {
  const name = `page ${route} loads clean`;
  const problems = [];
  if (navigationError) problems.push(`navigation: ${String(navigationError).slice(0, 160)}`);
  for (const err of pageErrors) problems.push(`page error: ${String(err).slice(0, 160)}`);
  for (const res of responses) {
    if (res.status >= 500) problems.push(`${res.status} ${templatePath(res.url)}`);
  }
  for (const text of consoleErrors) {
    if (!isExpectedConsoleError(text)) problems.push(`console: ${String(text).slice(0, 160)}`);
  }
  if (problems.length) return result(name, false, problems.slice(0, 4).join("; "));
  return result(name, true, `${responses.length} responses`);
}

/** Only the path, never a query string (it may hold a token): AGENTS.md logging rule. */
export function templatePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url).split("?")[0];
  }
}

export function formatLine(check) {
  return `${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`;
}

export function summarize(checks) {
  const failing = checks.filter(check => !check.ok);
  return { ok: failing.length === 0 && checks.length > 0, failing, lines: checks.map(formatLine) };
}

// ---------------------------------------------------------------- expected SHAs

function runTime(run) {
  return Date.parse(run?.run_started_at || run?.created_at || "") || 0;
}

function newestFirst(runs) {
  return [...runs].sort((a, b) => runTime(b) - runTime(a) || (b.id ?? 0) - (a.id ?? 0));
}

/**
 * Web: the head_sha of the newest successful "Deploy Web (Cloudflare Pages)"
 * run on main. A push deploys its head commit (VITE_GIT_COMMIT_SHA is
 * github.sha) whatever it touched, so path filters never enter into it.
 */
export function expectedWebSha(runs) {
  const done = (runs || []).filter(run => run.name === DEPLOY_WEB_WORKFLOW && run.head_branch === "main" && run.status === "completed" && run.conclusion === "success" && isSha(run.head_sha));
  return newestFirst(done)[0]?.head_sha ?? null;
}

/**
 * API: the commit refs/tags/api-runtime points to, from `git ls-remote origin
 * refs/tags/api-runtime`. deploy-api.yml moves that tag only after a verified
 * runtime deploy. An annotated tag lists its commit on the ^{} line.
 */
export function expectedApiSha(lsRemoteOutput) {
  let direct = null;
  let peeled = null;
  for (const line of String(lsRemoteOutput || "").split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!isSha(sha)) continue;
    if (ref === "refs/tags/api-runtime^{}") peeled = sha;
    else if (ref === "refs/tags/api-runtime") direct = sha;
  }
  return peeled || direct;
}

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

/**
 * A verification triggered by a deploy run is superseded when a newer run of
 * the same deploy workflow is still going (its completion triggers its own
 * verification), or when a run of the other deploy workflow is still going:
 * the live site would change under the smoke, and that run's completion
 * triggers a fresh verification too.
 */
export function supersededBy(trigger, runs) {
  if (!trigger) return null;
  const triggerTime = runTime(trigger);
  for (const run of runs || []) {
    if (run.id === trigger.id || !ACTIVE.has(run.status)) continue;
    if (!DEPLOY_WORKFLOWS.includes(run.name) || run.head_branch !== "main") continue;
    if (run.name === trigger.name) {
      if (runTime(run) > triggerTime || (runTime(run) === triggerTime && (run.id ?? 0) > (trigger.id ?? 0))) return run;
    } else {
      return run;
    }
  }
  return null;
}

/**
 * Decide what one release-verify run does, before any smoke runs.
 * - dispatch: verify the live release; the status goes on the dispatched SHA.
 * - workflow_run: a deploy that did not succeed is reported by its own
 *   "Deploy failed" issue, so nothing is verified; a superseded run exits
 *   without a status; otherwise the status goes on the deploy's head SHA.
 */
export function planVerification({ event, trigger = null, dispatchSha = null, runs = [], apiTagOutput = "" }) {
  const webSha = expectedWebSha(runs);
  const apiSha = expectedApiSha(apiTagOutput);
  let statusSha;
  if (event === "workflow_dispatch") {
    statusSha = dispatchSha;
  } else if (event === "workflow_run") {
    if (!trigger) return { action: "skip", reason: "no triggering deploy run" };
    if (trigger.conclusion !== "success") return { action: "skip", reason: `${trigger.name} ended ${trigger.conclusion}; its Deploy failed issue reports it` };
    const newer = supersededBy(trigger, runs);
    if (newer) return { action: "superseded", reason: `${newer.name} run ${newer.id} is ${newer.status}` };
    statusSha = trigger.head_sha;
  } else {
    return { action: "skip", reason: `unsupported event ${event}` };
  }
  if (!isSha(statusSha)) return { action: "fail", reason: "no release SHA to mark", statusSha: null, webSha, apiSha };
  if (!webSha) return { action: "fail", reason: `no successful ${DEPLOY_WEB_WORKFLOW} run on main`, statusSha, webSha, apiSha };
  if (!apiSha) return { action: "fail", reason: "refs/tags/api-runtime not found", statusSha, webSha, apiSha };
  return { action: "verify", statusSha, webSha, apiSha };
}

// ---------------------------------------------------------------- incident text

export function releaseIncidentTitle(sha) {
  return `${RELEASE_INCIDENT_PREFIX}${String(sha).slice(0, 8)}`;
}

export function isReleaseIncidentTitle(title) {
  return typeof title === "string" && title.startsWith(RELEASE_INCIDENT_PREFIX);
}

export function releaseIncidentBody({ sha, webSha, apiSha, lines, runUrl }) {
  return [
    `release-verify could not verify the live release after the deploy of \`${sha}\`.`,
    "",
    `- expected web: \`${webSha || "unknown"}\``,
    `- expected API: \`${apiSha || "unknown"}\``,
    runUrl ? `- run: ${runUrl}` : null,
    "",
    "```",
    ...(lines && lines.length ? lines : ["(no check output)"]),
    "```",
  ].filter(line => line !== null).join("\n");
}
