/**
 * PROCESS-provenance-loader-bounds: the single bounded Git output reader that both
 * production provenance loaders use.
 *
 * The trusted registry on main is already 1,620,441 bytes, and `execFileSync`
 * aborts a read above its default 1MiB output buffer with ENOBUFS/SIGTERM. Both
 * wrappers caught that abort as "unreadable", so a transport limit was being
 * reported as absent evidence.
 *
 * This module is transport only: no policy, no network, no claim, no registry
 * editing, no trust decision. It keeps the wrappers' existing semantics exactly:
 * a spawn error, a non-zero status or output above the bound throws, and each
 * wrapper's nullable adapter turns that throw into `null` as before.
 *
 * Bound: 64MiB of aggregate stdout for one read. Rationale: the measured registry
 * is about 1.6MiB, the per-artifact schema limit is 16MiB, and a read may
 * legitimately carry several artifacts; the existing source-reader precedent in
 * scripts/review-gate.mjs uses the same 64MiB figure. The bound is finite and
 * named so the aggregate read cannot become an unbounded allocation, and a read
 * above it fails closed instead of returning a truncated buffer. Truncated bytes
 * must never be parsed as evidence.
 */
import { spawnSync } from "node:child_process";

export const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

/**
 * Runs Git and returns its stdout as text.
 *
 * @param {string[]} args Git arguments, without the executable name.
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, limitBytes?: number, trim?: boolean }} [options]
 * @returns {string}
 * @throws when Git cannot start, exits non-zero, or writes more than the bound.
 */
export function readGitOutput(args, options = {}) {
  const { cwd, env = process.env, limitBytes = GIT_OUTPUT_LIMIT_BYTES, trim = true } = options;
  if (!Array.isArray(args) || !args.length) throw new Error("git read needs arguments");
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) throw new Error("git read needs a positive output bound");
  const result = spawnSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: limitBytes,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr ?? "").trim();
    throw new Error(`git ${args[0]} failed with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  const output = result.stdout ?? "";
  return trim ? output.trim() : output;
}

/** A throwing reader with the wrapper's argument shape: `git(...args)`. */
export function boundedGitReader(options = {}) {
  return (...args) => readGitOutput(args, options);
}

/** A nullable reader: unreadable history becomes `null`, never a stale substitute. */
export function nullableBoundedGitReader(options = {}) {
  const read = boundedGitReader(options);
  return (...args) => {
    try {
      return read(...args);
    } catch {
      return null;
    }
  };
}
