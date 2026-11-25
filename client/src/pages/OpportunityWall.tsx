import { lazy, Suspense } from "react";

const GoalWall = lazy(() => import("./goal/discovery/GoalWall"));

export default function OpportunityWall() {
  return <Suspense fallback={null}><GoalWall /></Suspense>;
}
