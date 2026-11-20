// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readLiveRelease } from "./nextTaskReleaseRead.mjs";
import { releaseLandingHold } from "./nextTaskCore.mjs";

const WEB = "a".repeat(40), API = "b".repeat(40), HEAD = "c".repeat(40), OLD = "d".repeat(40);
const DATE = "2026-11-20T06:00:00Z";
const workflow = (head_sha: string, id = 1) => ({ id, head_sha, head_branch: "main", status: "completed", conclusion: "success", created_at: DATE });
const issue = (number: number, title = "Incident") => ({ number, title, state: "open" });

function fixture() {
  const calls: string[] = [], warnings: string[] = [];
  const data = new Map<string, object>([
    ["/actions/workflows/deploy-api.yml/runs?branch=main&per_page=100", { workflow_runs: [workflow(API)] }],
    ["/actions/workflows/deploy-pages.yml/runs?branch=main&per_page=100", { workflow_runs: [workflow(WEB)] }],
    ["/git/ref/tags/api-runtime", { object: { type: "commit", sha: API } }],
    ["/issues?state=open&labels=incident&per_page=100&page=1", []],
    ["/issues?state=open&per_page=100&page=1", []],
    [`/commits/${WEB}/status?per_page=100`, { sha: WEB, statuses: [{ context: "release/verified", state: "success", created_at: DATE, updated_at: DATE }] }],
    [`/commits/${WEB}/pulls?per_page=100`, [{ number: 3, merge_commit_sha: WEB, merged_at: DATE,
      head: { sha: HEAD, ref: "agent/queue/test" }, base: { ref: "main", repo: { full_name: "o/r" } } }]],
    [`/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=10`, { workflow_runs: [workflow(HEAD, 4)] }],
    ["/actions/runs/4/jobs?filter=latest&per_page=100", { jobs: [{ name: "typecheck", steps: [{ name: "Review gate (independent Tier 1 pass)", status: "completed", conclusion: "success" }] }] }],
  ]);
  const publicData = new Map([
    ["https://skipwait.me/", `<html><head><meta name="git-commit" content="${WEB}"></head></html>`],
    ["https://skipwait.me/api/health", JSON.stringify({ commitSha: API })],
    ["https://skipwait.me/api/health/jobs", JSON.stringify({ ok: true })],
  ]);
  const github = async (_repo: string, route: string) => {
    calls.push(route);
    if (!data.has(route)) throw new Error(`unexpected fixture route ${route}`);
    return data.get(route);
  };
  const fetchImpl: typeof fetch = async (url, options) => {
    expect(options?.redirect).toBe("error");
    expect(options?.headers).toBeUndefined(); // GitHub credentials never cross to the public origin.
    calls.push(String(url));
    return new Response(publicData.get(String(url)) ?? "missing", { status: publicData.has(String(url)) ? 200 : 404 });
  };
  const tryGit = (...args: string[]) => {
    if (args[0] === "rev-list") return `${WEB} ${HEAD} ${OLD}`;
    if (args[0] === "merge-base" || args[0] === "for-each-ref") return "";
    throw new Error("unexpected fixture git read");
  };
  const read = () => readLiveRelease({ repo: "o/r", github, mainCi: { state: "green", sha: WEB }, tryGit,
    fetchImpl, warn: (message: string) => warnings.push(message) });
  return { calls, warnings, data, publicData, read, github, fetchImpl, tryGit };
}

