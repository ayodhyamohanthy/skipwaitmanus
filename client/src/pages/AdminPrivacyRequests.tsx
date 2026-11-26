import { lazy, Suspense } from "react";

const GoalAdminPrivacyRequests = lazy(() => import("./goal/admin-people/GoalAdminPrivacyRequests"));

export default function AdminPrivacyRequests() {
  return <Suspense fallback={null}><GoalAdminPrivacyRequests /></Suspense>;
}
