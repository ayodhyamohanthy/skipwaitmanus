// REL-watchdog (D-212, D-100): the pure half of the external watchdog Worker.
// The probe list, how a probe answer is judged, the up/down state machine and
// the alert text. No I/O here: watchdog/src/index.ts does the fetches, KV and
// delivery. Alerts carry probe names, status codes and times only (packet rule 3).

export type ProbeName = "home" | "ready" | "latency" | "catalog" | "signin-google" | "otp-send" | "email-code-send";

export interface ProbeSpec {
  readonly name: ProbeName;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: string;
  readonly redirect: "manual" | "follow";
}

const MALFORMED = JSON.stringify({ email: "watchdog-probe" });

/** Every probe is read-only: none signs in, sends a code, writes a row or costs money. */
export const PROBES: readonly ProbeSpec[] = [
  { name: "home", method: "GET", path: "/", redirect: "follow" },
  { name: "ready", method: "GET", path: "/api/health/ready", redirect: "follow" },
  { name: "latency", method: "GET", path: "/api/health/latency", redirect: "follow" },
  { name: "catalog", method: "GET", path: "/api/plans/catalog", redirect: "follow" },
  // No login_hint and no fresh=1, so the route builds the URL locally and calls no provider.
  { name: "signin-google", method: "GET", path: "/api/auth/workos/sign-in?provider=google", redirect: "manual" },
  // Both handlers refuse a malformed email before any provider call, rate counter or write.
  { name: "otp-send", method: "POST", path: "/api/auth/otp/send", body: MALFORMED, redirect: "follow" },
  { name: "email-code-send", method: "POST", path: "/api/auth/workos/email-code/send", body: MALFORMED, redirect: "follow" },
];

export const PROBE_TIMEOUT_MS = 10_000;
export const RETRY_DELAY_MS = 30_000;
/** A `validating` readiness answer is a rollout until it has lasted this many runs (15 minutes). */
export const VALIDATING_GRACE_RUNS = 3;
export const REMINDER_MS = 60 * 60_000;

export type Fetched =
  | { kind: "response"; status: number; contentType: string; location: string | null; body: string }
  | { kind: "error"; error: "timeout" | "network" };

export interface ProbeOutcome {
  name: ProbeName;
  pass: boolean;
  /** `ready` answered 503 `validating`: passes until the grace runs are spent. */
  validating: boolean;
  /** A status code with at most a fixed qualifier ("503 html", "200 body", "timeout"); never response content. */
  status: string;
  packsAvailable?: number;
}

const looksHtml = (f: { contentType: string; body: string }) =>
  /html/i.test(f.contentType) || f.body.trimStart().startsWith("<");