describe("the live release adapter reads exact, independently deployed evidence", () => {
  it("all seven are green from real provider-shaped fixtures, using only reads", async () => {
    const f = fixture();
    const result = await f.read();
    expect(result.lights.map(l => l.state)).toEqual(Array(7).fill("green"));
    expect(result.sha).toBe(WEB);
    expect(result.apiSha).toBe(API);
    expect(f.warnings).toEqual([]);
    expect(f.calls).toContain(`/commits/${WEB}/status?per_page=100`);
    expect(f.calls).toContain(`/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=10`);
  });

  it("does not compare the API to web or current main and ignores a newer failed web as an expected identity", async () => {
    const f = fixture();
    f.data.set("/actions/workflows/deploy-pages.yml/runs?branch=main&per_page=100", { workflow_runs: [
      { ...workflow(OLD, 2), conclusion: "failure", created_at: "2026-11-20T07:00:00Z" }, workflow(WEB),
    ] });
    const result = await f.read();
    expect(result.lights[3].state).toBe("red");
    expect(result.lights[4].state).toBe("green");
    expect(releaseLandingHold(result)).toMatchObject({ sha: WEB, lights: [4] });
  });

  it("resolves an annotated api-runtime tag to the commit", async () => {
    const f = fixture();
    f.data.set("/git/ref/tags/api-runtime", { object: { type: "tag", sha: OLD } });
    f.data.set(`/git/tags/${OLD}`, { object: { type: "commit", sha: API } });
    expect((await f.read()).lights[4].state).toBe("green");
  });

  it.each(["/git/ref/tags/api-runtime", "/actions/workflows/deploy-api.yml/runs?branch=main&per_page=100"])
  ("unreadable %s is unknown, not green or red", async route => {
    const f = fixture();
    f.data.delete(route);
    const result = await f.read();
    expect(result.lights[route.includes("api-runtime") ? 4 : 3].state).toBe("unknown");
    expect(releaseLandingHold(result)).toBeNull();
    expect(f.warnings.length).toBeGreaterThan(0);
  });

  it("rejects malformed health JSON, a SPA fallback and a missing heartbeat endpoint", async () => {
    const f = fixture();
    f.publicData.set("https://skipwait.me/api/health", "<html>SPA</html>");
    f.publicData.delete("https://skipwait.me/api/health/jobs");
    const result = await f.read();
    expect(result.lights[4].state).toBe("unknown");
    expect(result.lights[5].state).toBe("unknown");
    expect(releaseLandingHold(result)).toBeNull();
  });

  it("paginates watchdog and incident issues, excludes PRs and catches a later-page incident", async () => {
    const f = fixture();
    f.data.set("/issues?state=open&labels=incident&per_page=100&page=1", Array.from({ length: 100 }, (_, i) => ({ ...issue(i + 1), pull_request: {} })));
    f.data.set("/issues?state=open&labels=incident&per_page=100&page=2", [issue(101)]);
    f.data.set("/issues?state=open&per_page=100&page=1", Array.from({ length: 100 }, (_, i) => issue(i + 1, "Other")));
    f.data.set("/issues?state=open&per_page=100&page=2", [issue(102, "SkipWait DOWN: synthetic fixture")]);
    const result = await f.read();
    expect(result.lights[5].state).toBe("red");
    expect(result.lights[6].detail).toBe("open incident issues: 1");
    expect(result.incidents).toEqual([102, 101]);
  });

  it("a later unreadable page cannot erase a confirmed incident", async () => {
    const f = fixture();
    f.data.set("/issues?state=open&labels=incident&per_page=100&page=1", Array.from({ length: 100 }, (_, i) => issue(i + 1)));
    const result = await f.read();
    expect(result.lights[6].state).toBe("red");
    expect(result.lights[6].detail).toBe("open incident issues: at least 100");
    expect(f.warnings.some(w => w.includes("incident issues unreadable"))).toBe(true);
  });

  it("an incomplete scan with no matching incidents is unknown, never a false zero", async () => {
    const f = fixture();
    f.data.set("/issues?state=open&labels=incident&per_page=100&page=1", Array.from({ length: 100 }, (_, i) => ({ ...issue(i + 1), pull_request: {} })));
    expect((await f.read()).lights[6].state).toBe("unknown");
  });

  it("a stale combined-status SHA is unknown rather than an authoritative failure", async () => {
    const f = fixture();
    f.data.set(`/commits/${WEB}/status?per_page=100`, { sha: OLD, statuses: [] });
    expect((await f.read()).lights[4].state).toBe("unknown");
  });

  it("a pending exact release verification is not a failed release", async () => {
    const f = fixture();
    f.data.set(`/commits/${WEB}/status?per_page=100`, { sha: WEB, statuses: [{ context: "release/verified", state: "pending", created_at: DATE, updated_at: DATE }] });
    expect((await f.read()).lights[4].state).toBe("unknown");
  });

  it("governance unknown cannot hide known failed heartbeats", async () => {
    const f = fixture();
    f.data.delete(`/commits/${WEB}/pulls?per_page=100`);
    f.publicData.set("https://skipwait.me/api/health/jobs", JSON.stringify({ ok: false }));
    const result = await f.read();
    expect(result.lights[1].state).toBe("unknown");
    expect(result.lights[5].state).toBe("red");
    expect(releaseLandingHold(result)?.lights).toEqual([6]);
  });
});
