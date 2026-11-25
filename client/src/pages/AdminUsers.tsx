import { lazy, Suspense } from "react";

const GoalAdminUsers = lazy(() => import("./goal/admin-people/GoalAdminUsers"));

export default function AdminUsers() {
  return <Suspense fallback={null}><GoalAdminUsers /></Suspense>;
}
