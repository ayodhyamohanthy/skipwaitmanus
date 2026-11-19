import { lazy, Suspense } from "react";

const GoalAdminSchema = lazy(() => import("./goal/admin-ops/GoalAdminSchema"));

export default function AdminSchema() {
  return <Suspense fallback={null}><GoalAdminSchema /></Suspense>;
}
