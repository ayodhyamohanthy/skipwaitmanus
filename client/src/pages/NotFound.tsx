import { lazy, Suspense } from "react";
const GoalNotFound = lazy(() => import("./goal/system/GoalNotFound"));

export default function NotFound() {
  return <Suspense fallback={null}><GoalNotFound /></Suspense>;
}

