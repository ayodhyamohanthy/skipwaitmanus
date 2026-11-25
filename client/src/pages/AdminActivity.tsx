import { lazy, Suspense } from "react";

const GoalAdminActivity = lazy(() => import("./goal/admin-ops/GoalAdminActivity"));

export default function AdminActivity() {
  return <Suspense fallback={null}><GoalAdminActivity /></Suspense>;
}
