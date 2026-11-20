import { lazy, Suspense } from "react";

const GoalAdminSmoke = lazy(() => import("./goal/admin-ops/GoalAdminSmoke"));

export default function AdminSmoke() {
  return <Suspense fallback={null}><GoalAdminSmoke /></Suspense>;
}
