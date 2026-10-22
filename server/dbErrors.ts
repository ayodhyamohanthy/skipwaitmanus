/**
 * One duplicate-key check for every server path.
 *
 * Drizzle 0.45 rethrows each driver error as `DrizzleQueryError`, with the
 * mysql2 error (and its `ER_DUP_ENTRY` / errno 1062) on `.cause`. A check that
 * reads only the top level therefore passes against a bare test-kit error and
 * misses in production, where the intended idempotent answer becomes a 500.
 * Walk the cause chain instead. Five inspected levels is far deeper than any
 * real wrapper; a cycle ends the walk.
 */
const MAX_INSPECTED_LEVELS = 5;

export function isDuplicateKeyError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let level = 0; level < MAX_INSPECTED_LEVELS; level += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    const typed = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (typed.code === "ER_DUP_ENTRY" || typed.errno === 1062) return true;
    current = typed.cause;
  }
  return false;
}
