// @vitest-environment node
// OPS-live-qa-runner (D-373 (3)): signed-in live QA runs in GitHub Actions with the demo accounts, so no session needs
// the passwords. Everything here runs on fixtures: a fake browser, a fake fetch and no network.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNTS, ORIGIN, ROUTES, VIEWPORTS, captureName, exitCodeOf, judgeRoute, markdownOf, parseRoles, redactor, runLiveQa, signInMessage,
} from "./live-qa-signed-in.mjs";

const root = path.resolve(__dirname, "..");
const SOURCE = readFileSync(path.join(root, "scripts/live-qa-signed-in.mjs"), "utf8");
const WORKFLOW = readFileSync(path.join(root, ".github/workflows/live-qa.yml"), "utf8");
const SEEKER_PW = "seeker-fixture-password-0001";
const REFERRER_PW = "referrer-fixture-password-02";
const API_SHA = "a".repeat(40);
const WEB_SHA = "b".repeat(40);

type PageScript = { status?: number; pageError?: string; consoleError?: string; failed5xx?: boolean; sideways?: boolean; finalPath?: string; throws?: string };

/** A fake Playwright: records every call so the tests can prove what was (and was not) requested. */
function harness({ signIn = { seeker: 200, referrer: 200 } as Record<string, number>, pages = {} as Record<string, PageScript>, echoPasswordInError = false } = {}) {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const lines: string[] = [];
  const summaries: string[] = [];
  const outputs: string[] = [];
  const launch = async () => ({
    newContext: async () => {
      let role = "";
      return {
        request: {
          post: async (url: string, opts: { data: { email: string; password: string } }) => {
            role = opts.data.email.split("@")[0];
            calls.push(`POST ${url} ${opts.data.email}`);
            return { status: () => signIn[role] };
          },
        },
        newPage: async () => {
          const handlers: Record<string, (arg: unknown) => void> = {};
          let width = 0, current = "";
          return {
            setViewportSize: async (v: { width: number }) => { width = v.width; },
            on: (event: string, fn: (arg: unknown) => void) => { handlers[event] = fn; },
            goto: async (url: string) => {
              calls.push(`GOTO ${url} ${width}`);
              current = new URL(url).pathname;
              const s = pages[`${role}${current}@${width}`] ?? pages[`${role}${current}`] ?? {};
              if (s.throws) throw new Error(echoPasswordInError ? `${s.throws} ${SEEKER_PW}` : s.throws);
              if (s.pageError) handlers.pageerror?.(new Error(echoPasswordInError ? `${s.pageError} ${SEEKER_PW}` : s.pageError));
              if (s.consoleError) handlers.console?.({ type: () => "error", text: () => s.consoleError });
              if (s.failed5xx) handlers.response?.({ status: () => 502, url: () => `${ORIGIN}/api/x?token=abc` });
              if (s.finalPath) current = s.finalPath;
              return { status: () => s.status ?? 200 };
            },
            waitForLoadState: async () => {},
            title: async () => `Title ${current}`,
            url: () => `${ORIGIN}${current}`,
            evaluate: async () => Boolean((pages[`${role}${current}@${width}`] ?? pages[`${role}${current}`] ?? {}).sideways),
            screenshot: async (o: { path: string }) => { files.set(o.path, "png"); },
            close: async () => {},
          };
        },
        close: async () => {},
      };
    },
    close: async () => {},
  });
  const io = {
    launch,
    fetchText: async (url: string) => {
      calls.push(`FETCH ${url}`);
      if (url === `${ORIGIN}/api/health/ready`) return JSON.stringify({ ok: true, state: "ready", service: "skipwait-api", commitSha: API_SHA });
      if (url === `${ORIGIN}/`) return `<html><head><meta name="git-commit" content="${WEB_SHA}"></head></html>`;
      throw new Error(`unexpected fetch ${url}`);
    },
    mkdir: async () => {},
    writeFile: async (p: string, text: string) => { files.set(p, text); },
    appendSummary: async (text: string) => { summaries.push(text); },
    setOutput: async (text: string) => { outputs.push(text); },
    log: (line: string) => { lines.push(line); },
    outDir: "live-qa",
  };
  return { io, calls, files, lines, summaries, outputs };
}
const run = (h: ReturnType<typeof harness>, extra: object = {}) =>
  runLiveQa({ roles: ["seeker", "referrer"], passwords: { seeker: SEEKER_PW, referrer: REFERRER_PW }, trigger: "workflow_dispatch", ...h.io, ...extra });
