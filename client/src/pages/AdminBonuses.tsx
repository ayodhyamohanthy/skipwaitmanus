import { lazy, Suspense } from "react";

const GoalAdminBonuses = lazy(() => import("./goal/admin/GoalAdminBonuses"));

export default function AdminBonuses() {
  return <Suspense fallback={null}><GoalAdminBonuses /></Suspense>;
}
