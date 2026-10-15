// Read-only enrichment for referrer inbox rows (task 17). Computed from fields the referrer already sees in the
// review preview. Never includes seeker identity. No state, credit or send logic.
import { askChecks, countWords } from "../shared/askQuality";

export const FIT_NOTE_EXCERPT_MAX = 280;
export type AskStrength = "strong" | "good" | "basic";

export type InboxEnrichment = {
  jobTitle: string | null;
  officialLinkIncluded: boolean;
  fitNoteIncluded: boolean;
  resumeAttached: boolean;
  askStrength: AskStrength;
};

export function plainExcerpt(note: string | null | undefined, max: number = FIT_NOTE_EXCERPT_MAX): string | null {
  const text = (note ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function enrichInboxRow(input: { title: string | null | undefined; pitch: string | null | undefined; targetRoleUrl: string | null | undefined; attachmentCount: number | null | undefined }): InboxEnrichment {
  const note = input.pitch ?? "";
  const checks = askChecks({ officialUrl: Boolean(input.targetRoleUrl?.trim()), note, hasResume: Number(input.attachmentCount ?? 0) > 0 });
  const passed = checks.filter(check => check.ok).length;
  return {
    jobTitle: input.title?.trim() || null,
    officialLinkIncluded: checks[0].ok,
    fitNoteIncluded: countWords(note) >= 30,
    resumeAttached: checks[3].ok,
    askStrength: passed === 4 ? "strong" : passed >= 3 ? "good" : "basic",
  };
}
