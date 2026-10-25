import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The gate judges `git diff origin/main...HEAD`, so a test run in this checkout would judge whatever the
// pull request under test changed (D-200 lets a docs-only diff through). Run it in a throwaway repository
// whose diff the test controls instead.
function scopeCheckIn(changedPath: string, renameFrom?: string) {
  const dir = mkdtempSync(join(tmpdir(), "scope-check-"));
  try {
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, stdio: "pipe" });
    mkdirSync(join(dir, "scripts"));
    for (const f of ["scope-check.mjs", "queue-gate.mjs", "nextTaskCore.mjs"]) copyFileSync(join(root, "scripts", f), join(dir, "scripts", f));
    mkdirSync(join(dir, "docs", "plans"), { recursive: true });
    writeFileSync(join(dir, "docs", "plans", "assignments.json"), JSON.stringify({ tasks: [{ id: "A", branch: "agent/queue/a", status: "todo" }] }));
    if (renameFrom) {
      mkdirSync(dirname(join(dir, renameFrom)), { recursive: true });
      writeFileSync(join(dir, renameFrom), "on: schedule\n");
    }
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    mkdirSync(dirname(join(dir, changedPath)), { recursive: true });
    if (renameFrom) git("mv", renameFrom, changedPath);
    else writeFileSync(join(dir, changedPath), "changed\n");
    git("add", ".");
    git("commit", "-q", "-m", "change");
    return spawnSync(process.execPath, ["scripts/scope-check.mjs", "--branch"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_HEAD_REF: "agent/instinct/unregistered", GITHUB_EVENT_PATH: "" },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it("rejects a pull-request branch with no queue row before scope-check can fail open", () => {
  const run = scopeCheckIn("server/x.ts");
  expect(run.status).toBe(1);
  expect(`${run.stdout}${run.stderr}`).toContain("This branch matches no queue row.");
});

it("passes a docs-only pull request from a branch with no queue row (D-200)", () => {
  const run = scopeCheckIn("docs/note.md");
  expect(run.status).toBe(0);
  expect(`${run.stdout}${run.stderr}`).not.toContain("This branch matches no queue row.");
});

it("does not block the already-merged main branch's push CI", () => {
  const run = spawnSync(process.execPath, ["scripts/scope-check.mjs", "--branch"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "push",
      GITHUB_HEAD_REF: "main",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REF_NAME: "main",
      GITHUB_EVENT_PATH: "",
    },
  });
  expect(run.status).toBe(0);
});

it("counts a file moved into docs/ by its old path, so the move is not docs-only", () => {
  const run = scopeCheckIn("docs/watch.yml", ".github/workflows/watch.yml");
  expect(run.status).toBe(1);
  expect(`${run.stdout}${run.stderr}`).toContain("This branch matches no queue row.");
});
