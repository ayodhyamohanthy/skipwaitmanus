export const referralStatuses = ["pending", "approved", "declined", "intro_made", "interview", "offer", "closed"] as const;
export type ReferralStatus = (typeof referralStatuses)[number];

export const referralStatusLabels: Record<ReferralStatus, string> = {
  pending: "Request sent",
  approved: "Approved",
  declined: "Declined",
  intro_made: "Introduction made",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
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
  if (status === "declined") return 0;
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
  if (input.status === "pending" && input.referrerId) return { label: "Under review", title: "A verified employee is reviewing your request.", detail: "Their identity remains private. You will see a factual update when they make a decision.", tone: "blue" };
  if (input.status === "pending") return { label: "Privately routed", title: "Your request is available to eligible employees.", detail: "It remains private while a verified employee decides whether to claim it.", tone: "amber" };
  if (input.status === "approved") return { label: "Referral approved", title: "A verified employee approved your referral request.", detail: "Use the next-step email draft when you are ready to continue with the hiring process.", tone: "emerald" };
  if (input.status === "intro_made") return { label: "Introduction made", title: "Your referral has moved to the next step.", detail: "Continue privately with your referral partner when there is a real update.", tone: "blue" };
  if (input.status === "interview") return { label: "Interview in progress", title: "An interview milestone was recorded.", detail: "Keep communication private and update this only when the next real step happens.", tone: "blue" };
  if (input.status === "offer") return { label: "Offer recorded", title: "An offer milestone was recorded.", detail: "This is a factual private progress update, not a public success claim.", tone: "emerald" };
  if (input.status === "closed") return { label: "Request closed", title: "This referral request is closed.", detail: "Your private request history and documents remain protected.", tone: "slate" };
  if (input.status === "declined") return { label: "Request closed", title: "This referral request was declined.", detail: "Your documents stay private. You can reuse your packet for another opportunity.", tone: "slate" };
  return { label: referralStatusLabels[input.status], title: referralStatusLabels[input.status], detail: "This request has a verified status update.", tone: input.status === "offer" ? "emerald" : "blue" };
}

export function getReferrerInboxState(input: { status: ReferralStatus; referrerId?: number | null; savedAt?: Date | string | null }): "new" | "saved" | "completed" {
  if (input.status !== "pending") return "completed";
  if (input.referrerId || input.savedAt) return "saved";
  return "new";
}