const everything = (h: ReturnType<typeof harness>) => [...h.lines, ...h.summaries, ...h.outputs, ...h.files.values()].join("\n");

describe("constants", () => {
  it("pins the origin to https://skipwait.me and reads nothing that could change it", () => {
    expect(ORIGIN).toBe("https://skipwait.me");
    expect(SOURCE).toContain('export const ORIGIN = "https://skipwait.me";');
    const envNames = [...SOURCE.matchAll(/process\.env\.([A-Z_]+)/g)].map(m => m[1]);
    expect([...new Set(envNames)].sort()).toEqual(["GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "LIVE_QA_ROLES", "LIVE_QA_TRIGGER", "REVIEWER_REFERRER_PASSWORD", "REVIEWER_SEEKER_PASSWORD"]);
    expect(SOURCE).not.toMatch(/process\.argv\[[2-9]\]/);
    expect(SOURCE).not.toMatch(/https?:\/\/(?!skipwait\.me")/);
  });
  it("uses only the two public demo accounts, never admin", () => {
    expect(ACCOUNTS).toEqual({
      seeker: { email: "seeker@reviewer.skipwait.me", secret: "REVIEWER_SEEKER_PASSWORD" },
      referrer: { email: "referrer@reviewer.skipwait.me", secret: "REVIEWER_REFERRER_PASSWORD" },
    });
  });
  it("captures the packet's routes at 1280 and 390 and never /admin", () => {
    expect(ROUTES.seeker).toEqual(["/plans", "/billing", "/requests", "/ask", "/explore", "/alerts", "/inbox", "/messages", "/profile", "/settings", "/invite", "/support"]);
    expect(ROUTES.referrer).toEqual(["/referrer-home", "/queue", "/referrer/impact", "/inbox", "/invite", "/profile", "/settings"]);
    expect(VIEWPORTS).toEqual([{ width: 1280, height: 900 }, { width: 390, height: 844 }]);
    expect([...ROUTES.seeker, ...ROUTES.referrer].some(r => r.startsWith("/admin"))).toBe(false);
    const app = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
    for (const route of new Set([...ROUTES.seeker, ...ROUTES.referrer])) expect(app, route).toContain(`path="${route}"`);
  });
  it("parses the roles input and refuses anything else", () => {
    expect(parseRoles(undefined)).toEqual(["seeker", "referrer"]);
    expect(parseRoles("both")).toEqual(["seeker", "referrer"]);
    expect(parseRoles("seeker")).toEqual(["seeker"]);
    expect(parseRoles("referrer")).toEqual(["referrer"]);
    expect(() => parseRoles("admin")).toThrow(/both, seeker or referrer/);
  });
  it("names captures after the route and width", () => {
    expect(captureName("/plans", 1280)).toBe("plans-1280.png");
    expect(captureName("/referrer/impact", 390)).toBe("referrer-impact-390.png");
  });
});

describe("rules", () => {
  it("explains each sign-in failure", () => {
    expect(signInMessage(401)).toMatch(/do not match the live release.*reset/);
    expect(signInMessage(404)).toMatch(/REVIEWER_LOGIN_ENABLED is off/);
    expect(signInMessage(429)).toMatch(/rate limit/);
    expect(signInMessage(503)).toContain("503");
  });
  it("fails a route only on a 5xx document, an uncaught error or a failed navigation; lists the rest as findings", () => {
    const ok = { route: "/plans", width: 1280, status: 200, pageErrors: [], consoleErrors: [], failedRequests: [], sideways: false, finalPath: "/plans", navigationError: null };
    expect(judgeRoute(ok)).toEqual({ fails: [], findings: [] });
    expect(judgeRoute({ ...ok, status: 500 }).fails).toEqual(["document answered 500"]);
    expect(judgeRoute({ ...ok, pageErrors: ["boom"] }).fails).toEqual(["uncaught error: boom"]);
    expect(judgeRoute({ ...ok, navigationError: "timeout" }).fails).toEqual(["navigation failed: timeout"]);
    expect(judgeRoute({ ...ok, status: 404, consoleErrors: ["x"], failedRequests: ["502 /api/x"], sideways: true, finalPath: "/sign-in" })).toEqual({
      fails: [],
      findings: ["document answered 404", "1 console error", "1 request answered 5xx", "scrolls sideways at 390", "redirected to /sign-in"],
    });
  });
  it("exits 1 for a failed sign-in or a failing route, 0 otherwise", () => {
    const route = (fails: string[]) => ({ fails, findings: ["1 console error"] });
    expect(exitCodeOf({ roles: [{ signIn: { ok: true }, routes: [route([])] }] })).toBe(0);
    expect(exitCodeOf({ roles: [{ signIn: { ok: false }, routes: [] }] })).toBe(1);
    expect(exitCodeOf({ roles: [{ signIn: { ok: true }, routes: [route(["document answered 500"])] }] })).toBe(1);
  });
  it("redacts every password occurrence", () => {
    expect(redactor([SEEKER_PW, ""])(`x ${SEEKER_PW} y ${SEEKER_PW}`)).toBe("x [redacted] y [redacted]");
  });
});

describe("runLiveQa", () => {
  it("signs in once per role, captures every route at both widths and records the release", async () => {
    const h = harness();
    const { code, summary } = await run(h);
    expect(code).toBe(0);
    expect(h.calls.filter(c => c.startsWith("POST"))).toEqual([
      `POST ${ORIGIN}/api/auth/reviewer/sign-in seeker@reviewer.skipwait.me`,
      `POST ${ORIGIN}/api/auth/reviewer/sign-in referrer@reviewer.skipwait.me`,
    ]);
    expect(h.calls.filter(c => c.startsWith("GOTO"))).toHaveLength((ROUTES.seeker.length + ROUTES.referrer.length) * 2);
    expect(h.calls.every(c => !c.includes(" ") || c.split(" ")[1].startsWith(ORIGIN))).toBe(true);
    expect(summary.release).toEqual({ api: API_SHA, web: WEB_SHA });
    expect(h.files.has(path.join("live-qa", "referrer", "referrer-impact-390.png"))).toBe(true);
    const written = JSON.parse(h.files.get(path.join("live-qa", "summary.json")) ?? "{}");
    expect(written.roles.map((r: { role: string }) => r.role)).toEqual(["seeker", "referrer"]);
    expect(h.outputs).toEqual([`web_sha=${WEB_SHA}`]);
    expect(h.summaries.join("")).toContain("| seeker | /plans | 1280 | 200 |");
  });

  it("stops a role at a failed sign-in, never retries, and still runs the other role", async () => {
    const h = harness({ signIn: { seeker: 401, referrer: 200 } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(h.calls.filter(c => c.includes("seeker@"))).toHaveLength(1);
    expect(h.calls.some(c => c.startsWith("GOTO") && ROUTES.seeker.includes(new URL(c.split(" ")[1]).pathname) && !ROUTES.referrer.includes(new URL(c.split(" ")[1]).pathname))).toBe(false);
    expect(summary.roles[0].signIn).toMatchObject({ ok: false, status: 401 });
    expect(h.lines.join("\n")).toMatch(/seeker: sign-in failed \(401\).*reset/);
    expect(summary.roles[1].routes).toHaveLength(ROUTES.referrer.length * 2);
  });

  it("never prints, writes or summarises a password, even when an error message echoes one", async () => {
    const h = harness({ pages: { "seeker/plans": { pageError: "oops" }, "seeker/billing": { throws: "net::ERR" } }, echoPasswordInError: true });
    const { code } = await run(h);
    expect(code).toBe(1);
    const all = everything(h);
    expect(all).not.toContain(SEEKER_PW);
    expect(all).not.toContain(REFERRER_PW);
    expect(all).toContain("[redacted]");
    expect(all).not.toContain("token=abc");
  });

  it("fails on a 5xx document or an uncaught error, but only lists console errors and sideways scroll", async () => {
    const findingsOnly = harness({ pages: { "seeker/plans@390": { sideways: true, consoleError: "warn" }, "referrer/queue": { failed5xx: true } } });
    expect((await run(findingsOnly)).code).toBe(0);
    expect(findingsOnly.summaries.join("")).toContain("scrolls sideways at 390");
    const fivexx = harness({ pages: { "referrer/queue": { status: 502 } } });
    expect((await run(fivexx)).code).toBe(1);
  });

  it("skips quietly after a release until the owner adds the secrets, but fails a deliberate run", async () => {
    const after = harness();
    const skipped = await run(after, { passwords: { seeker: "", referrer: "" }, trigger: "workflow_run" });
    expect(skipped.code).toBe(0);
    expect(after.lines.join("\n")).toMatch(/::notice::live QA skipped: REVIEWER_SEEKER_PASSWORD and REVIEWER_REFERRER_PASSWORD not set/);
    expect(after.calls).toEqual([]);
    const manual = harness();
    const refused = await run(manual, { passwords: { seeker: SEEKER_PW, referrer: "" }, trigger: "workflow_dispatch" });
    expect(refused.code).toBe(1);
    expect(manual.lines.join("\n")).toMatch(/::error::REVIEWER_REFERRER_PASSWORD not set/);
    expect(manual.calls).toEqual([]);
  });

  it("runs one role on request", async () => {
    const h = harness();
    const { summary } = await run(h, { roles: ["referrer"], passwords: { seeker: "", referrer: REFERRER_PW } });
    expect(summary.roles.map((r: { role: string }) => r.role)).toEqual(["referrer"]);
    expect(h.calls.some(c => c.includes("seeker@"))).toBe(false);
  });

  it("renders a Markdown table with the release line", () => {
    const md = markdownOf({ origin: ORIGIN, release: { api: API_SHA, web: WEB_SHA }, roles: [{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [{ route: "/plans", width: 1280, status: 200, title: "Plans", fails: [], findings: [] }] }] });
    expect(md).toContain(`web \`${WEB_SHA.slice(0, 8)}\``);
    expect(md).toContain("| seeker | /plans | 1280 | 200 | Plans | ok |");
  });
});

describe("workflow", () => {
  it("runs on demand and after a successful production release on main, never on push or pull_request", () => {
    expect(WORKFLOW).toMatch(/^on:\n  workflow_dispatch:\n/m);
    expect(WORKFLOW).toMatch(/roles:[\s\S]*options: \[both, seeker, referrer\][\s\S]*default: both/);
    expect(WORKFLOW).toContain('workflows: ["Deploy API (Cloudflare Containers)", "Deploy Web (Cloudflare Pages)"]');
    expect(WORKFLOW).toContain("branches: [main]");
    expect(WORKFLOW).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(WORKFLOW).not.toMatch(/^\s+(push|pull_request|pull_request_target):/m);
  });
  it("reads the secrets only through env, masks them first and never puts them in a command", () => {
    const uses = WORKFLOW.match(/secrets\.REVIEWER_(SEEKER|REFERRER)_PASSWORD/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    expect(WORKFLOW).not.toMatch(/run:[^\n]*secrets\./);
    expect(WORKFLOW).not.toMatch(/with:[\s\S]{0,200}secrets\.REVIEWER/);
    const mask = WORKFLOW.indexOf("::add-mask::");
    expect(mask).toBeGreaterThan(0);
    expect(mask).toBeLessThan(WORKFLOW.indexOf("node scripts/live-qa-signed-in.mjs"));
  });
  it("keeps the job narrow: read-only token, one run at a time, 20 minutes, main, the artifact for 14 days", () => {
    expect(WORKFLOW).toMatch(/permissions:\n\s+contents: read/);
    expect(WORKFLOW).toMatch(/concurrency:\n\s+group: live-qa\n\s+cancel-in-progress: false/);
    expect(WORKFLOW).toContain("timeout-minutes: 20");
    expect(WORKFLOW).toContain("ref: main");
    expect(WORKFLOW).toContain("pnpm exec playwright install --with-deps chromium");
    expect(WORKFLOW).toMatch(/name: live-qa-\$\{\{ steps\.qa\.outputs\.web_sha \|\| github\.run_id \}\}/);
    expect(WORKFLOW).toContain("retention-days: 14");
    expect(WORKFLOW).not.toContain("REVIEWER_ALLOW_ADMIN");
    expect(WORKFLOW).not.toMatch(/https?:\/\/(?!skipwait\.me)/);
  });
});
