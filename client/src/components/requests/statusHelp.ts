// D-094-ai-in-ui.status-help (packet §4.7, D-264 (3), §15 F3): plain-language
// help for one referral request, retrieved from this catalogue and never
// generated. It is keyed by what the seeker sees - the askView label, plus the
// pending queueStatus for "Waiting" - because one "pending" sentence would be
// false for states as different as "waiting for coverage" and "under review".
// No entry states a money movement: held_for_credit has none and keeps
// requestNote's own line (the MyRequests contract, packet §2). D-094 (3)
// requires "localised"; keying by view lets the i18n foundation carry each
// entry per locale, and the row stops before landing until that ruling and the
// catalogue's approval are accepted (packet §4.9-4.10).
import { askView } from "./askView";

export const STATUS_HELP_ENABLED = false;

export type WaitingHelpKey = "available_for_review" | "waiting_for_coverage" | "default";
export type StatusHelpKey =
  | "under_review"
  | "accepted"
  | "referred"
  | "interviewing"
  | "offer"
  | "declined"
  | "withdrawn"
  | "closed"
  | "expired"
  | `waiting:${WaitingHelpKey}`;

export type StatusHelp = { readonly title: string; readonly body: string };

/** Everything this module reads from a request; ReferralRequest satisfies it. */
export type StatusHelpSource = {
  status: "pending" | "approved" | "intro_made" | "interview" | "offer" | "declined" | "withdrawn" | "closed";
  referrerId: number | null;
  heldForReferrer?: boolean;
  unclaimedAssignment?: boolean;
  queueStatus?: "available_for_review" | "waiting_for_coverage" | "held_for_credit" | null;
};

/**
 * Candidate entries, drafted from wording already on main and awaiting the
 * approval packet §4.10 requires: askView's labels, askNextLine and
 * requestNote (MyRequests.tsx, requestModel.ts), getJobSeekerReferralState
 * (shared/referral.ts), the D-019(e) privacy rule and D-034's oldest-first
 * delivery. Referral vocabulary only (D-173/D-180); no sentence promises a
 * referral, a yes or an outcome, and none mentions money.
 */
export const STATUS_HELP: Readonly<Record<StatusHelpKey, StatusHelp>> = {
  "waiting:waiting_for_coverage": {
    title: "Waiting for a verified employee",
    body: "No verified employee at this company can see it yet. It stays private until one joins; then the oldest waiting requests reach them first.",
  },
  "waiting:available_for_review": {
    title: "With the company's verified employees",
    body: "Verified employees at this company can see your request now. They keep your name and files private until they accept, and you'll see an update when one of them decides.",
  },
  "waiting:default": {
    title: "Waiting for a verified employee",
    body: "Your request is routed privately to verified employees at this company. You'll see an update when one of them decides; nothing here is public.",
  },
  under_review: {
    title: "A verified employee is reviewing it",
    body: "Someone who works there picked it up. Their identity stays private, and so do your name and files, until they accept. There is nothing to do until you see their decision.",
  },
  accepted: {
    title: "Your referrer said yes",
    body: "They submit your referral through the company's own process, then mark it Referred here. Message them in the conversation if you need to share something.",
  },
  referred: {
    title: "Referred",
    body: "Your referrer has submitted the referral. Watch your email for the company's recruiters; the company decides hiring, and your status updates as real milestones happen.",
  },
  interviewing: {
    title: "Interview in progress",
    body: "An interview milestone was recorded for this referral. Keep the conversation private and update the status only when the next real step happens.",
  },
  offer: {
    title: "Offer recorded",
    body: "An offer milestone was recorded. This is a factual private update, not a public claim.",
  },
  declined: {
    title: "The referrer declined",
    body: "This request is closed. Your documents stay private, and you can request a referral at this or another company any time.",
  },
  withdrawn: {
    title: "You withdrew this request",
    body: "It is closed and no longer shown to employees. You can request a referral again any time.",
  },
  closed: {
    title: "This request is closed",
    body: "Your private request history and documents remain protected.",
  },
  expired: {
    title: "This request ended without a referrer",
    body: "No verified employee picked it up before it ended. You can request a referral at this or another company any time.",
  },
};

const SETTLED_LABEL_KEYS = {
  "Under review": "under_review",
  "Accepted": "accepted",
  "Referred": "referred",
  "Interviewing": "interviewing",
  "Offer": "offer",
  "Declined": "declined",
  "Withdrawn": "withdrawn",
  "Closed": "closed",
  "Expired": "expired",
} as const satisfies Record<string, StatusHelpKey>;

const isSettledLabel = (label: string): label is keyof typeof SETTLED_LABEL_KEYS => label in SETTLED_LABEL_KEYS;

/** The catalogue key for what this request shows, or null where no entry may exist. */
export function statusHelpKeyFor(source: StatusHelpSource): StatusHelpKey | null {
  const { label } = askView(source);
  if (label === "Waiting") {
    // D-047: a request held for a missing referral cannot be explained without money.
    if (source.queueStatus === "held_for_credit") return null;
    if (source.queueStatus === "waiting_for_coverage") return "waiting:waiting_for_coverage";
    if (source.queueStatus === "available_for_review") return "waiting:available_for_review";
    return "waiting:default";
  }
  return isSettledLabel(label) ? SETTLED_LABEL_KEYS[label] : null;
}

export function statusHelpFor(source: StatusHelpSource): StatusHelp | null {
  const key = statusHelpKeyFor(source);
  return key ? STATUS_HELP[key] : null;
}
