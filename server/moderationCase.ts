// Safety-report case file (queue task 5 phase 1). Pure helpers only; db.ts owns the queries.
// Phase 1 stores facts (severity, due time, reviewer note, audit events). It sanctions no one and sends nothing.
export const URGENT_REVIEW_HOURS = 4;
export const NORMAL_REVIEW_HOURS = 48;
export const MODERATION_NOTE_MAX = 500;

export type ReportSeverity = "urgent" | "normal";

export function reportSeverity(urgent: boolean): ReportSeverity { return urgent ? "urgent" : "normal"; }

/** When a first review is due. Stored as a fact for admins; nothing alerts or promises it to anyone yet. */
export function reviewDueAt(createdAtMs: number, urgent: boolean): Date {
  return new Date(createdAtMs + (urgent ? URGENT_REVIEW_HOURS : NORMAL_REVIEW_HOURS) * 3_600_000);
}

export type ModerationEventKind = "opened" | "flagged_urgent" | "under_review" | "resolved" | "dismissed";
export type ModerationEventRow = { reportId: number; actorKind: "reporter" | "reviewer" | "system"; kind: string; note: string | null; createdAt: Date };

export function cleanNote(note: unknown): string | null {
  return typeof note === "string" && note.trim() ? note.trim().slice(0, MODERATION_NOTE_MAX) : null;
}

/** Events grouped per report id, oldest first. */
export function groupEvents(rows: ModerationEventRow[]): Map<number, Array<{ actor: string; kind: string; note: string | null; createdAt: string }>> {
  const grouped = new Map<number, Array<{ actor: string; kind: string; note: string | null; createdAt: string }>>();
  for (const row of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const list = grouped.get(row.reportId) ?? [];
    list.push({ actor: row.actorKind, kind: row.kind, note: row.note, createdAt: row.createdAt.toISOString() });
    grouped.set(row.reportId, list);
  }
  return grouped;
}
