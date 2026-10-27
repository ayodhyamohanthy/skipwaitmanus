// The shared ask vocabulary (My referrals rows and the conversation header): one
// dot + word + four-node stepper per status, so both screens read the same.
import type { GoalStatusValue } from "@/components/goal";

export type AskView = { status: GoalStatusValue; label: string; stepper?: { stage: number; terminal?: "expired" | "withdrawn" }; verb: string };

type AskStatusSource = { status: "pending" | "approved" | "intro_made" | "interview" | "offer" | "declined" | "withdrawn" | "closed"; referrerId: number | null; heldForReferrer?: boolean; unclaimedAssignment?: boolean };

/**
 * The goal status vocabulary is dot + text by role (DESIGN.md §5). Interview
 * and Offer are post-referral outcomes with no goal tone of their own, so they
 * stay neutral ink; a decline is an ended state, so it reads crimson.
 */
export function askView(request: AskStatusSource): AskView {
  switch (request.status) {
    case "pending": {
      const claimed = request.referrerId !== null && request.heldForReferrer !== true && request.unclaimedAssignment !== true;
      return claimed
        ? { status: "under_review", label: "Under review", stepper: { stage: 1 }, verb: "Picked up" }
        : { status: "waiting", label: "Waiting", stepper: { stage: 0 }, verb: "Sent" };
    }
    case "approved": return { status: "accepted", label: "Accepted", stepper: { stage: 2 }, verb: "Accepted" };
    case "intro_made": return { status: "referred", label: "Referred", stepper: { stage: 3 }, verb: "Referred" };
    case "interview": return { status: "accepted", label: "Interviewing", stepper: { stage: 3 }, verb: "Updated" };
    case "offer": return { status: "accepted", label: "Offer", stepper: { stage: 3 }, verb: "Updated" };
    case "declined": return { status: "expired", label: "Declined", stepper: { stage: 1, terminal: "expired" }, verb: "Declined" };
    case "withdrawn": return { status: "withdrawn", label: "Withdrawn", stepper: { stage: 2, terminal: "withdrawn" }, verb: "Withdrawn" };
    case "closed": return request.referrerId
      ? { status: "withdrawn", label: "Closed", stepper: { stage: 2, terminal: "withdrawn" }, verb: "Closed" }
      : { status: "expired", label: "Expired", stepper: { stage: 1, terminal: "expired" }, verb: "Expired" };
  }
}

