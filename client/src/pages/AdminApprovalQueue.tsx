import { lazy, Suspense } from "react";

const GoalAdminApprovalQueue = lazy(() => import("./goal/admin-approvals/GoalAdminApprovalQueue"));

export default function AdminApprovalQueue() {
  return <Suspense fallback={null}><GoalAdminApprovalQueue /></Suspense>;
}
