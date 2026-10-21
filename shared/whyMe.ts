/**
 * D-077(4): the ask composer's "Why me" asks for three reasons, up to 140 characters each, and stores them as three
 * lines in the existing note field (no schema change), so the server's note checks apply to the whole text. Notes
 * written before the composer moved are a single block; readers show them as one reason.
 */
export const WHY_ME_REASONS = 3;
export const WHY_ME_MAX = 140;

export type WhyMeReasons = readonly [string, string, string];

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/** Three reasons into one note: empty reasons dropped, one reason per line. */
export function composeWhyMe(reasons: readonly string[]): string {
  return reasons.map(clean).filter(Boolean).join("\n");
}

/** A stored note back into the composer's three fields. Extra lines join the third, so nothing is lost. */
export function splitWhyMe(note: string | null | undefined): WhyMeReasons {
  const lines = (note ?? "").split(/\r?\n/).map(clean).filter(Boolean);
  if (lines.length <= WHY_ME_REASONS) return [lines[0] ?? "", lines[1] ?? "", lines[2] ?? ""];
  return [lines[0], lines[1], lines.slice(2).join(" ")];
}

/** The reasons as a referrer reads them, numbered: one per line, or the whole note when it is one block. */
export function whyMeForReader(note: string | null | undefined): string[] {
  return (note ?? "").split(/\r?\n/).map(clean).filter(Boolean);
}

/** Reasons over the limit, by index (the composer shows the count and blocks Send until each fits). */
export function overLimitReasons(reasons: readonly string[]): number[] {
  return reasons.flatMap((reason, index) => (clean(reason).length > WHY_ME_MAX ? [index] : []));
}
