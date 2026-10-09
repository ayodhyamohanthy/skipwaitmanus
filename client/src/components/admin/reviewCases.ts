import type { CompanySuggestion, Enrollment, SafetyReport } from "./adminApi";
import { TERMINAL_CASE_STATUSES } from "./adminApi";

export type CaseKind = "report" | "verification" | "company";
export type CaseDecision = { value: string; label: string; detail: string; danger: boolean; dismiss: boolean };
export type ReviewCase = {
  key: string;
  kind: CaseKind;
  id: number;
  ref: string;
  title: string;
  sub: string;
  urgent: boolean;
  status: string;
  terminal: boolean;
  createdAt: string;
  updatedAt: string | null;
  evidence: string[];
  decisions: CaseDecision[];
  outcome: string;
  audit: string[];
};

const STATUS_LABELS: Record<string, string> = { open: "Open", pending: "Pending", under_review: "Under review", requires_review: "Needs review", resolved: "Resolved", dismissed: "Dismissed", approved: "Approved", declined: "Rejected", rejected: "Rejected" };
export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status.replace(/_/g, " ");

/** Compact age against the current clock: "38 min", "5 h", "1 d". */
export function caseAge(value: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

const REPORT_DECISIONS: CaseDecision[] = [
  { value: "dismissed", label: "Dismiss, no violation", detail: "Close it and notify the reporter", danger: false, dismiss: true },
  { value: "under_review", label: "Mark under review", detail: "Keep it open while you investigate", danger: false, dismiss: false },
  { value: "resolved", label: "Resolve with action", detail: "Action taken, reporter notified", danger: false, dismiss: false },
];
const VERIFICATION_DECISIONS: CaseDecision[] = [
  { value: "approved", label: "Approve", detail: "Confirm this referrer enrollment", danger: false, dismiss: false },
  { value: "rejected", label: "Reject", detail: "Keep unverified", danger: true, dismiss: true },
];
const COMPANY_DECISIONS: CaseDecision[] = [
  { value: "under_review", label: "Mark under review", detail: "Keep it open while you validate the domain", danger: false, dismiss: false },
  { value: "approved", label: "Approve for listing", detail: "Mark approved and notify the submitter", danger: false, dismiss: false },
  { value: "dismissed", label: "Dismiss", detail: "Not listed, submitter notified", danger: true, dismiss: true },
];

const openDecisions = (decisions: CaseDecision[], status: string) => decisions.filter(decision => !(decision.value === "under_review" && status === "under_review"));

function websiteHost(website: string | null) {
  if (!website) return null;
  try { return new URL(website).hostname.replace(/^www\./, ""); } catch { return website; }
}

export function reportCase(report: SafetyReport): ReviewCase {
  const age = caseAge(report.createdAt);
  const terminal = TERMINAL_CASE_STATUSES.has(report.status);
  const links = [report.referralRequestId ? `Request #${report.referralRequestId}` : null, report.reportedUserId ? `Account #${report.reportedUserId}` : null].filter((part): part is string => Boolean(part));
  return {
    key: `report:${report.id}`, kind: "report", id: report.id, ref: `R-${1000 + report.id}`, title: report.reason, sub: links.join(" · ") || "Member report",
    urgent: report.urgent, status: report.status, terminal, createdAt: report.createdAt, updatedAt: report.updatedAt ?? null,
    evidence: [report.details ?? "No written details — reason only.", report.referralRequestId ? `Linked referral request #${report.referralRequestId}` : null, report.reportedUserId ? `Reported account #${report.reportedUserId}` : null].filter((line): line is string => Boolean(line)),
    decisions: openDecisions(REPORT_DECISIONS, report.status),
    outcome: "Reporter notified. Appeal within 14 days via support.",
    audit: [`${age} ago · case opened by user report`, report.urgent ? `${age} ago · flagged urgent by the reporter` : null, report.status !== "open" && report.updatedAt ? `${caseAge(report.updatedAt)} ago · marked ${statusLabel(report.status).toLowerCase()}` : null].filter((line): line is string => Boolean(line)),
  };
}

export function enrollmentCase(item: Enrollment): ReviewCase {
  const age = caseAge(item.createdAt);
  const terminal = TERMINAL_CASE_STATUSES.has(item.status);
  const otp = item.meta?.otpTime ? new Date(item.meta.otpTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  return {
    key: `verification:${item.id}`, kind: "verification", id: item.id, ref: `V-${1000 + item.id}`, title: `Work-email enrollment @${item.companyDomain}`, sub: item.meta?.referrerName ? `${item.meta.referrerName} · claims ${item.companyDomain}` : `Referrer claims ${item.companyDomain}`,
    urgent: false, status: item.status, terminal, createdAt: item.createdAt, updatedAt: item.updatedAt ?? null,
    evidence: [otp ? `One-time code confirmed ${otp}` : "One-time code confirmation time not recorded", item.meta?.referrerEmail ? `Work email: ${item.meta.referrerEmail}` : null, `Company domain: ${item.companyDomain}`].filter((line): line is string => Boolean(line)),
    decisions: VERIFICATION_DECISIONS,
    outcome: item.status === "approved" ? "Referrer enrollment approved." : "Referrer enrollment rejected.",
    audit: [`${age} ago · enrollment opened after work-email verification`, terminal && item.updatedAt ? `${caseAge(item.updatedAt)} ago · ${statusLabel(item.status).toLowerCase()}` : null].filter((line): line is string => Boolean(line)),
  };
}

export function companyCase(item: CompanySuggestion): ReviewCase {
  const age = caseAge(item.createdAt);
  const host = websiteHost(item.website);
  return {
    key: `company:${item.id}`, kind: "company", id: item.id, ref: `C-${1000 + item.id}`, title: `New company: ${item.companyName}`, sub: [`Submitted by a ${item.role}`, host].filter((part): part is string => Boolean(part)).join(" · "),
    urgent: false, status: item.status, terminal: TERMINAL_CASE_STATUSES.has(item.status), createdAt: item.createdAt, updatedAt: null,
    evidence: [host ? `Website: ${host}` : "No website given", `Suggested name: ${item.companyName}`],
    decisions: openDecisions(COMPANY_DECISIONS, item.status),
    outcome: "Submitter notified.",
    audit: [`${age} ago · submitted by a ${item.role}`, item.status !== "open" ? `Status: ${statusLabel(item.status).toLowerCase()}` : null].filter((line): line is string => Boolean(line)),
  };
}

/** Open before decided, urgent before routine; otherwise keep the server's newest-first order. */
export function queueOrder(cases: ReviewCase[]) {
  return cases.map((item, index) => ({ item, index })).sort((a, b) => Number(a.item.terminal) - Number(b.item.terminal) || Number(b.item.urgent) - Number(a.item.urgent) || a.index - b.index).map(entry => entry.item);
}
