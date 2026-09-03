import type { StatusTone } from "@/components/StatusBadge";

// Shared vocabulary for the unified admin approval queue (design 2.5 + 2.6).
export type AdminApprovalQueueKind = "referral_request" | "referrer_enrollment" | "payment";
export type AdminApprovalQueueStatus = "pending" | "under_review" | "approved" | "declined" | "requires_review";
export type AdminApprovalQueueItem = {
  kind: AdminApprovalQueueKind;
  id: number;
  status: AdminApprovalQueueStatus;
  companyDomain: string;
  provider?: string | null;
  amount?: number | null;
  currency?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  summary: string;
  meta: {
    claimTime?: string | Date | null;
    otpTime?: string | Date | null;
    tokenCount?: number | null;
    reason?: string | null;
    seekerName?: string | null;
    seekerEmail?: string | null;
    referrerName?: string | null;
    referrerEmail?: string | null;
    roleTitle?: string | null;
    targetRoleUrl?: string | null;
    pitch?: string | null;
    role?: string | null;
    userEmail?: string | null;
    waitingForCoverage?: boolean | null;
    creditReserved?: boolean | null;
    approvalNote?: string | null;
  };
};

export const approvalStatusLabels: Record<AdminApprovalQueueStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "amber" },
  under_review: { label: "Under review", tone: "blue" },
  requires_review: { label: "Requires review", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "red" },
};

export const openApprovalStatuses = new Set<AdminApprovalQueueStatus>(["pending", "under_review", "requires_review"]);

export const displayRef = (id: number) => `Ref-${1000 + id}`;
export const displayPaymentRef = (id: number) => `Ref-PMT-${1000 + id}`;
export const itemKey = (item: { kind: AdminApprovalQueueKind; id: number }) => `${item.kind}:${item.id}`;

export function itemTitle(item: AdminApprovalQueueItem) {
  if (item.kind === "referral_request") return displayRef(item.id);
  if (item.kind === "payment") return displayPaymentRef(item.id);
  return item.meta.referrerName || `Ref-ENR-${1000 + item.id}`;
}

export function formatAmount(amount: number, currency: string) {
  const major = amount / 100;
  return `${currency} ${major % 1 === 0 ? major.toFixed(0) : major.toFixed(2)}`;
}

export function compactDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function compactDateTime(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

// Operational-activity actions rendered as human history lines on the detail.
export const historyLabels: Record<string, string> = {
  "company_referral.created": "Request created",
  "company_referral.claimed": "Claimed by verified referrer",
  "company_referral.approved": "Approved by referrer",
  "company_referral.declined": "Declined by referrer",
  "company_referral.one_click_approved": "Approved via one-click review",
  "company_referral.one_click_declined": "Declined via one-click review",
  "company_referral.email_one_click_approved": "Approved via email review",
  "company_referral.email_one_click_declined": "Declined via email review",
  "admin.approval_approved": "Approved by admin",
  "admin.approval_rejected": "Rejected by admin",
  "payment.review_credited": "Payment approved — tokens credited",
  "payment.review_rejected": "Payment rejected",
  "payment.refunded": "Payment refunded",
};
