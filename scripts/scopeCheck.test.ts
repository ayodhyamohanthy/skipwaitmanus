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

// D-356 (owner, Nov 17): "let the gpt 6.1 sol have full rights to edit anything". A branch whose own history
// shows a GPT-6.1 Sol session on the task is not failed for files outside `owns`; every other session still is.
function scopeCheckOwned(changedPath: string, markerSubject: string) {
  const dir = mkdtempSync(join(tmpdir(), "scope-check-sol-"));
  try {
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, stdio: "pipe" });
    mkdirSync(join(dir, "scripts"));
    for (const f of ["scope-check.mjs", "queue-gate.mjs", "nextTaskCore.mjs"]) copyFileSync(join(root, "scripts", f), join(dir, "scripts", f));
    mkdirSync(join(dir, "docs", "plans"), { recursive: true });
    writeFileSync(join(dir, "docs", "plans", "assignments.json"), JSON.stringify({ tasks: [{ id: "A", branch: "agent/queue/a", status: "todo", owns: ["client/a.ts"] }] }));
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-q", "-b", "agent/queue/a");
    git("commit", "-q", "--allow-empty", "-m", markerSubject);
    mkdirSync(dirname(join(dir, changedPath)), { recursive: true });
    writeFileSync(join(dir, changedPath), "changed\n");
    git("add", ".");
    git("commit", "-q", "-m", "change");
    return spawnSync(process.execPath, ["scripts/scope-check.mjs", "--branch"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_HEAD_REF: "agent/queue/a", GITHUB_EVENT_PATH: "" },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it("D-356: a GPT-6.1 Sol claim lets the branch change files outside owns, with a notice", () => {
  const run = scopeCheckOwned("server/x.ts", "Claim A: GPT-6.1 Sol · 1a2b");
  expect(run.status).toBe(0);
  expect(`${run.stdout}${run.stderr}`).toContain("D-356");
  expect(`${run.stdout}${run.stderr}`).toContain("server/x.ts");
});

it("D-356: another session's claim still fails a change outside owns", () => {
  const run = scopeCheckOwned("server/x.ts", "Claim A: Codex · 1a2b");
  expect(run.status).toBe(1);
  expect(`${run.stdout}${run.stderr}`).toContain("server/x.ts: this task owns nothing under shared/ or server/");
});

it("D-356: solHoldsTask reads only this task's Claim, Takeover and Fix claim markers by a GPT-6.1 Sol session", async () => {
  const { solHoldsTask } = await import("./scope-check.mjs");
  expect(solHoldsTask("A", ["Claim A: GPT-6.1 Sol · 1a2b"])).toBe(true);
  expect(solHoldsTask("A", ["work", "Takeover A: GPT-6.1 Sol · ca98"])).toBe(true);
  expect(solHoldsTask("A", ["Fix claim A: GPT-6.1 Sol · 12fe"])).toBe(true);
  expect(solHoldsTask("A", ["Claim B: GPT-6.1 Sol · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim AB: GPT-6.1 Sol · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim A: Codex · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim A: Claude Code · a971 (asked GPT-6.1 Sol)"])).toBe(false);
  expect(solHoldsTask("A", ["Merge GPT-6.1 Sol work for A"])).toBe(false);
  expect(solHoldsTask("A", [])).toBe(false);
  expect(solHoldsTask("D-100.csp-release", ["Takeover D-100.csp-release: GPT-6.1 Sol · ca98"])).toBe(true);
  expect(solHoldsTask("D-100.csp-release", ["Takeover D-100Xcsp-release: GPT-6.1 Sol · ca98"])).toBe(false);
});

// D-357 (owner, Nov 18): "make sure this model has full rights on works too not only 6.1". A GPT-6 Sol session gets
// exactly the GPT-6.1 Sol rights; no other name does.
it("D-357: a GPT-6 Sol claim lets the branch change files outside owns, with a notice naming the session", () => {
  const run = scopeCheckOwned("server/x.ts", "Takeover A: GPT-6 Sol · ca98");
  expect(run.status).toBe(0);
  expect(`${run.stdout}${run.stderr}`).toContain("D-357");
  expect(`${run.stdout}${run.stderr}`).toContain("GPT-6 Sol");
  expect(`${run.stdout}${run.stderr}`).toContain("server/x.ts");
});

it("D-357: solHoldsTask accepts GPT-6 Sol and GPT-6.1 Sol only", async () => {
  const { solHoldsTask } = await import("./scope-check.mjs");
  expect(solHoldsTask("A", ["Claim A: GPT-6 Sol · 1a2b"])).toBe(true);
  expect(solHoldsTask("A", ["Takeover A: GPT-6 Sol · ca98"])).toBe(true);
  expect(solHoldsTask("A", ["Fix claim A: GPT-6 Sol · 12fe"])).toBe(true);
  expect(solHoldsTask("A", ["Claim A: GPT-6 Sol"])).toBe(true);
  expect(solHoldsTask("A", ["Claim A: GPT-6.1 Sol · 1a2b"])).toBe(true);
  expect(solHoldsTask("A", ["Claim A: GPT-6.2 Sol · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim A: GPT-6 Solar · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim A: GPT-6X1 Sol · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim A: Codex GPT-6 · 1a2b"])).toBe(false);
  expect(solHoldsTask("A", ["Claim B: GPT-6 Sol · 1a2b"])).toBe(false);
});
