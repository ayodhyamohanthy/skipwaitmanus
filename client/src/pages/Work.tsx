import { lazy, Suspense } from "react";

const GoalWork = lazy(() => import("./goal/profile/GoalWork"));

export default function Work() {
  return <Suspense fallback={null}><GoalWork /></Suspense>;
}
