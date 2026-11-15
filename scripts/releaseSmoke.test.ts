// REL-release-verify (D-212): pins every rule of the post-deploy release smoke
// and the release-verify workflow on fixtures. No network.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planCatalogResponseSchema } from "../shared/billingCatalog";
import {
  CATALOG_KEYS,
  DEPLOY_API_WORKFLOW,
  DEPLOY_WEB_WORKFLOW,
  checkAdminGate,
  checkCatalog,
  checkHealth,
  checkHome,
  checkLatency,
  checkReady,
  checkSignedOut,
  checkSitemap,
  evaluatePage,
  expectedApiSha,
  expectedWebSha,
  formatLine,
  incidentShaFor,
  parseJsonBody,
  planVerification,
  releaseIncidentBody,
  releaseIncidentTitle,
  summarize,
  supersededBy,
} from "./releaseSmokeCore.mjs";

const WEB = "a".repeat(40);
const API = "b".repeat(40);
const OLD = "c".repeat(40);
const HTML_ERROR = "<!DOCTYPE html><html><head><title>Error 1101</title></head><body>Worker threw exception</body></html>";
const json = (status: number, value: unknown) => ({ status, body: JSON.stringify(value) });
const html = (status: number, body: string) => ({ status, body });

describe("HTTP checks", () => {
  it("home passes on the expected git-commit meta and fails on another SHA, a missing meta or a 5xx", () => {
    const page = (sha: string) => `<html><head><meta name="git-commit" content="${sha}" /></head></html>`;
    expect(checkHome(html(200, page(WEB)), WEB).ok).toBe(true);
    expect(checkHome(html(200, page(OLD)), WEB)).toMatchObject({ ok: false, detail: expect.stringContaining("expected aaaaaaaa") });
    expect(checkHome(html(200, "<html></html>"), WEB).ok).toBe(false);
    expect(checkHome(html(502, HTML_ERROR), WEB).ok).toBe(false);
    expect(checkHome({ error: "timeout" }, WEB).ok).toBe(false);
  });

  it("health passes on the API SHA and fails on another SHA or an HTML body", () => {
    expect(checkHealth(json(200, { ok: true, commitSha: API }), API).ok).toBe(true);
    expect(checkHealth(json(200, { ok: true, commitSha: OLD }), API).ok).toBe(false);
    expect(checkHealth(html(200, HTML_ERROR), API)).toMatchObject({ ok: false, detail: "body is not JSON" });
  });

  it("ready passes only on 200 state ready", () => {
    expect(checkReady(json(200, { state: "ready" })).ok).toBe(true);
    expect(checkReady(json(503, { state: "validating" })).ok).toBe(false);
    expect(checkReady(json(503, { state: "failed" })).ok).toBe(false);
    expect(checkReady(html(200, HTML_ERROR)).ok).toBe(false);
  });

  it("latency fails on dbRoundTripMs: null (the route answers 200 when the database fails)", () => {
    expect(checkLatency(json(200, { ok: true, dbRoundTripMs: 46 })).ok).toBe(true);
    expect(checkLatency(json(200, { ok: false, dbRoundTripMs: null }))).toMatchObject({ ok: false, detail: "dbRoundTripMs null" });
    expect(checkLatency(json(200, {})).ok).toBe(false);
    expect(checkLatency(html(200, HTML_ERROR)).ok).toBe(false);
  });

  it("catalog fails on HTML instead of JSON and on a missing key the client reads", () => {
    const full = Object.fromEntries(CATALOG_KEYS.map(key => [key, key === "plans" || key === "packs" ? [] : {}]));
    expect(checkCatalog(json(200, full)).ok).toBe(true);
    expect(checkCatalog(html(200, HTML_ERROR))).toMatchObject({ ok: false, detail: "body is not JSON" });
    const { packs: _packs, ...noPacks } = full;
    expect(checkCatalog(json(200, noPacks))).toMatchObject({ ok: false, detail: "missing packs" });
    expect(checkCatalog(json(503, { error: "offline" })).ok).toBe(false);
  });

  it("the catalog keys are exactly the keys of the schema client/src parses with", () => {
    expect([...CATALOG_KEYS].sort()).toEqual(Object.keys(planCatalogResponseSchema.shape).sort());
  });

  it("sitemap passes on 200 with a urlset and fails otherwise", () => {
    expect(checkSitemap(html(200, '<?xml version="1.0"?><urlset xmlns="x"></urlset>')).ok).toBe(true);
    expect(checkSitemap(html(200, HTML_ERROR)).ok).toBe(false);
    expect(checkSitemap(html(500, "")).ok).toBe(false);
  });

  it("the signed-out private API must answer 401 JSON: 200 leaks, 5xx is down", () => {
    expect(checkSignedOut(json(401, { error: "Sign in" })).ok).toBe(true);
    expect(checkSignedOut(json(200, { notifications: [] })).ok).toBe(false);
    expect(checkSignedOut(json(500, { error: "x" })).ok).toBe(false);
    expect(checkSignedOut(html(401, HTML_ERROR)).ok).toBe(false);
  });

  it("the admin sign-in gate must redirect", () => {
    expect(checkAdminGate({ status: 302, body: "" }).ok).toBe(true);
    expect(checkAdminGate({ status: 403, body: "" }).ok).toBe(false);
    expect(checkAdminGate({ status: 502, body: HTML_ERROR }).ok).toBe(false);
  });

  it("parseJsonBody refuses HTML and junk", () => {
    expect(parseJsonBody(HTML_ERROR)).toBeNull();
    expect(parseJsonBody("not json")).toBeNull();
    expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("browser pass", () => {
  it("passes a clean page and the browser's line for an expected 401", () => {
    const check = evaluatePage({
      route: "/",
      responses: [{ status: 200, url: "https://skipwait.me/" }, { status: 401, url: "https://skipwait.me/api/notifications" }],
      consoleErrors: ["Failed to load resource: the server responded with a status of 401 ()"],
    });
    expect(check.ok).toBe(true);
  });

  it("fails on an unexpected console error", () => {
    expect(evaluatePage({ route: "/", consoleErrors: ["TypeError: x is undefined"] })).toMatchObject({ ok: false, detail: expect.stringContaining("console: TypeError") });
    expect(evaluatePage({ route: "/", consoleErrors: ["Failed to load resource: the server responded with a status of 500 ()"] }).ok).toBe(false);
  });

  it("fails on a 5xx response on a public page, naming only the path", () => {
    const check = evaluatePage({ route: "/plans", responses: [{ status: 502, url: "https://skipwait.me/api/plans/catalog?token=secret" }] });
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("502 /api/plans/catalog");
    expect(check.detail).not.toContain("secret");
  });

  it("fails on a page error or a navigation that never finished", () => {
    expect(evaluatePage({ route: "/", pageErrors: ["ReferenceError: boom"] }).ok).toBe(false);
    expect(evaluatePage({ route: "/", navigationError: "Timeout 45000ms exceeded" }).ok).toBe(false);
  });
});

describe("summary", () => {
  it("prints one line per check and fails when any check fails", () => {
    const pass = { name: "a", ok: true, detail: "fine" };
    const fail = { name: "b", ok: false, detail: "broken" };
    expect(formatLine(pass)).toBe("PASS  a — fine");
    expect(formatLine(fail)).toBe("FAIL  b — broken");
    expect(summarize([pass]).ok).toBe(true);
    expect(summarize([pass, fail])).toMatchObject({ ok: false, failing: [fail], lines: ["PASS  a — fine", "FAIL  b — broken"] });
    expect(summarize([]).ok).toBe(false);
  });
});

const run = (over: Record<string, unknown>) => ({
  id: 1,
  name: DEPLOY_WEB_WORKFLOW,
  head_branch: "main",
  head_sha: WEB,
  status: "completed",
  conclusion: "success",
  run_started_at: "2026-10-30T06:00:00Z",
  ...over,
});

describe("expected SHAs", () => {
  it("web comes from the newest successful Deploy Web run on main, never a failed, running, branch or API run", () => {
    const runs = [
      run({ id: 1, head_sha: OLD, run_started_at: "2026-10-30T05:00:00Z" }),
      run({ id: 2, head_sha: WEB, run_started_at: "2026-10-30T06:00:00Z" }),
      run({ id: 3, head_sha: "d".repeat(40), run_started_at: "2026-10-30T07:00:00Z", conclusion: "failure" }),
      run({ id: 4, head_sha: "e".repeat(40), run_started_at: "2026-10-30T08:00:00Z", status: "in_progress", conclusion: null }),
      run({ id: 5, head_sha: "f".repeat(40), run_started_at: "2026-10-30T09:00:00Z", head_branch: "agent/x" }),
      run({ id: 6, head_sha: API, run_started_at: "2026-10-30T10:00:00Z", name: DEPLOY_API_WORKFLOW }),
    ];
    expect(expectedWebSha(runs)).toBe(WEB);
    expect(expectedWebSha([])).toBeNull();
  });

  it("API comes from the api-runtime tag, peeled when annotated", () => {
    expect(expectedApiSha(`${API}\trefs/tags/api-runtime\n`)).toBe(API);
    expect(expectedApiSha(`${OLD}\trefs/tags/api-runtime\n${API}\trefs/tags/api-runtime^{}\n`)).toBe(API);
    expect(expectedApiSha("")).toBeNull();
  });
});

describe("planVerification", () => {
  const tag = `${API}\trefs/tags/api-runtime\n`;
  const webTrigger = run({ id: 10, head_sha: WEB, run_started_at: "2026-10-30T06:00:00Z" });

  it("verifies a successful deploy with both expected SHAs and marks its head SHA", () => {
    expect(planVerification({ event: "workflow_run", trigger: webTrigger, runs: [webTrigger], apiTagOutput: tag })).toEqual({ action: "verify", statusSha: WEB, webSha: WEB, apiSha: API });
  });

  it("a superseded run exits without a status when a newer deploy of the same kind is running", () => {
    const newer = run({ id: 11, head_sha: OLD, status: "in_progress", conclusion: null, run_started_at: "2026-10-30T06:05:00Z" });
    const plan = planVerification({ event: "workflow_run", trigger: webTrigger, runs: [webTrigger, newer], apiTagOutput: tag });
    expect(plan.action).toBe("superseded");
    expect(plan).not.toHaveProperty("statusSha");
  });

  it("an older run still going does not supersede, the other deploy kind running does", () => {
    const older = run({ id: 9, status: "queued", conclusion: null, run_started_at: "2026-10-30T05:00:00Z" });
    expect(supersededBy(webTrigger, [webTrigger, older])).toBeNull();
    const api = run({ id: 12, name: DEPLOY_API_WORKFLOW, status: "in_progress", conclusion: null, run_started_at: "2026-10-30T05:59:00Z" });
    expect(supersededBy(webTrigger, [webTrigger, api])).toBe(api);
  });

  // D-240 (a): replaces "a deploy that did not succeed is left to its Deploy failed issue".
  it.each(["failure", "cancelled", "timed_out"])("a failed deploy (%s) is checked against what is live and never marks its own head verified", conclusion => {
    const NEW = "d".repeat(40);
    const webDone = run({ id: 20, head_sha: WEB, run_started_at: "2026-10-30T05:00:00Z" });
    const failedApi = run({ id: 21, name: DEPLOY_API_WORKFLOW, head_sha: NEW, conclusion, run_started_at: "2026-10-30T06:00:00Z" });
    const plan = planVerification({ event: "workflow_run", trigger: failedApi, runs: [webDone, failedApi], apiTagOutput: tag });
    expect(plan).toMatchObject({ action: "verify", webSha: WEB, apiSha: API });
    expect(plan.statusSha).toBeNull();
    expect(plan.statusSha).not.toBe(NEW);
    expect(incidentShaFor(plan)).toBe(WEB);
    expect(incidentShaFor(plan)).not.toBe(NEW);
  });

  it("a failed web deploy is checked too, at the last successful web head, without marking the failed head", () => {
    const NEW = "d".repeat(40);
    const webDone = run({ id: 20, head_sha: WEB, run_started_at: "2026-10-30T05:00:00Z" });
    const failedWeb = run({ id: 22, head_sha: NEW, conclusion: "failure", run_started_at: "2026-10-30T06:00:00Z" });
    const plan = planVerification({ event: "workflow_run", trigger: failedWeb, runs: [webDone, failedWeb], apiTagOutput: tag });
    expect(plan).toMatchObject({ action: "verify", statusSha: null, webSha: WEB, apiSha: API });
  });

  describe("D-240 (b): a partial deploy checks each side at its own expected SHA", () => {
    const NEW = "d".repeat(40);
    const prevWeb = run({ id: 30, head_sha: WEB, run_started_at: "2026-10-30T05:00:00Z" });

    it("API live at the new SHA, web not: API at NEW, web at the previous successful head", () => {
      const apiOk = run({ id: 31, name: DEPLOY_API_WORKFLOW, head_sha: NEW, run_started_at: "2026-10-30T06:00:00Z" });
      const webFailed = run({ id: 32, head_sha: NEW, conclusion: "failure", run_started_at: "2026-10-30T06:01:00Z" });
      const movedTag = `${NEW}\trefs/tags/api-runtime\n`;
      const runs = [prevWeb, apiOk, webFailed];
      expect(planVerification({ event: "workflow_run", trigger: apiOk, runs, apiTagOutput: movedTag })).toMatchObject({ action: "verify", statusSha: NEW, webSha: WEB, apiSha: NEW });
      const fromWeb = planVerification({ event: "workflow_run", trigger: webFailed, runs, apiTagOutput: movedTag });
      expect(fromWeb).toMatchObject({ action: "verify", statusSha: null, webSha: WEB, apiSha: NEW });
      expect(incidentShaFor(fromWeb)).toBe(WEB);
    });

    it("web live at the new SHA, API not: web at NEW, API at the unmoved tag", () => {
      const webOk = run({ id: 33, head_sha: NEW, run_started_at: "2026-10-30T06:00:00Z" });
      const apiFailed = run({ id: 34, name: DEPLOY_API_WORKFLOW, head_sha: NEW, conclusion: "failure", run_started_at: "2026-10-30T06:01:00Z" });
      const runs = [prevWeb, webOk, apiFailed];
      expect(planVerification({ event: "workflow_run", trigger: webOk, runs, apiTagOutput: tag })).toMatchObject({ action: "verify", statusSha: NEW, webSha: NEW, apiSha: API });
      const fromApi = planVerification({ event: "workflow_run", trigger: apiFailed, runs, apiTagOutput: tag });
      expect(fromApi).toMatchObject({ action: "verify", statusSha: null, webSha: NEW, apiSha: API });
      expect(fromApi.apiSha).not.toBe(NEW);
    });
  });

  describe("D-240 (c): supersession and one incident per live state", () => {
    const NEW = "d".repeat(40);
    const webDone = run({ id: 40, head_sha: WEB, run_started_at: "2026-10-30T05:00:00Z" });
    const failedApi = run({ id: 41, name: DEPLOY_API_WORKFLOW, head_sha: NEW, conclusion: "failure", run_started_at: "2026-10-30T06:00:00Z" });

    it.each(["queued", "in_progress"])("a newer %s run of the same kind supersedes a failed completion: no status, no issue", status => {
      const newer = run({ id: 42, name: DEPLOY_API_WORKFLOW, head_sha: OLD, status, conclusion: null, run_started_at: "2026-10-30T06:05:00Z" });
      const plan = planVerification({ event: "workflow_run", trigger: failedApi, runs: [webDone, failedApi, newer], apiTagOutput: tag });
      expect(plan.action).toBe("superseded");
      expect(plan).not.toHaveProperty("statusSha");
      expect(incidentShaFor(plan)).toBeNull();
    });

    it("any running run of the other kind supersedes a failed completion", () => {
      const otherKind = run({ id: 43, head_sha: OLD, status: "in_progress", conclusion: null, run_started_at: "2026-10-30T04:00:00Z" });
      const plan = planVerification({ event: "workflow_run", trigger: failedApi, runs: [webDone, failedApi, otherKind], apiTagOutput: tag });
      expect(plan.action).toBe("superseded");
      expect(incidentShaFor(plan)).toBeNull();
    });

    it("two failed completions over the same live SHAs name one incident, not two", () => {
      const failedApiAgain = run({ id: 44, name: DEPLOY_API_WORKFLOW, head_sha: OLD, conclusion: "timed_out", run_started_at: "2026-10-30T07:00:00Z" });
      const failedWeb = run({ id: 45, head_sha: NEW, conclusion: "cancelled", run_started_at: "2026-10-30T07:30:00Z" });
      const runs = [webDone, failedApi, failedApiAgain, failedWeb];
      const titles = [failedApi, failedApiAgain, failedWeb].map(trigger => {
        const plan = planVerification({ event: "workflow_run", trigger, runs, apiTagOutput: tag });
        expect(plan).toMatchObject({ action: "verify", statusSha: null, webSha: WEB, apiSha: API });
        return releaseIncidentTitle(incidentShaFor(plan));
      });
      expect(new Set(titles)).toEqual(new Set([releaseIncidentTitle(WEB)]));
    });
  });

  it("a dispatch marks the SHA it was given", () => {
    expect(planVerification({ event: "workflow_dispatch", dispatchSha: OLD, runs: [webTrigger], apiTagOutput: tag })).toMatchObject({ action: "verify", statusSha: OLD });
  });

  it("fails loudly when an expected SHA cannot be found", () => {
    expect(planVerification({ event: "workflow_dispatch", dispatchSha: OLD, runs: [], apiTagOutput: tag }).action).toBe("fail");
    expect(planVerification({ event: "workflow_dispatch", dispatchSha: OLD, runs: [webTrigger], apiTagOutput: "" }).action).toBe("fail");
  });
});

describe("incident text", () => {
  it("names the release by its short SHA and carries the failing lines, no ids beyond the SHAs", () => {
    expect(releaseIncidentTitle(WEB)).toBe("Release not verified: aaaaaaaa");
    const body = releaseIncidentBody({ sha: WEB, webSha: WEB, apiSha: API, lines: ["FAIL  x — y"], runUrl: "https://github.com/o/r/actions/runs/1" });
    expect(body).toContain("FAIL  x — y");
    expect(body).toContain(API);
  });
});

const workflowText = (file: string) => readFileSync(`.github/workflows/${file}`, "utf8");
const nameLine = (text: string) => /^name:\s*(.+)$/m.exec(text)?.[1]?.trim();

describe("release-verify.yml", () => {
  const wf = existsSync(".github/workflows/release-verify.yml") ? workflowText("release-verify.yml") : "";

  it("listens to the exact names of both deploy workflows", () => {
    const apiName = nameLine(workflowText("deploy-api.yml"));
    const webName = nameLine(workflowText("deploy-pages.yml"));
    expect(apiName).toBe(DEPLOY_API_WORKFLOW);
    expect(webName).toBe(DEPLOY_WEB_WORKFLOW);
    const listed = /workflows:\s*\[([^\]]*)\]/.exec(wf)?.[1] ?? "";
    const names = [...listed.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    expect(names.sort()).toEqual([apiName, webName].sort());
  });

  it("runs on completed main deploys and on dispatch with a SHA input", () => {
    expect(wf).toMatch(/workflow_run:[\s\S]*types:\s*\[completed\][\s\S]*branches:\s*\[main\]/);
    expect(wf).toMatch(/workflow_dispatch:[\s\S]*inputs:[\s\S]*sha:/);
  });

  it("sets the release/verified status and opens one incident per release", () => {
    expect(wf).toContain("statuses: write");
    expect(wf).toContain("issues: write");
    expect(wf).toContain("release/verified");
    expect(wf).toContain("gh label create incident --color B60205 --force");
  });

  it("D-240: status steps run only with a status SHA, and the incident is named by the planned incident SHA", () => {
    for (const step of ["Mark the release pending", "Release verified"]) {
      const block = wf.slice(wf.indexOf(`- name: ${step}`), wf.indexOf("- name:", wf.indexOf(`- name: ${step}`) + 1));
      expect(block).toMatch(/if: [^\n]*steps\.plan\.outputs\.status_sha != ''/);
    }
    expect(wf).toContain("INCIDENT_SHA: ${{ steps.plan.outputs.incident_sha }}");
    expect(wf).toMatch(/title="Release not verified: \$\{release:0:8\}"/);
    expect(wf).toMatch(/release="\$\{INCIDENT_SHA/);
  });

  it("never derives a SHA from path filters", () => {
    expect(wf).not.toMatch(/git log[^\n]*--\s/);
  });
});

describe("deploy workflow notices", () => {
  it.each(["deploy-api.yml", "deploy-pages.yml"])("%s no longer comments on whichever issue is newest", file => {
    const text = workflowText(file);
    expect(text).not.toMatch(/state: 'all', per_page: 1/);
    expect(text).toContain("Deploy failed: ");
    expect(text).toContain("'incident'");
  });

  it("deploy-api.yml keeps the D-238 shape: id: deploy, both verify steps runtime-only, marker unchanged", () => {
    const text = workflowText("deploy-api.yml");
    expect(text).toMatch(/- name: Deploy container image \+ worker\n\s+id: deploy\n\s+if: steps\.changes\.outputs\.classification == 'runtime'\n/);
    for (const step of ["Verify administrator sign-in gate", "Verify active Cloudflare container release"]) {
      expect(text).toMatch(new RegExp(`- name: ${step}\\n(?:\\s+#[^\\n]*\\n)*\\s+if: steps\\.changes\\.outputs\\.classification == 'runtime'\\n`));
    }
    expect(text).not.toMatch(/steps\.deploy\.outcome/);
    expect(text).toContain(
      [
        "      - name: Update deployed runtime marker",
        "        if: steps.changes.outputs.classification == 'runtime'",
        "        run: |",
        '          git tag -f api-runtime "${{ github.sha }}"',
        "          git push -f origin refs/tags/api-runtime",
        "",
      ].join("\n"),
    );
    const marker = text.indexOf("- name: Update deployed runtime marker");
    expect(text.indexOf("- name: Verify active Cloudflare container release")).toBeLessThan(marker);
    expect(text.indexOf("- name: Verify administrator sign-in gate")).toBeLessThan(marker);
  });
});
