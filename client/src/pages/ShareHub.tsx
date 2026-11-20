import { lazy, Suspense } from "react";
const GoalShareHub = lazy(() => import("./goal/seeker-small/GoalShareHub"));

export default function ShareHub() {
  return <Suspense fallback={null}><GoalShareHub /></Suspense>;
}
