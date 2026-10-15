/** Optional portal reference a referrer records when marking a request as referred. */
export const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._/#-]{0,39}$/;
export const REFERENCE_ID_ERROR = "Use up to 40 letters, numbers, spaces or . _ / # - for the reference ID";

/** Returns the trimmed reference, null for empty, or undefined when invalid. */
export function normalizeReferenceId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return REFERENCE_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}
