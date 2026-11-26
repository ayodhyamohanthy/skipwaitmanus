import { lazy, Suspense } from "react";
const GoalLanded = lazy(() => import("./goal/seeker-small/GoalLanded"));

export default function Landed() {
  return <Suspense fallback={null}><GoalLanded /></Suspense>;
}
