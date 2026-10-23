import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

it("rejects a pull-request branch with no queue row before scope-check can fail open", () => {
  const run = spawnSync(process.execPath, ["scripts/scope-check.mjs", "--branch"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_HEAD_REF: "agent/instinct/unregistered",
      GITHUB_EVENT_PATH: "",
    },
  });
  expect(run.status).toBe(1);
  expect(`${run.stdout}${run.stderr}`).toContain("This branch matches no queue row.");
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
