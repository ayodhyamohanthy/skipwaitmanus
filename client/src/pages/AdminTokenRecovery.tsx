import { lazy, Suspense } from "react";

const GoalAdminTokenRecovery = lazy(() => import("./goal/admin-money/GoalAdminTokenRecovery"));

export default function AdminTokenRecovery() {
  return <Suspense fallback={null}><GoalAdminTokenRecovery /></Suspense>;
}
