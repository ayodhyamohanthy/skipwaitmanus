// HYGIENE-picker-bootstrap (D-387): a fresh clone runs the picker first time.
// 1. Missing packages print one install line and exit non-zero, never a stack trace.
// 2. A shallow clone is unshallowed once automatically; a failed fetch keeps the existing STOP.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCompleteHistory, loadPickerModule, missingPackageOf } from "./next-task.mjs";

const INSTALL_LINE = /run pnpm install --frozen-lockfile/;
const SHALLOW_STOP = "STOP: complete history is required; run git fetch --unshallow origin, then run the picker again";

const missing = (pkg: string) => Object.assign(new Error(`Cannot find package '${pkg}' imported from /x/scripts/review-gate.mjs`), { code: "ERR_MODULE_NOT_FOUND" });

describe("missingPackageOf", () => {
  it("names a missing bare package", () => {
    expect(missingPackageOf(missing("zod"))).toBe("zod");
  });
  it("ignores a missing relative module and any other error", () => {
    const relative = Object.assign(new Error("Cannot find module '/x/scripts/gone.mjs' imported from /x/scripts/next-task.mjs"), { code: "ERR_MODULE_NOT_FOUND" });
    expect(missingPackageOf(relative)).toBeNull();
    expect(missingPackageOf(new Error("boom"))).toBeNull();
    expect(missingPackageOf(null)).toBeNull();
  });
});

describe("loadPickerModule", () => {
  it("returns the loaded module", async () => {
    await expect(loadPickerModule(async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 });
  });
  it("prints one install line and exits 1 when a package is missing", async () => {
    const err = vi.fn();
    const exit = vi.fn(() => { throw new Error("exited"); });
    await expect(loadPickerModule(async () => { throw missing("zod"); }, { err, exit })).rejects.toThrow("exited");
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toMatch(INSTALL_LINE);
    expect(err.mock.calls[0][0]).toContain("zod");
    expect(exit).toHaveBeenCalledWith(1);
  });
  it("rethrows any other failure unchanged", async () => {
    const boom = new Error("boom");
    const exit = vi.fn();
    await expect(loadPickerModule(async () => { throw boom; }, { err: vi.fn(), exit })).rejects.toBe(boom);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("ensureCompleteHistory", () => {
  const failer = () => vi.fn((message: string) => { throw new Error(message); });

  it("does nothing on a complete clone", () => {
    const tryGit = vi.fn(() => "false");
    ensureCompleteHistory({ tryGit, fail: failer(), log: vi.fn() });
    expect(tryGit).toHaveBeenCalledTimes(1);
    expect(tryGit).toHaveBeenCalledWith("rev-parse", "--is-shallow-repository");
  });

  it("unshallows a shallow clone exactly once and proceeds", () => {
    const answers = ["true", "", "false"];
    const tryGit = vi.fn(() => answers.shift() ?? null);
    const fail = failer();
    ensureCompleteHistory({ tryGit, fail, log: vi.fn() });
    expect(tryGit.mock.calls).toEqual([
      ["rev-parse", "--is-shallow-repository"],
      ["fetch", "-q", "--unshallow", "origin"],
      ["rev-parse", "--is-shallow-repository"],
    ]);
    expect(fail).not.toHaveBeenCalled();
  });

  it("keeps the existing STOP when the unshallow fetch fails", () => {
    const answers = ["true", null, "true"];
    const tryGit = vi.fn(() => answers.shift() ?? null);
    const fail = failer();
    expect(() => ensureCompleteHistory({ tryGit, fail, log: vi.fn() })).toThrow(SHALLOW_STOP);
    expect(fail).toHaveBeenCalledWith(SHALLOW_STOP, 2);
    expect(tryGit.mock.calls.filter(call => call[0] === "fetch")).toHaveLength(1);
  });
});

describe("the real picker without installed packages", () => {
  let dir = "";
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ""; });

  it("prints the install line, exits non-zero and shows no stack trace", () => {
    dir = mkdtempSync(path.join(tmpdir(), "picker-bootstrap-"));
    const scripts = path.join(dir, "scripts");
    const source = path.dirname(new URL(import.meta.url).pathname);
    cpSync(source, scripts, { recursive: true, filter: from => from === source || (!from.includes("node_modules") && (readdirSync(source).includes(path.basename(from)) && from.endsWith(".mjs"))) });
    const run = spawnSync(process.execPath, [path.join(scripts, "next-task.mjs"), "--status"], {
      cwd: dir, encoding: "utf8", timeout: 30_000, env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_PATH: "" },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(INSTALL_LINE);
    expect(run.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|\n\s+at /);
  });
});
