import { lazy, Suspense } from "react";

const GoalAdminApprovalRecord = lazy(() => import("./goal/admin-approvals/GoalAdminApprovalRecord"));

export default function AdminApprovalRecord() {
  return <Suspense fallback={null}><GoalAdminApprovalRecord /></Suspense>;
}
