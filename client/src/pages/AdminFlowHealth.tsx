import { lazy, Suspense } from "react";

const GoalAdminFlowHealth = lazy(() => import("./goal/admin-ops/GoalAdminFlowHealth"));

export default function AdminFlowHealth() {
  return <Suspense fallback={null}><GoalAdminFlowHealth /></Suspense>;
}
