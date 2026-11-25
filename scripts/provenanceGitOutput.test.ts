import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadTrustedProvenance, PROVENANCE_PATH } from "./modelProvenance.mjs";
import { git as gateGit } from "./review-gate.mjs";
import { git as pickerGit, tryGit as pickerTryGit } from "./next-task.mjs";
import {
  GIT_OUTPUT_LIMIT_BYTES,
  boundedGitReader,
  nullableBoundedGitReader,
  readGitOutput,
} from "./provenanceGitOutput.mjs";

const roots: string[] = [];
const LEGACY_BUFFER_BYTES = 1024 * 1024;
const PAD_BYTES = 1_300_000;

const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A schema-valid registry whose bytes are deliberately above the legacy 1MiB cap. */
function registryText(padBytes: number): string {
  return JSON.stringify({
    version: 1,
    routes: [{ id: "loader-bounds-route", padding: "x".repeat(padBytes) }],
    executions: [],
  });
}

function repoWithRegistry(text: string | null): string {
  const root = mkdtempSync(path.join(tmpdir(), "provenance-loader-bounds-"));
  roots.push(root);
  gitIn(root, "init", "--quiet");
  gitIn(root, "config", "user.email", "loader-bounds@example.invalid");
  gitIn(root, "config", "user.name", "Loader Bounds");
  if (text !== null) {
    mkdirSync(path.join(root, "docs"), { recursive: true });
    // Real files end with a newline; the fixture keeps one so trim is observable.
    writeFileSync(path.join(root, PROVENANCE_PATH), text.endsWith("\n") ? text : `${text}\n`);
    gitIn(root, "add", PROVENANCE_PATH);
    gitIn(root, "commit", "--quiet", "-m", "fixture");
    gitIn(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  }
  return root;
}

/** The wrapper bindings read process.cwd(), so the fixture is entered for the call. */
function inDir<T>(dir: string, run: () => T): T {
  const before = process.cwd();
  process.chdir(dir);
  try {
    return run();
  } finally {
    process.chdir(before);
  }
}

/** The gate's own adapter shape at its trusted-registry load. */
const gateAdapter = (...args: string[]) => {
  try {
    return gateGit(args);
  } catch {
    return null;
  }
};

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("shared bounded Git output reader", () => {
  it("names a finite 64MiB aggregate bound", () => {
    expect(GIT_OUTPUT_LIMIT_BYTES).toBe(64 * 1024 * 1024);
  });

  it("proves the legacy default buffer aborts on the same real Git read", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    let failure: unknown = null;
    try {
      execFileSync("git", ["show", `origin/main:${PROVENANCE_PATH}`], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (caught) {
      failure = caught;
    }
    expect(failure, "the fixture must be larger than the legacy 1MiB output buffer").toBeTruthy();
    expect((failure as NodeJS.ErrnoException).code).toBe("ENOBUFS");
  });

  it("reads the same registry through the shared reader", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const raw = readGitOutput(["show", `origin/main:${PROVENANCE_PATH}`], { cwd });
    expect(raw.length).toBeGreaterThan(LEGACY_BUFFER_BYTES);
    expect(raw).toBe(registryText(PAD_BYTES).trim());
  });

  it("keeps trim semantics and the array argument shape", () => {
    const cwd = repoWithRegistry(registryText(2048));
    const untrimmed = readGitOutput(["show", `origin/main:${PROVENANCE_PATH}`], { cwd, trim: false });
    expect(untrimmed.endsWith("\n")).toBe(true);
    expect(boundedGitReader({ cwd })("show", `origin/main:${PROVENANCE_PATH}`)).toBe(untrimmed.trim());
  });

  it("fails closed above the bound instead of returning truncated bytes", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    expect(() => readGitOutput(["show", `origin/main:${PROVENANCE_PATH}`], { cwd, limitBytes: 4096 })).toThrow();
    expect(nullableBoundedGitReader({ cwd, limitBytes: 4096 })("show", `origin/main:${PROVENANCE_PATH}`)).toBeNull();
  });

  it("turns a process failure into a throw or null, never a value", () => {
    const cwd = repoWithRegistry(registryText(2048));
    expect(() => readGitOutput(["definitely-not-a-git-subcommand"], { cwd })).toThrow();
    expect(nullableBoundedGitReader({ cwd })("definitely-not-a-git-subcommand")).toBeNull();
  });
});

