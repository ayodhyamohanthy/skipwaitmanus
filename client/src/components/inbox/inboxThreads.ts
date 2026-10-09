// Inbox data boundary: parses the live seeker (/mine) and referrer (/inbox)
// request lists and derives kit v4 inbox rows from them. Pure functions only,
// so the identity rules (seeker hidden until accept) are unit-testable.
import { z } from "zod";
import { getJobSeekerReferralState, isPostApprovalReferralStatus, referralStatuses, referralStatusLabels, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";
import { companySlugForJobCompany, getLaunchCompany } from "@/lib/companies";

const timestamp = z.union([z.string(), z.date()]).transform(value => (typeof value === "string" ? value : value.toISOString()));

const askingRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  companyDomain: z.string().min(1),
  status: z.enum(referralStatuses),
  referrerId: z.number().int().nullable().optional().transform(value => value ?? null),
  queueStatus: z.enum(["available_for_review", "waiting_for_coverage"]).nullish(),
  referrerMessage: z.string().nullish(),
  unreadMessageCount: z.number().int().nonnegative().optional().transform(value => value ?? 0),
  updatedAt: timestamp,
});

const referringRowSchema = z.object({
  id: z.number().int().positive(),
  companyDomain: z.string().min(1),
  status: z.enum(referralStatuses),
  unreadMessageCount: z.number().int().nonnegative().optional().transform(value => value ?? 0),
  updatedAt: timestamp,
});

export const askingListSchema = z.object({ requests: z.array(askingRowSchema) });
export const referringListSchema = z.object({ requests: z.array(referringRowSchema) });

export type AskingRow = z.infer<typeof askingRowSchema>;
export type ReferringRow = z.infer<typeof referringRowSchema>;
export type InboxSide = "asking" | "referring";
export type KitStatus = "Requested" | "Accepted" | "Referred" | "Interviewing" | "Offer" | "Closed" | "Expired" | "Declined" | "Withdrawn";
/** verified: counterpart is a verified employee; hidden: seeker not yet revealed; shared: seeker revealed after accept. */
export type CounterpartIdentity = "verified" | "hidden" | "shared";

export type InboxThread = {
  readonly key: string;
  readonly side: InboxSide;
  readonly href: string;
  readonly mark: string;
  readonly companyName: string;
  readonly who: string;
  readonly identity: CounterpartIdentity;
  readonly role: string;
  readonly note: string;
  readonly pill: KitStatus;
  readonly unread: number;
  readonly highlight: boolean;
  readonly updatedAt: string;
};

