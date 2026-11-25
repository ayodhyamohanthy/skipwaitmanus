// REL-watchdog (D-212, D-100): the scheduled() handler and its I/O. Every 5 minutes
// it probes the site, retries once after 30 s when a round fails, and alerts the
// owner by email (ZeptoMail) and, when GITHUB_ISSUES_TOKEN is set, a GitHub issue.
// The decisions are in ./core.ts; nothing here imports server/ or client/.
import {
  ISSUE_PREFIX,
  PROBES,
  PROBE_TIMEOUT_MS,
  RETRY_DELAY_MS,
  decide,
  evaluateProbe,
  parseState,
  roundFailed,
  settle,
  type Action,
  type Fetched,
  type ProbeOutcome,
  type ProbeSpec,
} from "./core";

interface Env {
  WATCHDOG_STATE: WatchdogKV;
  WATCHDOG_BASE_URL?: string;
  WATCHDOG_REPO?: string;
  ZEPTOMAIL_API_KEY?: string;
  GITHUB_ISSUES_TOKEN?: string;
}

const STATE_KEY = "state";
const DEFAULT_BASE_URL = "https://skipwait.me";
const DEFAULT_REPO = "ayodhyamohanthy/skipwaitmanus";
// The same two owner addresses server/errorAlerting.ts alerts (copied, not imported).
const ADMIN_ERROR_RECIPIENT = "ayodhya@skipwait.me";
const ADMIN_ALERT_COPY_RECIPIENT = "ayodhya@mail.instinct.com";
const FROM = "noreply@skipwait.me";
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 200_000;

async function probe(spec: ProbeSpec, baseUrl: string): Promise<Fetched> {
  try {
    const response = await fetch(new URL(spec.path, baseUrl).toString(), {
      method: spec.method,
      redirect: spec.redirect,
      headers: { "User-Agent": "skipwait-watchdog", Accept: "application/json, text/html", ...(spec.body ? { "Content-Type": "application/json" } : {}) },
      ...(spec.body ? { body: spec.body } : {}),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    let body = "";
    try {
      body = (await response.text()).slice(0, MAX_BODY_CHARS);
    } catch {
      body = "";
    }
    // Any Set-Cookie (the sign-in return cookie) is simply dropped.
    return { kind: "response", status: response.status, contentType: response.headers.get("content-type") ?? "", location: response.headers.get("location"), body };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { kind: "error", error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

const probeRound = (baseUrl: string): Promise<ProbeOutcome[]> =>
  Promise.all(PROBES.map(async spec => evaluateProbe(spec, await probe(spec, baseUrl), baseUrl)));

async function sendOne(apiKey: string, to: string, subject: string, text: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: { Authorization: `Zoho-enczapikey ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: { address: FROM, name: "SkipWait watchdog" }, to: [{ email_address: { address: to } }], subject, textbody: text }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendEmail(env: Env, subject: string, text: string): Promise<boolean> {
  if (!env.ZEPTOMAIL_API_KEY) {
    console.error("[watchdog] email channel not configured: ZEPTOMAIL_API_KEY is missing");
    return false;
  }
  const primary = await sendOne(env.ZEPTOMAIL_API_KEY, ADMIN_ERROR_RECIPIENT, subject, text);
  // The copy is best effort, as in server/errorAlerting.ts.
  await sendOne(env.ZEPTOMAIL_API_KEY, ADMIN_ALERT_COPY_RECIPIENT, subject, text);
  if (!primary) console.error("[watchdog] email delivery failed");
  return primary;
}

async function github(env: Env, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`https://api.github.com/repos/${env.WATCHDOG_REPO || DEFAULT_REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_ISSUES_TOKEN ?? ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "skipwait-watchdog",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
}

interface IssueSummary { number: number; title: string; pull_request?: unknown }

async function openIncidentIssues(env: Env): Promise<IssueSummary[] | null> {
  const response = await github(env, "GET", "/issues?state=open&labels=incident&per_page=100");
  if (!response.ok) return null;
  const items = (await response.json()) as IssueSummary[];
  return Array.isArray(items) ? items.filter(i => !i.pull_request && typeof i.title === "string" && i.title.startsWith(ISSUE_PREFIX)) : null;
}

async function issueAction(env: Env, action: Extract<Action, { channel: "issue" }>): Promise<boolean> {
  if (!env.GITHUB_ISSUES_TOKEN) return true; // optional channel: not configured is not a failure
  try {
    const open = await openIncidentIssues(env);
    if (open === null) return false;
    if (action.op === "open") {
      const existing = open[0];
      if (existing) return (await github(env, "POST", `/issues/${existing.number}/comments`, { body: action.body })).ok;
      const label = await github(env, "POST", "/labels", { name: "incident", color: "B60205" });
      if (!label.ok && label.status !== 422) return false; // 422: it already exists
      return (await github(env, "POST", "/issues", { title: action.title, body: action.body, labels: ["incident"] })).ok;
    }
    let ok = true;
    for (const issue of open) {
      ok = (await github(env, "POST", `/issues/${issue.number}/comments`, { body: action.body })).ok && ok;
      ok = (await github(env, "PATCH", `/issues/${issue.number}`, { state: "closed" })).ok && ok;
    }
    return ok;
  } catch {
    return false;
  }
}

async function deliver(env: Env, actions: readonly Action[]): Promise<boolean> {
  let delivered = true;
  for (const action of actions) {
    console.log(`[watchdog] alert ${action.channel}: ${action.channel === "email" ? action.subject : `${action.op} ${action.title}`}`);
    const ok = action.channel === "email" ? await sendEmail(env, action.subject, action.text) : await issueAction(env, action);
    if (!ok) {
      console.error(`[watchdog] ${action.channel} channel failed; state kept so the next run tries again`);
      delivered = false;
    }
  }
  return delivered;
}

export async function runWatchdog(env: Env): Promise<void> {
  const baseUrl = env.WATCHDOG_BASE_URL || DEFAULT_BASE_URL;
  let raw: string | null = null;
  try {
    raw = await env.WATCHDOG_STATE.get(STATE_KEY);
  } catch {
    console.error("[watchdog] KV read failed; running from a fresh state");
  }
  const prev = parseState(raw, Date.now());
  const rounds: ProbeOutcome[][] = [await probeRound(baseUrl)];
  if (roundFailed(rounds[0], prev.validatingRuns)) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    rounds.push(await probeRound(baseUrl));
  }
  const { next, actions } = decide(prev, rounds, Date.now());
  const delivered = await deliver(env, actions);
  const kept = settle(prev, next, delivered);
  console.log(`[watchdog] decided ${next.state} · rounds ${rounds.length} · failing ${next.failing.join(",") || "none"} · alerts ${actions.length}${delivered ? "" : " undelivered, kept " + kept.state}`);
  try {
    await env.WATCHDOG_STATE.put(STATE_KEY, JSON.stringify(kept));
  } catch {
    console.error("[watchdog] KV write failed");
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runWatchdog(env);
  },
};
