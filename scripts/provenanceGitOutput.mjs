/**
 * D-311 / PROCESS-provenance-loader-bounds: one bounded Git output reader for
 * both trusted-provenance loaders.
 *
 * Transport only. It makes no policy, trust, claim, registry or review
 * decision; callers keep their own error semantics and branch/ref arguments.
 *
 * The bound is finite on purpose. Node's execFileSync default maxBuffer is
 * 1 MiB, while the trusted registry on main f1adbc2a measured 1,620,441 bytes,
 * so the default turned a readable registry into ENOBUFS and both loaders
 * reported an invalid registry. 64 MiB matches the existing source-reader
 * precedent in review-gate.mjs (changesOf, changedPathsOf) and leaves room for
 * thousands of further routes. A read above it still fails loudly (ENOBUFS),
 * never as a truncated success or an empty valid registry.
 */
export const TRUSTED_GIT_OUTPUT_MAX_BYTES = 64 * 1024 * 1024;

/** execFileSync options for one Git read: the shared bound, nothing else changed. */
export function trustedGitReadOptions(options = {}) {
  return { ...options, maxBuffer: TRUSTED_GIT_OUTPUT_MAX_BYTES };
}

/** One Git read through the shared bound; throws exactly as execFileSync does. */
export function trustedGitRead(execFileSync, args, { env, cwd } = {}) {
  return execFileSync("git", args, trustedGitReadOptions({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}), ...(cwd ? { cwd } : {}) })).trim();
}

/** The reader both production scripts use, so the two paths cannot silently diverge. */
export function trustedGitReader(execFileSync, options = {}) {
  return (...args) => trustedGitRead(execFileSync, args, options);
}
