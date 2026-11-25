import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideCatchUp, liveShaOf, matchesAnyPath, webPathsOf } from "./deployWebCatchUp.mjs";

// DEPLOY-web-catch-up (D-388): a web deploy refused while main was red ships by itself once main is green.
const workflowText = (file: string) => readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
const PAGES = workflowText("deploy-pages.yml");
const CATCH_UP = workflowText("deploy-web-catch-up.yml");

const LIVE = "a".repeat(40);
const HEAD = "b".repeat(40);
const base = {
  ciConclusion: "success",
  ciEvent: "push",
  ciBranch: "main",
  ciHead: HEAD,
  mainTip: HEAD,
  liveSha: LIVE,
  liveIsAncestor: true,
  changedFiles: ["client/src/pages/MyRequests.tsx"],
  paths: webPathsOf(PAGES),
  activeDeployForHead: false,
};

describe("the owed-deploy decision", () => {
  it("deploys when the live web is behind and a web path changed", () => {
    expect(decideCatchUp(base)).toMatchObject({ deploy: true });
  });
  it("skips when only docs changed since the live commit", () => {
    expect(decideCatchUp({ ...base, changedFiles: ["docs/DEPLOY.md", "README.md"] })).toMatchObject({ deploy: false, reason: expect.stringMatching(/no web-path change/) });
  });
  it("skips when the live web already carries the commit", () => {
    expect(decideCatchUp({ ...base, liveSha: HEAD })).toMatchObject({ deploy: false, reason: expect.stringMatching(/already live/) });
  });
  it("skips with a notice when the live commit is not an ancestor", () => {
    expect(decideCatchUp({ ...base, liveIsAncestor: false })).toMatchObject({ deploy: false, notice: true, reason: expect.stringMatching(/not an ancestor/) });
  });
  it.each([
    [{ ciConclusion: "failure" }, /concluded failure/],
    [{ ciConclusion: "cancelled" }, /concluded cancelled/],
    [{ ciEvent: "pull_request" }, /not a push to main/],
    [{ ciEvent: "workflow_dispatch" }, /not a push to main/],
    [{ ciBranch: "feature" }, /not a push to main/],
  ])("skips a CI run that is not a green push to main (%o)", (patch, reason) => {
    expect(decideCatchUp({ ...base, ...patch })).toMatchObject({ deploy: false, reason: expect.stringMatching(reason) });
  });
  it("skips when main has moved past the CI head, so the newer commit's own CI decides", () => {
    expect(decideCatchUp({ ...base, mainTip: "c".repeat(40) })).toMatchObject({ deploy: false, reason: expect.stringMatching(/moved on/) });
  });
  it("skips when a Deploy Web run for this commit is already queued or running", () => {
    expect(decideCatchUp({ ...base, activeDeployForHead: true })).toMatchObject({ deploy: false, reason: expect.stringMatching(/already queued or running/) });
  });
  it("skips with a notice when the live commit cannot be read", () => {
    expect(decideCatchUp({ ...base, liveSha: null })).toMatchObject({ deploy: false, notice: true, reason: expect.stringMatching(/could not read/) });
  });
});

describe("path matching reads the Deploy Web push filter", () => {
  it("takes the list from deploy-pages.yml push.paths, comments skipped", () => {
    const paths = webPathsOf(PAGES);
    expect(paths).toContain("client/**");
    expect(paths).toContain("shared/**");
    expect(paths).toContain("scripts/prerenderSeo.ts");
    expect(paths).toContain(".github/workflows/deploy-pages.yml");
    expect(paths.some(p => p.startsWith("#"))).toBe(false);
  });
  it("matches ** across folders and exact files only exactly", () => {
    const paths = webPathsOf(PAGES);
    expect(matchesAnyPath("client/src/a/b.tsx", paths)).toBe(true);
    expect(matchesAnyPath("package.json", paths)).toBe(true);
    expect(matchesAnyPath("server/db.ts", paths)).toBe(false);
    expect(matchesAnyPath("scripts/prerenderSeo.test.ts", paths)).toBe(false);
    expect(matchesAnyPath("docs/client/notes.md", paths)).toBe(false);
  });
});

describe("liveShaOf", () => {
  it("reads the git-commit meta tag", () => {
    expect(liveShaOf(`<meta name="git-commit" content="${HEAD}" />`)).toBe(HEAD);
  });
  it("returns null for a page without a full SHA", () => {
    expect(liveShaOf("<html></html>")).toBeNull();
    expect(liveShaOf(`<meta name="git-commit" content="abc123" />`)).toBeNull();
  });
});

describe("the catch-up workflow", () => {
  it("runs after CI completes on main", () => {
    expect(CATCH_UP).toMatch(/^ {2}workflow_run:\n {4}workflows: \["CI"\]\n {4}types: \[completed\]\n {4}branches: \[main\]$/m);
  });
  it("decides with the module, then dispatches Deploy Web on main only when owed", () => {
    expect(CATCH_UP).toMatch(/run: node scripts\/deployWebCatchUp\.mjs >> "\$GITHUB_OUTPUT"/);
    expect(CATCH_UP).toMatch(/if: steps\.owed\.outputs\.deploy == 'true'\n {8}env:[\s\S]*?run: gh workflow run deploy-pages\.yml --ref main/);
  });
  it("never deploys itself: no wrangler, no secrets beyond GITHUB_TOKEN, no release-gate bypass", () => {
    expect(CATCH_UP).not.toMatch(/wrangler|CLOUDFLARE_|require-green-release/);
    for (const m of CATCH_UP.matchAll(/secrets\.([A-Z_]+)/g)) expect(m[1]).toBe("GITHUB_TOKEN");
  });
  it("can dispatch and read runs, nothing more", () => {
    expect(CATCH_UP).toMatch(/^permissions:\n {2}contents: read\n {2}actions: write$/m);
  });
  it("leaves Deploy Web's own triggers and gate untouched", () => {
    expect(PAGES).toMatch(/^ {2}workflow_dispatch:/m);
    expect(PAGES).not.toMatch(/workflow_run/);
    expect(PAGES).toMatch(/run: node scripts\/require-green-release\.mjs --target web\s*$/m);
  });
});
