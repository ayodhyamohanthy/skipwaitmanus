// Shared work-showcase contract for /work and /p/:handle. Mirrors the
// workItems rows that server/profileRoutes.ts returns (server/db.ts
// WORK_ITEM_KINDS); kept here so both pages label kinds identically.
export type WorkItem = {
  readonly id: number;
  readonly title: string;
  readonly kind: string;
  readonly source: string | null;
  readonly url: string | null;
  readonly pinned: boolean;
  readonly visibleOnProfile: boolean;
};

export const WORK_KINDS = [
  ["case_study", "Case study"],
  ["project", "Project"],
  ["article", "Article"],
  ["code", "Code"],
  ["other", "Other"],
] as const;

export type WorkKind = (typeof WORK_KINDS)[number][0];

const KIND_LABELS: Readonly<Record<string, string>> = Object.fromEntries(WORK_KINDS);

export function workKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** Live per-piece visibility: on the profile, or only the owner. */
export const WORK_VISIBILITY_LABELS = { visible: "Visible on profile", hidden: "Only me" } as const;

export function isGithubSource(source: string | null): boolean {
  return (source ?? "").trim().toLowerCase() === "github";
}
