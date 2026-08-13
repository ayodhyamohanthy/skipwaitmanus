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

export function getReferralProgress(status: ReferralStatus): number {
  if (status === "declined") return 0;
  const step = referralStatusSteps.indexOf(status);
  return step < 0 ? 0 : Math.round((step / (referralStatusSteps.length - 1)) * 100);
}

export function canReviewReferral(status: ReferralStatus): boolean {
  return status === "pending";
}
