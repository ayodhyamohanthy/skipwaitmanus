import { lazy, Suspense } from "react";

const GoalAdminOverview = lazy(() => import("./goal/admin/GoalAdminOverview"));

export default function AdminOverview() {
  return <Suspense fallback={null}><GoalAdminOverview /></Suspense>;
}
