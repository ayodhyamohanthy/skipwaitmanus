import { lazy, Suspense } from "react";

const GoalAdminReview = lazy(() => import("./goal/admin/GoalAdminReview"));

export default function AdminReview() {
  return <Suspense fallback={null}><GoalAdminReview /></Suspense>;
}
