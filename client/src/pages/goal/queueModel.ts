// Pure view model for the Referral queue (design/goal-ui/content.json screenB). Soonest to close first; day-level
// clocks only (DESIGN.md rule 14); "Under review" means the referrer opened it on this device, private to them;
// quality checks describe the ask, never the person.
import { askChecks } from "@shared/askQuality";
import { displayJobFunction } from "@shared/jobFunctions";
import { getAskShelfLifeEndsAtMs } from "@shared/referral";
import { displayRoleTitle } from "@shared/roleTitle";
import type { QueuePreview, QueueRow } from "./queueApi";

const DAY = 24 * 60 * 60 * 1000;

export type QueueItem = {
  id: number;
  ref: string | null;
  role: string;
  fn: string | null;
  company: string;
  closesAt: number | null;
  daysLeft: number | null;
  received: string;
  state: "new" | "opened";
  createdAt: string;
};

export function closesAtMs(row: Pick<QueueRow, "expiresAt" | "createdAt" | "coverageVisibleAt" | "waitingForCoverage">): number | null {
  const fromServer = row.expiresAt ? Date.parse(row.expiresAt) : NaN;
  if (Number.isFinite(fromServer)) return fromServer;
  return getAskShelfLifeEndsAtMs({ createdAt: row.createdAt, coverageVisibleAt: row.coverageVisibleAt, waitingForCoverage: row.waitingForCoverage });
}

export function toQueueItem(row: QueueRow, opened: ReadonlySet<number>, nowMs: number): QueueItem {
  const closesAt = closesAtMs(row);
  return {
    id: row.id,
    ref: row.displayRef,
    role: displayRoleTitle({ title: row.jobTitle, targetRoleUrl: row.targetRoleUrl, jobFunction: row.jobFunction }),
    fn: displayJobFunction(row.jobFunction),
    company: row.companyName?.trim() || row.companyDomain,
    closesAt,
    daysLeft: closesAt === null ? null : Math.max(0, Math.ceil((closesAt - nowMs) / DAY)),
    received: row.coverageVisibleAt ?? row.createdAt,
    state: opened.has(row.id) ? "opened" : "new",
    createdAt: row.createdAt,
  };
}

/** Soonest to close first, so the oldest asks are seen first; asks without a clock last, oldest first. */
export function sortQueue(items: readonly QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    if (a.closesAt !== null && b.closesAt !== null && a.closesAt !== b.closesAt) return a.closesAt - b.closesAt;
    if (a.closesAt === null && b.closesAt !== null) return 1;
    if (a.closesAt !== null && b.closesAt === null) return -1;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
}

export function clockText(daysLeft: number): string {
  if (daysLeft <= 0) return "Closes today";
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}

/** Passed checks on the ask (DESIGN.md: checks on the ask, never a score of the person). */
export function qualityChecks(row: Pick<QueueRow, "officialLinkIncluded" | "resumeAttached" | "askStrength">, preview: Pick<QueuePreview, "candidateMessage" | "targetRoleUrl"> | null): string[] {
  const checks: string[] = [];
  if (row.officialLinkIncluded) checks.push("Official job link");
  const note = preview?.candidateMessage ?? "";
  if (note && askChecks({ officialUrl: true, note, hasResume: true }).find(check => check.label === "One specific proof of fit")?.ok) checks.push("Specific proof of fit");
  if (row.resumeAttached) checks.push("Resume attached");
  if (row.askStrength) checks.push(`Ask strength: ${row.askStrength === "strong" ? "Strong" : row.askStrength === "good" ? "Good" : "Basic"}`);
  return checks;
}

/** The asks this referrer opened, kept on this device only ("Under review" is private to them). */
export const OPENED_KEY_PREFIX = "skipwait-queue-opened:";
export function readOpened(userId: string | null, storage: Pick<Storage, "getItem"> | null): Set<number> {
  try {
    const raw = storage?.getItem(`${OPENED_KEY_PREFIX}${userId ?? "session"}`);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []);
  } catch {
    return new Set();
  }
}
export function writeOpened(userId: string | null, ids: ReadonlySet<number>, storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(`${OPENED_KEY_PREFIX}${userId ?? "session"}`, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    /* best effort */
  }
}