function parseJson(f: { contentType: string; body: string }): Record<string, unknown> | null {
  if (looksHtml(f)) return null;
  try {
    const value: unknown = JSON.parse(f.body);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function signInRedirectOk(location: string | null, baseUrl: string): boolean {
  if (!location) return false;
  try {
    const redirectUri = new URL(location).searchParams.get("redirect_uri");
    if (!redirectUri) return false;
    const target = new URL(redirectUri);
    return target.host === hostOf(baseUrl) && target.pathname === "/api/auth/workos/callback";
  } catch {
    return false;
  }
}

function countPacks(body: Record<string, unknown>): number {
  const packs = body.packs;
  if (!Array.isArray(packs)) return 0;
  return packs.filter(p => p !== null && typeof p === "object" && (p as Record<string, unknown>).available === true).length;
}

/** Judge one probe answer. */
export function evaluateProbe(spec: ProbeSpec, fetched: Fetched, baseUrl: string): ProbeOutcome {
  const outcome = (pass: boolean, status: string, extra: Partial<ProbeOutcome> = {}): ProbeOutcome => ({ name: spec.name, pass, validating: false, status, ...extra });
  if (fetched.kind === "error") return outcome(false, fetched.error);
  const code = String(fetched.status);
  const asJson = spec.name === "home" || spec.name === "signin-google" ? null : parseJson(fetched);
  const badBody = (pass: boolean) => (pass ? code : `${code} ${looksHtml(fetched) ? "html" : "body"}`);
  switch (spec.name) {
    case "home": {
      const pass = fetched.status === 200 && fetched.body.includes('<meta name="git-commit"');
      return outcome(pass, fetched.status === 200 && !pass ? `${code} body` : code);
    }
    case "ready": {
      if (fetched.status === 200 && asJson?.state === "ready") return outcome(true, code);
      if (fetched.status === 503 && asJson?.state === "validating") return outcome(true, `${code} validating`, { validating: true });
      return outcome(false, asJson ? (asJson.state === "failed" ? `${code} failed` : fetched.status === 200 ? `${code} body` : code) : badBody(false));
    }
    case "latency": {
      const pass = fetched.status === 200 && typeof asJson?.dbRoundTripMs === "number";
      return outcome(pass, pass ? code : asJson ? (fetched.status === 200 ? `${code} no db` : code) : badBody(false));
    }
    case "catalog": {
      const pass = fetched.status === 200 && asJson !== null;
      return outcome(pass, pass ? code : asJson ? code : badBody(false), pass && asJson ? { packsAvailable: countPacks(asJson) } : {});
    }
    case "signin-google": {
      const pass = fetched.status === 302 && signInRedirectOk(fetched.location, baseUrl);
      return outcome(pass, fetched.status === 302 && !pass ? `${code} redirect` : code);
    }
    case "otp-send":
    case "email-code-send": {
      const pass = fetched.status === 400 && asJson !== null;
      return outcome(pass, pass ? code : asJson ? code : badBody(false));
    }
  }
}

/** The outcomes that fail this round; a `validating` answer fails once the grace runs are spent. */
export function failingOutcomes(outcomes: readonly ProbeOutcome[], validatingRuns: number): ProbeOutcome[] {
  return outcomes.filter(o => !o.pass || (o.validating && validatingRuns >= VALIDATING_GRACE_RUNS - 1));
}

export function roundFailed(outcomes: readonly ProbeOutcome[], validatingRuns: number): boolean {
  return failingOutcomes(outcomes, validatingRuns).length > 0;
}

export interface WatchState {
  state: "up" | "down";
  /** When the current state began (ms since epoch). */
  since: number;
  lastAlertAt: number | null;
  lastWeeklyAt: number;
  weekRuns: number;
  weekOutages: number;
  validatingRuns: number;
  packsAvailable: number;
  failing: ProbeName[];
}

export function initialState(nowMs: number): WatchState {
  // lastWeeklyAt starts now, so a first deploy mid-week does not send a weekly note at once.
  return { state: "up", since: nowMs, lastAlertAt: null, lastWeeklyAt: nowMs, weekRuns: 0, weekOutages: 0, validatingRuns: 0, packsAvailable: 0, failing: [] };
}

const NAMES: ReadonlySet<string> = new Set(PROBES.map(p => p.name));

/** Read a stored state defensively: anything malformed starts fresh rather than throwing. */
export function parseState(raw: string | null, nowMs: number): WatchState {
  if (!raw) return initialState(nowMs);
  try {
    const v = JSON.parse(raw) as Partial<WatchState>;
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    const fresh = initialState(nowMs);
    return {
      state: v.state === "down" ? "down" : "up",
      since: num(v.since, fresh.since),
      lastAlertAt: typeof v.lastAlertAt === "number" ? v.lastAlertAt : null,
      lastWeeklyAt: num(v.lastWeeklyAt, fresh.lastWeeklyAt),
      weekRuns: num(v.weekRuns, 0),
      weekOutages: num(v.weekOutages, 0),
      validatingRuns: num(v.validatingRuns, 0),
      packsAvailable: num(v.packsAvailable, 0),
      failing: Array.isArray(v.failing) ? v.failing.filter((n): n is ProbeName => typeof n === "string" && NAMES.has(n)) : [],
    };
  } catch {
    return initialState(nowMs);
  }
}

export type Action =
  | { channel: "email"; subject: string; text: string }
  | { channel: "issue"; op: "open" | "close"; title: string; body: string };

export const ISSUE_PREFIX = "SkipWait DOWN:";

const WEEK_MS = 7 * 24 * 60 * 60_000;
/** The most recent Monday 03:30 UTC (09:00 IST) at or before nowMs. */
function lastWeeklyBoundary(nowMs: number): number {
  const d = new Date(nowMs);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  let boundary = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday, 3, 30, 0);
  if (boundary > nowMs) boundary -= WEEK_MS;
  return boundary;
}

export function weeklyDue(lastWeeklyAt: number, nowMs: number): boolean {
  return lastWeeklyAt < lastWeeklyBoundary(nowMs);
}

const iso = (ms: number) => new Date(ms).toISOString();
const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));
const list = (failing: readonly ProbeOutcome[]) => failing.map(o => o.name).join(", ");
const statuses = (failing: readonly ProbeOutcome[]) => failing.map(o => o.status).join(", ");
const detail = (failing: readonly ProbeOutcome[], sinceMs: number, nowMs: number) =>
  [...failing.map(o => `${o.name}: ${o.status}`), `Down since: ${iso(sinceMs)}`, `Checked: ${iso(nowMs)}`].join("\n");

