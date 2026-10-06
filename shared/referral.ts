export const referralStatuses = ["pending", "approved", "declined", "intro_made", "interview", "offer", "closed", "withdrawn"] as const;
export type ReferralStatus = (typeof referralStatuses)[number];

export const referralStatusLabels: Record<ReferralStatus, string> = {
  pending: "Request sent",
  approved: "Request accepted",
  declined: "Declined",
  intro_made: "Introduction reported",
  interview: "Interview reported",
  offer: "Offer reported",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

export const referralStatusSteps: ReferralStatus[] = ["pending", "approved", "intro_made", "interview", "offer", "closed"];

export const postApprovalReferralStatuses = ["approved", "intro_made", "interview", "offer", "closed"] as const;
export const referralProgressUpdateStatuses = ["intro_made", "interview", "offer", "closed"] as const;
export type ReferralProgressUpdateStatus = (typeof referralProgressUpdateStatuses)[number];

export function isPostApprovalReferralStatus(status: string): status is (typeof postApprovalReferralStatuses)[number] {
  return (postApprovalReferralStatuses as readonly string[]).includes(status);
}

export function isReferralProgressUpdateStatus(status: unknown): status is ReferralProgressUpdateStatus {
  return typeof status === "string" && (referralProgressUpdateStatuses as readonly string[]).includes(status);
}

export function getReferralProgress(status: ReferralStatus): number {
  if (status === "declined" || status === "withdrawn") return 0;
  const step = referralStatusSteps.indexOf(status);
  return step < 0 ? 0 : Math.round((step / (referralStatusSteps.length - 1)) * 100);
}

export function canReviewReferral(status: ReferralStatus): boolean {
  return status === "pending";
}

export type JobSeekerReferralState = {
  label: string;
  title: string;
  detail: string;
  tone: "blue" | "amber" | "emerald" | "slate";
};

export function getJobSeekerReferralState(input: { status: ReferralStatus; referrerId?: number | null }): JobSeekerReferralState {
  const reported = "Reported by you or your referral partner, not verified by the employer.";
  if (input.status === "pending" && input.referrerId) return { label: "Under review", title: "A verified employee is reviewing your request.", detail: "Their identity remains private. You will see a factual update when they make a decision.", tone: "blue" };
  if (input.status === "pending") return { label: "Privately routed", title: "Your request is available to eligible employees.", detail: "It remains private while a verified employee decides whether to claim it.", tone: "amber" };
  if (input.status === "approved") return { label: "Request accepted", title: "A verified employee accepted your request.", detail: "Their acceptance does not confirm that a referral was submitted to the employer. Ask your partner for the next step.", tone: "emerald" };
  if (input.status === "intro_made") return { label: "Introduction reported", title: "An introduction was reported.", detail: reported, tone: "blue" };
  if (input.status === "interview") return { label: "Interview reported", title: "An interview was reported.", detail: reported, tone: "blue" };
  if (input.status === "offer") return { label: "Offer reported", title: "An offer was reported.", detail: reported, tone: "emerald" };
  if (input.status === "closed") return { label: "Request closed", title: "This referral request is closed.", detail: "Your private request history and documents remain protected.", tone: "slate" };
  if (input.status === "declined") return { label: "Request closed", title: "This referral request was declined.", detail: "Your documents stay private. You can reuse your packet for another opportunity.", tone: "slate" };
  if (input.status === "withdrawn") return { label: "Withdrawn", title: "You withdrew this request.", detail: "Your credit was returned to your balance. You can request another referral anytime.", tone: "slate" };
  return { label: referralStatusLabels[input.status], title: referralStatusLabels[input.status], detail: "This request has a verified status update.", tone: input.status === "offer" ? "emerald" : "blue" };
}

export function getReferrerInboxState(input: { status: ReferralStatus; referrerId?: number | null; savedAt?: Date | string | null }): "new" | "saved" | "completed" {
  if (input.status !== "pending") return "completed";
  if (input.referrerId || input.savedAt) return "saved";
  return "new";
}
