import { lazy, Suspense } from "react";

// D-332 (D-048-K-post-opportunity): the goal page is the only /post-opportunity design.
const GoalPostOpportunity = lazy(() => import("./goal/post-opportunity/GoalPostOpportunity"));

export default function PostOpportunity() {
  return <Suspense fallback={null}><GoalPostOpportunity /></Suspense>;
}
