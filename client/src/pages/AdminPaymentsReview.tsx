import React, { lazy, Suspense } from "react";

const GoalAdminPayments = lazy(() => import("./goal/admin-money/GoalAdminPayments"));

export default function AdminPaymentsReview() {
  return <Suspense fallback={null}><GoalAdminPayments /></Suspense>;
}
