import { lazy, Suspense } from "react";

const GoalAdminPartners = lazy(() => import("./goal/admin-ops/GoalAdminPartners"));

export default function AdminPartners() {
  return <Suspense fallback={null}><GoalAdminPartners /></Suspense>;
}
