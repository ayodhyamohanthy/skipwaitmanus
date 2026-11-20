import GoalReviewerSignIn from "@/pages/goal/sign-in/GoalReviewerSignIn";

/** Unlinked sign-in for review accounts (Razorpay website review, our own QA). Hidden from search; the server route is off unless enabled. */
export default function ReviewerSignIn() {
  return <GoalReviewerSignIn />;
}