/**
 * One run's decision. `rounds` holds the first round and, when it failed, the
 * retry 30 s later. Two failed rounds in a row open an outage (D-100).
 */
export function decide(prev: WatchState, rounds: readonly (readonly ProbeOutcome[])[], nowMs: number): { next: WatchState; actions: Action[] } {
  const lastRound = rounds[rounds.length - 1] ?? [];
  const failedRounds = rounds.map(r => failingOutcomes(r, prev.validatingRuns));
  const runFailed = rounds.length >= 2 && failedRounds.every(f => f.length > 0);
  const failing = runFailed ? failedRounds[failedRounds.length - 1] : [];
  const catalog = lastRound.find(o => o.name === "catalog" && o.packsAvailable !== undefined);
  const next: WatchState = {
    ...prev,
    weekRuns: prev.weekRuns + 1,
    validatingRuns: lastRound.some(o => o.validating) ? prev.validatingRuns + 1 : 0,
    packsAvailable: catalog?.packsAvailable ?? prev.packsAvailable,
  };
  const actions: Action[] = [];

  if (runFailed && prev.state === "up") {
    Object.assign(next, { state: "down", since: nowMs, lastAlertAt: nowMs, weekOutages: prev.weekOutages + 1, failing: failing.map(o => o.name) });
    actions.push({ channel: "email", subject: `${ISSUE_PREFIX} ${list(failing)} (${statuses(failing)})`, text: detail(failing, nowMs, nowMs) });
    actions.push({ channel: "issue", op: "open", title: `${ISSUE_PREFIX} ${list(failing)}`, body: detail(failing, nowMs, nowMs) });
  } else if (runFailed) {
    next.failing = failing.map(o => o.name);
    if (prev.lastAlertAt === null || nowMs - prev.lastAlertAt >= REMINDER_MS) {
      next.lastAlertAt = nowMs;
      const text = detail(failing, prev.since, nowMs);
      actions.push({ channel: "email", subject: `SkipWait still DOWN: ${list(failing)} (${statuses(failing)}), ${minutes(nowMs - prev.since)} min`, text });
      actions.push({ channel: "issue", op: "open", title: `${ISSUE_PREFIX} ${list(failing)}`, body: text });
    }
  } else if (prev.state === "down") {
    Object.assign(next, { state: "up", since: nowMs, lastAlertAt: nowMs, failing: [] });
    const text = `Recovered: ${iso(nowMs)}\nDown since: ${iso(prev.since)}`;
    actions.push({ channel: "email", subject: `SkipWait recovered after ${minutes(nowMs - prev.since)} min`, text });
    actions.push({ channel: "issue", op: "close", title: ISSUE_PREFIX, body: text });
  }

  if (weeklyDue(prev.lastWeeklyAt, nowMs)) {
    const counts = `${next.weekRuns} runs, ${next.weekOutages} outages, ${next.packsAvailable} packs on sale`;
    const green = next.weekOutages === 0 && next.state === "up";
    actions.push({
      channel: "email",
      subject: green ? `SkipWait watchdog: all probes green this week (${counts})` : `SkipWait watchdog weekly: ${counts}`,
      text: `Week ending: ${iso(nowMs)}\nState: ${next.state}`,
    });
    Object.assign(next, { lastWeeklyAt: nowMs, weekRuns: 0, weekOutages: 0 });
  }

  return { next, actions };
}

/** Keep the new state only when every alert was delivered; otherwise the next run tries again. */
export function settle(prev: WatchState, next: WatchState, delivered: boolean): WatchState {
  return delivered ? next : prev;
}
