import { describe, expect, it } from "vitest";
import {
  PROBES,
  VALIDATING_GRACE_RUNS,
  REMINDER_MS,
  decide,
  evaluateProbe,
  initialState,
  roundFailed,
  settle,
  weeklyDue,
  type Fetched,
  type ProbeName,
  type ProbeOutcome,
  type WatchState,
} from "../watchdog/src/core";

// REL-watchdog (D-212, D-100): the pure half of the external watchdog Worker.
const BASE = "https://skipwait.me";
const spec = (name: ProbeName) => {
  const found = PROBES.find(p => p.name === name);
  if (!found) throw new Error(`no probe ${name}`);
  return found;
};
const res = (status: number, body = "", contentType = "application/json", location: string | null = null): Fetched => ({ kind: "response", status, body, contentType, location });
const html = (status: number, body = "<!doctype html><html><body>error</body></html>") => res(status, body, "text/html; charset=utf-8");
const json = (status: number, value: unknown) => res(status, JSON.stringify(value));
const okLocation = "https://api.workos.com/user_management/authorize?client_id=c&provider=GoogleOAuth&redirect_uri=https%3A%2F%2Fskipwait.me%2Fapi%2Fauth%2Fworkos%2Fcallback&response_type=code&state=s";

const passing: Record<ProbeName, Fetched> = {
  home: html(200, '<html><head><meta name="git-commit" content="abc" /></head></html>'),
  ready: json(200, { ok: true, state: "ready" }),
  latency: json(200, { ok: true, dbRoundTripMs: 50 }),
  catalog: json(200, { packs: [{ id: "pack_5", available: true }, { id: "pack_25", available: false }] }),
  "signin-google": res(302, "", "text/plain", okLocation),
  "otp-send": json(400, { error: "Enter a valid work email address" }),
  "email-code-send": json(400, { error: "Enter a valid email address" }),
};
const evaluate = (name: ProbeName, fetched: Fetched) => evaluateProbe(spec(name), fetched, BASE);
const round = (overrides: Partial<Record<ProbeName, Fetched>> = {}): ProbeOutcome[] =>
  PROBES.map(p => evaluate(p.name, overrides[p.name] ?? passing[p.name]));
const down = { ready: html(503, "<html>error code: 1101</html>") };

const T0 = Date.UTC(2026, 9, 28, 10, 0, 0); // a Wednesday
const MIN = 60_000;

describe("probes", () => {
  it("are all read-only requests against the base URL with no credentials", () => {
    expect(PROBES.map(p => p.name)).toEqual(["home", "ready", "latency", "catalog", "signin-google", "otp-send", "email-code-send"]);
    for (const p of PROBES) {
      expect(p.path.startsWith("/")).toBe(true);
      if (p.method === "POST") expect(JSON.parse(p.body ?? "")).toEqual({ email: "watchdog-probe" });
    }
    expect(spec("signin-google").path).toBe("/api/auth/workos/sign-in?provider=google");
    expect(spec("signin-google").redirect).toBe("manual");
  });

  it("pass on the healthy answers", () => {
    for (const p of PROBES) expect(evaluate(p.name, passing[p.name]).pass, p.name).toBe(true);
  });

  it("home fails without the git-commit meta, on a 5xx and on a network error", () => {
    expect(evaluate("home", html(200, "<html></html>")).pass).toBe(false);
    expect(evaluate("home", html(502)).pass).toBe(false);
    expect(evaluate("home", { kind: "error", error: "timeout" })).toMatchObject({ pass: false, status: "timeout" });
  });

  it("ready fails on failed, on any other 5xx, on a Cloudflare error page and on HTML", () => {
    expect(evaluate("ready", json(503, { ok: false, state: "failed" })).pass).toBe(false);
    expect(evaluate("ready", json(500, { ok: false })).pass).toBe(false);
    expect(evaluate("ready", html(200)).pass).toBe(false);
    expect(evaluate("ready", html(503)).pass).toBe(false);
    expect(evaluate("ready", json(503, { ok: false, state: "validating" }))).toMatchObject({ pass: true, validating: true });
  });

  it("latency fails when the database round trip is null or the body is HTML", () => {
    expect(evaluate("latency", json(200, { ok: true, dbRoundTripMs: null })).pass).toBe(false);
    expect(evaluate("latency", html(200)).pass).toBe(false);
  });

  it("catalog fails on an HTML body and counts the packs on sale without ever failing on them", () => {
    expect(evaluate("catalog", html(200)).pass).toBe(false);
    expect(evaluate("catalog", json(503, { error: "x" })).pass).toBe(false);
    expect(evaluate("catalog", passing.catalog)).toMatchObject({ pass: true, packsAvailable: 1 });
    const none = evaluate("catalog", json(200, { packs: [{ id: "pack_5", available: false }] }));
    expect(none).toMatchObject({ pass: true, packsAvailable: 0 });
  });

  it("signin-google needs a 302 to a redirect_uri on skipwait.me /api/auth/workos/callback", () => {
    expect(evaluate("signin-google", res(502, "Authentication could not be started", "text/plain")).pass).toBe(false);
    expect(evaluate("signin-google", res(302, "", "text/plain", okLocation.replace("skipwait.me", "evil.example"))).pass).toBe(false);
    expect(evaluate("signin-google", res(302, "", "text/plain", okLocation.replace("callback", "other"))).pass).toBe(false);
    expect(evaluate("signin-google", res(302, "", "text/plain", null)).pass).toBe(false);
    expect(evaluate("signin-google", html(200)).pass).toBe(false);
  });

  it("the two code-send probes need a 400 JSON refusal; a 5xx or HTML means sign-in is broken", () => {
    for (const name of ["otp-send", "email-code-send"] as const) {
      expect(evaluate(name, json(500, { error: "x" })).pass).toBe(false);
      expect(evaluate(name, html(400)).pass).toBe(false);
      expect(evaluate(name, html(503)).pass).toBe(false);
      expect(evaluate(name, json(200, { sent: true })).pass).toBe(false);
    }
  });
});

