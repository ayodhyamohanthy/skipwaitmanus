/** Shared test-account allowlist for Skippy and seeker agents; an empty list allows nobody. */
export function parseSkippieAllowedIds(value: string | undefined): ReadonlySet<number> {
  return new Set((value ?? "").split(",").map(entry => Number(entry.trim())).filter(id => Number.isInteger(id) && id > 0));
}
