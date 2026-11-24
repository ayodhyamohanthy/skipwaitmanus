// SEC-deps-nov24 (D-388): the Dependabot auto-merge workflow only turns auto-merge on, only for
// Dependabot's own pull requests, with a merge commit, and only for semver-patch updates or
// devDependency minors. Required CI (the main ruleset) still decides every merge.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = ".github/workflows/dependabot-auto-merge.yml";
const text = () => readFileSync(WORKFLOW, "utf8");

/** The `run: |` body of the step named `name`, de-indented, so the real decision can be executed. */
function runBlock(source: string, name: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex(line => line.trim() === `- name: ${name}`);
  if (start < 0) throw new Error(`step "${name}" not found`);
  const runAt = lines.findIndex((line, i) => i > start && line.trim() === "run: |");
  if (runAt < 0) throw new Error(`step "${name}" has no run block`);
  const indent = (lines[runAt].match(/^ */)?.[0].length ?? 0) + 2;
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

function decide(updateType: string, dependencyType: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dependabot-decide-"));
  const output = join(dir, "output");
  try {
    writeFileSync(output, "");
    execFileSync("bash", ["-e", "-c", runBlock(text(), "Decide")], {
      env: { PATH: process.env.PATH, UPDATE_TYPE: updateType, DEPENDENCY_TYPE: dependencyType, GITHUB_OUTPUT: output },
      encoding: "utf8",
    });
    const match = readFileSync(output, "utf8").match(/^allow=(true|false)$/m);
    if (!match) throw new Error("no decision written");
    return match[1];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Dependabot auto-merge workflow (SEC-deps-nov24)", () => {
  it("exists", () => {
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it("runs only for Dependabot's own pull requests", () => {
    const source = text();
    expect(source).toMatch(/^on:\n {2}pull_request:/m);
    expect(source).not.toMatch(/pull_request_target/);
    expect(source).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(source).toContain("github.actor == 'dependabot[bot]'");
  });

  it("asks only for the two write permissions it needs", () => {
    const block = text().match(/^permissions:\n((?: {2}.+\n)+)/m)?.[1] ?? "";
    expect(block.trim().split("\n").map(line => line.trim()).sort()).toEqual(["contents: write", "pull-requests: write"]);
  });

  it("pins dependabot/fetch-metadata to a full commit", () => {
    expect(text()).toMatch(/uses: dependabot\/fetch-metadata@[0-9a-f]{40}\n/);
  });

  it("turns on auto-merge with a merge commit and never merges directly", () => {
    const source = text();
    expect(source).toContain('gh pr merge --auto --merge "$PR_URL"');
    expect(source).not.toMatch(/--squash|--rebase|--admin/);
    expect(source.match(/gh pr merge/g)).toHaveLength(1);
  });

  it("allows semver-patch updates of any dependency", () => {
    expect(decide("version-update:semver-patch", "direct:production")).toBe("true");
    expect(decide("version-update:semver-patch", "direct:development")).toBe("true");
    expect(decide("version-update:semver-patch", "indirect")).toBe("true");
  });

  it("allows semver-minor updates of direct devDependencies only", () => {
    expect(decide("version-update:semver-minor", "direct:development")).toBe("true");
    expect(decide("version-update:semver-minor", "direct:production")).toBe("false");
    expect(decide("version-update:semver-minor", "indirect")).toBe("false");
  });

  it("refuses every major and anything it cannot classify", () => {
    expect(decide("version-update:semver-major", "direct:development")).toBe("false");
    expect(decide("version-update:semver-major", "direct:production")).toBe("false");
    expect(decide("", "")).toBe("false");
    expect(decide("version-update:semver-patch; rm -rf /", "direct:production")).toBe("false");
  });
});