describe("rollout grace and packs", () => {
  const validating = { ready: json(503, { ok: false, state: "validating" }) };

  it("a validating 503 passes for 2 runs and fails on the third", () => {
    expect(VALIDATING_GRACE_RUNS).toBe(3);
    let state = initialState(T0);
    const runs: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const now = T0 + i * 5 * MIN;
      const first = round(validating);
      const failed = roundFailed(first, state.validatingRuns);
      runs.push(failed);
      const result = decide(state, failed ? [first, round(validating)] : [first], now);
      state = settle(state, result.next, true);
    }
    expect(runs).toEqual([false, false, true]);
    expect(state.state).toBe("down");
    expect(state.failing).toEqual(["ready"]);
  });

  it("the validating count resets once ready answers", () => {
    let state = initialState(T0);
    state = settle(state, decide(state, [round(validating)], T0).next, true);
    state = settle(state, decide(state, [round()], T0 + 5 * MIN).next, true);
    expect(state.validatingRuns).toBe(0);
  });

  it("no pack on sale passes, a drop from some to none passes, and the count reaches the weekly note", () => {
    let state = initialState(T0);
    state = settle(state, decide(state, [round()], T0).next, true);
    expect(state.packsAvailable).toBe(1);
    const none = { catalog: json(200, { packs: [{ id: "pack_5", available: false }] }) };
    expect(roundFailed(round(none), 0)).toBe(false);
    const result = decide(state, [round(none)], T0 + 5 * MIN);
    expect(result.actions).toEqual([]);
    state = settle(state, result.next, true);
    expect(state.packsAvailable).toBe(0);
    const monday = Date.UTC(2026, 10, 2, 3, 30, 0);
    const weekly = decide(state, [round(none)], monday);
    expect(weekly.actions).toHaveLength(1);
    expect(weekly.actions[0]).toMatchObject({ channel: "email" });
    expect((weekly.actions[0] as { subject: string }).subject).toContain("0 packs on sale");
  });
});

describe("alert rules", () => {
  it("one failed round opens nothing", () => {
    const state = initialState(T0);
    const first = round(down);
    expect(roundFailed(first, 0)).toBe(true);
    const result = decide(state, [first, round()], T0);
    expect(result.actions).toEqual([]);
    expect(result.next.state).toBe("up");
  });

  it("two failed rounds in a row open one outage: one email and one issue action", () => {
    const state = initialState(T0);
    const result = decide(state, [round(down), round(down)], T0);
    expect(result.next).toMatchObject({ state: "down", since: T0, lastAlertAt: T0, weekOutages: 1, failing: ["ready"] });
    expect(result.actions).toHaveLength(2);
    const [email, issue] = result.actions;
    expect(email).toMatchObject({ channel: "email", subject: "SkipWait DOWN: ready (503 html)" });
    expect(issue).toMatchObject({ channel: "issue", op: "open", title: "SkipWait DOWN: ready" });
  });

  it("a further failed run sends nothing until 60 minutes pass, then one reminder", () => {
    let state = settle(initialState(T0), decide(initialState(T0), [round(down), round(down)], T0).next, true);
    for (let t = T0 + 5 * MIN; t < T0 + REMINDER_MS; t += 5 * MIN) {
      const result = decide(state, [round(down), round(down)], t);
      expect(result.actions).toEqual([]);
      state = settle(state, result.next, true);
    }
    const reminder = decide(state, [round(down), round(down)], T0 + REMINDER_MS);
    expect(reminder.actions.map(a => a.channel)).toEqual(["email", "issue"]);
    expect((reminder.actions[0] as { subject: string }).subject).toBe("SkipWait still DOWN: ready (503 html), 60 min");
    expect(reminder.next.lastAlertAt).toBe(T0 + REMINDER_MS);
    expect(reminder.next.since).toBe(T0);
    expect(reminder.next.weekOutages).toBe(1);
  });

  it("recovery sends one email and closes the issue", () => {
    let state = settle(initialState(T0), decide(initialState(T0), [round(down), round(down)], T0).next, true);
    const result = decide(state, [round()], T0 + 25 * MIN);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({ channel: "email", subject: "SkipWait recovered after 25 min" });
    expect(result.actions[1]).toMatchObject({ channel: "issue", op: "close" });
    state = settle(state, result.next, true);
    expect(state).toMatchObject({ state: "up", failing: [] });
    expect(decide(state, [round()], T0 + 30 * MIN).actions).toEqual([]);
  });

  it("a round that recovers on its retry while down also recovers", () => {
    const state = settle(initialState(T0), decide(initialState(T0), [round(down), round(down)], T0).next, true);
    const result = decide(state, [round(down), round()], T0 + 10 * MIN);
    expect(result.next.state).toBe("up");
    expect(result.actions.map(a => a.channel)).toEqual(["email", "issue"]);
  });
});

