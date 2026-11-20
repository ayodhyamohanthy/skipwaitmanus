import { lazy, Suspense } from "react";

const GoalReport = lazy(() => import("./goal/support/GoalReport"));

export default function Report() {
  return <Suspense fallback={null}><GoalReport /></Suspense>;
}
