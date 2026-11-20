import { lazy, Suspense } from "react";

const GoalSafety = lazy(() => import("./goal/support/GoalSafety"));

export default function Safety() {
  return <Suspense fallback={null}><GoalSafety /></Suspense>;
}