describe("weekly note", () => {
  const monday = Date.UTC(2026, 10, 2, 3, 30, 0); // Monday 03:30 UTC = 09:00 IST

  it("is due once a week on Monday from 03:30 UTC", () => {
    expect(weeklyDue(T0, T0 + MIN)).toBe(false);
    expect(weeklyDue(T0, monday - MIN)).toBe(false);
    expect(weeklyDue(T0, monday)).toBe(true);
    expect(weeklyDue(monday, monday + 5 * MIN)).toBe(false);
    expect(weeklyDue(monday, monday + 7 * 24 * 60 * MIN)).toBe(true);
  });

  it("fires once with the counts and resets them", () => {
    let state = initialState(T0);
    for (let i = 0; i < 4; i++) state = settle(state, decide(state, [round()], T0 + i * 5 * MIN).next, true);
    expect(state.weekRuns).toBe(4);
    const result = decide(state, [round()], monday);
    expect(result.actions).toEqual([{ channel: "email", subject: "SkipWait watchdog: all probes green this week (5 runs, 0 outages, 1 packs on sale)", text: expect.any(String) }]);
    state = settle(state, result.next, true);
    expect(state).toMatchObject({ weekRuns: 0, weekOutages: 0, lastWeeklyAt: monday });
    expect(decide(state, [round()], monday + 5 * MIN).actions).toEqual([]);
  });

  it("does not claim a green week when there was an outage", () => {
    let state = settle(initialState(T0), decide(initialState(T0), [round(down), round(down)], T0).next, true);
    state = settle(state, decide(state, [round()], T0 + 10 * MIN).next, true);
    const result = decide(state, [round()], monday);
    const subjects = result.actions.map(a => (a as { subject: string }).subject);
    expect(subjects).toEqual(["SkipWait watchdog weekly: 3 runs, 1 outages, 1 packs on sale"]);
  });
});

describe("failed channel", () => {
  it("leaves the state unchanged so the next run tries again", () => {
    const state = initialState(T0);
    const result = decide(state, [round(down), round(down)], T0);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(settle(state, result.next, false)).toEqual(state);
    const retry = decide(settle(state, result.next, false), [round(down), round(down)], T0 + 5 * MIN);
    expect(retry.actions.map(a => a.channel)).toEqual(["email", "issue"]);
  });
});

describe("content", () => {
  it("no alert holds anything but probe names, status codes and times", () => {
    const secretish = "user@example.com token=abc123 <script>";
    const nasty: Partial<Record<ProbeName, Fetched>> = {
      ready: json(503, { ok: false, state: "failed", error: secretish }),
      catalog: html(500, `<html>${secretish}</html>`),
      "signin-google": res(302, secretish, "text/plain", `https://evil.example/?redirect_uri=${encodeURIComponent(secretish)}`),
      "otp-send": json(500, { error: secretish }),
    };
    let state: WatchState = initialState(T0);
    const texts: string[] = [];
    const open = decide(state, [round(nasty), round(nasty)], T0);
    state = settle(state, open.next, true);
    const remind = decide(state, [round(nasty), round(nasty)], T0 + REMINDER_MS);
    state = settle(state, remind.next, true);
    const recover = decide(state, [round()], T0 + 2 * REMINDER_MS);
    for (const a of [...open.actions, ...remind.actions, ...recover.actions]) {
      texts.push(a.channel === "email" ? `${a.subject}\n${a.text}` : `${a.title}\n${a.body}`);
    }
    expect(texts.length).toBe(6);
    const allowed = /^[A-Za-z0-9 :,()\-.\n]*$/;
    for (const t of texts) {
      expect(t).not.toContain("example");
      expect(t).not.toContain("abc123");
      expect(t).not.toContain("<");
      expect(t, t).toMatch(allowed);
    }
  });
});
