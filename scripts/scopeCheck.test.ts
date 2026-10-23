import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

it("rejects a branch with no queue row before the scope check can fail open", () => {
  const run = spawnSync(process.execPath, ["scripts/scope-check.mjs", "--branch"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_HEAD_REF: "agent/instinct/unregistered",
      GITHUB_EVENT_PATH: "",
    },
  });
  expect(run.status).toBe(1);
  expect(`${run.stdout}${run.stderr}`).toContain("This branch matches no queue row.");
});