const KIT_STATUS: Record<ReferralStatus, KitStatus> = {
  pending: "Requested",
  approved: "Accepted",
  intro_made: "Referred",
  interview: "Interviewing",
  offer: "Offer",
  closed: "Closed",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function kitStatusFor(status: ReferralStatus): KitStatus {
  return KIT_STATUS[status];
}

export function companyIdentity(companyDomain: string): { name: string; mark: string } {
  const launch = getLaunchCompany(companySlugForJobCompany(companyDomain) ?? "");
  if (launch) return { name: launch.name, mark: launch.initials };
  return { name: companyDomain, mark: companyDomain.charAt(0).toUpperCase() };
}

function unreadNote(count: number) {
  return `${count} new message${count === 1 ? "" : "s"}`;
}

/**
 * An unclaimed ask that lapses is closed by the server's expiry path (the only
 * way to reach "closed" without a referrer), so it reads as Expired, matching
 * the Requests and Thread screens.
 */
export function askingStatus(row: Pick<AskingRow, "status" | "referrerId">): KitStatus {
  return row.status === "closed" && row.referrerId === null ? "Expired" : kitStatusFor(row.status);
}

export function askingThread(row: AskingRow): InboxThread {
  const company = companyIdentity(row.companyDomain);
  const pending = row.status === "pending";
  const pill = askingStatus(row);
  const note = row.unreadMessageCount > 0
    ? unreadNote(row.unreadMessageCount)
    : pill === "Expired"
      ? "This request expired."
      : !pending && row.referrerMessage
        ? row.referrerMessage
        : pending
          ? row.queueStatus === "waiting_for_coverage" ? "Waiting for coverage" : row.queueStatus === "available_for_review" ? "Available for review" : "Waiting for a referrer to accept"
          : getJobSeekerReferralState({ status: row.status, referrerId: row.referrerId }).label;
  return {
    key: `asking-${row.id}`,
    side: "asking",
    href: `/conversation/${row.id}`,
    mark: company.mark,
    companyName: company.name,
    // The referrer's name is not part of the seeker list payload; before
    // accept the referrer stays anonymous by design.
    who: row.referrerId !== null && isPostApprovalReferralStatus(row.status) ? `Your referrer · ${company.name}` : `Someone at ${company.name}`,
    identity: "verified",
    role: row.title?.trim() || "Referral request",
    note,
    pill,
    unread: row.unreadMessageCount,
    highlight: row.unreadMessageCount > 0,
    updatedAt: row.updatedAt,
  };
}

export function referringThread(row: ReferringRow): InboxThread {
  const company = companyIdentity(row.companyDomain);
  const pending = row.status === "pending";
  const revealed = isPostApprovalReferralStatus(row.status);
  const note = row.unreadMessageCount > 0
    ? unreadNote(row.unreadMessageCount)
    : pending ? "New ask for you to review" : referralStatusLabels[row.status];
  return {
    key: `referring-${row.id}`,
    side: "referring",
    href: `/conversation/${row.id}?from=inbox`,
    mark: company.mark,
    companyName: company.name,
    // Never reveal the seeker before accept; the list payload carries no
    // seeker identity either way.
    who: revealed ? "Seeker · identity shared" : "Seeker · identity hidden",
    identity: revealed ? "shared" : "hidden",
    role: company.name,
    note,
    pill: kitStatusFor(row.status),
    unread: row.unreadMessageCount,
    highlight: row.unreadMessageCount > 0 || pending,
    updatedAt: row.updatedAt,
  };
}

export function buildInboxThreads(asking: readonly AskingRow[], referring: readonly ReferringRow[]): InboxThread[] {
  const seen = new Set<number>();
  const uniqueReferring = referring.filter(row => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  const time = (value: string) => { const ms = new Date(value).getTime(); return Number.isNaN(ms) ? 0 : ms; };
  return [...asking.map(askingThread), ...uniqueReferring.map(referringThread)].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
}

export function filterInboxThreads(threads: readonly InboxThread[], side: "all" | InboxSide, query: string): InboxThread[] {
  const q = query.trim().toLowerCase();
  return threads.filter(thread => (side === "all" || thread.side === side) && (!q || `${thread.companyName} ${thread.who} ${thread.role} ${thread.note}`.toLowerCase().includes(q)));
}

export function timeAgo(value: string, nowMs: number = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((nowMs - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type TokenSource = () => Promise<string | null>;

async function getList<T>(path: string, getToken: TokenSource, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export async function fetchAskingRows(getToken: TokenSource): Promise<AskingRow[]> {
  return (await getList("/api/company-referrals/mine", getToken, askingListSchema, "We could not load your referral requests")).requests;
}

/** New asks (the review queue) plus decided ones you handled. */
export async function fetchReferringRows(getToken: TokenSource): Promise<{ fresh: ReferringRow[]; completed: ReferringRow[] }> {
  const fallback = "We could not load your referrer conversations";
  const [fresh, completed] = await Promise.all([
    getList("/api/company-referrals/inbox?scope=new", getToken, referringListSchema, fallback),
    getList("/api/company-referrals/inbox?scope=completed", getToken, referringListSchema, fallback),
  ]);
  return { fresh: fresh.requests, completed: completed.requests };
}