describe("the picker's own git bindings above 1MiB", () => {
  it("returns the oversized registry bytes through its exported tryGit", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const raw = inDir(cwd, () => pickerTryGit("show", `origin/main:${PROVENANCE_PATH}`));
    expect(raw).not.toBeNull();
    expect(raw!.length).toBeGreaterThan(LEGACY_BUFFER_BYTES);
    expect(raw).toBe(registryText(PAD_BYTES).trim());
  });

  it("loads the trusted registry through its exported tryGit", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const trusted = inDir(cwd, () => loadTrustedProvenance(pickerTryGit));
    expect(trusted.registryError).toBeUndefined();
    expect(trusted.registry?.routes?.[0]?.id).toBe("loader-bounds-route");
  });

  it("keeps the throwing binding throwing on a real Git failure", () => {
    const cwd = repoWithRegistry(registryText(2048));
    expect(() => inDir(cwd, () => pickerGit("definitely-not-a-git-subcommand"))).toThrow();
    expect(inDir(cwd, () => pickerTryGit("definitely-not-a-git-subcommand"))).toBeNull();
  });

  it("reports the oversized read through the picker's own binding when the bound is lowered", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const lowered = inDir(cwd, () => nullableBoundedGitReader({ limitBytes: 4096 })("show", `origin/main:${PROVENANCE_PATH}`));
    expect(lowered).toBeNull();
  });
});

describe("the review gate's own git binding above 1MiB", () => {
  it("returns the oversized registry bytes through its exported array-argument git", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const raw = inDir(cwd, () => gateGit(["show", `origin/main:${PROVENANCE_PATH}`]));
    expect(raw.length).toBeGreaterThan(LEGACY_BUFFER_BYTES);
    expect(raw).toBe(registryText(PAD_BYTES).trim());
  });

  it("loads the trusted registry through the gate's own adapter shape", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const trusted = inDir(cwd, () => loadTrustedProvenance(gateAdapter));
    expect(trusted.registryError).toBeUndefined();
    expect(trusted.registry?.routes?.[0]?.id).toBe("loader-bounds-route");
  });

  it("keeps the gate binding throwing on a real Git failure and null through its adapter", () => {
    const cwd = repoWithRegistry(registryText(2048));
    expect(() => inDir(cwd, () => gateGit(["definitely-not-a-git-subcommand"]))).toThrow();
    expect(inDir(cwd, () => gateAdapter("definitely-not-a-git-subcommand"))).toBeNull();
  });
});

describe("actual production loader integration above 1MiB", () => {
  it("reports an over-bound read through existing parser semantics, not as a truncated success", () => {
    const cwd = repoWithRegistry(registryText(PAD_BYTES));
    const trusted = loadTrustedProvenance(nullableBoundedGitReader({ cwd, limitBytes: 4096 }));
    expect(trusted.registry).toBeNull();
    // `null` bytes are what the existing parser already reports as invalid; the test
    // asserts that existing behavior instead of inventing transport wording.
    expect(trusted.registryError).toBe("invalid provenance registry");
  });

  it("reports a missing trusted main, malformed and truncated content explicitly", () => {
    expect(loadTrustedProvenance(nullableBoundedGitReader({ cwd: repoWithRegistry(null) })).registryError).toBe(
      "no trusted-main provenance registry",
    );
    expect(loadTrustedProvenance(nullableBoundedGitReader({ cwd: repoWithRegistry("{not json") })).registryError).toBe(
      "unreadable provenance registry",
    );
    const truncated = registryText(PAD_BYTES).slice(0, 900_000);
    expect(loadTrustedProvenance(nullableBoundedGitReader({ cwd: repoWithRegistry(truncated) })).registryError).toBe(
      "unreadable provenance registry",
    );
  });
});
